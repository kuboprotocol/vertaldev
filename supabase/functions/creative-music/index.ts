// Vertal Music AI — painel de criação de música (mesmo fluxo do Studio da MusKAI).
// Assíncrono: action "generate" cobra, registra e envia; action "status" acompanha, salva o MP3 e
// devolve o crédito se a geração falhar. Lógica pura em ../_shared/music/vertalMusicCore.ts.
//
// Provedores (ver vertalMusicCore.pickMusicProvider):
//   muskai → sunoapi.org (mesma tecnologia da MusKAI) com SUNOAPI_KEY;
//   vertal → motor próprio ACE-Step v1.5 no Modal (VERTAL_OWN_MUSIC_URL / VERTAL_OWN_MUSIC_TOKEN).
// Config: segredo avulso da função vence; senão vem do cofre de segredos (kubo_secrets) da conta dona
// (VERTAL_MUSIC_KEYS_OWNER ou VERTAL_FREE_KEYS_OWNER no VERTAL_GPU_CONFIG), porque o projeto está no
// limite de 100 segredos. VERTAL_MUSIC_CHARGE_ADMINS=true cobra também contas admin (teste ao vivo).
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import {
  getUser, deductCredits, keepCharges, recordAsset, refundCharge, supaAdmin, withRefundOnFailure,
} from "../_shared/creative.ts";
import { expandVcaEnv } from "../_shared/vertalCodeAi/router.ts";
import { resolveEnvForRun } from "../_shared/kuboSecrets.ts";
import {
  MUSIC_COST_CREDITS, MUSIC_JOB_MAX_MS, SUNO_BASE, SUNO_DEFAULT_MODEL, autoTitle, buildMusicTags, buildSuperPrompt,
  cleanLyrics, fallbackLyrics, lyricsPrompt, mapSunoStatus, musicRequestError, normalizeMusicRequest, ownPayload,
  pickMusicProvider, sunoPayload, type MusicEnv, type MusicRequest, type NormalizedMusicRequest,
} from "../_shared/music/vertalMusicCore.ts";

const COST_DOWNLOAD_MP3 = 1;
const COST_DOWNLOAD_WAV = 2;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIG_KEYS = [
  "SUNOAPI_KEY", "SUNO_MODEL", "VERTAL_OWN_MUSIC_URL", "VERTAL_OWN_MUSIC_TOKEN", "VERTAL_MUSIC_PROVIDER",
  "VERTAL_MUSIC_CHARGE_ADMINS",
];

// deno-lint-ignore no-explicit-any
type Loose = any;

let vaultCache: { at: number; env: Record<string, string> } | null = null;
async function musicEnv(): Promise<MusicEnv> {
  const base = expandVcaEnv(Deno.env.toObject()) as Record<string, string | undefined>;
  if (!vaultCache || Date.now() - vaultCache.at > 300_000) {
    const owner = (base.VERTAL_MUSIC_KEYS_OWNER ?? base.VERTAL_FREE_KEYS_OWNER ?? "").trim();
    const missing = CONFIG_KEYS.filter((k) => !(base[k] ?? "").trim());
    let env: Record<string, string> = {};
    if (UUID_RE.test(owner) && missing.length) {
      try {
        env = (await resolveEnvForRun(supaAdmin() as Loose, owner, missing, { target: "creative_music" })).env;
      } catch (e) {
        console.warn(`[creative-music] vault: ${e instanceof Error ? e.message : "err"}`);
      }
    }
    vaultCache = { at: Date.now(), env };
  }
  const out: MusicEnv = { ...vaultCache.env };
  for (const k of CONFIG_KEYS) if ((base[k] ?? "").trim()) out[k] = base[k];
  out.SUNO_API_KEY = base.SUNO_API_KEY;
  out.CEREBRAS = base.VERTAL_CEREBRAS_KEY;
  out.OPENROUTER = base.OPENROUTER_API_KEY;
  return out;
}

const truthy = (v?: string) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  // Callback do sunoapi.org (obrigatório no pedido); o painel acompanha por consulta, então só confirmamos.
  if (url.searchParams.get("cb") === "suno") return j(200, { ok: true });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });
  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "generate";
    if (action === "config") {
      const env = await musicEnv();
      const provider = pickMusicProvider(env);
      return j(200, { ok: true, available: Boolean(provider), provider, cost: MUSIC_COST_CREDITS });
    }
    if (action === "generate") return await generate(user, body as MusicRequest, idempotencyKey);
    if (action === "status") return await status(user, body);
    if (action === "history") return await history(user);

    if (action === "download") {
      const { format = "mp3", asset_id } = body;
      const cost = format === "wav" ? COST_DOWNLOAD_WAV : COST_DOWNLOAD_MP3;
      const ded = await deductCredits(user.id, cost, `creative_music_download_${format}`, { asset_id }, user.email, idempotencyKey);
      if (!ded.ok) return j((ded as Loose).status ?? 402, { error: ded.error });
      return j(200, { ok: true });
    }
    return j(400, { error: "invalid action" });
  } catch (e) {
    console.error("[creative-music] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

async function generate(user: Loose, body: MusicRequest, idempotencyKey?: string) {
  const r = normalizeMusicRequest(body);
  const invalid = musicRequestError(r);
  if (invalid) return j(400, { error: invalid === "lyrics_required" ? "Cole a letra completa ou troque o modo da letra." : "Descreva a música (estilo, tema ou letra)." , code: invalid });

  const env = await musicEnv();
  const provider = pickMusicProvider(env);
  if (!provider) {
    console.error("[creative-music] nenhum provedor de música configurado");
    return j(503, { error: "A geração de música está temporariamente indisponível. Nenhum crédito foi cobrado.", code: "music_unavailable" });
  }

  const chargeKey = idempotencyKey && idempotencyKey.length > 8 ? `music:${idempotencyKey}` : `music:${user.id}:${crypto.randomUUID()}`;
  const ded = await deductCredits(
    user.id, MUSIC_COST_CREDITS, "creative_music_gen", { provider, title: r.title || null }, user.email, chargeKey,
    { chargeAdmins: truthy(env.VERTAL_MUSIC_CHARGE_ADMINS) },
  );
  if (!ded.ok) {
    const st = (ded as Loose).status ?? 402;
    const msg = ded.error === "deduction_failed" || /insufficient/.test(ded.error) ? "insufficient_credits" : ded.error;
    return j(st === 500 ? 402 : st, { error: msg });
  }
  const charged = Boolean((ded as Loose).charged);

  const seed = Date.now().toString(36).slice(-4).toUpperCase();
  const title = autoTitle(r, seed);
  const lyrics = r.instrumental ? "" : await writeLyrics(r, env);
  const tags = buildMusicTags(r);
  const started = Date.now();

  let jobId: string;
  if (provider === "muskai") {
    const key = (env.SUNOAPI_KEY ?? env.SUNO_API_KEY ?? "").trim();
    const cb = `${Deno.env.get("SUPABASE_URL")}/functions/v1/creative-music?cb=suno`;
    const res = await fetch(`${SUNO_BASE}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(sunoPayload(r, lyrics, title, env.SUNO_MODEL || SUNO_DEFAULT_MODEL, cb)),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.code !== 200 || !data?.data?.taskId) {
      console.error("[creative-music] suno submit failed", res.status, data?.code, data?.msg);
      return j(502, { error: "O provedor de música recusou o pedido. O crédito foi devolvido.", code: "provider_error" });
    }
    jobId = String(data.data.taskId);
  } else {
    const base = String(env.VERTAL_OWN_MUSIC_URL).replace(/\/+$/, "");
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.VERTAL_OWN_MUSIC_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(ownPayload(r, lyrics, Math.floor(Math.random() * 2 ** 31))),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.id !== "string") {
      console.error("[creative-music] own submit failed", res.status, JSON.stringify(data).slice(0, 200));
      return j(502, { error: "O motor de música não respondeu. O crédito foi devolvido.", code: "provider_error" });
    }
    jobId = data.id;
  }

  const assetId = await recordAsset(user.id, {
    tool: "music",
    status: "processing",
    prompt: r.description || r.lyricsInput || title,
    credits_spent: charged ? MUSIC_COST_CREDITS : 0,
    metadata: {
      provider, task_id: jobId, title, tags, lyrics, instrumental: r.instrumental, style: r.style, mood: r.mood,
      language: r.language, tempo: r.tempo, energy: r.energy, music_key: r.musicKey, vibe_dna: r.dna,
      lyrics_mode: r.lyricsMode, super_prompt: buildSuperPrompt(r), charged, charge_key: chargeKey,
      cost: MUSIC_COST_CREDITS, started_at: new Date(started).toISOString(),
    },
  });
  if (!assetId) return j(500, { error: "Não foi possível registrar a geração. O crédito foi devolvido." });
  // A partir daqui o crédito pertence ao job: "status" devolve se ele falhar.
  keepCharges();
  return j(200, { ok: true, asset_id: assetId, task_id: jobId, provider, title, lyrics, charged, cost: MUSIC_COST_CREDITS });
}

async function writeLyrics(r: NormalizedMusicRequest, env: MusicEnv): Promise<string> {
  if (r.lyricsMode === "paste" && r.lyricsInput) return r.lyricsInput;
  const prompt = lyricsPrompt(r);
  const tries: Array<{ url: string; key?: string; model: string }> = [
    { url: "https://api.cerebras.ai/v1/chat/completions", key: env.CEREBRAS, model: "gpt-oss-120b" },
    { url: "https://openrouter.ai/api/v1/chat/completions", key: env.OPENROUTER, model: "openrouter/free" },
    { url: "https://openrouter.ai/api/v1/chat/completions", key: env.OPENROUTER, model: "meta-llama/llama-3.3-70b-instruct:free" },
  ];
  for (const t of tries) {
    if (!t.key) continue;
    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json", "HTTP-Referer": "https://vertal.dev" },
        body: JSON.stringify({ model: t.model, messages: [{ role: "user", content: prompt }], max_tokens: 900, temperature: 0.9 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const text = cleanLyrics(String(d?.choices?.[0]?.message?.content ?? ""));
      if (text.length > 40) return text;
    } catch { /* próximo */ }
  }
  return fallbackLyrics(r);
}

async function status(user: Loose, body: Loose) {
  const admin = supaAdmin();
  let q = admin.from("creative_assets").select("id,status,output_url,metadata,created_at,prompt").eq("user_id", user.id).eq("tool", "music");
  if (body.asset_id && UUID_RE.test(String(body.asset_id))) q = q.eq("id", body.asset_id);
  else if (body.task_id) q = q.eq("metadata->>task_id", String(body.task_id));
  else return j(400, { error: "asset_id required" });
  const { data: asset } = await q.maybeSingle();
  if (!asset) return j(404, { error: "not_found" });
  const meta = (asset.metadata ?? {}) as Loose;
  if (asset.status !== "processing") return j(200, view(asset));

  const env = await musicEnv();
  const age = Date.now() - new Date(meta.started_at ?? asset.created_at).getTime();
  let state: "processing" | "completed" | "failed" = "processing";
  let items: Array<{ audio_url: string; image_url?: string; title?: string; duration?: number }> = [];
  let reason = "";

  try {
    if (meta.provider === "muskai") {
      const key = (env.SUNOAPI_KEY ?? env.SUNO_API_KEY ?? "").trim();
      if (key) {
        const res = await fetch(`${SUNO_BASE}/generate/record-info?taskId=${encodeURIComponent(meta.task_id)}`, {
          headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
        });
        const d = await res.json().catch(() => ({}));
        const clips = (d?.data?.response?.sunoData ?? []) as Loose[];
        const ready = clips.filter((c) => c.audioUrl || c.audio_url);
        state = mapSunoStatus(d?.data?.status, ready.length);
        reason = d?.data?.errorMessage ?? d?.data?.status ?? "";
        if (state === "completed") {
          for (const [i, c] of ready.slice(0, 2).entries()) {
            const saved = await rehost(c.audioUrl ?? c.audio_url, `${user.id}/music/${asset.id}-${i ? "B" : "A"}.mp3`, "audio/mpeg");
            items.push({ audio_url: saved ?? (c.audioUrl ?? c.audio_url), image_url: c.imageUrl ?? c.image_url, title: c.title, duration: c.duration });
          }
        }
      }
    } else if (meta.provider === "vertal") {
      const base = String(env.VERTAL_OWN_MUSIC_URL ?? "").replace(/\/+$/, "");
      const auth = { Authorization: `Bearer ${env.VERTAL_OWN_MUSIC_TOKEN}` };
      if (base) {
        const res = await fetch(`${base}/status?id=${encodeURIComponent(meta.task_id)}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
        const d = await res.json().catch(() => ({}));
        if (d?.status === "completed") {
          const mp3 = await fetch(`${base}/result?id=${encodeURIComponent(meta.task_id)}`, { headers: auth, signal: AbortSignal.timeout(60_000) });
          if (mp3.ok) {
            const bytes = new Uint8Array(await mp3.arrayBuffer());
            const saved = await upload(bytes, `${user.id}/music/${asset.id}-A.mp3`, "audio/mpeg");
            if (saved) {
              state = "completed";
              items = [{ audio_url: saved, title: meta.title, duration: d.seconds }];
            }
          }
        } else if (d?.status === "failed" || d?.status === "expired" || res.status === 404) {
          state = "failed";
          reason = d?.status ?? "job_not_found";
        }
      }
    }
  } catch (e) {
    console.warn("[creative-music] status check failed:", e instanceof Error ? e.message : e);
  }

  if (state === "processing" && age > MUSIC_JOB_MAX_MS) {
    state = "failed";
    reason = "timeout";
  }

  if (state === "completed") {
    const { data: upd } = await admin.from("creative_assets").update({
      status: "completed", output_url: items[0]?.audio_url ?? null,
      metadata: { ...meta, items, finished_at: new Date().toISOString() },
    }).eq("id", asset.id).eq("status", "processing").select("id,status,output_url,metadata,created_at,prompt").maybeSingle();
    return j(200, view(upd ?? { ...asset, status: "completed", output_url: items[0]?.audio_url, metadata: { ...meta, items } }));
  }
  if (state === "failed") {
    let refunded = false;
    if (meta.charged && meta.charge_key) refunded = await refundCharge(user.id, Number(meta.cost ?? MUSIC_COST_CREDITS), "creative_music_gen", meta.charge_key);
    const { data: upd } = await admin.from("creative_assets").update({
      status: "failed", error_message: String(reason || "generation_failed").slice(0, 200),
      metadata: { ...meta, refunded, finished_at: new Date().toISOString() },
    }).eq("id", asset.id).eq("status", "processing").select("id,status,output_url,metadata,created_at,prompt").maybeSingle();
    return j(200, view(upd ?? { ...asset, status: "failed", metadata: { ...meta, refunded } }));
  }
  return j(200, view(asset));
}

async function history(user: Loose) {
  const { data } = await supaAdmin().from("creative_assets").select("id,status,output_url,metadata,created_at,prompt")
    .eq("user_id", user.id).eq("tool", "music").order("created_at", { ascending: false }).limit(10);
  return j(200, { ok: true, items: (data ?? []).map(view) });
}

function view(a: Loose) {
  const m = (a?.metadata ?? {}) as Loose;
  const raw = Array.isArray(m.items) && m.items.length ? m.items : a?.output_url ? [{ audio_url: a.output_url, title: m.title }] : [];
  // audioUrl/imageUrl (camelCase) mantêm compatíveis o Vertal Studio e o agente do Vertal Chat.
  const items = raw.map((x: Loose) => ({ ...x, audioUrl: x.audio_url, imageUrl: x.image_url, title: x.title ?? m.title }));
  return {
    ok: true, asset_id: a.id, status: a.status, title: m.title ?? a.prompt ?? "Música", provider: m.provider ?? null,
    lyrics: m.lyrics ?? "", style: m.style ?? null, mood: m.mood ?? null, created_at: a.created_at,
    items, refunded: Boolean(m.refunded), charged: Boolean(m.charged), cost: m.cost ?? MUSIC_COST_CREDITS,
  };
}

async function upload(bytes: Uint8Array, path: string, contentType: string): Promise<string | null> {
  const storage = supaAdmin().storage.from("uploads");
  const { error } = await storage.upload(path, bytes, { contentType, upsert: true });
  if (error) {
    console.error("[creative-music] upload failed:", error.message);
    return null;
  }
  const { data } = await storage.createSignedUrl(path, 60 * 60 * 24 * 30);
  return data?.signedUrl ?? null;
}

async function rehost(src: string, path: string, contentType: string): Promise<string | null> {
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return await upload(new Uint8Array(await r.arrayBuffer()), path, contentType);
  } catch {
    return null;
  }
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
