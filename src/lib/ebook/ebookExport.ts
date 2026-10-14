// Exportação do Vertal Ebook Engine — roda no navegador, sem custo de créditos.
// EPUB 3 e DOCX são montados com JSZip; PDF com jsPDF. Imagens que não puderem
// ser baixadas (CORS) ficam de fora em vez de quebrar a exportação.
import type { EbookDoc } from "./ebookDoc";

// ---------- markdown → blocos ----------

export type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "li"; ordered: boolean; text: string }
  | { kind: "quote"; text: string }
  | { kind: "img"; alt: string; src: string };

export function markdownBlocks(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ").trim() });
    para = [];
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.+)$/))) { flush(); out.push({ kind: "h", level: Math.min(m[1].length, 3) as 1 | 2 | 3, text: m[2] }); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { flush(); out.push({ kind: "img", alt: m[1], src: m[2] }); continue; }
    if ((m = line.match(/^[-*+]\s+(.+)$/))) { flush(); out.push({ kind: "li", ordered: false, text: m[1] }); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.+)$/))) { flush(); out.push({ kind: "li", ordered: true, text: m[1] }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push({ kind: "quote", text: m[1] }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); continue; }
    para.push(line);
  }
  flush();
  return out;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Negrito/itálico/código inline → XHTML (texto já escapado). */
export function inlineHtml(s: string): string {
  return escapeXml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function plainText(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "ebook";
}

export function ebookFileName(doc: EbookDoc, ext: string): string {
  return `${slug(doc.title)}.${ext}`;
}

async function fetchImage(src: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const r = await fetch(src);
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") ?? "image/png").split(";")[0];
    if (!type.startsWith("image/")) return null;
    return { bytes: new Uint8Array(await r.arrayBuffer()), type };
  } catch {
    return null;
  }
}

const extOf = (type: string) => (type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "png");

// ---------- EPUB 3 ----------

export async function exportEpub(doc: EbookDoc): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  const manifest: string[] = [];
  const spine: string[] = [];
  const images = new Map<string, string>(); // src → caminho no zip
  const addImage = async (src: string): Promise<string | null> => {
    if (images.has(src)) return images.get(src)!;
    const img = await fetchImage(src);
    if (!img) return null;
    const name = `images/img${images.size + 1}.${extOf(img.type)}`;
    zip.file(`OEBPS/${name}`, img.bytes);
    manifest.push(`<item id="img${images.size + 1}" href="${name}" media-type="${img.type}"${images.size === 0 && src === doc.cover ? ' properties="cover-image"' : ""}/>`);
    images.set(src, name);
    return name;
  };

  const page = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(doc.language)}">
<head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;

  zip.file("OEBPS/style.css", "body{font-family:serif;line-height:1.6;margin:1em}h1{font-size:1.8em;margin:1.5em 0 .8em}h2{font-size:1.35em;margin:1.2em 0 .6em}h3{font-size:1.15em}img{max-width:100%}blockquote{border-left:3px solid #c9941a;margin-left:0;padding-left:1em;font-style:italic}.cover{text-align:center}.cover img{height:95vh}");
  manifest.push('<item id="css" href="style.css" media-type="text/css"/>');

  if (doc.cover) {
    const name = await addImage(doc.cover);
    if (name) {
      zip.file("OEBPS/cover.xhtml", page(doc.title, `<div class="cover"><img src="${name}" alt="${escapeXml(doc.title)}"/></div>`));
      manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="cover"/>');
    }
  }

  zip.file("OEBPS/title.xhtml", page(doc.title, `<h1>${escapeXml(doc.title)}</h1>${doc.subtitle ? `<p><em>${escapeXml(doc.subtitle)}</em></p>` : ""}`));
  manifest.push('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>');
  spine.push('<itemref idref="title"/>');

  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  spine.push('<itemref idref="nav"/>');

  for (let i = 0; i < doc.chapters.length; i++) {
    const c = doc.chapters[i];
    let html = `<h1>${escapeXml(`Capítulo ${i + 1} — ${c.title}`)}</h1>`;
    let list: "ul" | "ol" | null = null;
    for (const b of markdownBlocks(c.content)) {
      const want = b.kind === "li" ? (b.ordered ? "ol" : "ul") : null;
      if (list && list !== want) { html += `</${list}>`; list = null; }
      if (want && !list) { html += `<${want}>`; list = want; }
      if (b.kind === "h") html += `<h${b.level + 1}>${inlineHtml(b.text)}</h${b.level + 1}>`;
      else if (b.kind === "p") html += `<p>${inlineHtml(b.text)}</p>`;
      else if (b.kind === "li") html += `<li>${inlineHtml(b.text)}</li>`;
      else if (b.kind === "quote") html += `<blockquote><p>${inlineHtml(b.text)}</p></blockquote>`;
      else if (b.kind === "img") {
        const name = await addImage(b.src);
        if (name) html += `<p><img src="${name}" alt="${escapeXml(b.alt)}"/></p>`;
      }
    }
    if (list) html += `</${list}>`;
    zip.file(`OEBPS/chap${i + 1}.xhtml`, page(c.title, html));
    manifest.push(`<item id="chap${i + 1}" href="chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="chap${i + 1}"/>`);
  }

  zip.file("OEBPS/nav.xhtml", page("Sumário", `<nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>${doc.chapters.map((c, i) => `<li><a href="chap${i + 1}.xhtml">${escapeXml(`${i + 1}. ${c.title}`)}</a></li>`).join("")}</ol></nav>`));

  const id = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(doc.language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${escapeXml(doc.title)}</dc:title>
<dc:language>${escapeXml(doc.language)}</dc:language>
<dc:creator>Vertal Ebook Engine</dc:creator>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>${manifest.join("")}</manifest>
<spine>${spine.join("")}</spine>
</package>`);

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

// ---------- DOCX ----------

function docxRuns(text: string): string {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p) => {
    const bold = /^\*\*.+\*\*$/.test(p);
    const italic = !bold && /^\*.+\*$/.test(p);
    const t = plainText(bold ? p.slice(2, -2) : italic ? p.slice(1, -1) : p);
    const rPr = bold ? "<w:rPr><w:b/></w:rPr>" : italic ? "<w:rPr><w:i/></w:rPr>" : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`;
  }).join("");
}

const para = (style: string | null, runs: string, pageBreakBefore = false) =>
  `<w:p>${style || pageBreakBefore ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${pageBreakBefore ? "<w:pageBreakBefore/>" : ""}</w:pPr>` : ""}${runs}</w:p>`;

export async function exportDocx(doc: EbookDoc): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const body: string[] = [para("Title", docxRuns(doc.title))];
  if (doc.subtitle) body.push(para("Subtitle", docxRuns(doc.subtitle)));
  body.push(para("Heading1", docxRuns("Sumário"), true));
  doc.chapters.forEach((c, i) => body.push(para(null, docxRuns(`${i + 1}. ${c.title}`))));
  doc.chapters.forEach((c, i) => {
    body.push(para("Heading1", docxRuns(`Capítulo ${i + 1} — ${c.title}`), true));
    for (const b of markdownBlocks(c.content)) {
      if (b.kind === "h") body.push(para(`Heading${Math.min(b.level + 1, 3)}`, docxRuns(b.text)));
      else if (b.kind === "p") body.push(para(null, docxRuns(b.text)));
      else if (b.kind === "li") body.push(para("ListParagraph", docxRuns(`${b.ordered ? "–" : "•"} ${b.text}`)));
      else if (b.kind === "quote") body.push(para("Quote", docxRuns(b.text)));
    }
  });

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  const style = (id: string, name: string, size: number, extra = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/>${id.startsWith("Heading") ? `<w:outlineLvl w:val="${Number(id.slice(-1)) - 1}"/>` : ""}</w:pPr><w:rPr>${extra}<w:sz w:val="${size}"/></w:rPr></w:style>`;
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:style>
${style("Title", "Title", 56, "<w:b/>")}${style("Subtitle", "Subtitle", 30, "<w:i/>")}${style("Heading1", "heading 1", 36, "<w:b/>")}${style("Heading2", "heading 2", 30, "<w:b/>")}${style("Heading3", "heading 3", 26, "<w:b/>")}${style("ListParagraph", "List Paragraph", 24)}${style("Quote", "Quote", 24, "<w:i/>")}
</w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}

// ---------- PDF ----------

function toDataUrl(img: { bytes: Uint8Array; type: string }): string {
  let bin = "";
  img.bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `data:${img.type};base64,${btoa(bin)}`;
}

export async function exportPdf(doc: EbookDoc): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 56;
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const write = (text: string, size: number, style: "normal" | "bold" | "italic", gap: number, indent = 0) => {
    pdf.setFont("times", style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(plainText(text), maxW - indent) as string[];
    const lh = size * 1.4;
    for (const l of lines) { ensure(lh); pdf.text(l, M + indent, y + size); y += lh; }
    y += gap;
  };
  const image = async (src: string, maxH: number) => {
    const img = await fetchImage(src);
    if (!img) return;
    try {
      const url = toDataUrl(img);
      const props = pdf.getImageProperties(url);
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale, h = props.height * scale;
      ensure(h);
      pdf.addImage(url, extOf(img.type).toUpperCase(), M + (maxW - w) / 2, y, w, h);
      y += h + 12;
    } catch { /* formato não suportado pelo jsPDF */ }
  };

  if (doc.cover) { await image(doc.cover, H - M * 2); pdf.addPage(); y = M; }
  y = H / 3;
  write(doc.title, 28, "bold", 12);
  if (doc.subtitle) write(doc.subtitle, 16, "italic", 0);

  pdf.addPage(); y = M;
  write("Sumário", 20, "bold", 10);
  doc.chapters.forEach((c, i) => write(`${i + 1}. ${c.title}`, 12, "normal", 2));

  for (let i = 0; i < doc.chapters.length; i++) {
    const c = doc.chapters[i];
    pdf.addPage(); y = M;
    write(`Capítulo ${i + 1} — ${c.title}`, 20, "bold", 12);
    for (const b of markdownBlocks(c.content)) {
      if (b.kind === "h") { y += 6; write(b.text, b.level === 1 ? 16 : 14, "bold", 6); }
      else if (b.kind === "p") write(b.text, 12, "normal", 8);
      else if (b.kind === "li") write(`${b.ordered ? "–" : "•"} ${b.text}`, 12, "normal", 4, 12);
      else if (b.kind === "quote") write(b.text, 12, "italic", 8, 18);
      else if (b.kind === "img") await image(b.src, 300);
    }
  }
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
