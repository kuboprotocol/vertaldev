// Exportação do Auto Cadê: folha A3 em SVG (com carimbo, pronta para impressão/PDF) e DXF (AutoCAD, R12).
import type { CadDocument, CadOpening, Pt } from './model';
import { CAD_LIMITS } from './model';
import { documentBounds, dist, formatArea, formatM, polygonArea, polygonCentroid, wallQuad, wallThicknessNear } from './geometry';

// Folha A3 paisagem em mm. Área de desenho e carimbo no canto inferior direito.
const SHEET = { w: 420, h: 297, margin: 10 };
const DRAW = { x: 10, y: 10, w: 400, h: 232 };
const TITLE = { x: 270, y: 247, w: 140, h: 40 };
const MARGIN_M = 1;

export interface CadSheetLayout {
  /** Escala real da folha (1:N). Igual à declarada, ou maior quando o desenho não cabe. */
  scaleDenominator: number;
  /** Escala declarada no documento. */
  declaredDenominator: number;
  /** mm no papel por metro real. */
  mmPerM: number;
  toPaper: (p: Pt) => Pt;
  adjusted: boolean;
}

export function cadSheetLayout(doc: CadDocument): CadSheetLayout {
  const declared = Number(doc.scale.split(':')[1]) || 50;
  const b = documentBounds(doc) ?? { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const wM = b.maxX - b.minX + 2 * MARGIN_M;
  const hM = b.maxY - b.minY + 2 * MARGIN_M;
  // Escala mínima para o desenho caber na área de desenho: 1 mm no papel = N mm reais.
  const fit = Math.max(Math.ceil((wM * 1000) / DRAW.w), Math.ceil((hM * 1000) / DRAW.h));
  const n = Math.max(declared, fit);
  const mmPerM = 1000 / n;
  const x0 = DRAW.x + (DRAW.w - wM * mmPerM) / 2;
  const y0 = DRAW.y + (DRAW.h - hM * mmPerM) / 2;
  const left = b.minX - MARGIN_M;
  const top = b.maxY + MARGIN_M;
  return {
    scaleDenominator: n,
    declaredDenominator: declared,
    mmPerM,
    adjusted: n !== declared,
    toPaper: (p) => ({ x: x0 + (p.x - left) * mmPerM, y: y0 + (top - p.y) * mmPerM }),
  };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const poly = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

/** Normal unitária do segmento a→b, girada 90° para a esquerda (em metros). */
function normal(a: Pt, b: Pt): Pt {
  const len = dist(a, b) || 1;
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** Desenho em SVG, em mm, no formato A3 paisagem. */
export function cadToSvg(doc: CadDocument): string {
  const L = cadSheetLayout(doc);
  const P = L.toPaper;
  const out: string[] = [];
  const mm = (m: number) => m * L.mmPerM;

  // Ambientes: contorno tracejado, nome e área no centro.
  for (const r of doc.rooms) {
    out.push(`<polygon points="${poly(r.points.map(P))}" fill="#f1f5f9" stroke="#64748b" stroke-width="0.2" stroke-dasharray="1 0.6"/>`);
    const c = P(polygonCentroid(r.points));
    out.push(
      `<text x="${c.x.toFixed(2)}" y="${(c.y - 0.6).toFixed(2)}" text-anchor="middle" font-size="3" font-weight="600" fill="#0f172a">${esc(r.name)}</text>`,
      `<text x="${c.x.toFixed(2)}" y="${(c.y + 2.6).toFixed(2)}" text-anchor="middle" font-size="2.2" fill="#334155">${esc(formatArea(polygonArea(r.points)))}</text>`,
    );
  }

  // Paredes: preenchidas.
  for (const w of doc.walls) {
    out.push(`<polygon points="${poly(wallQuad(w).map(P))}" fill="#0f172a"/>`);
  }

  // Linhas de apoio.
  for (const l of doc.lines) {
    const a = P(l.a);
    const b = P(l.b);
    out.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#0f172a" stroke-width="0.25"/>`);
  }

  // Portas e janelas: o vão é aberto na parede e recebe folha (porta) ou caixilho (janela).
  for (const o of doc.openings) out.push(openingSvg(o, doc, L));

  // Cotas.
  for (const d of doc.dimensions) {
    const n = normal(d.a, d.b);
    const a2 = { x: d.a.x + n.x * d.offset, y: d.a.y + n.y * d.offset };
    const b2 = { x: d.b.x + n.x * d.offset, y: d.b.y + n.y * d.offset };
    const A = P(d.a), B = P(d.b), A2 = P(a2), B2 = P(b2);
    const ang = (Math.atan2(B2.y - A2.y, B2.x - A2.x) * 180) / Math.PI;
    const mid = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
    const label = `${formatM(dist(d.a, d.b))} m`;
    const readable = ang > 90 || ang < -90 ? ang + 180 : ang;
    out.push(
      `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${A2.x.toFixed(2)}" y2="${A2.y.toFixed(2)}" stroke="#0f172a" stroke-width="0.15"/>`,
      `<line x1="${B.x.toFixed(2)}" y1="${B.y.toFixed(2)}" x2="${B2.x.toFixed(2)}" y2="${B2.y.toFixed(2)}" stroke="#0f172a" stroke-width="0.15"/>`,
      `<line x1="${A2.x.toFixed(2)}" y1="${A2.y.toFixed(2)}" x2="${B2.x.toFixed(2)}" y2="${B2.y.toFixed(2)}" stroke="#0f172a" stroke-width="0.2"/>`,
      `<text transform="translate(${mid.x.toFixed(2)},${(mid.y - 0.8).toFixed(2)}) rotate(${readable.toFixed(2)})" text-anchor="middle" font-size="2.4" fill="#0f172a">${esc(label)}</text>`,
    );
  }

  // Textos.
  for (const t of doc.texts) {
    const p = P(t.at);
    out.push(`<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" font-size="${Math.max(1.8, mm(t.height)).toFixed(2)}" fill="#0f172a">${esc(t.text)}</text>`);
  }

  const tb = doc.titleBlock;
  const scaleText = L.adjusted ? `1:${L.scaleDenominator} (ajustada; declarada 1:${L.declaredDenominator})` : `1:${L.scaleDenominator}`;
  const rows: [string, string][] = [
    ['Projeto', tb.project],
    ['Desenho', tb.drawing],
    ['Arquiteto(a)', tb.architect],
    ['Registro', tb.registration],
    ['Data', tb.date],
    ['Escala', scaleText],
    ['Folha', tb.sheet],
  ];
  const rowH = TITLE.h / rows.length;
  const block: string[] = [
    `<rect x="${TITLE.x}" y="${TITLE.y}" width="${TITLE.w}" height="${TITLE.h}" fill="#ffffff" stroke="#0f172a" stroke-width="0.4"/>`,
    `<line x1="${TITLE.x + 32}" y1="${TITLE.y}" x2="${TITLE.x + 32}" y2="${TITLE.y + TITLE.h}" stroke="#0f172a" stroke-width="0.3"/>`,
  ];
  rows.forEach(([label, value], i) => {
    const y = TITLE.y + i * rowH;
    if (i > 0) block.push(`<line x1="${TITLE.x}" y1="${y.toFixed(2)}" x2="${TITLE.x + TITLE.w}" y2="${y.toFixed(2)}" stroke="#94a3b8" stroke-width="0.2"/>`);
    block.push(
      `<text x="${TITLE.x + 2}" y="${(y + rowH * 0.66).toFixed(2)}" font-size="2.3" fill="#475569">${esc(label)}</text>`,
      `<text x="${TITLE.x + 34}" y="${(y + rowH * 0.66).toFixed(2)}" font-size="3" font-weight="600" fill="#0f172a">${esc(value || '—')}</text>`,
    );
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.w}mm" height="${SHEET.h}mm" viewBox="0 0 ${SHEET.w} ${SHEET.h}" font-family="Arial, Helvetica, sans-serif">`,
    `<title>${esc(tb.project)} — ${esc(tb.drawing)}</title>`,
    `<rect width="${SHEET.w}" height="${SHEET.h}" fill="#ffffff"/>`,
    `<rect x="${SHEET.margin - 3}" y="${SHEET.margin - 3}" width="${SHEET.w - 2 * SHEET.margin + 6}" height="${SHEET.h - 2 * SHEET.margin + 6}" fill="none" stroke="#0f172a" stroke-width="0.6"/>`,
    ...out,
    ...block,
    `<text x="${DRAW.x}" y="${TITLE.y + 6}" font-size="2.4" fill="#475569">Medidas em metros. Escala ${esc(`1:${L.scaleDenominator}`)}.</text>`,
    `</svg>`,
  ].join('\n');
}

function openingSvg(o: CadOpening, doc: CadDocument, L: CadSheetLayout): string {
  const P = L.toPaper;
  const t = wallThicknessNear(doc, { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }, CAD_LIMITS.defaultWallThicknessM);
  const span = dist(o.a, o.b) || 1;
  const n = normal(o.a, o.b);
  const A = P(o.a);
  const B = P(o.b);
  // Vão aberto na parede (cor do fundo).
  const gap = `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" stroke="#ffffff" stroke-width="${(t * L.mmPerM).toFixed(2)}"/>`;
  if (o.kind === 'window') {
    const h = t / 2;
    const corners = [
      { x: o.a.x + n.x * h, y: o.a.y + n.y * h },
      { x: o.b.x + n.x * h, y: o.b.y + n.y * h },
      { x: o.b.x - n.x * h, y: o.b.y - n.y * h },
      { x: o.a.x - n.x * h, y: o.a.y - n.y * h },
    ];
    return `${gap}<polygon points="${poly(corners.map(P))}" fill="#e0f2fe" stroke="#0f172a" stroke-width="0.25"/>`;
  }
  // Porta: folha articulada em a, arco de a até a ponta da folha.
  const leafEnd = { x: o.a.x + n.x * span, y: o.a.y + n.y * span };
  const LE = P(leafEnd);
  const r = span * L.mmPerM;
  return [
    gap,
    `<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${LE.x.toFixed(2)}" y2="${LE.y.toFixed(2)}" stroke="#0f172a" stroke-width="0.35"/>`,
    `<path d="M ${LE.x.toFixed(2)} ${LE.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${B.x.toFixed(2)} ${B.y.toFixed(2)}" fill="none" stroke="#0f172a" stroke-width="0.2" stroke-dasharray="0.8 0.6"/>`,
  ].join('');
}

// ─── DXF (AutoCAD, R12 ASCII) ─────────────────────────────────────────────

const DXF_LAYERS: [string, number][] = [
  ['PAREDES', 7],
  ['ABERTURAS', 3],
  ['AMBIENTES', 4],
  ['COTAS', 1],
  ['TEXTOS', 2],
  ['LINHAS', 8],
];

/** Texto seguro para DXF: só ASCII, com acentos escritos como \U+XXXX. */
export function dxfText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, (ch) => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

/** Documento DXF em metros (INSUNITS 6). Layers: PAREDES, ABERTURAS, AMBIENTES, COTAS, TEXTOS, LINHAS. */
export function cadToDxf(doc: CadDocument): string {
  const o: string[] = [];
  const g = (code: number, value: string | number) => o.push(String(code), typeof value === 'number' ? value.toFixed(4) : value);
  const line = (layer: string, a: Pt, b: Pt) => {
    o.push('0', 'LINE', '8', layer);
    g(10, a.x); g(20, a.y); g(30, 0);
    g(11, b.x); g(21, b.y); g(31, 0);
  };
  const polyline = (layer: string, pts: Pt[], closed: boolean) => {
    o.push('0', 'LWPOLYLINE', '8', layer);
    o.push('90', String(pts.length), '70', closed ? '1' : '0');
    for (const p of pts) { g(10, p.x); g(20, p.y); }
  };
  const text = (layer: string, at: Pt, height: number, value: string) => {
    o.push('0', 'TEXT', '8', layer);
    g(10, at.x); g(20, at.y); g(30, 0); g(40, height);
    o.push('1', dxfText(value));
  };

  // HEADER
  o.push('0', 'SECTION', '2', 'HEADER');
  o.push('9', '$ACADVER', '1', 'AC1009');
  o.push('9', '$INSUNITS', '70', '6');
  o.push('9', '$DWGCODEPAGE', '3', 'ANSI_1252');
  o.push('0', 'ENDSEC');

  // TABLES: layers
  o.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(DXF_LAYERS.length));
  for (const [name, color] of DXF_LAYERS) {
    o.push('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS');
  }
  o.push('0', 'ENDTAB', '0', 'ENDSEC');

  // ENTITIES
  o.push('0', 'SECTION', '2', 'ENTITIES');
  for (const w of doc.walls) polyline('PAREDES', wallQuad(w), true);
  for (const r of doc.rooms) {
    polyline('AMBIENTES', r.points, true);
    text('TEXTOS', polygonCentroid(r.points), 0.25, r.name);
  }
  for (const l of doc.lines) line('LINHAS', l.a, l.b);
  for (const op of doc.openings) {
    line('ABERTURAS', op.a, op.b);
    if (op.kind === 'window') {
      const t = wallThicknessNear(doc, { x: (op.a.x + op.b.x) / 2, y: (op.a.y + op.b.y) / 2 }, CAD_LIMITS.defaultWallThicknessM);
      const n = normal(op.a, op.b);
      const h = t / 2;
      polyline('ABERTURAS', [
        { x: op.a.x + n.x * h, y: op.a.y + n.y * h },
        { x: op.b.x + n.x * h, y: op.b.y + n.y * h },
        { x: op.b.x - n.x * h, y: op.b.y - n.y * h },
        { x: op.a.x - n.x * h, y: op.a.y - n.y * h },
      ], true);
    } else {
      const n = normal(op.a, op.b);
      const span = dist(op.a, op.b);
      line('ABERTURAS', op.a, { x: op.a.x + n.x * span, y: op.a.y + n.y * span });
    }
  }
  for (const d of doc.dimensions) {
    const n = normal(d.a, d.b);
    const a2 = { x: d.a.x + n.x * d.offset, y: d.a.y + n.y * d.offset };
    const b2 = { x: d.b.x + n.x * d.offset, y: d.b.y + n.y * d.offset };
    line('COTAS', d.a, a2);
    line('COTAS', d.b, b2);
    line('COTAS', a2, b2);
    const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
    text('COTAS', mid, 0.25, `${formatM(dist(d.a, d.b))} m`);
  }
  for (const t of doc.texts) text('TEXTOS', t.at, t.height, t.text);
  o.push('0', 'ENDSEC');
  o.push('0', 'EOF');
  return o.join('\n') + '\n';
}
