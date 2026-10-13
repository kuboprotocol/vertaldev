// Vertal Avatar AI: photo + script → lip-synced talking-avatar video (HeyGen Avatar IV via OpenRouter).
//   POST { action: "submit", image_url, script, duration, aspect, resolution? }
//   POST { action: "status", asset_id }
// The job runs asynchronously on OpenRouter; the client polls "status". The finished video is copied to our
// public bucket (OpenRouter's content URL needs our API key). A failed or timed-out job is fully refunded.
import { corsHeaders } from "../_shared/cors.ts";
import * as creative from "../_shared/creative.ts";
import {
  AVATAR_LIMITS,
  AVATAR_MODEL,
  AVATAR_PROVIDER_COST_USD_PER_SECOND,
  countWords,
  isAvatarAspect,
  isAvatarDuration,
  isAvatarResolution,
  maxWordsFor,
  quoteAvatar,
} from "../_shared/avatarConfig.ts";

const TOOL = "avatar";
const OR_VIDEOS = "https://openrouter.ai/api/v1/videos";

interface AvatarMeta {
  model: string;
  duration: number;
  aspect: string;
  resolution: string;
  image_url: string;
  credits_charged: number;
  submitted_at: string;
  job_id?: string;
  job_status: "queued" | "completed" | "failed";
  video_url?: string;
  provider_cost_usd?: number;
  error?: string;
  refunded?: boolean;
}

const defaultDeps = {
  getUser: creative.getUser,
  deductCredits: creative.deductCredits,
  admin: creative.supaAdmin as () => any,
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  env: (k: string): string | undefined => Deno.env.get(k),
};
let deps = defaultDeps;
/** Test seam: swap external dependencies (database, credits, OpenRouter). */
export function __setDeps(d: Partial<typeof defaultDeps>) {
  deps = { ...defaultDeps, ...d };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "unauthorized" });

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "submit") return await submit(user, body, req.headers.get("X-Idempotency-Key"));
    if (body.action === "status") return await status(user.id, body.asset_id);
    return j(400, { error: "invalid_action" });
  } catch (e) {
    console.error("[creative-avatar] error:", e);
    return j(500, { error: creative.sanitizeError(e) });
  }
}

Deno.serve(creative.withRefundOnFailure(handleRequest));

async function submit(
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
  idempotencyKey: string | null,
) {
  const { duration, aspect, image_url } = body;
  const resolution = body.resolution ?? "720p";
  if (!isAvatarDuration(duration)) return j(400, { error: "invalid_duration" });
  if (!isAvatarAspect(aspect)) return j(400, { error: "invalid_aspect" });
  if (!isAvatarResolution(resolution)) return j(400, { error: "invalid_resolution" });
  if (typeof image_url !== "string" || !isOwnUpload(image_url, user.id)) return j(400, { error: "invalid_image_url" });

  const script = typeof body.script === "string" ? body.script.trim() : "";
  if (!script) return j(400, { error: "script_required" });
  if (script.length > AVATAR_LIMITS.maxScriptChars) return j(400, { error: "script_too_long" });
  if (countWords(script) > maxWordsFor(duration)) {
    return j(400, { error: "script_too_long_for_duration", max_words: maxWordsFor(duration) });
  }

  const orKey = deps.env("OPENROUTER_API_KEY");
  if (!orKey) return j(503, { error: "avatar_ai_not_configured" });

  const costPerSecond = Number(deps.env("AVATAR_COST_USD_PER_SECOND")) || AVATAR_PROVIDER_COST_USD_PER_SECOND;
  const { credits } = quoteAvatar(duration, costPerSecond);
  const ded = await deps.deductCredits(
    user.id,
    credits,
    `creative_${TOOL}`,
    { duration, aspect, resolution },
    user.email,
    idempotencyKey,
  );
  if (!ded.ok) return j(ded.status ?? 402, { error: ded.error, credits_required: credits });

  const admin = deps.admin();
  const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: user.id });
  const model = deps.env("AVATAR_MODEL") || AVATAR_MODEL;

  const meta: AvatarMeta = {
    model,
    duration,
    aspect,
    resolution,
    image_url,
    credits_charged: isAdmin ? 0 : credits,
    submitted_at: new Date().toISOString(),
    job_status: "queued",
  };

  const payload: Record<string, unknown> = {
    model,
    prompt: script,
    aspect_ratio: aspect,
    resolution,
    input_references: [{ type: "image_url", image_url: { url: image_url } }],
  };
  // Optional HeyGen passthrough (voice, expressiveness, captions…) as JSON, e.g. {"options":{"heygen":{...}}}.
  const providerOptions = deps.env("AVATAR_PROVIDER_OPTIONS");
  if (providerOptions) {
    try {
      payload.provider = JSON.parse(providerOptions);
    } catch {
      console.warn("[creative-avatar] AVATAR_PROVIDER_OPTIONS is not valid JSON; ignored");
    }
  }

  try {
    const r = await deps.fetch(OR_VIDEOS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kubovibe.dev",
        "X-Title": "KUBO Vibe",
      },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || typeof d.id !== "string") {
      console.warn(`[creative-avatar] submit failed (${r.status})`, JSON.stringify(d).slice(0, 300));
      markFailed(meta, "submit_failed");
    } else {
      meta.job_id = d.id;
    }
  } catch (err) {
    console.error("[creative-avatar] submit error:", err);
    markFailed(meta, "submit_failed");
  }

  const { data: asset, error } = await admin
    .from("creative_assets")
    .insert({
      user_id: user.id,
      tool: TOOL,
      status: "processing",
      prompt: script,
      credits_spent: credits,
      idempotency_key: idempotencyKey,
      metadata: meta,
    })
    .select("id")
    .single();
  if (error || !asset) throw new Error(`asset_insert_failed:${error?.message}`);

  await refundIfFailed(asset.id, user.id, meta);
  await admin.from("creative_assets").update({ metadata: meta, status: assetStatus(meta) }).eq("id", asset.id);

  return j(200, { ok: true, asset_id: asset.id, credits_charged: meta.credits_charged, ...publicView(meta) });
}

async function status(userId: string, assetId: unknown) {
  if (typeof assetId !== "string") return j(400, { error: "asset_id_required" });
  const admin = deps.admin();
  const { data: asset } = await admin
    .from("creative_assets")
    .select("id, status, metadata")
    .eq("id", assetId)
    .eq("user_id", userId)
    .eq("tool", TOOL)
    .maybeSingle();
  if (!asset) return j(404, { error: "not_found" });

  const meta = asset.metadata as AvatarMeta;
  const orKey = deps.env("OPENROUTER_API_KEY");
  if (meta.job_status === "queued" && orKey) {
    const expired = Date.now() - Date.parse(meta.submitted_at) > AVATAR_LIMITS.jobTimeoutMinutes * 60_000;
    await pollJob(meta, orKey, userId, assetId, expired);
    await refundIfFailed(assetId, userId, meta);
    await admin
      .from("creative_assets")
      .update({
        metadata: meta,
        status: assetStatus(meta),
        output_url: meta.video_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId);
  }

  return j(200, { ok: true, asset_id: assetId, ...publicView(meta) });
}

async function pollJob(meta: AvatarMeta, orKey: string, userId: string, assetId: string, expired: boolean) {
  const auth = { Authorization: `Bearer ${orKey}` };
  try {
    if (!meta.job_id || !/^[\w-]+$/.test(meta.job_id)) throw new Error("bad_job_id");
    const s = await deps.fetch(`${OR_VIDEOS}/${meta.job_id}`, { headers: auth });
    const sd = await s.json().catch(() => ({}));
    if (sd.status === "failed" || sd.status === "cancelled" || sd.status === "expired") {
      markFailed(meta, typeof sd.error === "string" ? sd.error.slice(0, 200) : sd.status);
      return;
    }
    if (sd.status !== "completed") {
      if (!s.ok) markFailed(meta, `status_${s.status}`);
      else if (expired) markFailed(meta, "timeout");
      return;
    }
    if (typeof sd.usage?.cost === "number") meta.provider_cost_usd = sd.usage.cost;
    const url = await copyToStorage(`${OR_VIDEOS}/${meta.job_id}/content?index=0`, auth, userId, assetId);
    if (!url) {
      // Download hiccup: retry on the next poll until the timeout.
      if (expired) markFailed(meta, "download_failed");
      return;
    }
    meta.video_url = url;
    meta.job_status = "completed";
  } catch (err) {
    console.error("[creative-avatar] poll error:", err);
    if (expired) markFailed(meta, "timeout");
  }
}

async function copyToStorage(url: string, auth: Record<string, string>, userId: string, assetId: string) {
  try {
    const r = await deps.fetch(url, { headers: auth });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const path = `${userId}/avatar/${assetId}.mp4`;
    const storage = deps.admin().storage.from("uploads");
    const { error } = await storage.upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) return null;
    return storage.getPublicUrl(path).data.publicUrl as string;
  } catch {
    return null;
  }
}

async function refundIfFailed(assetId: string, userId: string, meta: AvatarMeta) {
  if (meta.job_status !== "failed" || meta.refunded) return;
  if (meta.credits_charged <= 0) {
    meta.refunded = true;
    return;
  }
  const { error } = await deps.admin().rpc("execute_atomic_credit_topup", {
    _user_id: userId,
    _amount: meta.credits_charged,
    _reason: `refund:${TOOL}`,
    _category: "creative_refund",
    _metadata: { asset_id: assetId, error: meta.error },
    _idempotency_key: `refund:${TOOL}:${assetId}`,
  });
  if (error) console.error("[creative-avatar] refund failed:", error);
  else meta.refunded = true;
}

function markFailed(meta: AvatarMeta, error: string) {
  meta.job_status = "failed";
  meta.error = error;
}

function assetStatus(meta: AvatarMeta): string {
  return meta.job_status === "queued" ? "processing" : meta.job_status;
}

function publicView(meta: AvatarMeta) {
  return {
    status: assetStatus(meta),
    video_url: meta.video_url ?? null,
    refunded: !!meta.refunded,
    error: meta.job_status === "failed" ? meta.error ?? "generation_failed" : null,
  };
}

function isOwnUpload(url: string, userId: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(deps.env("SUPABASE_URL")!);
    return u.protocol === "https:" && u.host === base.host &&
      u.pathname.startsWith(`/storage/v1/object/public/uploads/${userId}/`) && !u.pathname.includes("..");
  } catch {
    return false;
  }
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
