import { describe, expect, it } from 'vitest';
import {
  addBlankPage,
  appendPdf,
  applyOp,
  deletePage,
  hexToRgbUnit,
  inspectPdf,
  loadPdf,
  normalizeRotation,
  rotatePage,
  sanitizeForFont,
  visualRectToBox,
  visualSize,
  visualToUnit,
} from './pdfEdit';
import { blankPdf, textToPdf } from './pdfGenerate';

const crop = { x: 0, y: 0, width: 612, height: 792 };

describe('coordenadas da página girada', () => {
  it('normaliza o ângulo de /Rotate', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(180)).toBe(180);
  });

  it('mapeia o canto superior esquerdo visível para o canto certo do PDF em cada rotação', () => {
    expect(visualToUnit({ x: 0, y: 0 }, 0)).toEqual({ u: 0, v: 1 });
    expect(visualToUnit({ x: 0, y: 0 }, 90)).toEqual({ u: 0, v: 0 });
    expect(visualToUnit({ x: 0, y: 0 }, 180)).toEqual({ u: 1, v: 0 });
    expect(visualToUnit({ x: 0, y: 0 }, 270)).toEqual({ u: 1, v: 1 });
  });

  it('troca largura e altura visíveis em 90° e 270°', () => {
    expect(visualSize(612, 792, 0)).toEqual({ width: 612, height: 792 });
    expect(visualSize(612, 792, 90)).toEqual({ width: 792, height: 612 });
    expect(visualSize(612, 792, 270)).toEqual({ width: 792, height: 612 });
  });

  it('o quadrante superior esquerdo da tela vira a caixa certa no PDF', () => {
    const r = { x: 0, y: 0, w: 0.5, h: 0.5 };
    expect(visualRectToBox(r, 0, crop)).toEqual({ x: 0, y: 396, width: 306, height: 396 });
    // Com a página girada 90° no sentido horário, o canto visível superior esquerdo é o inferior esquerdo original.
    expect(visualRectToBox(r, 90, crop)).toEqual({ x: 0, y: 0, width: 306, height: 396 });
  });

  it('caixa de retângulo é a mesma seja qual for o sentido em que o usuário arrastou', () => {
    const forward = visualRectToBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 0, crop);
    const reversed = visualRectToBox({ x: 0.4, y: 0.6, w: -0.3, h: -0.4 }, 0, crop);
    expect(reversed.x).toBeCloseTo(forward.x, 6);
    expect(reversed.y).toBeCloseTo(forward.y, 6);
    expect(reversed.width).toBeCloseTo(forward.width, 6);
    expect(reversed.height).toBeCloseTo(forward.height, 6);
  });

  it('converte cor hexadecimal', () => {
    expect(hexToRgbUnit('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgbUnit('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgbUnit('nao-e-cor')).toEqual([0, 0, 0]);
  });
});

describe('operações sobre o PDF', () => {
  it('valida PDF e recusa o que não é PDF', async () => {
    const pdf = await blankPdf();
    await expect(inspectPdf(pdf)).resolves.toEqual({ pages: 1 });
    await expect(inspectPdf(new TextEncoder().encode('oi, sou texto'))).rejects.toThrow('não é um PDF');
  });

  it('gira, apaga, insere página em branco e anexa outro PDF', async () => {
    let pdf = await textToPdf('Teste', 'Primeiro parágrafo.\n\nSegundo parágrafo.');

    pdf = await rotatePage(pdf, 0, 90);
    expect((await loadPdf(pdf)).getPage(0).getRotation().angle).toBe(90);
    pdf = await rotatePage(pdf, 0, -90);
    expect((await loadPdf(pdf)).getPage(0).getRotation().angle).toBe(0);

    pdf = await addBlankPage(pdf, 0);
    expect((await loadPdf(pdf)).getPageCount()).toBe(2);

    pdf = await deletePage(pdf, 1);
    expect((await loadPdf(pdf)).getPageCount()).toBe(1);

    const other = await blankPdf();
    pdf = await appendPdf(pdf, other);
    expect((await loadPdf(pdf)).getPageCount()).toBe(2);
  });

  it('não apaga a última página', async () => {
    const pdf = await blankPdf();
    await expect(deletePage(pdf, 0)).rejects.toThrow('pelo menos uma página');
  });

  it('insere texto e destaque sem quebrar, inclusive em página girada', async () => {
    let pdf = await blankPdf();
    pdf = await rotatePage(pdf, 0, 90);
    pdf = await applyOp(pdf, { kind: 'text', page: 0, at: { x: 0.2, y: 0.3 }, text: 'Olá, mundo — ação', size: 14, color: '#2563eb' });
    pdf = await applyOp(pdf, { kind: 'highlight', page: 0, rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.05 }, color: '#facc15' });
    pdf = await applyOp(pdf, { kind: 'cover', page: 0, rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, color: '#ffffff' });
    const loaded = await loadPdf(pdf);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getPage(0).getRotation().angle).toBe(90);
  });

  it('rejeita área muito pequena e texto vazio', async () => {
    const pdf = await blankPdf();
    await expect(applyOp(pdf, { kind: 'cover', page: 0, rect: { x: 0.1, y: 0.1, w: 0.001, h: 0.2 }, color: '#fff' })).rejects.toThrow('área maior');
    await expect(applyOp(pdf, { kind: 'text', page: 0, at: { x: 0.1, y: 0.1 }, text: '   ', size: 12, color: '#000' })).rejects.toThrow('Digite um texto');
  });

  it('caracteres fora da fonte padrão viram "?" em vez de quebrar', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(sanitizeForFont('ação ✓ 漢', font)).toBe('ação ? ?');
  });
});
