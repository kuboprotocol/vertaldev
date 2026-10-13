// Estrutura de um eBook do Vertal Ebook Engine e conversão markdown ↔ estrutura.
// Compartilhado entre as edge functions e o editor do painel (src/lib/ebook/ebookDoc.ts).

export interface EbookChapter {
  title: string;
  /** Corpo em markdown, sem o título do capítulo. */
  content: string;
}

export interface EbookDoc {
  title: string;
  subtitle?: string;
  language: string;
  cover?: string | null;
  chapters: EbookChapter[];
}

/** Limites do editor (criação vai até EBOOK_MAX_CHAPTERS; o editor permite adicionar mais). */
export const EBOOK_EDITOR_MAX_CHAPTERS = 20;
export const EBOOK_MAX_CHAPTER_CHARS = 30_000;

const CHAPTER_HEADING = /^#\s+Cap[ií]tulo\s+\d+\s*[—–:-]\s*(.+)$/;

export function ebookToMarkdown(doc: EbookDoc): string {
  const toc = doc.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");
  return [
    `# ${doc.title}`,
    doc.subtitle ? `*${doc.subtitle}*` : "",
    `## Sumário\n\n${toc}`,
    ...doc.chapters.map((c, i) => `# Capítulo ${i + 1} — ${c.title}\n\n${c.content.trim()}`),
  ].filter(Boolean).join("\n\n");
}

/**
 * Lê o markdown gerado pelo motor. eBooks antigos (antes do editor) não seguem o
 * formato "# Capítulo N — título": nesse caso cada `#`/`##` depois do título vira capítulo.
 */
export function markdownToEbook(md: string, fallback: { title?: string; language?: string; cover?: string | null } = {}): EbookDoc {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let title = fallback.title ?? "";
  let subtitle: string | undefined;
  let start = 0;

  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 >= 0 && !CHAPTER_HEADING.test(lines[firstH1])) {
    title = lines[firstH1].replace(/^#\s+/, "").trim();
    start = firstH1 + 1;
    const next = lines.slice(start).find((l) => l.trim() !== "");
    const m = next?.match(/^\*([^*].*)\*$/);
    if (m) subtitle = m[1].trim();
  }

  const body = lines.slice(start);
  const strict = body.some((l) => CHAPTER_HEADING.test(l));
  const isHeading = (l: string) => (strict ? CHAPTER_HEADING.test(l) : /^#{1,2}\s+/.test(l) && !/^#{1,2}\s+(Sumário|Índice)\s*$/i.test(l));

  const chapters: EbookChapter[] = [];
  let current: EbookChapter | null = null;
  let skipping = false; // dentro do "## Sumário"
  for (const l of body) {
    if (/^#{1,2}\s+(Sumário|Índice)\s*$/i.test(l)) { skipping = true; continue; }
    if (isHeading(l)) {
      skipping = false;
      const m = l.match(CHAPTER_HEADING);
      current = { title: (m ? m[1] : l.replace(/^#{1,2}\s+/, "")).trim(), content: "" };
      chapters.push(current);
      continue;
    }
    if (skipping || !current) continue;
    current.content += `${l}\n`;
  }
  for (const c of chapters) c.content = c.content.trim();

  if (chapters.length === 0) {
    const rest = body.join("\n").replace(subtitle ? `*${subtitle}*` : "", "").trim();
    chapters.push({ title: title || "Capítulo 1", content: rest });
  }
  return { title: title || "Sem título", subtitle, language: fallback.language ?? "pt-BR", cover: fallback.cover ?? null, chapters };
}

/** Valida e normaliza um documento vindo do cliente. Retorna null se inválido. */
export function sanitizeEbookDoc(raw: unknown): EbookDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.chapters) || r.chapters.length === 0 || r.chapters.length > EBOOK_EDITOR_MAX_CHAPTERS) return null;
  const chapters: EbookChapter[] = [];
  for (const c of r.chapters) {
    if (!c || typeof c !== "object") return null;
    const title = String((c as EbookChapter).title ?? "").slice(0, 200);
    const content = String((c as EbookChapter).content ?? "");
    if (content.length > EBOOK_MAX_CHAPTER_CHARS) return null;
    chapters.push({ title, content });
  }
  return {
    title: String(r.title ?? "Sem título").slice(0, 200),
    subtitle: r.subtitle ? String(r.subtitle).slice(0, 300) : undefined,
    language: String(r.language ?? "pt-BR").slice(0, 20),
    cover: typeof r.cover === "string" ? r.cover : null,
    chapters,
  };
}
