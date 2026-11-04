// Exportação de Word (.docx) e PowerPoint (.pptx) do Vertal Office. Bibliotecas carregadas sob demanda.
import JSZip from 'jszip';
import type { DocData } from './documentModel';
import type { DeckData } from './slidesModel';

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wordParagraph(text: string, style?: 'Title' | 'Heading2', prefix = ''): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${xmlEscape(prefix + text)}</w:t></w:r></w:p>`;
}

/**
 * Word: título, títulos de seção, parágrafos e itens de lista. Monta o pacote .docx
 * direto (zip com três partes XML), sem a biblioteca `docx`, que estoura a memória do build.
 */
export async function docToDocx(doc: DocData): Promise<Blob> {
  const body = [
    wordParagraph(doc.title || 'Documento sem título', 'Title'),
    ...doc.blocks
      .filter((b) => b.text.trim() !== '')
      .map((b) => {
        if (b.type === 'heading') return wordParagraph(b.text, 'Heading2');
        if (b.type === 'bullet') return wordParagraph(b.text, undefined, '• ');
        return wordParagraph(b.text);
      }),
  ].join('');

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      body +
      '</w:body></w:document>',
  );
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** PowerPoint: um slide por item, com título e tópicos. */
export async function deckToPptx(deck: DeckData): Promise<ArrayBuffer> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.title = deck.title;
  pptx.author = 'Vertal Office';
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.addText(s.title || ' ', { x: 0.6, y: 0.4, w: 12, h: 1.2, fontSize: 36, bold: true, color: '1E293B' });
    if (s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.9, w: 11.5, h: 4.8, fontSize: 22, color: '334155', valign: 'top' },
      );
    }
  }
  return (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
}
