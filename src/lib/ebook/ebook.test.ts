import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { EBOOK_EDITOR_MAX_CHAPTERS, ebookToMarkdown, markdownToEbook, sanitizeEbookDoc, type EbookDoc } from "./ebookDoc";
import { exportDocx, exportEpub, inlineHtml, markdownBlocks } from "./ebookExport";

const doc: EbookDoc = {
  title: "O Guia",
  subtitle: "Do zero ao topo",
  language: "pt-BR",
  cover: null,
  chapters: [
    { title: "Começo", content: "## Primeiros passos\n\nTexto com **negrito** & *itálico*.\n\n- item A\n- item B" },
    { title: "Fim", content: "> Uma citação\n\nÚltimo parágrafo." },
  ],
};

// O Blob do jsdom não tem arrayBuffer(); FileReader funciona.
function blobZip(b: Blob) {
  return new Promise<JSZip>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => JSZip.loadAsync(r.result as ArrayBuffer).then(resolve, reject);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

describe("ebookDoc", () => {
  it("converte estrutura → markdown → estrutura sem perdas", () => {
    const back = markdownToEbook(ebookToMarkdown(doc), { language: "pt-BR" });
    expect(back.title).toBe(doc.title);
    expect(back.subtitle).toBe(doc.subtitle);
    expect(back.chapters).toEqual(doc.chapters);
  });

  it("lê eBooks antigos sem cabeçalho \"Capítulo N —\"", () => {
    const legacy = "# Meu Livro\n\n## Sumário\n\n1. A\n2. B\n\n## Introdução\n\nOlá.\n\n## Conclusão\n\nTchau.";
    const d = markdownToEbook(legacy);
    expect(d.title).toBe("Meu Livro");
    expect(d.chapters.map((c) => c.title)).toEqual(["Introdução", "Conclusão"]);
    expect(d.chapters[0].content).toBe("Olá.");
  });

  it("valida documentos vindos do cliente", () => {
    expect(sanitizeEbookDoc(doc)?.chapters).toHaveLength(2);
    expect(sanitizeEbookDoc({ ...doc, chapters: [] })).toBeNull();
    expect(sanitizeEbookDoc({ ...doc, chapters: Array(EBOOK_EDITOR_MAX_CHAPTERS + 1).fill(doc.chapters[0]) })).toBeNull();
    expect(sanitizeEbookDoc(null)).toBeNull();
  });
});

describe("ebookExport", () => {
  it("quebra markdown em blocos", () => {
    expect(markdownBlocks(doc.chapters[0].content).map((b) => b.kind)).toEqual(["h", "p", "li", "li"]);
    expect(inlineHtml("a & **b** *c*")).toBe("a &amp; <strong>b</strong> <em>c</em>");
  });

  it("gera um EPUB 3 válido", async () => {
    const zip = await blobZip(await exportEpub(doc));
    expect(Object.keys(zip.files)[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain("<dc:title>O Guia</dc:title>");
    expect(opf).toContain('idref="chap2"');
    const ch1 = await zip.file("OEBPS/chap1.xhtml")!.async("string");
    expect(ch1).toContain("<strong>negrito</strong> &amp; <em>itálico</em>");
    expect(ch1).toContain("<ul><li>item A</li><li>item B</li></ul>");
  });

  it("gera um DOCX com títulos e capítulos", async () => {
    const zip = await blobZip(await exportDocx(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain("Capítulo 2 — Fim");
    expect(xml).toContain("<w:b/></w:rPr><w:t xml:space=\"preserve\">negrito</w:t>");
    expect(zip.file("word/styles.xml")).toBeTruthy();
  });
});
