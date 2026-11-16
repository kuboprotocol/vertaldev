import { describe, expect, it } from 'vitest';
import {
  CAD_LIMITS,
  CAD_PRICING,
  CAD_SYSTEM_PROMPT,
  cadAiCostBrl,
  cadCredits,
  cadPriceBrl,
  emptyCadDocument,
  parseModelJson,
  summarizeCadDocument,
  validateCadPlan,
} from '../model';
import type { CadDocument } from '../model';
import { CREDIT_VALUE_BRL } from '../../../../supabase/functions/_shared/videoStudioConfig';
import { cadSheetLayout, cadToDxf, cadToSvg, dxfText } from '../export';
import {
  documentBounds,
  hitTest,
  nearestEndpoint,
  orthoConstrain,
  polygonArea,
  projectOntoWall,
  removeEntity,
  snapToGrid,
  translateEntity,
  wallQuad,
} from '../geometry';

const plan = {
  title: 'Apto 2 quartos',
  scale: '1:50',
  titleBlock: { project: 'Apto 2 quartos', architect: 'Ana Souza', registration: 'CAU A123-4', sheet: '01/02' },
  walls: [
    { a: [0, 0], b: [6, 0], thickness: 0.15 },
    { a: [6, 0], b: [6, 4], thickness: 0.15 },
    { a: [6, 4], b: [0, 4], thickness: 0.15 },
    { a: [0, 4], b: [0, 0] },
    { a: [2, 0], b: [2, 0] }, // comprimento zero: descartada
  ],
  rooms: [
    { name: 'Sala', points: [[0.1, 0.1], [5.9, 0.1], [5.9, 3.9], [0.1, 3.9]] },
    { name: 'Quarto', points: [[0, 0]] }, // menos de 3 pontos: descartado
  ],
  openings: [
    { kind: 'door', a: [2, 0], b: [2.9, 0] },
    { kind: 'window', a: [1, 4], b: [2.2, 4] },
    { kind: 'porta-estranha', a: [0, 1], b: [0, 1.9] },
  ],
  dimensions: [{ a: [0, -0.6], b: [6, -0.6], offset: 0.6 }],
  texts: [{ at: [3, 2], text: 'Sala\n\u0007 de estar', height: 0.25 }],
};

describe('plano da IA (validateCadPlan)', () => {
  it('monta um desenho com ids, descarta itens inválidos e normaliza', () => {
    const result = validateCadPlan(plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.document;
    expect(d.walls).toHaveLength(4);
    expect(d.walls[0].id).toBe('w1');
    expect(d.rooms).toHaveLength(1);
    expect(d.openings.map((o) => o.kind)).toEqual(['door', 'window', 'door']);
    expect(d.scale).toBe('1:50');
    expect(d.titleBlock.architect).toBe('Ana Souza');
    expect(d.titleBlock.registration).toBe('CAU A123-4');
    expect(d.texts[0].text).toBe('Sala de estar');
  });

  it('aceita pontos como {x,y} e cai para a escala padrão quando a escala não é permitida', () => {
    const result = validateCadPlan({ ...plan, scale: '1:999', walls: [{ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scale).toBe(CAD_LIMITS.defaultScale);
    expect(result.document.walls[0].thickness).toBe(CAD_LIMITS.defaultWallThicknessM);
  });

  it('recusa o que não é objeto e planos sem nenhum elemento válido', () => {
    expect(validateCadPlan(null).ok).toBe(false);
    expect(validateCadPlan([]).ok).toBe(false);
    expect(validateCadPlan({ walls: [{ a: [0, 0], b: [0, 0] }] }).ok).toBe(false);
  });

  it('recusa coordenadas absurdas (fora do limite ou não numéricas)', () => {
    const result = validateCadPlan({ walls: [{ a: [0, 0], b: [CAD_LIMITS.maxCoordM + 1, 0] }, { a: [0, 0], b: [4, 'x'] }] });
    expect(result.ok).toBe(false);
  });

  it('recusa planos com elementos demais', () => {
    const walls = Array.from({ length: CAD_LIMITS.maxElements + 1 }, (_, i) => ({ a: [i * 0.1, 0], b: [i * 0.1, 3] }));
    expect(validateCadPlan({ walls }).ok).toBe(false);
  });
});

describe('leitura da resposta do modelo (parseModelJson)', () => {
  it('lê JSON puro, JSON com cerca de markdown e JSON com texto em volta', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseModelJson('Aqui está: {"a":3} obrigado')).toEqual({ a: 3 });
  });

  it('lança erro quando não há JSON', () => {
    expect(() => parseModelJson('sem json nenhum')).toThrow();
  });
});

describe('preço do uso da IA (75% em cima do custo)', () => {
  it('o preço é o custo com 75% a mais, em qualquer tamanho de pedido', () => {
    for (const chars of [500, 3_000, 9_000]) {
      const cost = cadAiCostBrl(chars);
      expect(cadPriceBrl(cost)).toBeCloseTo(cost * (1 + CAD_PRICING.markup), 10);
      expect(CAD_PRICING.markup).toBe(0.75);
    }
  });

  it('o crédito nunca paga menos que 75% de lucro, mesmo no menor pacote de créditos', () => {
    for (const chars of [200, 2_000, CAD_SYSTEM_PROMPT.length + CAD_LIMITS.maxPromptChars + CAD_LIMITS.maxCurrentChars]) {
      const credits = cadCredits(chars);
      const cost = cadAiCostBrl(chars);
      const revenueAtWorstCredit = credits * CREDIT_VALUE_BRL.min;
      expect(revenueAtWorstCredit).toBeGreaterThanOrEqual(cadPriceBrl(cost) - 1e-9);
      expect(revenueAtWorstCredit / cost - 1).toBeGreaterThanOrEqual(CAD_PRICING.markup);
    }
  });

  it('um pedido típico custa 1 crédito e o pedido maior, no máximo, 2', () => {
    expect(cadCredits(CAD_SYSTEM_PROMPT.length + 200)).toBe(1);
    expect(cadCredits(CAD_SYSTEM_PROMPT.length + CAD_LIMITS.maxPromptChars + CAD_LIMITS.maxCurrentChars)).toBeLessThanOrEqual(2);
  });

  it('o custo cresce com o tamanho da entrada', () => {
    expect(cadAiCostBrl(8_000)).toBeGreaterThan(cadAiCostBrl(800));
  });
});

describe('resumo enviado para ajuste', () => {
  it('cabe no limite e preserva a escala', () => {
    const big = emptyCadDocument({
      walls: Array.from({ length: 300 }, (_, i) => ({ id: `w${i}`, a: { x: i, y: 0 }, b: { x: i + 1, y: 0 }, thickness: 0.15 })),
    });
    const s = summarizeCadDocument(big);
    expect(s.length).toBeLessThanOrEqual(CAD_LIMITS.maxCurrentChars);
    expect(s.startsWith('escala 1:50')).toBe(true);
  });
});

describe('geometria', () => {
  const doc: CadDocument = emptyCadDocument({
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2 }],
    rooms: [{ id: 'r1', name: 'Sala', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] }],
    lines: [{ id: 'l1', a: { x: 10, y: 0 }, b: { x: 10, y: 5 } }],
    texts: [{ id: 't1', at: { x: 1, y: 1 }, text: 'Oi', height: 0.25 }],
  });

  it('área de polígono (fórmula de Gauss) e contorno da parede', () => {
    expect(polygonArea(doc.rooms[0].points)).toBeCloseTo(12, 10);
    const q = wallQuad(doc.walls[0]);
    expect(q[0].y).toBeCloseTo(0.1, 10);
    expect(q[2].y).toBeCloseTo(-0.1, 10);
  });

  it('acerto: grade, ponta mais próxima e trava ortogonal', () => {
    expect(snapToGrid({ x: 1.26, y: 0.24 }, 0.1)).toEqual({ x: 1.3, y: 0.2 });
    expect(nearestEndpoint({ x: 10.1, y: 0.05 }, doc, 0.25)).toEqual({ x: 10, y: 0 });
    expect(nearestEndpoint({ x: 7, y: 7 }, doc, 0.25)).toBeNull();
    expect(orthoConstrain({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual({ x: 3, y: 0 });
    expect(orthoConstrain({ x: 0, y: 0 }, { x: 1, y: 3 })).toEqual({ x: 0, y: 3 });
  });

  it('porta e janela encaixam no eixo da parede mais próxima', () => {
    expect(projectOntoWall({ x: 2, y: 0.1 }, doc, 0.3)).toEqual({ x: 2, y: 0 });
    expect(projectOntoWall({ x: 2, y: 2 }, doc, 0.3)).toEqual({ x: 2, y: 2 });
  });

  it('seleção: prioriza texto, depois parede, depois ambiente', () => {
    expect(hitTest(doc, { x: 1.05, y: 1.05 }, 0.05)).toEqual({ kind: 'text', id: 't1' });
    expect(hitTest(doc, { x: 2, y: 0 }, 0.05)).toEqual({ kind: 'wall', id: 'w1' });
    expect(hitTest(doc, { x: 2, y: 2 }, 0.05)).toEqual({ kind: 'room', id: 'r1' });
    expect(hitTest(doc, { x: 50, y: 50 }, 0.05)).toBeNull();
  });

  it('mover e apagar devolvem um documento novo sem alterar o original', () => {
    const moved = translateEntity(doc, { kind: 'wall', id: 'w1' }, { x: 1, y: 2 });
    expect(moved.walls[0].a).toEqual({ x: 1, y: 2 });
    expect(doc.walls[0].a).toEqual({ x: 0, y: 0 });
    const removed = removeEntity(doc, { kind: 'line', id: 'l1' });
    expect(removed.lines).toHaveLength(0);
    expect(doc.lines).toHaveLength(1);
  });

  it('caixa do desenho cobre todos os itens', () => {
    expect(documentBounds(doc)).toEqual({ minX: 0, minY: -0.1, maxX: 10, maxY: 5 });
    expect(documentBounds(emptyCadDocument())).toBeNull();
  });
});

describe('exportação', () => {
  const result = validateCadPlan(plan);
  const doc = result.ok ? result.document : emptyCadDocument();

  it('DXF: layers, entidades e fim do arquivo, só em ASCII', () => {
    const dxf = cadToDxf(doc);
    expect(dxf).toMatch(/\n\$INSUNITS\n70\n6\n/);
    for (const layer of ['PAREDES', 'ABERTURAS', 'AMBIENTES', 'COTAS', 'TEXTOS', 'LINHAS']) {
      expect(dxf).toContain(`\nLAYER\n2\n${layer}\n`);
    }
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('TEXT');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    // Nenhum caractere fora de ASCII: acentos viram \U+XXXX.
    expect([...dxf].some((ch) => ch.charCodeAt(0) > 127)).toBe(false);
    expect(dxf).toContain('Sala de estar');
  });

  it('DXF: escapa acentos e quebras de linha', () => {
    expect(dxfText('Cozinha ç\nx')).toBe('Cozinha \\U+00E7 x');
    expect(dxfText('a\\b')).toBe('a\\\\b');
  });

  it('SVG: folha A3 com carimbo, paredes e nome do arquiteto', () => {
    const svg = cadToSvg(doc);
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('Ana Souza');
    expect(svg).toContain('CAU A123-4');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('Sala');
  });

  it('SVG: a escala só muda quando o desenho não cabe na folha', () => {
    const small = cadSheetLayout(doc);
    expect(small.adjusted).toBe(false);
    expect(small.scaleDenominator).toBe(50);
    const huge = emptyCadDocument({
      scale: '1:50',
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, thickness: 0.15 }],
    });
    const layout = cadSheetLayout(huge);
    expect(layout.adjusted).toBe(true);
    expect(layout.scaleDenominator).toBeGreaterThan(50);
  });

  it('SVG: escapa texto do usuário (sem injeção de marcação)', () => {
    const evil = emptyCadDocument({
      titleBlock: { project: '<script>x</script>', drawing: 'd', architect: '', registration: '', date: '2026-01-01', sheet: '1' },
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, thickness: 0.15 }],
    });
    const svg = cadToSvg(evil);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
