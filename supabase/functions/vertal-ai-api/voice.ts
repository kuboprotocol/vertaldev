// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// VERTAL AI API · voz clonada (marca branca). Rotas (Authorization: Bearer vtl_ai_…):
//
//   GET    /v1/voices/consent          termo de consentimento (pt/en/es) e campos obrigatórios
//   GET    /v1/voices/languages        idiomas da fala (23) — cantar funciona em qualquer idioma
//   GET    /v1/music/genres?q=         ritmos do mundo + idiomas de letra (catálogo para o app do cliente)
//   POST   /v1/voices                  cria a voz de um usuário final (JSON com sample_url, ou multipart com "sample")
//   GET    /v1/voices?end_user=…       vozes do usuário final (ou de todos, sem end_user)
//   DELETE /v1/voices/{id}             apaga a voz e a amostra
//   POST   /v1/audio/speech            {voice_id, input, language?:"auto"|código} → 202 {id}
//   POST   /v1/audio/sing              {voice_id, source_url, pitch_shift?} → 202 {id}
//   GET    /v1/voice-jobs/{id}         status; pronto → audio_url (7 dias) e o preço cobrado
//
// Preço: atacado (cobrança v2) = max(nosso custo de GPU, piso) × 1,20 em créditos pré-pagos; só cobra o que fica
// pronto; saldo zerado → 402. Liga com VERTAL_OWN_VOICE_API_ENABLED (VERTAL_GPU_CONFIG). Depende das tabelas de
// docs/vertal-code-ai/proposed-migration-voice-api.sql (não aplicada) e do app Modal vertal-voice.
import { corsHeaders } from "../_shared/cors.ts";
import { hashAiKey, bearerFrom, checkKeyRow } from "../_shared/vertalCodeAi/apiKeys.ts";
import { checkSpend, MICRO } from "../_shared/vertalCodeAi/pricing.ts";
import { expandBillingEnv, loadBilling, pickBillingLocale, priceRequest, wholesaleBalanceGate, type BillingConfig } from "../_shared/vertalCodeAi/billing.ts";
import {
  VOICE_API_LIMITS, checkConsentAttestation, cleanEndUser, cleanVoiceApiName, consentInfo, extForMime, matchVoiceRoute, mimeFromName,
  safeFetchUrl, sampleMimeOk, voiceApiEnabledFor, voiceJobCostUsd,
} from "../_shared/vertalCodeAi/voiceApi.ts";
import { TTS_LANGUAGES, VOICE_CONSENT_TEXT, cleanSpeakText, isUnsupportedSpeech, resolveSpeechLanguage, ttsLangCode, voiceEnvFrom } from "../_shared/voiceClone.ts";
import { MUSIC_LYRIC_LANGUAGES, WORLD_GENRES, searchMusicStyles } from "../_shared/music/worldGenres.ts";

type Env = Record<string, string | undefined>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });
}
export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: { message, type: status === 402 ? "insufficient_quota" : status === 401 ? "authentication_error" : "invalid_request_error", code, ...extra } });
const missingTable = (e: any) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(String(e.message ?? "")));

function voiceEnv(): Env {
  // VERTAL_OWN_VOICE_* (motor, flag da API, preço da GPU) e as chaves de cobrança moram no VERTAL_GPU_CONFIG.
  return expandBillingEnv(voiceEnvFrom(Deno.env.toObject()));
}

export interface KeyRow { id: string; owner_id: string; rpm: number | null; monthly_cap_credits: number | null }

export async function authKey(req: Request, admin: any): Promise<{ row: KeyRow; spentMicro: number } | Response> {
  const token = bearerFrom(req.headers);
  if (!token) return fail(401, "invalid_api_key", "Send Authorization: Bearer vtl_ai_…");
  const { data: row } = await admin
    .from("vertal_ai_api_keys")
    .select("id, owner_id, revoked_at, expires_at, monthly_cap_credits, rpm, spent_micro, spent_period")
    .eq("key_hash", await hashAiKey(token))
    .maybeSingle();
  const kc = checkKeyRow(row ?? null);
  if (kc.ok === false) return fail(kc.status, kc.code, kc.message);
  try {
    const { data: n } = await admin.rpc("bump_rate_limit", { _bucket: `vertal_ai_key:${row.id}`, _user: row.owner_id, _window_seconds: 60 });
    if (typeof n === "number" && n > (row.rpm ?? 20)) return json(429, { error: { message: "Rate limit for this key.", type: "rate_limit_error", code: "rate_limit_exceeded" } }, { "Retry-After": "60" });
  } catch { /* sem a RPC, segue só com o teto de gasto */ }
  return { row, spentMicro: kc.spentThisMonthMicro };
}

export async function balanceOf(admin: any, ownerId: string): Promise<number> {
  const [{ data: sub }, { data: owed }] = await Promise.all([
    admin.from("subscriptions").select("edits_limit, edits_used").eq("user_id", ownerId).eq("is_active", true).maybeSingle(),
    admin.from("vertal_ai_usage").select("debit_credits").eq("owner_id", ownerId).eq("charge_status", "owed").limit(500),
  ]);
  const owedCredits = (owed ?? []).reduce((a: number, r: any) => a + (r.debit_credits ?? 0), 0);
  return sub ? Math.max(0, (sub.edits_limit ?? 0) - (sub.edits_used ?? 0) - owedCredits) : 0;
}

/** Saldo positivo + teto mensal da chave para o pior caso. */
async function gate(admin: any, k: { row: KeyRow; spentMicro: number }, cfg: BillingConfig, kind: "voice" | "singing", worstCostUsd: number, req: Request) {
  const balance = await balanceOf(admin, k.row.owner_id);
  const g = wholesaleBalanceGate(balance, pickBillingLocale([req.headers.get("Accept-Language")]));
  if (g.ok === false) return fail(g.status, g.code, g.message);
  const worst = priceRequest(cfg, { channel: "wholesale", kind, costUsd: worstCostUsd });
  const { data: carry } = await admin.from("vertal_ai_carry").select("carry_micro").eq("owner_id", k.row.owner_id).maybeSingle();
  const spend = checkSpend({
    balanceCredits: balance,
    carryMicro: Number(carry?.carry_micro ?? 0),
    maxCostMicro: worst.ok ? worst.micro : 0,
    keySpentMicroThisMonth: k.spentMicro,
    keyMonthlyCapCredits: k.row.monthly_cap_credits === null ? null : Number(k.row.monthly_cap_credits),
  });
  if (spend.ok === false) {
    const s = spend as { status: number; code: string; message: string };
    return fail(s.status, s.code, s.message);
  }
  return null;
}

/** Registra o uso (idempotente por request_id) e debita os créditos inteiros acumulados. */
async function charge(admin: any, row: KeyRow, requestId: string, model: string, kind: "voice" | "singing", cfg: BillingConfig, costUsd: number) {
  const price = priceRequest(cfg, { channel: "wholesale", kind, costUsd });
  if (!price.ok) return { ok: false as const };
  const { data: rec, error } = await admin.rpc("vertal_ai_record_usage", {
    _key_id: row.id, _owner_id: row.owner_id, _request_id: requestId, _model: model, _cost_class: kind,
    _prompt_tokens: 0, _completion_tokens: 0, _cost_micro: price.micro, _response: { kind, model },
  });
  if (error) {
    console.error("[vertal-ai-api/voice] record usage:", error.message);
    return { ok: false as const };
  }
  if (rec?.debit_credits > 0) {
    const { error: chErr } = await admin.rpc("execute_atomic_credit_deduction", {
      _user_id: row.owner_id, _amount: rec.debit_credits, _reason: "vertal_ai_api:voice", _category: "vertal_ai_api",
      _metadata: { key_id: row.id, usage_id: rec.usage_id, model }, _idempotency_key: `vai-${rec.usage_id}`,
    });
    await admin.from("vertal_ai_usage").update({ charge_status: chErr ? "owed" : "charged" }).eq("id", rec.usage_id);
  }
  if (rec?.usage_id) {
    await admin.from("vertal_ai_usage").update({ kind, markup: price.markup, cost_usd: price.billedCostUsd }).eq("id", rec.usage_id).then(() => {}, () => {});
  }
  return { ok: true as const, usageId: rec?.usage_id as string | undefined, credits: price.credits, priceUsd: price.priceUsd, costUsd: price.billedCostUsd, floorApplied: price.floorApplied };
}

/** Baixa áudio de uma URL pública (SSRF-safe, com teto de bytes). */
async function download(raw: unknown, maxBytes: number): Promise<{ bytes: Uint8Array; mime: string } | { error: string }> {
  const u = safeFetchUrl(raw);
  if (!u) return { error: "url_not_allowed" };
  let res: Response;
  try {
    res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    return { error: "download_failed" };
  }
  if (!res.ok || !res.body) return { error: "download_failed" };
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { error: "too_large" };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { error: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.byteLength;
  }
  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const mime = sampleMimeOk(ct) ? ct : mimeFromName(u.pathname) ?? "";
  return mime ? { bytes, mime } : { error: "not_audio" };
}

function engine(env: Env) {
  const url = (env.VERTAL_OWN_VOICE_URL ?? "").replace(/\/+$/, "");
  const token = env.VERTAL_OWN_VOICE_TOKEN ?? "";
  return url && token ? { url, auth: { Authorization: `Bearer ${token}` } } : null;
}

export async function handleVoiceApi(req: Request, admin: any, path: string): Promise<Response | null> {
  const route = matchVoiceRoute(req.method, path);
  if (route === "not_voice") return null;
  if (route === null) return fail(405, "method_not_allowed", "Method not allowed for this route.");

  const k = await authKey(req, admin);
  if (k instanceof Response) return k;
  const env = voiceEnv();
  if (!voiceApiEnabledFor(env, k.row.owner_id)) return fail(404, "voice_api_disabled", "Voice endpoints are not enabled for this account yet.");
  const cfg = loadBilling(env.VERTAL_BILLING_CONFIG).config;
  const owner = k.row.owner_id;

  try {
    switch (route.r) {
      case "consent":
        return json(200, consentInfo());
      case "languages":
        return json(200, {
          speech: TTS_LANGUAGES,
          speech_default: "auto",
          speech_rules: "language=auto detects from the text; languages outside the list fall back (Latin script → voice language or English, uk/sr → ru, fa/ur → ar, flagged language_fallback) or are refused with 422 language_unsupported before any charge.",
          singing: "any language (voice conversion keeps the original lyrics and melody)",
        });
      case "genres": {
        const q = new URL(req.url).searchParams.get("q") ?? "";
        return json(200, { styles: searchMusicStyles(q, 500), total: WORLD_GENRES.length, free_text: true, lyric_languages: MUSIC_LYRIC_LANGUAGES });
      }
      case "voices_list": {
        const eu = new URL(req.url).searchParams.get("end_user");
        let q = admin.from("vertal_api_voices").select("id,end_user,name,language,sample_seconds,created_at").eq("owner_id", owner).is("deleted_at", null);
        if (eu) {
          const e = cleanEndUser(eu);
          if (!e) return fail(400, "invalid_end_user", "end_user must be 1-128 chars [A-Za-z0-9._:@-].");
          q = q.eq("end_user", e);
        }
        const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
        if (error) return missingTable(error) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "list_failed", "Could not list voices.");
        return json(200, { object: "list", data: data ?? [] });
      }
      case "voices_delete": {
        const { data, error } = await admin.from("vertal_api_voices").update({ deleted_at: new Date().toISOString() })
          .eq("id", route.id).eq("owner_id", owner).is("deleted_at", null).select("sample_path").maybeSingle();
        if (error) return missingTable(error) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "delete_failed", "Could not delete.");
        if (!data) return fail(404, "not_found", "Voice not found.");
        await admin.storage.from("uploads").remove([data.sample_path]).catch(() => undefined);
        return json(200, { id: route.id, deleted: true });
      }
      case "voices_create":
        return await createVoice(req, admin, k, cfg);
      case "speech":
      case "sing":
        return await submit(req, admin, k, cfg, env, route.r === "speech" ? "speak" : "sing");
      case "job":
        return await jobStatus(admin, k.row, cfg, env, route.id);
    }
  } catch (e) {
    console.error("[vertal-ai-api/voice]", e instanceof Error ? e.message : e);
    return fail(500, "internal_error", "Internal error.");
  }
  return null;
}

async function createVoice(req: Request, admin: any, k: { row: KeyRow; spentMicro: number }, cfg: BillingConfig): Promise<Response> {
  const owner = k.row.owner_id;
  let body: Record<string, unknown> = {};
  let file: File | null = null;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return fail(400, "invalid_body", "Invalid multipart body.");
    for (const [key, v] of fd.entries()) {
      if (key === "sample" && v instanceof File) file = v;
      else if (typeof v === "string") body[key] = v;
    }
    if (typeof body.consent === "string") body.consent = JSON.parse(body.consent as string);
  } else {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }

  const endUser = cleanEndUser(body.end_user);
  if (!endUser) return fail(400, "invalid_end_user", "end_user (your app's user id) is required: 1-128 chars [A-Za-z0-9._:@-].");
  const consent = checkConsentAttestation(body.consent);
  if (!consent.ok) {
    return fail(400, "consent_required", "A consent attestation from the end user is required to clone a voice.", { missing: consent.missing, consent: consentInfo() });
  }
  const seconds = Number(body.sample_seconds);
  if (!Number.isFinite(seconds) || seconds < VOICE_API_LIMITS.minSampleSeconds || seconds > VOICE_API_LIMITS.maxSampleSeconds) {
    return fail(400, "sample_invalid", `sample_seconds must be ${VOICE_API_LIMITS.minSampleSeconds}-${VOICE_API_LIMITS.maxSampleSeconds}.`);
  }

  // Limites antes de baixar qualquer coisa.
  const [{ count: perUser, error: cErr }, { count: perOwner }] = await Promise.all([
    admin.from("vertal_api_voices").select("id", { count: "exact", head: true }).eq("owner_id", owner).eq("end_user", endUser).is("deleted_at", null),
    admin.from("vertal_api_voices").select("id", { count: "exact", head: true }).eq("owner_id", owner).is("deleted_at", null),
  ]);
  if (cErr) return missingTable(cErr) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "create_failed", "Could not create.");
  if ((perUser ?? 0) >= VOICE_API_LIMITS.maxVoicesPerEndUser) return fail(409, "too_many_voices", `This end user already has ${VOICE_API_LIMITS.maxVoicesPerEndUser} voices. Delete one first.`);
  if ((perOwner ?? 0) >= VOICE_API_LIMITS.maxVoicesPerCustomer) return fail(409, "too_many_voices", "Voice limit for this account reached.");

  const blocked = await gate(admin, k, cfg, "voice", 0, req);
  if (blocked) return blocked;

  let bytes: Uint8Array;
  let mime: string;
  if (file) {
    if (file.size > VOICE_API_LIMITS.maxSampleBytes) return fail(400, "sample_invalid", "Sample is larger than 12 MB.");
    mime = (file.type || mimeFromName(file.name) || "").split(";")[0].toLowerCase();
    if (!sampleMimeOk(mime)) return fail(400, "sample_invalid", "Sample must be mp3, wav, m4a, webm, ogg or aac.");
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const d = await download(body.sample_url, VOICE_API_LIMITS.maxSampleBytes);
    if ("error" in d) return fail(400, "sample_invalid", `sample_url: ${d.error} (public https audio, max 12 MB).`);
    bytes = d.bytes;
    mime = d.mime;
  }

  const id = crypto.randomUUID();
  const samplePath = `${owner}/voices/api/${id}.${extForMime(mime)}`;
  const up = await admin.storage.from("uploads").upload(samplePath, bytes, { contentType: mime, upsert: false });
  if (up.error) return fail(500, "upload_failed", "Could not store the sample.");

  const name = cleanVoiceApiName(body.name);
  const language = ttsLangCode(body.language) ?? null;
  const consentLang = typeof body.consent_language === "string" && /^(pt|en|es)/i.test(body.consent_language) ? body.consent_language.slice(0, 2).toLowerCase() as "pt" | "en" | "es" : "en";
  const { data, error } = await admin.from("vertal_api_voices").insert({
    id, owner_id: owner, key_id: k.row.id, end_user: endUser, name, language, sample_path: samplePath, sample_mime: mime.slice(0, 60),
    sample_seconds: Math.round(seconds * 10) / 10, consent_version: consent.value.version, consent_text: VOICE_CONSENT_TEXT[consentLang],
    consent_attestation: consent.value,
    consent_ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null,
  }).select("id,end_user,name,language,sample_seconds,created_at").single();
  if (error) {
    await admin.storage.from("uploads").remove([samplePath]).catch(() => undefined);
    return missingTable(error) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "create_failed", "Could not create.");
  }
  const billed = await charge(admin, k.row, `voice-create:${id}`, "vertal-voice-create", "voice", cfg, 0);
  return json(201, { ...data, object: "voice", billing: billed.ok ? { credits: billed.credits, price_usd: billed.priceUsd } : null });
}

async function submit(req: Request, admin: any, k: { row: KeyRow; spentMicro: number }, cfg: BillingConfig, env: Env, kind: "speak" | "sing"): Promise<Response> {
  const owner = k.row.owner_id;
  const eng = engine(env);
  if (!eng) return fail(503, "voice_engine_unavailable", "The voice engine is unavailable. Nothing was charged.");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const voiceId = typeof body.voice_id === "string" && UUID_RE.test(body.voice_id) ? body.voice_id.toLowerCase() : null;
  if (!voiceId) return fail(400, "invalid_voice_id", "voice_id is required.");
  const { data: voice, error: vErr } = await admin.from("vertal_api_voices").select("id,end_user,name,language,sample_path")
    .eq("id", voiceId).eq("owner_id", owner).is("deleted_at", null).maybeSingle();
  if (vErr) return missingTable(vErr) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "voice_lookup_failed", "Could not read the voice.");
  if (!voice) return fail(404, "voice_not_found", "Voice not found.");

  const billingKind = kind === "speak" ? "voice" : "singing";
  const input: Record<string, unknown> = { voice_name: voice.name };
  const payload: Record<string, unknown> = { kind };
  if (kind === "speak") {
    const text = cleanSpeakText(body.input ?? body.text);
    if (text.length < 2) return fail(400, "input_required", `input (text, up to ${VOICE_API_LIMITS.maxTextChars} chars) is required.`);
    const choice = resolveSpeechLanguage({ requested: body.language, text, voiceLanguage: voice.language });
    if (isUnsupportedSpeech(choice)) {
      return fail(422, "language_unsupported", "Speech cannot read this language yet. Singing works in any language. Nothing was charged.", { detected: choice.unsupported, speech_languages: TTS_LANGUAGES });
    }
    payload.text = text;
    payload.language = choice.language;
    Object.assign(input, { chars: text.length, language: choice.language, language_fallback: choice.fallback, detected: choice.detected });
  }
  // Pior caso no teto de gasto ANTES de baixar/enviar.
  const worstUsd = voiceJobCostUsd(env, VOICE_API_LIMITS.worstGpuSeconds[kind], "A10G");
  const blocked = await gate(admin, k, cfg, billingKind, worstUsd, req);
  if (blocked) return blocked;

  const jobId = crypto.randomUUID();
  if (kind === "sing") {
    const d = await download(body.source_url, VOICE_API_LIMITS.maxSongBytes);
    if ("error" in d) return fail(400, "source_invalid", `source_url: ${d.error} (public https audio, max 40 MB).`);
    const srcPath = `${owner}/voices/api/src/${jobId}.${extForMime(d.mime)}`;
    const up = await admin.storage.from("uploads").upload(srcPath, d.bytes, { contentType: d.mime, upsert: false });
    if (up.error) return fail(500, "upload_failed", "Could not store the song.");
    const s = await admin.storage.from("uploads").createSignedUrl(srcPath, 3600);
    if (!s.data?.signedUrl) return fail(500, "upload_failed", "Could not store the song.");
    payload.source_url = s.data.signedUrl;
    const shift = Number(body.pitch_shift);
    if (Number.isFinite(shift) && Math.abs(shift) <= 12) payload.pitch_shift = Math.round(shift);
    input.source_path = srcPath;
  }
  const ref = await admin.storage.from("uploads").createSignedUrl(voice.sample_path, 3600);
  if (!ref.data?.signedUrl) return fail(404, "voice_not_found", "Voice sample missing.");
  payload.reference_url = ref.data.signedUrl;

  let providerId = "";
  try {
    const r = await fetch(`${eng.url}/submit`, { method: "POST", headers: { ...eng.auth, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && typeof d?.id === "string") providerId = d.id;
  } catch { /* abaixo */ }
  if (!providerId) return fail(503, "voice_engine_unavailable", "The voice engine is busy. Try again shortly. Nothing was charged.");

  const { error } = await admin.from("vertal_api_voice_jobs").insert({
    id: jobId, owner_id: owner, key_id: k.row.id, end_user: voice.end_user, voice_id: voice.id, kind, status: "processing",
    provider_job_id: providerId, input,
  });
  if (error) return fail(500, "job_failed", "Could not record the job. Nothing was charged.");
  return json(202, {
    id: jobId, object: "voice.job", kind, status: "processing", voice_id: voice.id, eta_seconds: kind === "speak" ? 30 : 150,
    ...(kind === "speak" ? { language: input.language, language_fallback: input.language_fallback } : {}),
    poll: `/v1/voice-jobs/${jobId}`,
  });
}

function view(j: any) {
  return {
    id: j.id, object: "voice.job", kind: j.kind, status: j.status, voice_id: j.voice_id, end_user: j.end_user,
    audio_url: j.output_url ?? null, error: j.error ?? null, created_at: j.created_at, finished_at: j.finished_at ?? null,
    ...(j.kind === "speak" ? { language: j.input?.language ?? null, language_fallback: !!j.input?.language_fallback } : {}),
    billing: j.status === "completed" ? { credits: j.price_micro != null ? Number(j.price_micro) / MICRO : null, gpu_seconds: j.gpu_seconds ?? null } : null,
  };
}

async function jobStatus(admin: any, row: KeyRow, cfg: BillingConfig, env: Env, id: string): Promise<Response> {
  const { data: job, error } = await admin.from("vertal_api_voice_jobs").select("*").eq("id", id).eq("owner_id", row.owner_id).maybeSingle();
  if (error) return missingTable(error) ? fail(503, "voice_api_unavailable", "Voice API storage is not ready.") : fail(500, "status_failed", "Could not read the job.");
  if (!job) return fail(404, "not_found", "Job not found.");
  if (job.status !== "processing") return json(200, view(job));

  const eng = engine(env);
  let state: "processing" | "completed" | "failed" = "processing";
  let reason = "";
  let st: any = {};
  let outUrl = "";
  let outPath = "";
  if (eng) {
    try {
      const r = await fetch(`${eng.url}/status?id=${encodeURIComponent(job.provider_job_id)}`, { headers: eng.auth, signal: AbortSignal.timeout(15_000) });
      st = await r.json().catch(() => ({}));
      if (st?.status === "completed") {
        const res = await fetch(`${eng.url}/result?id=${encodeURIComponent(job.provider_job_id)}`, { headers: eng.auth, signal: AbortSignal.timeout(60_000) });
        if (res.ok) {
          outPath = `${row.owner_id}/voices/api/out/${job.id}.mp3`;
          const up = await admin.storage.from("uploads").upload(outPath, new Uint8Array(await res.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
          const s = up.error ? null : await admin.storage.from("uploads").createSignedUrl(outPath, VOICE_API_LIMITS.resultTtlSeconds);
          if (s?.data?.signedUrl) {
            outUrl = s.data.signedUrl;
            state = "completed";
          }
        }
      } else if (st?.status === "failed" || st?.status === "expired" || r.status === 404) {
        state = "failed";
        reason = String(st?.error ?? st?.status ?? "job_not_found").slice(0, 200);
      }
    } catch { /* tenta no próximo poll */ }
  }
  if (state === "processing" && Date.now() - new Date(job.created_at).getTime() > VOICE_API_LIMITS.jobMaxMs) {
    state = "failed";
    reason = "timeout";
  }
  if (state === "failed") {
    const { data: upd } = await admin.from("vertal_api_voice_jobs").update({ status: "failed", error: reason || "generation_failed", finished_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "processing").select("*").maybeSingle();
    return json(200, { ...view(upd ?? { ...job, status: "failed", error: reason }), message: "Generation failed. Nothing was charged." });
  }
  if (state === "processing") return json(200, view(job));

  // Pronto: trava a linha (só um poll cobra), depois cobra pelo custo real de GPU.
  const gpuSeconds = typeof st.gpu_seconds === "number" ? st.gpu_seconds : null;
  const costUsd = voiceJobCostUsd(env, gpuSeconds, st.gpu ?? null);
  const kind = job.kind === "speak" ? "voice" : "singing";
  const { data: locked } = await admin.from("vertal_api_voice_jobs").update({
    status: "completed", output_path: outPath, output_url: outUrl, finished_at: new Date().toISOString(),
    gpu_seconds: gpuSeconds, gpu: typeof st.gpu === "string" ? st.gpu.slice(0, 40) : null, cost_usd: costUsd,
  }).eq("id", job.id).eq("status", "processing").select("*").maybeSingle();
  if (!locked) {
    const { data: again } = await admin.from("vertal_api_voice_jobs").select("*").eq("id", job.id).maybeSingle();
    return json(200, view(again ?? job));
  }
  const billed = await charge(admin, row, `voice-job:${job.id}`, job.kind === "speak" ? "vertal-voice-speak" : "vertal-voice-sing", kind, cfg, costUsd);
  const priceMicro = billed.ok ? Math.round(billed.credits * MICRO) : null;
  await admin.from("vertal_api_voice_jobs").update({ price_micro: priceMicro, usage_id: billed.ok ? billed.usageId ?? null : null, charged: billed.ok })
    .eq("id", job.id).then(() => {}, () => {});
  if (job.input?.source_path) await admin.storage.from("uploads").remove([job.input.source_path]).catch(() => undefined);
  return json(200, view({ ...locked, price_micro: priceMicro }));
}

