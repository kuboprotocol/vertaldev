// Matemática do scanner de documentos: recorte em perspectiva (homografia), filtros e tamanho de saída.
// Inspirado no MakeACopy (Apache-2.0, github.com/egdels/makeacopy). O código é reescrito em TypeScript para a web.

export interface Pt { x: number; y: number }
/** Quatro cantos na ordem: topo-esquerda, topo-direita, base-direita, base-esquerda. */
export type Quad = [Pt, Pt, Pt, Pt];
export type ScanMode = 'color' | 'gray' | 'bw';

export interface RawImage { data: Uint8ClampedArray; width: number; height: number }

/** Cantos com um recuo proporcional à imagem: ponto de partida para o usuário ajustar. */
export function insetQuad(width: number, height: number, ratio = 0.06): Quad {
  const mx = width * ratio;
  const my = height * ratio;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Tamanho da página retificada: o maior lado de cada par de bordas, limitado a maxSide. */
export function outputSize(quad: Quad, maxSide = 2400): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const w = Math.max(dist(tl, tr), dist(bl, br));
  const h = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Resolve o sistema 8x8 por eliminação de Gauss com pivô parcial. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Cantos degenerados: não dá para retificar.');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homografia 3x3 (linha a linha) que leva cada src[i] para dst[i]. */
export function homography(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  return [...solve(A, b), 1];
}

export function applyHomography(H: number[], x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/**
 * Retifica a região do quad da imagem para um retângulo outW x outH.
 * Mapeamento inverso: para cada pixel de saída, acha o ponto da origem e amostra bilinear.
 * Fora da origem fica branco (papel ausente nos cantos).
 */
export function warpPerspective(src: RawImage, quad: Quad, outW: number, outH: number): RawImage {
  const rect: Quad = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const H = homography(rect, quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { width: W, height: Hh, data } = src;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const o = (v * outW + u) * 4;
      const p = applyHomography(H, u, v);
      if (p.x < 0 || p.y < 0 || p.x > W - 1 || p.y > Hh - 1) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(p.x);
      const y0 = Math.floor(p.y);
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, Hh - 1);
      const fx = p.x - x0;
      const fy = p.y - y0;
      for (let c = 0; c < 3; c++) {
        const top = data[(y0 * W + x0) * 4 + c] * (1 - fx) + data[(y0 * W + x1) * 4 + c] * fx;
        const bot = data[(y1 * W + x0) * 4 + c] * (1 - fx) + data[(y1 * W + x1) * 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Limiar de Otsu: escolhe o corte que melhor separa papel (claro) de tinta (escuro). */
export function otsuThreshold(gray: Uint8Array | Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/** Aplica o filtro do documento in place: colorida mantém; cinza e P&B removem a cor. */
export function enhance(img: RawImage, mode: ScanMode): RawImage {
  if (mode === 'color') return img;
  const d = img.data;
  const n = img.width * img.height;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]);
  }
  const t = mode === 'bw' ? otsuThreshold(gray) : -1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let g = gray[i];
    if (mode === 'bw') g = g > t ? 255 : 0;
    d[o] = d[o + 1] = d[o + 2] = g;
  }
  return img;
}
