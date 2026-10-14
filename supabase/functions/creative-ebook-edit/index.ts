// Vertal Ebook Engine — recursos de IA do editor. Cada ação cobra o preço de
// EBOOK_ADDON_CREDITS (../_shared/ebookPricing.ts) e é reembolsada se falhar.
// A função não grava o livro: devolve o trecho gerado e o editor salva (edição
// manual e exportação são grátis). A exceção é a tradução, que cria um novo eBook.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { EBOOK_ADDON_CREDITS } from "../_shared/ebookPricing.ts";
import { coverPrompt, ebookChat as chat, ebookImage, mapLimit } from "../_shared/ebookAi.ts";
import { EBOOK_EDITOR_MAX_CHAPTERS, ebookToMarkdown, sanitizeEbookDoc, type EbookDoc } from "../_shared/ebookDoc.ts";

const ACTIONS = {
  new_chapter: EBOOK_ADDON_CREDITS.newChapter,
  rewrite_chapter: EBOOK_ADDON_CREDITS.rewriteChapter,
  cover: EBOOK_ADDON_CREDITS.cover,
  illustration: EBOOK_ADDON_CREDITS.illustrations,
  review: EBOOK_ADDON_CREDITS.fullReview,
  translate: EBOOK_ADDON_CREDITS.translation,
} as const;
type Action = keyof typeof ACTIONS;

const CONCURRENCY = 7;

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const body = await req.json();
    const action = body?.action as Action;
    if (!(action in ACTIONS)) return j(400, { error: "invalid_action" });
    const doc = sanitizeEbookDoc(body?.doc);
    if (!doc) return j(400, { error: "invalid_doc" });
    const instruction = String(body?.instruction ?? "").slice(0, 1000);
    const index = Number(body?.index);
    const needsIndex = action === "rewrite_chapter" || action === "illustration";
    if (needsIndex && !(Number.isInteger(index) && index >= 0 && index < doc.chapters.length)) return j(400, { error: "invalid_index" });
    if (action === "new_chapter" && doc.chapters.length >= EBOOK_EDITOR_MAX_CHAPTERS) return j(400, { error: "max_chapters" });
    const targetLanguage = String(body?.target_language ?? "").slice(0, 40);
    if (action === "translate" && !targetLanguage) return j(400, { error: "target_language required" });

    const credits = ACTIONS[action];
    const ded = await deductCredits(user.id, credits, `creative_ebook_${action}`, { title: doc.title, index: needsIndex ? index : undefined }, user.email, idempotencyKey);
    if (!ded.ok) return j(ded.status ?? 402, { error: ded.error });

    const toc = doc.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");
    const author = `Você é um autor profissional escrevendo o livro "${doc.title}" em ${doc.language}. Sumário:\n${toc}`;

    switch (action) {
      case "new_chapter": {
        const position = Math.min(Math.max(Number(body?.position) || doc.chapters.length, 0), doc.chapters.length);
        const wanted = String(body?.title ?? "").slice(0, 200);
        const r = await chat([
          { role: "system", content: `${author}\n\nEscreva um NOVO capítulo que entra na posição ${position + 1}, entre 1200 e 1600 palavras, em markdown com subtítulos (##). Responda APENAS JSON: {"title": string, "content": string}.` },
          { role: "user", content: [wanted && `Título: ${wanted}`, instruction && `Instruções: ${instruction}`].filter(Boolean).join("\n") || "Escolha o tema que melhor complementa o livro." },
        ], 3500, true);
        const ch = parseChapter(r.content, wanted);
        if (!ch.content) return j(503, { error: "Falha ao gerar capítulo" });
        return j(200, { ok: true, credits, chapter: ch, position, model: r.model });
      }
      case "rewrite_chapter": {
        const c = doc.chapters[index];
        const r = await chat([
          { role: "system", content: `${author}\n\nReescreva o capítulo ${index + 1} ("${c.title}") mantendo o tema e o idioma, em markdown com subtítulos (##). Devolva SOMENTE o novo corpo do capítulo, sem o título.` },
          { role: "user", content: `${instruction ? `Instruções: ${instruction}\n\n` : ""}Texto atual:\n${c.content}` },
        ], 3500);
        const content = stripFence(r.content);
        if (!content) return j(503, { error: "Falha ao reescrever" });
        return j(200, { ok: true, credits, chapter: { title: c.title, content }, model: r.model });
      }
      case "cover": {
        const cover = await ebookImage(coverPrompt(doc.title, doc.subtitle ?? doc.chapters.map((c) => c.title).join(", "), instruction), user.id, "cover");
        if (!cover) return j(503, { error: "Falha ao gerar capa" });
        return j(200, { ok: true, credits, cover });
      }
      case "illustration": {
        const c = doc.chapters[index];
        const url = await ebookImage(
          `Editorial book illustration, landscape 16:9, no text, for the chapter "${c.title}" of the book "${doc.title}". ${instruction || `Scene summarizing: ${c.content.slice(0, 400)}`}`,
          user.id, "illustration",
        );
        if (!url) return j(503, { error: "Falha ao gerar ilustração" });
        return j(200, { ok: true, credits, image_url: url, index });
      }
      case "review": {
        const results = await mapLimit(doc.chapters, CONCURRENCY, (c, i) => chat([
          { role: "system", content: `${author}\n\nVocê é o revisor final. Revise o capítulo ${i + 1}: corrija gramática, ortografia e pontuação, melhore clareza e fluidez, elimine repetições, preserve o conteúdo, o tom, o idioma, as imagens e a estrutura markdown. ${instruction ? `Observações do autor: ${instruction}. ` : ""}Devolva SOMENTE o texto revisado.` },
          { role: "user", content: c.content },
        ], 3500));
        const chapters = doc.chapters.map((c, i) => ({ title: c.title, content: stripFence(results[i].content) || c.content }));
        return j(200, { ok: true, credits, chapters });
      }
      case "translate": {
        const [meta, ...bodies] = await mapLimit([null, ...doc.chapters], CONCURRENCY, (c) => c === null
          ? chat([
            { role: "system", content: `Traduza para ${targetLanguage}. Responda APENAS JSON: {"title": string, "subtitle": string, "chapters": string[]} com os títulos traduzidos na mesma ordem.` },
            { role: "user", content: JSON.stringify({ title: doc.title, subtitle: doc.subtitle ?? "", chapters: doc.chapters.map((x) => x.title) }) },
          ], 1500, true)
          : chat([
            { role: "system", content: `Você é um tradutor literário profissional. Traduza o texto para ${targetLanguage} com naturalidade, preservando a formatação markdown e as imagens. Devolva SOMENTE a tradução.` },
            { role: "user", content: c.content },
          ], 4000));
        let titles: { title?: string; subtitle?: string; chapters?: string[] } = {};
        try { titles = JSON.parse(stripFence(meta.content)); } catch { /* mantém originais */ }
        const translated: EbookDoc = {
          title: titles.title || doc.title,
          subtitle: titles.subtitle || doc.subtitle,
          language: targetLanguage,
          cover: doc.cover,
          chapters: doc.chapters.map((c, i) => ({ title: titles.chapters?.[i] || c.title, content: stripFence(bodies[i].content) || c.content })),
        };
        const assetId = await recordAsset(user.id, {
          tool: "ebook",
          prompt: `${doc.title} (${targetLanguage})`,
          output_text: ebookToMarkdown(translated),
          output_url: translated.cover ?? undefined,
          credits_spent: credits,
          metadata: { title: translated.title, chapters: translated.chapters.length, language: targetLanguage, cover: translated.cover, translated_from: body?.asset_id ?? null, doc: translated },
        });
        return j(200, { ok: true, credits, doc: translated, asset_id: assetId });
      }
    }
  } catch (e) {
    console.error("[creative-ebook-edit] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:\w+)?\s*\n?/, "").replace(/\n?```$/, "").trim();
}

function parseChapter(raw: string, fallbackTitle: string): { title: string; content: string } {
  try {
    const o = JSON.parse(stripFence(raw));
    return { title: String(o.title || fallbackTitle || "Novo capítulo"), content: String(o.content ?? "").trim() };
  } catch {
    return { title: fallbackTitle || "Novo capítulo", content: stripFence(raw) };
  }
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
