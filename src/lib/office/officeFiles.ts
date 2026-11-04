// Exportação de Word (.docx) e PowerPoint (.pptx) do Vertal Office. Bibliotecas carregadas sob demanda.
import type { DocData } from './documentModel';
import type { DeckData } from './slidesModel';

/** Word: título, títulos de seção, parágrafos e itens de lista. */
export async function docToDocx(doc: DocData): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title || 'Documento sem título')] }),
    ...doc.blocks
      .filter((b) => b.text.trim() !== '')
      .map((b) => {
        if (b.type === 'heading') {
          return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] });
        }
        if (b.type === 'bullet') {
          return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] });
        }
        return new Paragraph({ children: [new TextRun(b.text)] });
      }),
  ];
  const file = new Document({ creator: 'Vertal Office', title: doc.title, sections: [{ children }] });
  return Packer.toBlob(file);
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
