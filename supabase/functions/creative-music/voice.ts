// Vertal · Clonador de voz — ações "voice_*" da edge function creative-music (sem função nova: o projeto
// está no limite de funções). Regras puras em ../_shared/voiceClone.ts; motor no app Modal "vertal-voice".
//
// Ações (todas exigem login + flag VERTAL_OWN_VOICE_ENABLED + estar na lista; padrão: só o Laércio):
//   voice_config                       → liberado?, custos, termo de consentimento, limites
//   voice_list                         → vozes salvas do usuário
//   voice_create {name, sample_path, sample_mime, sample_seconds, consent, language}
//   voice_delete {voice_id}
//   voice_speak  {text, voice_id?, language?}        → cobra, envia e devolve {job_id}
//   voice_sing   {source_url|source_path, voice_id?} → cobra, envia e devolve {job_id}
//   voice_status {job_id}                            → acompanha; falhou/expirou → devolve o crédito
//   voice_jobs                                       → últimos trabalhos (histórico do painel)
// Sem as tabelas (migração 20261127210000 não aplicada) responde 503 "voice_clone_unavailable".
import { corsHeaders } from "../_shared/cors.ts";
import { deductCredits, keepCharges, refundCharge, supaAdmin } from "../_shared/creative.ts";
import { resolveEnvForRun } from "../_shared/kuboSecrets.ts";
import {
  VOICE_CONSENT_TEXT, VOICE_CONSENT_VERSION, VOICE_LIMITS, VOICE_SAMPLE_MIME, cleanSpeakText, cleanVoiceName,
  consentValid, ownUploadPathFromUrl, ownVoiceSamplePath, voiceCloneAllowed, voiceCloneCosts, voiceEnvFrom, voiceLang, voiceMessage,
  type VoiceJobKind, type VoiceLang,
} from "../_shared/voiceClone.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOICE_KEYS = [
  "VERTAL_OWN_VOICE_ENABLED", "VERTAL_OWN_VOICE_USER_IDS", "VERTAL_OWN_VOICE_URL", "VERTAL_OWN_VOICE_TOKEN",
  "VERTAL_OWN_VOICE_TTS_CREDITS", "VERTAL_OWN_VOICE_SING_CREDITS", "VERTAL_OWN_VOICE_CREATE_CREDITS",
  "VERTAL_OWN_VOICE_CHARGE_ADMINS",
];
const SIGNED_TTL = 60 * 60 * 24 * 30;

let vaultCache: { at: number; env: Record<string, string> } | null = null;

/** Segredo avulso vence; depois VERTAL_GPU_CONFIG; depois o cofre da conta dona (mesmo esquema do creative-music). */
async function voiceEnv(): Promise<Record<string, string | undefined>> {
  const base = voiceEnvFrom(Deno.env.toObject());
  const missing = VOICE_KEYS.filter((k) => !(base[k] ?? "").trim());
  if (!vaultCache || Date.now() - vaultCache.at > 300_000) {
    const owner = (base.VERTAL_MUSIC_KEYS_OWNER ?? base.VERTAL_FREE_KEYS_OWNER ?? "").trim();
    let env: Record<string, string> = {};
    if (UUID_RE.test(owner) && missing.length) {
      try {
        env = (await resolveEnvForRun(supaAdmin() as Loose, owner, missing, { target: "creative_music_voice" })).env;
      } catch (e) {
        console.warn(`[creative-music/voice] vault: ${e instanceof Error ? e.message : "err"}`);
      }
    }
    vaultCache = { at: Date.now(), env };
  }
  const out: Record<string, string | undefined> = { ...vaultCache.env };
  for (const k of VOICE_KEYS) if ((base[k] ?? "").trim()) out[k] = base[k];
  return out;
}

const truthy = (v?: string) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const err = (s: number, code: string, lang: VoiceLang) => j(s, { error: voiceMessage(code, lang), code });

/** Tabela ainda não existe (migração não aplicada)? */
const missingTable = (e: Loose) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(String(e.message ?? "")));

export async function handleVoice(user: Loose, body: Loose, req: Request, idempotencyKey?: string): Promise<Response> {
  const action = String(body.action);
  const lang = voiceLang(body.language ?? req.headers.get("Accept-Language"));
  const env = await voiceEnv();
  const allowed = voiceCloneAllowed(env, user.id);
  const costs = voiceCloneCosts(env);
  const engine = Boolean((env.VERTAL_OWN_VOICE_URL ?? "").trim() && (env.VERTAL_OWN_VOICE_TOKEN ?? "").trim());

  if (action === "voice_config") {
    return j(200, {
      ok: true, enabled: allowed, engine: allowed ? engine : false, costs,
      consent_version: VOICE_CONSENT_VERSION, consent_text: VOICE_CONSENT_TEXT[lang],
      limits: { max_voices: VOICE_LIMITS.maxVoicesPerUser, min_seconds: VOICE_LIMITS.minSampleSeconds, max_seconds: VOICE_LIMITS.maxSampleSeconds, max_bytes: VOICE_LIMITS.maxSampleBytes, max_text: VOICE_LIMITS.maxTextChars },
    });
  }
  if (!allowed) return err(403, "disabled", lang);

  const admin = supaAdmin();
  try {
    switch (action) {
      case "voice_list": {
        const { data, error } = await admin.from("vertal_voice_clones")
          .select("id,name,language,sample_seconds,created_at").eq("user_id", user.id).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(VOICE_LIMITS.maxVoicesPerUser);
        if (error) return missingTable(error) ? err(503, "unavailable", lang) : j(500, { error: "list_failed" });
        return j(200, { ok: true, voices: data ?? [] });
      }
      case "voice_create":
        return await createVoice(admin, user, body, req, lang, costs.create, env, idempotencyKey);
      case "voice_delete": {
        const id = String(body.voice_id ?? "");
        if (!UUID_RE.test(id)) return j(400, { error: "invalid_voice_id" });
        const { data, error } = await admin.from("vertal_voice_clones").update({ deleted_at: new Date().toISOString() })
          .eq("id", id).eq("user_id", user.id).is("deleted_at", null).select("sample_path").maybeSingle();
        if (error) return missingTable(error) ? err(503, "unavailable", lang) : j(500, { error: "delete_failed" });
        if (data?.sample_path) await admin.storage.from("uploads").remove([data.sample_path]).catch(() => undefined);
        return j(200, { ok: true, deleted: Boolean(data) });
      }
      case "voice_speak":
      case "voice_sing":
        if (!engine) return err(503, "unavailable", lang);
        return await submitJob(admin, user, body, lang, action === "voice_speak" ? "speak" : "sing", costs, env, idempotencyKey);
      case "voice_status":
        return await jobStatus(admin, user, body, lang, env);
      case "voice_jobs": {
        const { data, error } = await admin.from("vertal_voice_jobs")
          .select("id,kind,status,output_url,error,created_at,finished_at,voice_id,input")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
        if (error) return missingTable(error) ? err(503, "unavailable", lang) : j(500, { error: "list_failed" });
        return j(200, { ok: true, jobs: (data ?? []).map(jobView) });
      }
      default:
        return j(400, { error: "invalid action" });
    }
  } catch (e) {
    console.error("[creative-music/voice] error:", e instanceof Error ? e.message : e);
    return err(500, "unavailable", lang);
  }
}

async function createVoice(admin: Loose, user: Loose, body: Loose, req: Request, lang: VoiceLang, cost: number, env: Record<string, string | undefined>, idem?: string) {
  const name = cleanVoiceName(body.name) || (lang === "en" ? "My voice" : lang === "es" ? "Mi voz" : "Minha voz");
  if (!consentValid(body.consent)) {
    return j(400, { error: voiceMessage("consent_required", lang), code: "consent_required", consent_version: VOICE_CONSENT_VERSION, consent_text: VOICE_CONSENT_TEXT[lang] });
  }
  const path = ownVoiceSamplePath(user.id, body.sample_path);
  const mime = typeof body.sample_mime === "string" ? body.sample_mime.toLowerCase() : "";
  const seconds = Number(body.sample_seconds);
  if (!path || !VOICE_SAMPLE_MIME.test(mime) || !Number.isFinite(seconds) || seconds < VOICE_LIMITS.minSampleSeconds || seconds > VOICE_LIMITS.maxSampleSeconds) {
    return err(400, "sample_invalid", lang);
  }
  // A amostra precisa existir no bucket, dentro da pasta do usuário.
  const signed = await admin.storage.from("uploads").createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) return err(400, "sample_invalid", lang);

  const { count, error: cErr } = await admin.from("vertal_voice_clones").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).is("deleted_at", null);
  if (cErr) return missingTable(cErr) ? err(503, "unavailable", lang) : j(500, { error: "create_failed" });
  if ((count ?? 0) >= VOICE_LIMITS.maxVoicesPerUser) return err(409, "too_many", lang);

  if (cost > 0) {
    const ded = await deductCredits(user.id, cost, "voice_clone_create", { name }, user.email, idem ? `voice-create:${idem}` : null, { chargeAdmins: truthy(env.VERTAL_OWN_VOICE_CHARGE_ADMINS) });
    if (!ded.ok) return err((ded as Loose).status === 409 ? 409 : 402, "insufficient_credits", lang);
  }
  // Consentimento gravado junto com a voz, ANTES de qualquer uso (texto do servidor, não do cliente).
  const { data, error } = await admin.from("vertal_voice_clones").insert({
    user_id: user.id, name, sample_path: path, sample_mime: mime.slice(0, 60), sample_seconds: Math.round(seconds * 10) / 10,
    language: lang, consent_version: VOICE_CONSENT_VERSION, consent_text: VOICE_CONSENT_TEXT[lang],
    consent_accepted_at: new Date().toISOString(),
    consent_ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null,
    consent_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
  }).select("id,name,language,sample_seconds,created_at").single();
  if (error) return missingTable(error) ? err(503, "unavailable", lang) : j(500, { error: "create_failed" });
  return j(200, { ok: true, voice: data });
}

async function pickVoice(admin: Loose, userId: string, voiceId: unknown) {
  let q = admin.from("vertal_voice_clones").select("id,name,sample_path,language").eq("user_id", userId).is("deleted_at", null);
  if (typeof voiceId === "string" && UUID_RE.test(voiceId)) q = q.eq("id", voiceId);
  return await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
}

async function submitJob(admin: Loose, user: Loose, body: Loose, lang: VoiceLang, kind: VoiceJobKind, costs: { speak: number; sing: number }, env: Record<string, string | undefined>, idem?: string) {
  const { data: voice, error: vErr } = await pickVoice(admin, user.id, body.voice_id);
  if (vErr) return missingTable(vErr) ? err(503, "unavailable", lang) : j(500, { error: "voice_lookup_failed" });
  if (!voice) return err(404, "no_voice", lang);

  const ref = await admin.storage.from("uploads").createSignedUrl(voice.sample_path, 60 * 60);
  if (ref.error || !ref.data?.signedUrl) return err(404, "no_voice", lang);

  const payload: Record<string, unknown> = { kind, reference_url: ref.data.signedUrl };
  const input: Record<string, unknown> = { voice_name: voice.name };
  if (kind === "speak") {
    const text = cleanSpeakText(body.text);
    if (text.length < 2) return j(400, { error: "text_required" });
    payload.text = text;
    payload.language = voiceLang(body.language ?? voice.language);
    input.text = text;
  } else {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const path = ownUploadPathFromUrl(user.id, body.source_url ?? body.source_path, supabaseUrl);
    if (!path) return err(400, "source_missing", lang);
    const src = await admin.storage.from("uploads").createSignedUrl(path, 60 * 60);
    if (src.error || !src.data?.signedUrl) return err(404, "source_missing", lang);
    payload.source_url = src.data.signedUrl;
    const shift = Number(body.pitch_shift);
    if (Number.isFinite(shift) && Math.abs(shift) <= 12) payload.pitch_shift = Math.round(shift);
    input.source_path = path;
    if (typeof body.title === "string") input.title = body.title.slice(0, 120);
  }

  const cost = kind === "speak" ? costs.speak : costs.sing;
  const chargeKey = idem && idem.length > 8 ? `voice:${kind}:${idem}` : `voice:${kind}:${user.id}:${crypto.randomUUID()}`;
  const ded = await deductCredits(user.id, cost, `voice_clone_${kind}`, { voice_id: voice.id }, user.email, chargeKey, { chargeAdmins: truthy(env.VERTAL_OWN_VOICE_CHARGE_ADMINS) });
  if (!ded.ok) {
    if ((ded as Loose).error === "duplicate_request") return j(409, { error: "duplicate_request" });
    return err((ded as Loose).status === 429 ? 429 : 402, "insufficient_credits", lang);
  }
  const charged = Boolean((ded as Loose).charged);

  const base = String(env.VERTAL_OWN_VOICE_URL).replace(/\/+$/, "");
  let jobId = "";
  try {
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.VERTAL_OWN_VOICE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && typeof d?.id === "string") jobId = d.id;
    else console.error("[creative-music/voice] submit failed", res.status, JSON.stringify(d).slice(0, 200));
  } catch (e) {
    console.error("[creative-music/voice] submit error", e instanceof Error ? e.message : e);
  }
  // Não enviou: resposta não-2xx → withRefundOnFailure devolve o crédito desta requisição.
  if (!jobId) return err(502, "unavailable", lang);

  const { data: job, error: jErr } = await admin.from("vertal_voice_jobs").insert({
    user_id: user.id, voice_id: voice.id, kind, status: "processing", provider_job_id: jobId, input,
    credits: charged ? cost : 0, charged, charge_key: chargeKey,
  }).select("id,kind,status,created_at").single();
  if (jErr || !job) return err(500, "unavailable", lang);
  // Daqui em diante o crédito pertence ao trabalho: voice_status devolve se ele falhar.
  keepCharges();
  return j(200, { ok: true, job_id: job.id, kind, voice: { id: voice.id, name: voice.name }, cost, charged, eta_seconds: kind === "speak" ? 30 : 150 });
}

async function jobStatus(admin: Loose, user: Loose, body: Loose, lang: VoiceLang, env: Record<string, string | undefined>) {
  const id = String(body.job_id ?? "");
  if (!UUID_RE.test(id)) return j(400, { error: "invalid_job_id" });
  const { data: job, error } = await admin.from("vertal_voice_jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return missingTable(error) ? err(503, "unavailable", lang) : j(500, { error: "status_failed" });
  if (!job) return j(404, { error: "not_found" });
  if (job.status !== "processing") return j(200, jobView(job));

  const base = String(env.VERTAL_OWN_VOICE_URL ?? "").replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${env.VERTAL_OWN_VOICE_TOKEN ?? ""}` };
  let state: "processing" | "completed" | "failed" = "processing";
  let reason = "";
  let outPath = "";
  let outUrl = "";
  try {
    if (base) {
      const res = await fetch(`${base}/status?id=${encodeURIComponent(job.provider_job_id)}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      const d = await res.json().catch(() => ({}));
      if (d?.status === "completed") {
        const r = await fetch(`${base}/result?id=${encodeURIComponent(job.provider_job_id)}`, { headers: auth, signal: AbortSignal.timeout(60_000) });
        if (r.ok) {
          const bytes = new Uint8Array(await r.arrayBuffer());
          outPath = `${user.id}/voices/out/${job.id}.mp3`;
          const up = await admin.storage.from("uploads").upload(outPath, bytes, { contentType: "audio/mpeg", upsert: true });
          if (!up.error) {
            const s = await admin.storage.from("uploads").createSignedUrl(outPath, SIGNED_TTL);
            if (s.data?.signedUrl) {
              outUrl = s.data.signedUrl;
              state = "completed";
            }
          }
        }
      } else if (d?.status === "failed" || d?.status === "expired" || res.status === 404) {
        state = "failed";
        reason = String(d?.error ?? d?.status ?? "job_not_found").slice(0, 200);
      }
    }
  } catch (e) {
    console.warn("[creative-music/voice] status check failed:", e instanceof Error ? e.message : e);
  }
  const age = Date.now() - new Date(job.created_at).getTime();
  if (state === "processing" && age > VOICE_LIMITS.jobMaxMs) {
    state = "failed";
    reason = "timeout";
  }
  if (state === "completed") {
    const { data: upd } = await admin.from("vertal_voice_jobs").update({
      status: "completed", output_path: outPath, output_url: outUrl, finished_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing").select("*").maybeSingle();
    return j(200, jobView(upd ?? { ...job, status: "completed", output_url: outUrl }));
  }
  if (state === "failed") {
    let refunded = false;
    if (job.charged && job.charge_key) refunded = await refundCharge(user.id, Number(job.credits ?? 0), `voice_clone_${job.kind}`, job.charge_key);
    const { data: upd } = await admin.from("vertal_voice_jobs").update({
      status: "failed", error: reason || "generation_failed", refunded, finished_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing").select("*").maybeSingle();
    return j(200, { ...jobView(upd ?? { ...job, status: "failed", refunded }), message: voiceMessage("failed", lang) });
  }
  return j(200, jobView(job));
}

function jobView(x: Loose) {
  return {
    ok: true, job_id: x.id, kind: x.kind, status: x.status, audio_url: x.output_url ?? null,
    error: x.error ?? null, refunded: Boolean(x.refunded), created_at: x.created_at, finished_at: x.finished_at ?? null,
    voice_id: x.voice_id ?? null, title: x.input?.title ?? null, text: x.input?.text ?? null,
  };
}
