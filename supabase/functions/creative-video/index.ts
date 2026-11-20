// supabase/functions/creative-video/index.ts
// Kubo Shorts + Avatar — text/image to short video.
//   Shorts: POST { prompt, duration } → script + thumbnail.
//   Avatar: POST { mode: "avatar", prompt, voice, image_url? } → narration (MiniMax, Kokoro or the user's
//           cloned voice) and, with a photo, a lip-sync job (Kling AI Avatar) on the fal.ai queue;
//           POST { mode: "avatar", action: "status", asset_id }.
//           Cloned voices: action "clone_voice" { name, sample_url, consent: true }, "list_voices",
//           "delete_voice" { voice_id }. `voice` is a catalog id or `clone:<uuid>` owned by the caller.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, supaAdmin, withRefundOnFailure } from "../_shared/creative.ts";
import {
  AVATAR_CLONE_LIMITS,
  AVATAR_CLONE_PREVIEW_TEXT,
  AVATAR_KOKORO_MODEL,
  AVATAR_LIMITS,
  AVATAR_TTS_MODEL,
  AVATAR_VIDEO_MODEL,
  AVATAR_VOICE_CLONE_MODEL,
  AVATAR_VOICES,
  DEFAULT_AVATAR_VOICE,
  avatarVideoCredits,
  avatarVoiceCloneCredits,
  avatarVoiceCredits,
  cloneVoiceRef,
  estimateSpeechSeconds,
  getLibraryVoice,
  isAvatarVoice,
  isUuid,
  parseCloneVoiceRef,
  quoteAvatar,
  wavDurationSeconds,
} from "../_shared/avatarConfig.ts";

const FAL_RUN = "https://fal.run/";
const FAL_QUEUE = "https://queue.fal.run/";

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  const authHeader = req.headers.get("Authorization");
  const user = await getUser(authHeader);
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.mode === "avatar") {
      if (body.action === "status") return await avatarStatus(user.id, body.asset_id);
      if (body.action === "clone_voice") return await cloneVoice(user, body, idempotencyKey);
      if (body.action === "list_voices") return await listVoices(user.id);
      if (body.action === "delete_voice") return await deleteVoice(user.id, body.voice_id);
      return await avatarSubmit(user, body, idempotencyKey);
    }

    const { mode = "shorts", prompt, duration = 30 } = body;
    if (!prompt) return j(400, { error: "prompt required" });

    const cost = 3;
    const tool = "shorts";

    console.log(`[creative-video] processing ${tool} for ${user.id}, cost: ${cost}`);

    const ded = await deductCredits(user.id, cost, `creative_${tool}`, { prompt, duration }, user.email, idempotencyKey);
    if (!ded.ok) {
      console.warn(`[creative-video] credit deduction failed: ${ded.error}`);
      return j((ded as any).status ?? 402, { error: ded.error });
    }

    // 1) Generate script using DeepSeek/Lovable AI
    const DS = Deno.env.get("DEEPSEEK_API_KEY");
    const LK = Deno.env.get("LOVABLE_API_KEY");
    const OR = Deno.env.get("OPENROUTER_API_KEY");
    
    const sysMsg =
      `Escreva um roteiro de vídeo curto vertical (Reels/Shorts/TikTok) em PT-BR, com gancho nos primeiros 3s, narração e call-to-action. Duração aproximada: ${duration}s.`;
    
    const messages = [
      { role: "system", content: sysMsg },
      { role: "user", content: prompt },
    ];
    
    let script = "";
    const aiTries: Array<{ url: string; key?: string; model: string }> = [];
    if (OR) aiTries.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: OR, model: "moonshotai/kimi-k2.6" });
    if (DS) aiTries.push({ url: "https://api.deepseek.com/chat/completions", key: DS, model: "deepseek-chat" });
    if (LK) aiTries.push({ url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LK, model: "google/gemini-2.0-flash-exp" });

    for (const t of aiTries) {
      if (!t.key) continue;
      try {
        const r = await fetch(t.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: t.model, messages, max_tokens: 800 }),
        });
        if (r.ok) {
          const d = await r.json();
          script = d?.choices?.[0]?.message?.content ?? "";
          if (script) break;
        } else {
          console.warn(`[creative-video] AI try failed (${t.model}): ${r.status}`);
        }
      } catch (err) {
        console.error(`[creative-video] AI fetch error (${t.model}):`, err);
      }
    }

    // 2) Generate cover/thumbnail via Lovable AI image
    let cover: string | null = null;
    if (LK) {
      try {
        const ir = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LK}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-exp", // Updated to valid image model if available or fallback
            messages: [{ role: "user", content: `Thumbnail vertical cinematográfica para vídeo: ${prompt}` }],
          }),
        });
        const id = await ir.json();
        cover = id?.choices?.[0]?.message?.content?.match(/https:\/\/[^\s]+/)?.[0] ?? null;
      } catch (err) { 
        console.error("[creative-video] thumbnail error:", err);
      }
    }

    const assetId = await recordAsset(user.id, {
      tool,
      status: "processing",
      prompt,
      output_url: cover ?? undefined,
      output_text: script,
      credits_spent: cost,
      metadata: { mode, duration, cover, script },
    });

    return j(200, {
      ok: true,
      asset_id: assetId,
      script,
      cover,
      note: "Roteiro + thumbnail prontos. Renderização final de vídeo em fila (será disponibilizada em breve).",
    });
  } catch (e) {
    console.error("[creative-video] critical error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── Vertal Avatar AI ────────────────────────────────────────────────────────────────────────────

interface AvatarJob {
  request_id: string;
  status_url: string;
  response_url: string;
}
interface AvatarMeta {
  mode: "avatar";
  /** Catalog id or `clone:<uuid>`. */
  voice: string;
  voice_provider?: "minimax" | "kokoro" | "clone";
  source: "photo" | "text";
  image_url: string | null;
  audio_url: string;
  seconds: number;
  voice_credits: number;
  /** Credits actually charged for the video (0 for admins), refunded if the lip-sync fails. */
  video_credits_charged: number;
  submitted_at: string;
  job?: AvatarJob;
  video_url?: string;
  error?: string;
  refunded?: boolean;
}

async function avatarSubmit(
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
  idempotencyKey: string | undefined,
) {
  const text = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!text) return j(400, { error: "prompt required" });
  if (text.length > AVATAR_LIMITS.maxTextChars) return j(400, { error: `text_max_${AVATAR_LIMITS.maxTextChars}_chars` });
  const resolved = await resolveVoice(user.id, body.voice);
  if (!resolved) return j(400, { error: "invalid_voice" });
  const voice = resolved.ref;

  let imageUrl: string | null = null;
  if (body.image_url !== undefined && body.image_url !== null) {
    if (typeof body.image_url !== "string" || !isOwnUpload(body.image_url, user.id)) return j(400, { error: "invalid_image_url" });
    imageUrl = body.image_url;
  }

  const falKey = Deno.env.get("FAL_KEY");
  if (!falKey) return j(503, { error: "avatar_ai_not_configured" });
  const auth = { Authorization: `Key ${falKey}`, "Content-Type": "application/json" };

  // 1) Voice. Charged first; withRefundOnFailure gives it back if anything below fails.
  const voiceCredits = avatarVoiceCredits(text.length);
  const dedVoice = await deductCredits(user.id, voiceCredits, "creative_avatar_voice", { chars: text.length, voice }, user.email, idempotencyKey);
  if (!dedVoice.ok) return j(dedVoice.status ?? 402, { error: dedVoice.error, credits_required: quoteAvatar(text, !!imageUrl).credits });

  const speech = await synthesize(resolved, text, auth);
  if (!speech) return j(502, { error: "voice_generation_failed" });
  const falAudioUrl = speech.url;
  const ext = speech.contentType === "audio/wav" ? "wav" : "mp3";
  const stored = await storeBytes(speech.bytes, `${user.id}/avatar/${crypto.randomUUID()}.${ext}`, speech.contentType);
  const seconds = speech.seconds ?? estimateSpeechSeconds(text.length);
  const audioUrl = stored?.signedUrl ?? falAudioUrl;

  const meta: AvatarMeta = {
    mode: "avatar",
    voice,
    voice_provider: resolved.provider,
    source: imageUrl ? "photo" : "text",
    image_url: imageUrl,
    audio_url: audioUrl,
    seconds,
    voice_credits: voiceCredits,
    video_credits_charged: 0,
    submitted_at: new Date().toISOString(),
  };

  if (!imageUrl) {
    const assetId = await recordAsset(user.id, {
      tool: "avatar",
      status: "completed",
      prompt: text,
      output_url: audioUrl,
      credits_spent: voiceCredits,
      metadata: meta as unknown as Record<string, unknown>,
    });
    return j(200, { ok: true, asset_id: assetId, status: "completed", audio_url: audioUrl, video_url: null, credits_charged: voiceCredits });
  }

  // 2) Talking face, billed on the real audio length.
  const videoCredits = avatarVideoCredits(seconds);
  const dedVideo = await deductCredits(
    user.id, videoCredits, "creative_avatar_video", { seconds }, user.email,
    idempotencyKey ? `${idempotencyKey}:video` : null, { rateLimit: false },
  );
  if (!dedVideo.ok) return j(dedVideo.status ?? 402, { error: dedVideo.error, credits_required: voiceCredits + videoCredits });

  const q = await fetch(FAL_QUEUE + (Deno.env.get("FAL_MODEL_AVATAR_VIDEO") || AVATAR_VIDEO_MODEL), {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ image_url: imageUrl, audio_url: falAudioUrl, prompt: "." }),
  });
  const qd = await q.json().catch(() => ({}));
  if (!q.ok || !qd.request_id || !isFalQueueUrl(qd.status_url) || !isFalQueueUrl(qd.response_url)) {
    console.warn(`[creative-video] avatar submit failed (${q.status})`, JSON.stringify(qd).slice(0, 300));
    return j(502, { error: "avatar_submit_failed" });
  }
  meta.job = { request_id: qd.request_id, status_url: qd.status_url, response_url: qd.response_url };

  const { data: isAdmin } = await supaAdmin().rpc("is_admin", { p_user_id: user.id });
  meta.video_credits_charged = isAdmin ? 0 : videoCredits;

  const assetId = await recordAsset(user.id, {
    tool: "avatar",
    status: "processing",
    prompt: text,
    output_url: audioUrl,
    credits_spent: voiceCredits + videoCredits,
    metadata: meta as unknown as Record<string, unknown>,
  });
  if (!assetId) throw new Error("asset_insert_failed");

  return j(200, {
    ok: true, asset_id: assetId, status: "processing", audio_url: audioUrl, video_url: null,
    credits_charged: isAdmin ? 0 : voiceCredits + videoCredits,
  });
}

async function avatarStatus(userId: string, assetId: unknown) {
  if (typeof assetId !== "string") return j(400, { error: "asset_id_required" });
  const admin = supaAdmin();
  const { data: asset } = await admin
    .from("creative_assets")
    .select("id, status, metadata")
    .eq("id", assetId)
    .eq("user_id", userId)
    .eq("tool", "avatar")
    .maybeSingle();
  if (!asset) return j(404, { error: "not_found" });

  const meta = asset.metadata as AvatarMeta;
  let status: string = asset.status;
  const falKey = Deno.env.get("FAL_KEY");

  if (status === "processing" && meta.job && falKey) {
    const auth = { Authorization: `Key ${falKey}` };
    const expired = Date.now() - Date.parse(meta.submitted_at) > AVATAR_LIMITS.jobTimeoutMinutes * 60_000;
    try {
      const s = await fetch(meta.job.status_url, { headers: auth });
      const sd = await s.json().catch(() => ({}));
      if (sd.status === "COMPLETED") {
        const r = await fetch(meta.job.response_url, { headers: auth });
        const rd = await r.json().catch(() => ({}));
        const falVideo: unknown = rd?.video?.url;
        if (r.ok && typeof falVideo === "string" && falVideo.startsWith("https://")) {
          meta.video_url = (await rehost(falVideo, `${userId}/avatar/${assetId}.mp4`, "video/mp4")) ?? falVideo;
          status = "completed";
        } else {
          meta.error = "generation_failed";
          status = "failed";
        }
      } else if ((!s.ok && s.status !== 202) || expired) {
        meta.error = expired ? "timeout" : `status_${s.status}`;
        status = "failed";
      }
    } catch (err) {
      console.error("[creative-video] avatar poll error:", err);
      if (expired) {
        meta.error = "timeout";
        status = "failed";
      }
    }

    if (status === "failed" && !meta.refunded) {
      if (meta.video_credits_charged > 0) {
        const { error } = await admin.rpc("execute_atomic_credit_topup", {
          _user_id: userId,
          _amount: meta.video_credits_charged,
          _reason: "refund:avatar_video",
          _category: "creative_refund",
          _metadata: { asset_id: assetId, error: meta.error },
          _idempotency_key: `refund:avatar_video:${assetId}`,
        });
        if (error) console.error("[creative-video] avatar refund failed:", error);
        else meta.refunded = true;
      } else {
        meta.refunded = true;
      }
    }

    if (status !== "processing") {
      await admin
        .from("creative_assets")
        .update({ status, metadata: meta, output_url: meta.video_url ?? meta.audio_url, updated_at: new Date().toISOString() })
        .eq("id", assetId);
    }
  }

  return j(200, {
    ok: true, asset_id: assetId, status,
    audio_url: meta.audio_url, video_url: meta.video_url ?? null,
    error: meta.error ?? null, refunded: !!meta.refunded,
  });
}

/** Copy a provider file into the user's folder of the private "uploads" bucket; returns a 30-day signed URL. */
async function rehost(url: string, path: string, contentType: string): Promise<string | null> {
  const bytes = await download(url);
  if (!bytes) return null;
  return (await storeBytes(bytes, path, contentType))?.signedUrl ?? null;
}

async function download(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function storeBytes(
  bytes: Uint8Array | null,
  path: string,
  contentType: string,
): Promise<{ path: string; signedUrl: string } | null> {
  if (!bytes) return null;
  try {
    const storage = supaAdmin().storage.from("uploads");
    const { error } = await storage.upload(path, bytes, { contentType, upsert: true });
    if (error) return null;
    const { data } = await storage.createSignedUrl(path, 60 * 60 * 24 * 30);
    return data?.signedUrl ? { path, signedUrl: data.signedUrl } : null;
  } catch {
    return null;
  }
}

/** Only accept photos the user uploaded to their own folder (public or signed storage URL). */
function isOwnUpload(url: string, userId: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(Deno.env.get("SUPABASE_URL")!);
    return u.protocol === "https:" && u.host === base.host && !u.pathname.includes("..") &&
      [`/storage/v1/object/public/uploads/${userId}/`, `/storage/v1/object/sign/uploads/${userId}/`]
        .some((prefix) => u.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

function isFalQueueUrl(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(FAL_QUEUE);
}

// ── Voices: library (MiniMax, Kokoro) and the user's cloned voices ─────────────────────────────

const USER_VOICES_TABLE = "avatar_user_voices";

interface ResolvedVoice {
  /** What is stored and echoed back: a catalog id or `clone:<uuid>`. */
  ref: string;
  provider: "minimax" | "kokoro" | "clone";
  /** Provider voice id, always resolved here (never taken from the client). */
  providerVoiceId: string;
}

/** Turn the `voice` the client sent into a provider voice. Clones must belong to the caller. */
async function resolveVoice(userId: string, raw: unknown): Promise<ResolvedVoice | null> {
  if (typeof raw === "string" && raw.startsWith("clone:")) {
    const id = parseCloneVoiceRef(raw);
    if (!id) return null;
    const { data } = await supaAdmin()
      .from(USER_VOICES_TABLE)
      .select("id, provider_voice_id")
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data?.provider_voice_id) return null;
    return { ref: cloneVoiceRef(data.id), provider: "clone", providerVoiceId: data.provider_voice_id };
  }
  // Unknown or missing values keep the old behaviour: the default MiniMax voice.
  const entry = getLibraryVoice(isAvatarVoice(raw) ? raw : DEFAULT_AVATAR_VOICE);
  const presetOverride = entry.provider === "minimax" && entry.id in AVATAR_VOICES
    ? Deno.env.get(`AVATAR_VOICE_${entry.id.toUpperCase()}`)
    : undefined;
  return { ref: entry.id, provider: entry.provider, providerVoiceId: presetOverride || entry.providerVoiceId };
}

interface Speech {
  url: string;
  bytes: Uint8Array | null;
  seconds: number | null;
  contentType: "audio/mpeg" | "audio/wav";
}

/** Text → speech on fal.ai. Cloned voices are MiniMax custom voices, spoken by Speech-02 HD. */
async function synthesize(voice: ResolvedVoice, text: string, auth: Record<string, string>): Promise<Speech | null> {
  const kokoro = voice.provider === "kokoro";
  const model = kokoro
    ? Deno.env.get("FAL_MODEL_AVATAR_KOKORO") || AVATAR_KOKORO_MODEL
    : Deno.env.get("FAL_MODEL_AVATAR_TTS") || AVATAR_TTS_MODEL;
  const payload = kokoro
    ? { prompt: text, voice: voice.providerVoiceId, speed: 1 }
    : {
      text,
      voice_setting: { voice_id: voice.providerVoiceId, speed: 1 },
      language_boost: "Portuguese",
      output_format: "url",
    };
  const r = await fetch(FAL_RUN + model, { method: "POST", headers: auth, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({}));
  const url: unknown = d?.audio?.url;
  if (!r.ok || typeof url !== "string" || !url.startsWith("https://")) {
    console.warn(`[creative-video] avatar tts failed (${voice.provider}, ${r.status})`, JSON.stringify(d).slice(0, 300));
    return null;
  }
  const bytes = await download(url);
  const wavSeconds = bytes ? wavDurationSeconds(bytes) : null;
  const durationMs = Number(d?.duration_ms);
  return {
    url,
    bytes,
    seconds: durationMs > 0 ? durationMs / 1000 : wavSeconds,
    contentType: wavSeconds !== null ? "audio/wav" : "audio/mpeg",
  };
}

/** Path inside the "uploads" bucket of a storage URL (public or signed), or null. */
function uploadsPath(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/uploads\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function cloneVoice(
  user: { id: string; email?: string | null },
  body: Record<string, unknown>,
  idempotencyKey: string | undefined,
) {
  if (body.consent !== true) return j(400, { error: "consent_required" });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, AVATAR_CLONE_LIMITS.maxNameChars) : "";
  if (!name) return j(400, { error: "name_required" });
  if (typeof body.sample_url !== "string" || !isOwnUpload(body.sample_url, user.id)) return j(400, { error: "invalid_sample_url" });
  const samplePath = uploadsPath(body.sample_url);
  if (!samplePath || samplePath.includes("..") || !samplePath.startsWith(`${user.id}/voices/`)) {
    return j(400, { error: "invalid_sample_url" });
  }

  const falKey = Deno.env.get("FAL_KEY");
  if (!falKey) return j(503, { error: "avatar_ai_not_configured" });
  const auth = { Authorization: `Key ${falKey}`, "Content-Type": "application/json" };
  const admin = supaAdmin();

  const { count } = await admin
    .from(USER_VOICES_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if ((count ?? 0) >= AVATAR_CLONE_LIMITS.maxVoicesPerUser) {
    return j(409, { error: "voice_limit_reached", limit: AVATAR_CLONE_LIMITS.maxVoicesPerUser });
  }

  // Check the sample on our side before paying the provider.
  const { data: blob, error: dlErr } = await admin.storage.from("uploads").download(samplePath);
  if (dlErr || !blob) return j(400, { error: "invalid_sample_url" });
  if (blob.size > AVATAR_CLONE_LIMITS.maxSampleBytes) return j(400, { error: "sample_too_large" });
  const sampleSeconds = wavDurationSeconds(new Uint8Array(await blob.arrayBuffer()));
  if (sampleSeconds !== null && sampleSeconds < AVATAR_CLONE_LIMITS.minSampleSeconds) return j(400, { error: "sample_too_short" });
  const { data: signed } = await admin.storage.from("uploads").createSignedUrl(samplePath, 60 * 60);
  if (!signed?.signedUrl) return j(400, { error: "invalid_sample_url" });

  const credits = avatarVoiceCloneCredits();
  const ded = await deductCredits(user.id, credits, "creative_avatar_voice_clone", { name, sample_seconds: sampleSeconds }, user.email, idempotencyKey);
  if (!ded.ok) return j(ded.status ?? 402, { error: ded.error, credits_required: credits });

  // The preview text makes MiniMax use the voice once, so it is kept (unused clones are deleted after 7 days).
  const r = await fetch(FAL_RUN + (Deno.env.get("FAL_MODEL_AVATAR_VOICE_CLONE") || AVATAR_VOICE_CLONE_MODEL), {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      audio_url: signed.signedUrl,
      noise_reduction: true,
      need_volume_normalization: true,
      text: AVATAR_CLONE_PREVIEW_TEXT,
      model: "speech-02-hd",
    }),
  });
  const rd = await r.json().catch(() => ({}));
  const providerVoiceId: unknown = rd?.custom_voice_id;
  if (!r.ok || typeof providerVoiceId !== "string" || !providerVoiceId) {
    console.warn(`[creative-video] voice clone failed (${r.status})`, JSON.stringify(rd).slice(0, 300));
    return j(502, { error: "voice_clone_failed" });
  }

  const id = crypto.randomUUID();
  const falPreview: unknown = rd?.audio?.url;
  let previewPath: string | null = null;
  let previewUrl: string | null = null;
  if (typeof falPreview === "string" && falPreview.startsWith("https://")) {
    const stored = await storeBytes(await download(falPreview), `${user.id}/voices/${id}-preview.mp3`, "audio/mpeg");
    previewPath = stored?.path ?? null;
    previewUrl = stored?.signedUrl ?? falPreview;
  }

  const createdAt = new Date().toISOString();
  const { error: insErr } = await admin.from(USER_VOICES_TABLE).insert({
    id,
    user_id: user.id,
    name,
    provider: "minimax",
    provider_voice_id: providerVoiceId,
    sample_path: samplePath,
    preview_path: previewPath,
    preview_url: previewUrl,
    consent_at: createdAt,
    created_at: createdAt,
  });
  if (insErr) {
    console.error("[creative-video] voice insert failed:", insErr);
    return j(500, { error: insErr.message?.includes("voice_limit_reached") ? "voice_limit_reached" : "voice_save_failed" });
  }

  const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: user.id });
  return j(200, {
    ok: true,
    voice: { id: cloneVoiceRef(id), voice_id: id, name, provider: "clone", preview_url: previewUrl, created_at: createdAt },
    credits_charged: isAdmin ? 0 : credits,
  });
}

async function listVoices(userId: string) {
  const admin = supaAdmin();
  const { data, error } = await admin
    .from(USER_VOICES_TABLE)
    .select("id, name, preview_url, preview_path, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[creative-video] list voices failed:", error);
    return j(500, { error: "voices_unavailable" });
  }
  const voices = await Promise.all((data ?? []).map(async (v) => {
    let previewUrl: string | null = v.preview_url ?? null;
    if (v.preview_path) {
      const { data: s } = await admin.storage.from("uploads").createSignedUrl(v.preview_path, 60 * 60 * 24);
      previewUrl = s?.signedUrl ?? previewUrl;
    }
    return { id: cloneVoiceRef(v.id), voice_id: v.id, name: v.name, provider: "clone", preview_url: previewUrl, created_at: v.created_at };
  }));
  return j(200, { ok: true, voices, limit: AVATAR_CLONE_LIMITS.maxVoicesPerUser, clone_credits: avatarVoiceCloneCredits() });
}

async function deleteVoice(userId: string, raw: unknown) {
  const id = parseCloneVoiceRef(raw) ?? (isUuid(raw) ? raw.toLowerCase() : null);
  if (!id) return j(400, { error: "voice_id_required" });
  const admin = supaAdmin();
  const { data, error } = await admin
    .from(USER_VOICES_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("sample_path, preview_path")
    .maybeSingle();
  if (error) {
    console.error("[creative-video] delete voice failed:", error);
    return j(500, { error: "voice_delete_failed" });
  }
  if (!data) return j(404, { error: "not_found" });
  // The voice sample is personal data: remove the files right away (the row stays soft-deleted for audit).
  const paths = [data.sample_path, data.preview_path].filter((p): p is string => typeof p === "string" && p.startsWith(`${userId}/`));
  if (paths.length) {
    const { error: rmErr } = await admin.storage.from("uploads").remove(paths);
    if (rmErr) console.warn("[creative-video] voice files cleanup failed:", rmErr);
  }
  return j(200, { ok: true, voice_id: id });
}
