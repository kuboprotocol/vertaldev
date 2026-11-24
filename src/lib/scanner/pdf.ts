// Monta o PDF de páginas escaneadas (JPEG) com pdf-lib, uma página A4 por imagem, sem cortar o conteúdo.

export interface ScanJpegPage { jpeg: Uint8Array; width: number; height: number }

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 24;

/** Encaixa a imagem na A4 mantendo a proporção e centralizando. */
export function fitRect(imgW: number, imgH: number, pageW = A4_W, pageH = A4_H, margin = MARGIN) {
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const scale = Math.min(availW / imgW, availH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h };
}

export async function buildScanPdf(pages: ScanJpegPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('Nenhuma página para exportar.');
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle('Documento escaneado');
  doc.setProducer('Vertal Scanner');
  for (const p of pages) {
    const image = await doc.embedJpg(p.jpeg);
    const page = doc.addPage([A4_W, A4_H]);
    const r = fitRect(p.width, p.height);
    page.drawImage(image, { x: r.x, y: r.y, width: r.width, height: r.height });
  }
  return doc.save();
}
