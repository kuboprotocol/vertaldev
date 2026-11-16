// Geometria do Auto Cadê: acerto (snap), seleção, contorno das paredes e movimento de itens.
// Tudo em metros. Funções puras: nunca alteram o documento recebido.
import type { CadDocument, CadWall, Pt } from './model';

export type CadEntityKind = 'wall' | 'line' | 'room' | 'opening' | 'dimension' | 'text';
export interface CadEntityRef {
  kind: CadEntityKind;
  id: string;
}

let idCounter = 0;
/** Id curto e único para itens criados no editor. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Área em m² (fórmula de Gauss). */
export function polygonArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** Os quatro cantos da parede (retângulo em volta do eixo). */
export function wallQuad(w: CadWall): Pt[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w.thickness / 2);
  const ny = (dx / len) * (w.thickness / 2);
  return [
    { x: w.a.x + nx, y: w.a.y + ny },
    { x: w.b.x + nx, y: w.b.y + ny },
    { x: w.b.x - nx, y: w.b.y - ny },
    { x: w.a.x - nx, y: w.a.y - ny },
  ];
}

export function snapToGrid(p: Pt, step: number): Pt {
  if (step <= 0) return { ...p };
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

/** Trava o segmento em horizontal ou vertical (Shift). */
export function orthoConstrain(start: Pt, p: Pt): Pt {
  return Math.abs(p.x - start.x) >= Math.abs(p.y - start.y) ? { x: p.x, y: start.y } : { x: start.x, y: p.y };
}

/** Ponto de extremidade existente mais perto, se estiver dentro da tolerância (em metros). */
export function nearestEndpoint(p: Pt, doc: CadDocument, tol: number): Pt | null {
  let best: Pt | null = null;
  let bestD = tol;
  const consider = (q: Pt) => {
    const d = dist(p, q);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  };
  doc.walls.forEach((w) => { consider(w.a); consider(w.b); });
  doc.lines.forEach((l) => { consider(l.a); consider(l.b); });
  return best;
}

/** Para portas e janelas: encaixa o ponto no eixo da parede mais próxima, se estiver perto. */
export function projectOntoWall(p: Pt, doc: CadDocument, tol: number): Pt {
  let best: Pt | null = null;
  let bestD = tol;
  for (const w of doc.walls) {
    const q = projectOnSegment(p, w.a, w.b);
    const d = dist(p, q);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  }
  return best ?? p;
}

/** Espessura da parede mais próxima do ponto (para desenhar o vão). */
export function wallThicknessNear(doc: CadDocument, p: Pt, fallback: number): number {
  let best = fallback;
  let bestD = Infinity;
  for (const w of doc.walls) {
    const d = distToSegment(p, w.a, w.b);
    if (d < bestD) {
      bestD = d;
      best = w.thickness;
    }
  }
  return bestD < 0.6 ? best : fallback;
}

/** Item sob o ponto, na ordem de prioridade: texto, vão, cota, parede, linha, ambiente. `tol` em metros. */
export function hitTest(doc: CadDocument, p: Pt, tol: number): CadEntityRef | null {
  for (const t of doc.texts) {
    const w = Math.max(0.6, t.text.length * t.height * 0.6);
    if (p.x >= t.at.x - tol && p.x <= t.at.x + w + tol && p.y >= t.at.y - tol && p.y <= t.at.y + t.height + tol) {
      return { kind: 'text', id: t.id };
    }
  }
  for (const o of doc.openings) {
    if (distToSegment(p, o.a, o.b) <= tol) return { kind: 'opening', id: o.id };
  }
  for (const d of doc.dimensions) {
    if (distToSegment(p, d.a, d.b) <= tol) return { kind: 'dimension', id: d.id };
  }
  for (const w of doc.walls) {
    if (distToSegment(p, w.a, w.b) <= Math.max(tol, w.thickness / 2)) return { kind: 'wall', id: w.id };
  }
  for (const l of doc.lines) {
    if (distToSegment(p, l.a, l.b) <= tol) return { kind: 'line', id: l.id };
  }
  for (const r of doc.rooms) {
    if (pointInPolygon(p, r.points)) return { kind: 'room', id: r.id };
  }
  return null;
}

/** Move um item inteiro por (dx, dy). Devolve um documento novo. */
export function translateEntity(doc: CadDocument, ref: CadEntityRef, d: Pt): CadDocument {
  const mv = (p: Pt): Pt => ({ x: p.x + d.x, y: p.y + d.y });
  const hit = <T extends { id: string }>(list: T[], f: (item: T) => T): T[] =>
    list.map((item) => (item.id === ref.id ? f(item) : item));
  switch (ref.kind) {
    case 'wall': return { ...doc, walls: hit(doc.walls, (w) => ({ ...w, a: mv(w.a), b: mv(w.b) })) };
    case 'line': return { ...doc, lines: hit(doc.lines, (l) => ({ ...l, a: mv(l.a), b: mv(l.b) })) };
    case 'room': return { ...doc, rooms: hit(doc.rooms, (r) => ({ ...r, points: r.points.map(mv) })) };
    case 'opening': return { ...doc, openings: hit(doc.openings, (o) => ({ ...o, a: mv(o.a), b: mv(o.b) })) };
    case 'dimension': return { ...doc, dimensions: hit(doc.dimensions, (x) => ({ ...x, a: mv(x.a), b: mv(x.b) })) };
    case 'text': return { ...doc, texts: hit(doc.texts, (t) => ({ ...t, at: mv(t.at) })) };
  }
}

/** Remove um item. Devolve um documento novo. */
export function removeEntity(doc: CadDocument, ref: CadEntityRef): CadDocument {
  const keep = <T extends { id: string }>(list: T[]) => list.filter((item) => item.id !== ref.id);
  switch (ref.kind) {
    case 'wall': return { ...doc, walls: keep(doc.walls) };
    case 'line': return { ...doc, lines: keep(doc.lines) };
    case 'room': return { ...doc, rooms: keep(doc.rooms) };
    case 'opening': return { ...doc, openings: keep(doc.openings) };
    case 'dimension': return { ...doc, dimensions: keep(doc.dimensions) };
    case 'text': return { ...doc, texts: keep(doc.texts) };
  }
}

/** Caixa que envolve todo o desenho, ou null se estiver vazio. */
export function documentBounds(doc: CadDocument): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts: Pt[] = [
    ...doc.walls.flatMap(wallQuad),
    ...doc.lines.flatMap((l) => [l.a, l.b]),
    ...doc.rooms.flatMap((r) => r.points),
    ...doc.openings.flatMap((o) => [o.a, o.b]),
    ...doc.dimensions.flatMap((d) => [d.a, d.b]),
    ...doc.texts.map((t) => t.at),
  ];
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Número com vírgula, como se escreve no Brasil. */
export function formatM(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

export function formatArea(m2: number): string {
  return `${formatM(m2)} m²`;
}
