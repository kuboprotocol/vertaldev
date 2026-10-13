// Vertal Ebook Engine — gera um eBook completo: esboço → capítulos (em paralelo) → capa.
// Texto via OpenRouter (Kimi K2.6 → DeepSeek V3.2 → Gemini 3 Flash), com fallback
// para DeepSeek oficial / Lovable. Capa via Lovable AI Nano Banana.
// Preço em créditos: ../_shared/ebookPricing.ts (mesma tabela exibida no painel).
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { clampChapters, ebookCost, EBOOK_OPENROUTER_MODELS } from "../_shared/ebookPricing.ts";

type Msg = { role: "system" | "user"; content: string };
type Outline = { title: string; subtitle?: string; chapters: { title: string; summary: string }[] };

const CHAPTER_CONCURRENCY = 5;

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const body = await req.json();
    const topic = String(body?.topic ?? "").trim();
    const language = String(body?.language ?? "pt-BR");
    if (!topic) return j(400, { error: "topic required" });
    const chapters = clampChapters(body?.chapters);
    const { tier, listCredits, credits } = ebookCost(chapters);

    const ded = await deductCredits(user.id, credits, "creative_ebook", { topic, chapters, tier: tier.id, list_credits: listCredits }, user.email, idempotencyKey);
    if (!ded.ok) return j(ded.status ?? 402, { error: ded.error });

    // 1) Esboço
    const outlineRes = await chat([
      { role: "system", content: `Você é um editor-chefe de livros best-seller. Planeje um eBook em ${language}. Responda APENAS JSON: {"title": string, "subtitle": string, "chapters": [{"title": string, "summary": string}]} com exatamente ${chapters} capítulos, em ordem lógica e sem repetição de conteúdo.` },
      { role: "user", content: topic },
    ], 2000, true);
    const outline = parseOutline(outlineRes.content, topic, chapters);

    // 2) Capítulos em paralelo (lotes)
    const toc = outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");
    const bodies: string[] = new Array(outline.chapters.length).fill("");
    let model = outlineRes.model;
    for (let i = 0; i < outline.chapters.length; i += CHAPTER_CONCURRENCY) {
      const batch = outline.chapters.slice(i, i + CHAPTER_CONCURRENCY);
      const results = await Promise.all(batch.map((c, k) => chat([
        { role: "system", content: `Você é um autor profissional escrevendo o livro "${outline.title}" em ${language}. Sumário:\n${toc}\n\nEscreva SOMENTE o capítulo pedido, entre 1200 e 1600 palavras, em markdown, com subtítulos (##), exemplos práticos e um fechamento que conecte ao próximo capítulo. Não repita o título do capítulo no início.` },
        { role: "user", content: `Capítulo ${i + k + 1}: ${c.title}\nResumo: ${c.summary}` },
      ], 3000)));
      results.forEach((r, k) => { bodies[i + k] = r.content.trim(); model = r.model; });
    }
    if (bodies.some((b) => !b)) return j(503, { error: "Falha ao gerar conteúdo" });

    const text = [
      `# ${outline.title}`,
      outline.subtitle ? `*${outline.subtitle}*` : "",
      `## Sumário\n\n${toc}`,
      ...outline.chapters.map((c, i) => `# Capítulo ${i + 1} — ${c.title}\n\n${bodies[i]}`),
    ].filter(Boolean).join("\n\n");

    // 3) Capa (best-effort)
    const cover = await generateCover(outline.title, topic);

    const assetId = await recordAsset(user.id, {
      tool: "ebook",
      prompt: topic,
      output_text: text,
      output_url: cover ?? undefined,
      credits_spent: credits,
      metadata: { title: outline.title, chapters, language, cover, tier: tier.id, list_credits: listCredits, model },
    });

    return j(200, { ok: true, title: outline.title, content: text, cover, asset_id: assetId, credits, list_credits: listCredits, tier: tier.id, model });
  } catch (e) {
    console.error("[creative-ebook] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

async function chat(messages: Msg[], max_tokens: number, json = false): Promise<{ content: string; model: string }> {
  const OR = Deno.env.get("OPENROUTER_API_KEY");
  const DS = Deno.env.get("DEEPSEEK_API_KEY");
  const LK = Deno.env.get("LOVABLE_API_KEY");
  const override = Deno.env.get("EBOOK_MODEL");
  const tries: Array<{ url: string; key: string; model: string; extra?: Record<string, unknown> }> = [];
  if (OR) {
    for (const m of [...(override ? [override] : []), ...EBOOK_OPENROUTER_MODELS]) {
      tries.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: OR, model: m });
    }
  }
  if (DS) tries.push({ url: "https://api.deepseek.com/chat/completions", key: DS, model: "deepseek-chat" });
  if (LK) tries.push({ url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LK, model: "google/gemini-3-flash-preview" });

  for (const t of tries) {
    try {
      const payload: Record<string, unknown> = { model: t.model, messages, max_tokens, temperature: 0.8 };
      if (json) payload.response_format = { type: "json_object" };
      const r = await fetch(t.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json", "X-Title": "Vertal Ebook Engine" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { console.warn(`[creative-ebook] ${t.model} failed ${r.status}`); continue; }
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content ?? "";
      if (content) return { content, model: t.model };
    } catch (e) {
      console.warn(`[creative-ebook] ${t.model} threw`, e);
    }
  }
  throw new Error("all_providers_failed");
}

function parseOutline(raw: string, topic: string, chapters: number): Outline {
  let o: Partial<Outline> = {};
  try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { /* fallback abaixo */ }
  const list = Array.isArray(o.chapters) ? o.chapters.filter((c) => c && c.title).slice(0, chapters) : [];
  while (list.length < chapters) list.push({ title: `Parte ${list.length + 1}`, summary: topic });
  return { title: String(o.title || topic), subtitle: o.subtitle ? String(o.subtitle) : undefined, chapters: list };
}

async function generateCover(title: string, topic: string): Promise<string | null> {
  const LK = Deno.env.get("LOVABLE_API_KEY");
  if (!LK) return null;
  try {
    const ir = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: `Premium bestseller ebook cover, portrait 2:3, for the book "${title}" about: ${topic}. Modern, cinematic, elegant typography with the exact title text only.` }],
        modalities: ["image", "text"],
      }),
    });
    const id = await ir.json();
    return id?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
  } catch (_) {
    return null;
  }
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
