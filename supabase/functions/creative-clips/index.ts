// Vertal Clips — motor próprio de cortes virais.
//   multipart (file)          → transcreve um trecho de áudio com timestamps por palavra (grátis, com rate limit)
//   { action: "analyze", … }  → IA escolhe os melhores cortes com timestamps reais + score viral (1 crédito por corte)
//   { transcript | source_url } (legado) → sugere cortes a partir de texto livre
// O corte, o reenquadramento 9:16 e as legendas são renderizados no navegador do usuário.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, enforceRateLimit, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";

/** Pricing: the user pays per clip delivered by the AI; transcribing is free (rate limited). */
const COST_PER_CLIP = 1;
const TRANSCRIBE_RATE_LIMIT = { max: 60, windowSeconds: 60 };
const COST_LEGACY = 1;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const MAX_PROMPT_CHARS = 60_000;

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return await transcribe(req, user, idempotencyKey);
    }
    const body = await req.json();
    if (body?.action === "analyze") return await analyze(body, user, idempotencyKey);
    return await legacy(body, user, idempotencyKey);
  } catch (e) {
    console.error("[creative-clips] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

type User = { id: string; email?: string };

async function transcribe(req: Request, user: User, idempotencyKey?: string) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return j(400, { error: "file required" });
  if (file.size > MAX_AUDIO_BYTES) return j(413, { error: "audio_chunk_too_large" });
  const language = String(form.get("language") ?? "").slice(0, 5);

  const providers: Array<{ url: string; key: string; model: string }> = [];
  const GROQ = Deno.env.get("GROQ_API_KEY");
  const OPENAI = Deno.env.get("OPENAI_API_KEY");
  if (GROQ) providers.push({ url: "https://api.groq.com/openai/v1/audio/transcriptions", key: GROQ, model: "whisper-large-v3-turbo" });
  if (OPENAI) providers.push({ url: "https://api.openai.com/v1/audio/transcriptions", key: OPENAI, model: "whisper-1" });
  if (!providers.length) return j(503, { error: "transcription_unavailable" });

  const rl = await enforceRateLimit(user.id, "creative_clips_transcribe", { ...TRANSCRIBE_RATE_LIMIT, userEmail: user.email });
  if (!rl.ok) return j(429, { error: rl.error });

  let lastError = "transcribe_failed";
  for (const p of providers) {
    const up = new FormData();
    up.append("file", file, file.name || "audio.wav");
    up.append("model", p.model);
    up.append("response_format", "verbose_json");
    up.append("timestamp_granularities[]", "word");
    up.append("timestamp_granularities[]", "segment");
    if (language) up.append("language", language);
    const r = await fetch(p.url, { method: "POST", headers: { Authorization: `Bearer ${p.key}` }, body: up });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      lastError = data?.error?.message ?? `transcribe_${r.status}`;
      continue;
    }
    return j(200, {
      ok: true,
      language: data.language,
      duration: data.duration,
      words: (data.words ?? []).map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
      segments: (data.segments ?? []).map((s: any) => ({ text: s.text, start: s.start, end: s.end })),
    });
  }
  return j(502, { error: lastError });
}

async function analyze(body: any, user: User, idempotencyKey?: string) {
  const transcript = String(body?.transcript ?? "").slice(0, MAX_PROMPT_CHARS);
  if (!transcript.trim()) return j(400, { error: "transcript required" });
  const count = clampInt(body?.count, 1, 15, 8);
  const minSec = clampInt(body?.min_sec, 5, 180, 30);
  const maxSec = clampInt(body?.max_sec, minSec, 240, 60);
  const language = String(body?.language ?? "pt-BR").slice(0, 10);
  const duration = Number(body?.duration) || 0;

  const sys = `Você é o editor-chefe de cortes virais da Vertal. Recebe a transcrição de um vídeo longo com timestamps em segundos no formato [início-fim] texto.
Escolha os ${count} melhores trechos para Reels/TikTok/Shorts. Regras:
- Cada corte deve ter entre ${minSec} e ${maxSec} segundos, começar no início de uma frase e terminar no fim de uma frase.
- Os primeiros 3 segundos precisam de um gancho forte (pergunta, afirmação polêmica, número, promessa).
- O trecho precisa fazer sentido sozinho, sem contexto do resto do vídeo, e ter um payoff.
- Cortes não podem se sobrepor.
- Dê notas de 0 a 10 para: hook (força do gancho), flow (fluidez/ritmo), value (valor/insight), trend (potencial de tendência).
Responda APENAS JSON: {"clips":[{"start":number,"end":number,"title":string,"hook":string,"reason":string,"scores":{"hook":number,"flow":number,"value":number,"trend":number},"hashtags":[string]}]}
title: título curto chamativo (até 60 caracteres) no idioma ${language}. hook: a frase de abertura. reason: por que vai viralizar (1 frase). hashtags: 3 a 5.`;
  const messages = [
    { role: "system", content: sys },
    { role: "user", content: `Título do vídeo: ${String(body?.title ?? "—").slice(0, 200)}\nDuração: ${duration.toFixed(0)}s\n\n${transcript}` },
  ];

  const raw = await chat(messages, true);
  const clips = parseClips(raw)?.slice(0, count);
  if (!clips?.length) return j(502, { error: "analysis_failed" });

  const cost = clips.length * COST_PER_CLIP;
  const ded = await deductCredits(user.id, cost, "creative_clips_analyze", { duration, count, clips: clips.length }, user.email, idempotencyKey);
  if (!ded.ok) return j((ded as any).status ?? 402, { error: ded.error });

  const assetId = await recordAsset(user.id, {
    tool: "clips",
    prompt: String(body?.title ?? "").slice(0, 200) || transcript.slice(0, 200),
    credits_spent: cost,
    metadata: { clips, duration, engine: "vertal-clips-v2" },
  });
  return j(200, { ok: true, clips, credits_charged: cost, asset_id: assetId });
}

async function legacy(body: any, user: User, idempotencyKey?: string) {
  const { transcript, source_url } = body ?? {};
  if (!transcript && !source_url) return j(400, { error: "transcript or source_url required" });

  const ded = await deductCredits(user.id, COST_LEGACY, "creative_clips", { source_url }, user.email, idempotencyKey);
  if (!ded.ok) return j((ded as any).status ?? 402, { error: ded.error });

  const sys = `Você é editor de vídeo. Analise o texto do vídeo e proponha até 15 cortes virais. Para cada corte retorne JSON com: start (mm:ss), end (mm:ss), title (gancho curto), hook (porquê viraliza). Responda APENAS um array JSON.`;
  const raw = await chat([
    { role: "system", content: sys },
    { role: "user", content: transcript ?? `Vídeo em: ${source_url}` },
  ], false);
  const clips = parseClips(raw) ?? [];

  const assetId = await recordAsset(user.id, {
    tool: "clips",
    prompt: source_url ?? transcript?.slice(0, 200),
    credits_spent: COST_LEGACY,
    metadata: { clips, source_url },
  });
  return j(200, { ok: true, clips, asset_id: assetId });
}

/** Tries each configured LLM in turn and returns the first non-empty answer. */
async function chat(messages: unknown[], json: boolean): Promise<string> {
  const tries: Array<{ url: string; key: string; model: string }> = [];
  const DS = Deno.env.get("DEEPSEEK_API_KEY");
  const LK = Deno.env.get("LOVABLE_API_KEY");
  const GROQ = Deno.env.get("GROQ_API_KEY");
  if (DS) tries.push({ url: "https://api.deepseek.com/chat/completions", key: DS, model: "deepseek-chat" });
  if (LK) tries.push({ url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LK, model: "google/gemini-3-flash-preview" });
  if (GROQ) tries.push({ url: "https://api.groq.com/openai/v1/chat/completions", key: GROQ, model: "llama-3.3-70b-versatile" });
  for (const t of tries) {
    try {
      const r = await fetch(t.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: t.model,
          messages,
          max_tokens: 4000,
          temperature: 0.4,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const raw = d?.choices?.[0]?.message?.content ?? "";
      if (raw) return raw;
    } catch (e) {
      console.warn("[creative-clips] provider failed:", t.model, e);
    }
  }
  return "";
}

function parseClips(raw: string): unknown[] | null {
  if (!raw) return null;
  const candidates = [raw, raw.match(/\{[\s\S]*\}/)?.[0], raw.match(/\[[\s\S]*\]/)?.[0]];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v)) return v;
      if (Array.isArray(v?.clips)) return v.clips;
    } catch { /* try next */ }
  }
  return null;
}

function clampInt(v: unknown, min: number, max: number, def: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
