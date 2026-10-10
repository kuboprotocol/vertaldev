// Vertal Video Studio: 1–10 images → video.
//   POST { action: "submit", tier, style, aspect, images | image_count, prompt?, captions? }
//   POST { action: "status", asset_id }
// Express is rendered in the browser (flat charge). AI tiers animate each image through the fal.ai queue;
// each failed clip is refunded through the idempotent top-up RPC. Final composition happens client-side.
import { corsHeaders } from "../_shared/cors.ts";
import * as creative from "../_shared/creative.ts";
import {
  VIDEO_LIMITS,
  VIDEO_TIERS,
  buildFalInput,
  buildMotionPrompt,
  isVideoAspect,
  isVideoStyle,
  isVideoTier,
  quoteVideo,
  type VideoTierKey,
} from "../_shared/videoStudioConfig.ts";

const TOOL = "video_studio";
const FAL_QUEUE = "https://queue.fal.run/";

type JobStatus = "queued" | "completed" | "failed";
interface Job {
  index: number;
  image_url: string;
  status: JobStatus;
  request_id?: string;
  status_url?: string;
  response_url?: string;
  video_url?: string;
  error?: string;
  refunded?: boolean;
}
interface StudioMeta {
  tier: VideoTierKey;
  style: string;
  aspect: string;
  credits_per_clip_charged: number;
  submitted_at: string;
  jobs: Job[];
}

const defaultDeps = {
  getUser: creative.getUser,
  deductCredits: creative.deductCredits,
  admin: creative.supaAdmin as () => any,
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  env: (k: string): string | undefined => Deno.env.get(k),
};
let deps = defaultDeps;
/** Test seam: swap external dependencies (database, credits, fal.ai). */
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
    console.error("[creative-video-studio] error:", e);
    return j(500, { error: creative.sanitizeError(e) });
  }
}

Deno.serve(handleRequest);

async function submit(
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
  idempotencyKey: string | null,
) {
  const { tier, style, aspect } = body;
  if (!isVideoTier(tier)) return j(400, { error: "invalid_tier" });
  if (!isVideoStyle(style)) return j(400, { error: "invalid_style" });
  if (!isVideoAspect(aspect)) return j(400, { error: "invalid_aspect" });

  const t = VIDEO_TIERS[tier];
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, VIDEO_LIMITS.maxPromptChars) : "";
  const captions = Array.isArray(body.captions)
    ? body.captions.map((c) => (typeof c === "string" ? c.slice(0, VIDEO_LIMITS.maxCaptionChars) : ""))
    : [];

  let images: string[] = [];
  let imageCount: number;
  if (t.engine === "local") {
    imageCount = Number(body.image_count);
  } else {
    if (!Array.isArray(body.images)) return j(400, { error: "images_required" });
    images = body.images.filter((u): u is string => typeof u === "string");
    if (images.length !== body.images.length || !images.every((u) => isOwnUpload(u, user.id))) {
      return j(400, { error: "invalid_image_url" });
    }
    imageCount = images.length;
  }
  if (!Number.isInteger(imageCount) || imageCount < VIDEO_LIMITS.minImages || imageCount > VIDEO_LIMITS.maxImages) {
    return j(400, { error: `image_count_must_be_${VIDEO_LIMITS.minImages}_to_${VIDEO_LIMITS.maxImages}` });
  }

  const falKey = deps.env("FAL_KEY");
  if (t.engine === "fal" && !falKey) return j(503, { error: "video_ai_not_configured" });

  const { credits } = quoteVideo(tier, imageCount);
  const ded = await deps.deductCredits(
    user.id,
    credits,
    `creative_${TOOL}_${tier}`,
    { tier, style, aspect, image_count: imageCount },
    user.email,
    idempotencyKey,
  );
  if (!ded.ok) return j(ded.status ?? 402, { error: ded.error, credits_required: credits });

  const admin = deps.admin();
  const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: user.id });

  const meta: StudioMeta = {
    tier,
    style,
    aspect,
    credits_per_clip_charged: isAdmin ? 0 : t.creditsPerClip,
    submitted_at: new Date().toISOString(),
    jobs: [],
  };

  if (t.engine === "fal") {
    const model = deps.env(`FAL_MODEL_${tier.toUpperCase()}`) || t.falModel!;
    meta.jobs = await Promise.all(
      images.map(async (image_url, index): Promise<Job> => {
        const input = buildFalInput(tier, image_url, buildMotionPrompt(style, prompt, captions[index]));
        try {
          const r = await deps.fetch(FAL_QUEUE + model, {
            method: "POST",
            headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.request_id || !isFalUrl(d.status_url) || !isFalUrl(d.response_url)) {
            console.warn(`[creative-video-studio] fal submit failed (${r.status})`, JSON.stringify(d).slice(0, 300));
            return { index, image_url, status: "failed", error: "submit_failed" };
          }
          return { index, image_url, status: "queued", request_id: d.request_id, status_url: d.status_url, response_url: d.response_url };
        } catch (err) {
          console.error("[creative-video-studio] fal submit error:", err);
          return { index, image_url, status: "failed", error: "submit_failed" };
        }
      }),
    );
  }

  const { data: asset, error } = await admin
    .from("creative_assets")
    .insert({
      user_id: user.id,
      tool: TOOL,
      status: t.engine === "local" ? "completed" : "processing",
      prompt: prompt || null,
      credits_spent: credits,
      idempotency_key: idempotencyKey,
      metadata: meta,
    })
    .select("id")
    .single();
  if (error || !asset) throw new Error(`asset_insert_failed:${error?.message}`);

  await refundFailed(asset.id, user.id, meta);
  await admin.from("creative_assets").update({ metadata: meta, status: overallStatus(meta) }).eq("id", asset.id);

  return j(200, { ok: true, asset_id: asset.id, tier, credits_charged: isAdmin ? 0 : credits, ...publicView(meta) });
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

  const meta = asset.metadata as StudioMeta;
  const falKey = deps.env("FAL_KEY");
  const pending = meta.jobs.filter((job) => job.status === "queued");

  if (pending.length && falKey) {
    const expired = Date.now() - Date.parse(meta.submitted_at) > VIDEO_LIMITS.jobTimeoutMinutes * 60_000;
    await Promise.all(pending.map((job) => pollJob(job, falKey, userId, assetId, expired)));
    await refundFailed(assetId, userId, meta);
    const first = meta.jobs.find((job) => job.video_url)?.video_url ?? null;
    await admin
      .from("creative_assets")
      .update({ metadata: meta, status: overallStatus(meta), output_url: first, updated_at: new Date().toISOString() })
      .eq("id", assetId);
  }

  return j(200, { ok: true, asset_id: assetId, tier: meta.tier, ...publicView(meta) });
}

async function pollJob(job: Job, falKey: string, userId: string, assetId: string, expired: boolean) {
  const auth = { Authorization: `Key ${falKey}` };
  try {
    if (!isFalUrl(job.status_url) || !isFalUrl(job.response_url)) throw new Error("bad_job_urls");
    const s = await deps.fetch(job.status_url!, { headers: auth });
    const sd = await s.json().catch(() => ({}));
    if (sd.status !== "COMPLETED") {
      if (!s.ok && s.status !== 202) markFailed(job, `status_${s.status}`);
      else if (expired) markFailed(job, "timeout");
      return;
    }
    const r = await deps.fetch(job.response_url!, { headers: auth });
    const rd = await r.json().catch(() => ({}));
    const falUrl: unknown = rd?.video?.url;
    if (!r.ok || typeof falUrl !== "string" || !falUrl.startsWith("https://")) {
      markFailed(job, "generation_failed");
      return;
    }
    job.video_url = (await copyToStorage(falUrl, userId, assetId, job.index)) ?? falUrl;
    job.status = "completed";
  } catch (err) {
    console.error("[creative-video-studio] poll error:", err);
    if (expired) markFailed(job, "timeout");
  }
}

// Re-host clips in our public bucket so the browser composer can draw them on a canvas (same CORS policy as uploads).
async function copyToStorage(url: string, userId: string, assetId: string, index: number): Promise<string | null> {
  try {
    const r = await deps.fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const path = `${userId}/video-studio/${assetId}-${index}.mp4`;
    const storage = deps.admin().storage.from("uploads");
    const { error } = await storage.upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) return null;
    return storage.getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function refundFailed(assetId: string, userId: string, meta: StudioMeta) {
  const amount = meta.credits_per_clip_charged;
  for (const job of meta.jobs) {
    if (job.status !== "failed" || job.refunded) continue;
    if (amount <= 0) {
      job.refunded = true;
      continue;
    }
    const { error } = await deps.admin().rpc("execute_atomic_credit_topup", {
      _user_id: userId,
      _amount: amount,
      _reason: `refund:${TOOL}`,
      _category: "creative_refund",
      _metadata: { asset_id: assetId, clip_index: job.index, error: job.error },
      _idempotency_key: `refund:${TOOL}:${assetId}:${job.index}`,
    });
    if (error) console.error("[creative-video-studio] refund failed:", error);
    else job.refunded = true;
  }
}

function markFailed(job: Job, error: string) {
  job.status = "failed";
  job.error = error;
}

function overallStatus(meta: StudioMeta): string {
  if (!meta.jobs.length) return "completed";
  if (meta.jobs.some((job) => job.status === "queued")) return "processing";
  return meta.jobs.some((job) => job.status === "completed") ? "completed" : "failed";
}

function publicView(meta: StudioMeta) {
  return {
    status: overallStatus(meta),
    clips: meta.jobs.map(({ index, status, video_url, refunded }) => ({ index, status, video_url: video_url ?? null, refunded: !!refunded })),
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

function isFalUrl(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(FAL_QUEUE);
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
