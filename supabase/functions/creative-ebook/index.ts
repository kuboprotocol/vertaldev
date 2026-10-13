// Vertal Ebook Engine — gera um eBook completo: esboço → capítulos (em paralelo) → capa.
// IA (OpenRouter Kimi K2.6 + fallbacks, capa Nano Banana): ../_shared/ebookAi.ts.
// A estrutura do livro (metadata.doc) é a que o editor abre.
// Preço em créditos: ../_shared/ebookPricing.ts (mesma tabela exibida no painel).
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { clampChapters, ebookCost } from "../_shared/ebookPricing.ts";
import { coverPrompt, ebookChat as chat, ebookImage, mapLimit } from "../_shared/ebookAi.ts";
import { ebookToMarkdown, type EbookDoc } from "../_shared/ebookDoc.ts";

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
    const results = await mapLimit(outline.chapters, CHAPTER_CONCURRENCY, (c, i) => chat([
      { role: "system", content: `Você é um autor profissional escrevendo o livro "${outline.title}" em ${language}. Sumário:\n${toc}\n\nEscreva SOMENTE o capítulo pedido, entre 1200 e 1600 palavras, em markdown, com subtítulos (##), exemplos práticos e um fechamento que conecte ao próximo capítulo. Não repita o título do capítulo no início.` },
      { role: "user", content: `Capítulo ${i + 1}: ${c.title}\nResumo: ${c.summary}` },
    ], 3000));
    const bodies = results.map((r) => r.content.trim());
    const model = results[results.length - 1]?.model ?? outlineRes.model;
    if (bodies.some((b) => !b)) return j(503, { error: "Falha ao gerar conteúdo" });

    // 3) Capa (best-effort)
    const cover = await ebookImage(coverPrompt(outline.title, topic), user.id, "cover");

    const doc: EbookDoc = {
      title: outline.title,
      subtitle: outline.subtitle,
      language,
      cover,
      chapters: outline.chapters.map((c, i) => ({ title: c.title, content: bodies[i] })),
    };
    const text = ebookToMarkdown(doc);

    const assetId = await recordAsset(user.id, {
      tool: "ebook",
      prompt: topic,
      output_text: text,
      output_url: cover ?? undefined,
      credits_spent: credits,
      metadata: { title: outline.title, chapters, language, cover, tier: tier.id, list_credits: listCredits, model, doc },
    });

    return j(200, { ok: true, title: outline.title, content: text, cover, doc, asset_id: assetId, credits, list_credits: listCredits, tier: tier.id, model });
  } catch (e) {
    console.error("[creative-ebook] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function parseOutline(raw: string, topic: string, chapters: number): Outline {
  let o: Partial<Outline> = {};
  try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { /* fallback abaixo */ }
  const list = Array.isArray(o.chapters) ? o.chapters.filter((c) => c && c.title).slice(0, chapters) : [];
  while (list.length < chapters) list.push({ title: `Parte ${list.length + 1}`, summary: topic });
  return { title: String(o.title || topic), subtitle: o.subtitle ? String(o.subtitle) : undefined, chapters: list };
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
