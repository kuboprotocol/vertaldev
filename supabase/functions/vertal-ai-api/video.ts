// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// VERTAL AI API · vídeo (marca branca). Rotas (Authorization: Bearer vtl_ai_…):
//
//   POST /v1/videos/generations  {mode?:"ai"|"cover", prompt?, duration_seconds, audio_url?, image_url?, end_user?}
//                                → 202 {id, object:"video.job", status:"processing", estimate}
//   GET  /v1/videos/{id}         status; pronto → video_url (7 dias) e o preço cobrado
//
// Motor: o mesmo app Modal do "Vertal Vídeo" (vertal-video, Wan2.1 próprio), rota /video.
// Cobrança: atacado (cobrança v2) = max(custo real medido, piso "video") × 1,20, em créditos pré-pagos; só cobra
// o que fica pronto (idempotente por job). Saldo zerado → 402. Trava de custo/duração em _shared/vertalCodeAi/videoApi.ts.
// Liga por chave: vertal_ai_api_keys.features {"video": true} (ou VERTAL_VIDEO_API_ENABLED + _KEY_IDS no VERTAL_GPU_CONFIG;
// VERTAL_VIDEO_API_ENABLED=false desliga tudo). Sem tabela nova: o id do job é
// assinado (HMAC) e amarrado à chave; o MP4 fica em uploads/{dono}/videos/api/{job}.mp4.
import { checkSpend, MICRO } from "../_shared/vertalCodeAi/pricing.ts";
import { expandBillingEnv, loadBilling, pickBillingLocale, priceRequest, wholesaleBalanceGate, type BillingConfig } from "../_shared/vertalCodeAi/billing.ts";
import { cleanEndUser, safeFetchUrl } from "../_shared/vertalCodeAi/voiceApi.ts";
import {
  cappedCostUsd, cleanVideoPrompt, loadVideoApiConfig, matchVideoRoute, planVideo, signVideoJob, verifyVideoJob, videoApiEnabledFor,
  videoCostUsd, videoEnvFrom, type VideoApiConfig, type VideoJobClaims, type VideoMode,
} from "../_shared/vertalCodeAi/videoApi.ts";
import { authKey, balanceOf, fail, json, type KeyRow } from "./voice.ts";

type Env = Record<string, string | undefined>;
const RESULT_TTL_S = 7 * 24 * 3600;
const BUCKET = "uploads";

function env(): Env {
  return expandBillingEnv(videoEnvFrom(Deno.env.toObject()));
}
const secret = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function engine(e: Env) {
  const url = (e.VERTAL_OWN_VIDEO_URL ?? "").trim().replace(/\/+$/, "");
  const token = (e.VERTAL_OWN_VIDEO_TOKEN ?? "").trim();
  return /^https:\/\//i.test(url) && token ? { url, auth: { Authorization: `Bearer ${token}` } } : null;
}

const outPath = (owner: string, c: VideoJobClaims) => `${owner}/videos/api/${c.p}.mp4`;

export async function handleVideoApi(req: Request, admin: any, path: string): Promise<Response | null> {
  const route = matchVideoRoute(req.method, path);
  if (route === "not_video") return null;
  if (route === null) return fail(405, "method_not_allowed", "Method not allowed for this route.");

  const k = await authKey(req, admin);
  if (k instanceof Response) return k;
  const e = env();
  // Recurso por chave (coluna features; sem a migração, só a lista do config vale).
  const { data: feat } = await admin.from("vertal_ai_api_keys").select("features").eq("id", k.row.id).maybeSingle().then((r: any) => r, () => ({ data: null }));
  if (!videoApiEnabledFor(e, { id: k.row.id, features: feat?.features })) return fail(404, "video_api_disabled", "Video endpoints are not enabled for this key yet.");
  const billing = loadBilling(e.VERTAL_BILLING_CONFIG).config;
  const cfg = loadVideoApiConfig(e, billing.wholesaleMarkup);
  try {
    return route.r === "create" ? await create(req, admin, k, billing, cfg, e) : await status(admin, k.row, billing, cfg, e, route.id);
  } catch (err) {
    console.error("[vertal-ai-api/video]", err instanceof Error ? err.message : err);
    return fail(500, "internal_error", "Internal error.");
  }
}

async function create(req: Request, admin: any, k: { row: KeyRow; spentMicro: number }, billing: BillingConfig, cfg: VideoApiConfig, e: Env): Promise<Response> {
  const eng = engine(e);
  if (!eng) return fail(503, "video_engine_unavailable", "The video engine is unavailable. Nothing was charged.");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode: VideoMode = body.mode === "cover" ? "cover" : "ai";
  const prompt = cleanVideoPrompt(body.prompt);
  if (mode === "ai" && prompt.length < 3) return fail(400, "invalid_prompt", "prompt (3-1500 chars) is required for mode=ai.");
  const audio = body.audio_url == null || body.audio_url === "" ? null : safeFetchUrl(body.audio_url);
  if (body.audio_url && !audio) return fail(400, "invalid_audio_url", "audio_url must be a public https URL.");
  const image = body.image_url == null || body.image_url === "" ? null : safeFetchUrl(body.image_url);
  if (body.image_url && !image) return fail(400, "invalid_image_url", "image_url must be a public https URL.");
  if (mode === "cover" && (!audio || !image)) return fail(400, "cover_media_required", "mode=cover needs image_url and audio_url.");
  const endUser = body.end_user == null ? null : cleanEndUser(body.end_user);
  if (body.end_user != null && !endUser) return fail(400, "invalid_end_user", "end_user must be 1-128 chars [A-Za-z0-9._:@-].");

  const planned = planVideo(cfg, mode, body.duration_seconds ?? body.seconds);
  if (!planned.ok) return fail(planned.status, planned.code, planned.message);
  const plan = planned.plan;

  // Saldo positivo + teto mensal da chave para o pior caso (o teto de preço do pedido).
  const balance = await balanceOf(admin, k.row.owner_id);
  const g = wholesaleBalanceGate(balance, pickBillingLocale([req.headers.get("Accept-Language")]));
  if (g.ok === false) return fail(g.status, g.code, g.message);
  const worst = priceRequest(billing, { channel: "wholesale", kind: "video", costUsd: plan.priceCapUsd / cfg.wholesaleMarkup });
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

  const payload: Record<string, unknown> = { mode, seconds: plan.seconds };
  if (audio) payload.audio_url = audio.toString();
  if (mode === "cover") payload.image_url = image!.toString();
  else Object.assign(payload, { prompt, budget_gpu_s: plan.budgetGpuS, max_clips: plan.clips, steps: plan.steps, clip_seconds: plan.clipSeconds });

  let providerId = "";
  try {
    const r = await fetch(`${eng.url}/video`, { method: "POST", headers: { ...eng.auth, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && typeof d?.id === "string" && /^fc-[A-Za-z0-9]+$/.test(d.id)) providerId = d.id;
  } catch { /* abaixo */ }
  if (!providerId) return fail(503, "video_engine_unavailable", "The video engine is busy. Try again shortly. Nothing was charged.");

  const claims: VideoJobClaims = { p: providerId, k: k.row.id, m: mode, s: plan.seconds, c: plan.priceCapUsd, t: Math.floor(Date.now() / 1000), ...(endUser ? { u: endUser } : {}) };
  const id = await signVideoJob(secret(), claims);
  const est = priceRequest(billing, { channel: "wholesale", kind: "video", costUsd: plan.estimatedCostUsd });
  return json(202, {
    id, object: "video.job", mode, status: "processing", duration_seconds: plan.seconds, end_user: endUser,
    eta_seconds: mode === "cover" ? 30 : 90 + plan.clips * 45,
    estimate: { price_usd: est.ok ? est.priceUsd : null, credits: est.ok ? est.credits : null, max_price_usd: plan.priceCapUsd, scenes: plan.clips },
    poll: `/v1/videos/${id}`,
  });
}

function view(c: VideoJobClaims, id: string, extra: Record<string, unknown>) {
  return { id, object: "video.job", mode: c.m, duration_seconds: c.s, end_user: c.u ?? null, created_at: new Date(c.t * 1000).toISOString(), ...extra };
}

async function chargeVideo(admin: any, row: KeyRow, c: VideoJobClaims, billing: BillingConfig, costUsd: number) {
  const price = priceRequest(billing, { channel: "wholesale", kind: "video", costUsd });
  if (!price.ok) return null;
  const { data: rec, error } = await admin.rpc("vertal_ai_record_usage", {
    _key_id: row.id, _owner_id: row.owner_id, _request_id: `video-job:${c.p}`, _model: c.m === "cover" ? "vertal-video-cover" : "vertal-video-ai", _cost_class: "video",
    _prompt_tokens: 0, _completion_tokens: 0, _cost_micro: price.micro, _response: { kind: "video", mode: c.m, seconds: c.s, cost_usd: costUsd },
  });
  if (error) {
    console.error("[vertal-ai-api/video] record usage:", error.message);
    return null;
  }
  if (rec?.replayed) {
    // Já cobrado num poll anterior: devolve o que ficou registrado.
    const { data: u } = await admin.from("vertal_ai_usage").select("cost_micro").eq("id", rec.usage_id).maybeSingle();
    const micro = Number(u?.cost_micro ?? price.micro);
    return { credits: micro / MICRO, priceUsd: Math.round((micro / MICRO) * 0.03 * 1e6) / 1e6 };
  }
  if (rec?.debit_credits > 0) {
    const { error: chErr } = await admin.rpc("execute_atomic_credit_deduction", {
      _user_id: row.owner_id, _amount: rec.debit_credits, _reason: "vertal_ai_api:video", _category: "vertal_ai_api",
      _metadata: { key_id: row.id, usage_id: rec.usage_id, mode: c.m, seconds: c.s }, _idempotency_key: `vai-${rec.usage_id}`,
    });
    await admin.from("vertal_ai_usage").update({ charge_status: chErr ? "owed" : "charged" }).eq("id", rec.usage_id);
  }
  if (rec?.usage_id) await admin.from("vertal_ai_usage").update({ kind: "video", markup: price.markup, cost_usd: price.billedCostUsd }).eq("id", rec.usage_id).then(() => {}, () => {});
  return { credits: price.credits, priceUsd: price.priceUsd };
}

async function status(admin: any, row: KeyRow, billing: BillingConfig, cfg: VideoApiConfig, e: Env, id: string): Promise<Response> {
  const c = await verifyVideoJob(secret(), id, row.id);
  if (!c) return fail(404, "not_found", "Video job not found.");
  const path = outPath(row.owner_id, c);

  // Já pronto antes (MP4 guardado): só assina de novo (e a cobrança é idempotente).
  const existing = await admin.storage.from(BUCKET).createSignedUrl(path, RESULT_TTL_S);
  const eng = engine(e);
  let st: any = null;
  if (existing.data?.signedUrl && eng) {
    try {
      const r = await fetch(`${eng.url}/status?id=${encodeURIComponent(c.p)}`, { headers: eng.auth, signal: AbortSignal.timeout(15_000) });
      const d = await r.json().catch(() => null);
      if (d?.status === "completed") st = d;
    } catch { /* cobrança já registrada ou CPU só */ }
  }
  if (!existing.data?.signedUrl) {
    if (!eng) return json(200, view(c, id, { status: "processing" }));
    try {
      const r = await fetch(`${eng.url}/status?id=${encodeURIComponent(c.p)}`, { headers: eng.auth, signal: AbortSignal.timeout(15_000) });
      st = await r.json().catch(() => ({}));
      if (r.status === 404 || st?.status === "failed" || st?.status === "expired") {
        return json(200, view(c, id, { status: "failed", error: String(st?.status ?? "job_not_found"), message: "Generation failed. Nothing was charged." }));
      }
      if (st?.status !== "completed") {
        if (Date.now() / 1000 - c.t > 2 * 3600) return json(200, view(c, id, { status: "failed", error: "timeout", message: "Generation failed. Nothing was charged." }));
        return json(200, view(c, id, { status: "processing" }));
      }
      const res = await fetch(`${eng.url}/result?id=${encodeURIComponent(c.p)}`, { headers: eng.auth, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) return json(200, view(c, id, { status: "processing" }));
      const up = await admin.storage.from(BUCKET).upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: "video/mp4", upsert: true });
      if (up.error) {
        console.error("[vertal-ai-api/video] upload:", up.error.message);
        return json(200, view(c, id, { status: "processing" }));
      }
    } catch {
      return json(200, view(c, id, { status: "processing" }));
    }
  }
  const signed = existing.data?.signedUrl ? existing : await admin.storage.from(BUCKET).createSignedUrl(path, RESULT_TTL_S);
  if (!signed.data?.signedUrl) return json(200, view(c, id, { status: "processing" }));

  // Custo real (GPU medida pelo motor + CPU), nunca acima do teto do pedido.
  const real = videoCostUsd(cfg, st ? Number(st.gpu_s ?? 0) : 0, st ? Number(st.cpu_s ?? 0) : 60);
  const cost = cappedCostUsd(cfg, { priceCapUsd: c.c }, real);
  const billed = await chargeVideo(admin, row, c, billing, cost);
  return json(200, view(c, id, {
    status: "completed",
    video_url: signed.data.signedUrl,
    expires_in: RESULT_TTL_S,
    ...(st ? { scenes: st.clips ?? null, render_seconds: st.cpu_s ?? null, gpu_seconds: st.gpu_s ?? null } : {}),
    billing: billed ? { credits: billed.credits, price_usd: billed.priceUsd } : null,
  }));
}
