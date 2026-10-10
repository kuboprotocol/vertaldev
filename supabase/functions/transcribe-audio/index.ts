// Audio Transcription via OpenAI Whisper
// Substitui o Groq transcription com suporte completo a múltiplos idiomas
// Modelos: Whisper Large v3
// Custo: 2 créditos por arquivo

import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError } from "../_shared/creative.ts";

const TRANSCRIBE_COST = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return j(503, { error: "openai_unavailable" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;

  try {
    const ct = req.headers.get("content-type") ?? "";

    // Transcription (multipart)
    if (!ct.includes("multipart/form-data")) {
      return j(400, { error: "multipart/form-data required" });
    }

    const form = await req.formData();
    const file = form.get("file");
    const language = form.get("language") ?? "pt"; // Portuguese by default

    if (!(file instanceof File)) {
      return j(400, { error: "file required" });
    }

    // Deduct credits
    const ded = await deductCredits(
      user.id,
      TRANSCRIBE_COST,
      "creative_transcribe_audio",
      { size: file.size, language },
      user.email,
      idempotencyKey
    );

    if (!ded.ok) {
      return j((ded as any).status ?? 402, { error: ded.error });
    }

    // Call OpenAI Whisper API
    const upstream = new FormData();
    upstream.append("file", file, file.name || "audio.webm");
    upstream.append("model", "whisper-1");
    upstream.append("language", language);

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });

    if (!r.ok) {
      const data = await r.json();
      return j(r.status, { error: data?.error?.message || "transcribe_failed" });
    }

    const data = await r.json();

    // Record asset in audit log
    recordAsset(user.id, {
      tool: "transcribe_audio",
      output_text: data?.text ?? "",
      credits_spent: TRANSCRIBE_COST,
      metadata: {
        provider: "openai",
        model: "whisper-1",
        language,
        duration_seconds: file.size, // Approximation
      },
    }).catch(() => {});

    return j(200, {
      ok: true,
      text: data?.text ?? "",
      provider: "openai",
      model: "whisper-1",
      language,
    });
  } catch (e) {
    console.error("[transcribe-audio] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
});

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
