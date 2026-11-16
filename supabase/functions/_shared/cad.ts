// Auto Cadê: modelo do desenho, validação do plano que a IA devolve e preço do uso da IA.
// TypeScript puro, sem APIs de Deno nem do navegador. A edge function cad-generate, o editor do
// Painel Criativo e o Vertal Chat importam este mesmo arquivo: o preço mostrado ao arquiteto
// e o cobrado no servidor nunca divergem.
import { CREDIT_VALUE_BRL, USD_TO_BRL } from "./videoStudioConfig.ts";

/** Ponto em metros. Origem (0,0) no canto inferior esquerdo da planta; y cresce para cima. */
export type Pt = { x: number; y: number };

export const CAD_LIMITS = {
  maxPromptChars: 2_000,
  /** Resumo do desenho atual enviado para ajuste pela IA. */
  maxCurrentChars: 4_000,
  maxOutputTokens: 6_000,
  maxElements: 400,
  maxTextChars: 120,
  maxFieldChars: 120,
  maxCoordM: 500,
  minLengthM: 0.05,
  defaultWallThicknessM: 0.15,
  maxWallThicknessM: 1,
  defaultTextHeightM: 0.25,
  defaultScale: "1:50",
} as const;

export const CAD_SCALES = ["1:25", "1:50", "1:75", "1:100", "1:200"] as const;

/**
 * Preço do uso da IA. "75% de lucro em cima" = preço = custo × 1,75 (markup).
 * Custo: pior preço da cadeia de provedores (Kimi K2 no OpenRouter, DeepSeek, Groq), em USD por milhão de tokens,
 * com a entrada de todo o pedido e a saída no limite máximo. Assim o cobrado nunca fica abaixo do custo real.
 */
export const CAD_PRICING = {
  markup: 0.75,
  worstInputUsdPerMTok: 0.6,
  worstOutputUsdPerMTok: 2.5,
  charsPerToken: 3.5,
} as const;

export interface CadTitleBlock {
  project: string;
  drawing: string;
  architect: string;
  registration: string;
  date: string;
  sheet: string;
}

export interface CadWall { id: string; a: Pt; b: Pt; thickness: number }
export interface CadLine { id: string; a: Pt; b: Pt }
export interface CadRoom { id: string; name: string; points: Pt[] }
/** a–b é o vão sobre o eixo da parede. door = porta (folha + arco), window = janela. */
export interface CadOpening { id: string; kind: "door" | "window"; a: Pt; b: Pt }
/** offset: distância da linha de cota ao segmento, em metros (lado esquerdo da direção a→b). */
export interface CadDimension { id: string; a: Pt; b: Pt; offset: number }
export interface CadText { id: string; at: Pt; text: string; height: number }

export interface CadDocument {
  version: 1;
  scale: string;
  titleBlock: CadTitleBlock;
  walls: CadWall[];
  lines: CadLine[];
  rooms: CadRoom[];
  openings: CadOpening[];
  dimensions: CadDimension[];
  texts: CadText[];
}

export function emptyTitleBlock(overrides: Partial<CadTitleBlock> = {}): CadTitleBlock {
  return {
    project: "Projeto sem título",
    drawing: "Planta baixa",
    architect: "",
    registration: "",
    date: new Date().toISOString().slice(0, 10),
    sheet: "01/01",
    ...overrides,
  };
}

export function emptyCadDocument(overrides: Partial<CadDocument> = {}): CadDocument {
  return {
    version: 1,
    scale: CAD_LIMITS.defaultScale,
    titleBlock: emptyTitleBlock(),
    walls: [],
    lines: [],
    rooms: [],
    openings: [],
    dimensions: [],
    texts: [],
    ...overrides,
  };
}

export function cadElementCount(doc: CadDocument): number {
  return doc.walls.length + doc.lines.length + doc.rooms.length + doc.openings.length + doc.dimensions.length + doc.texts.length;
}

// ─── Preço ────────────────────────────────────────────────────────────────

/** Custo máximo em reais de uma chamada: entrada (caracteres ÷ 3,5) + saída no limite. */
export function cadAiCostBrl(inputChars: number, maxOutputTokens: number = CAD_LIMITS.maxOutputTokens): number {
  const inputTokens = Math.ceil(Math.max(0, inputChars) / CAD_PRICING.charsPerToken);
  const usd = (inputTokens * CAD_PRICING.worstInputUsdPerMTok + maxOutputTokens * CAD_PRICING.worstOutputUsdPerMTok) / 1_000_000;
  return usd * USD_TO_BRL;
}

/** Preço para o cliente: custo + 75%. */
export function cadPriceBrl(costBrl: number): number {
  return costBrl * (1 + CAD_PRICING.markup);
}

/**
 * Créditos de uma geração. Divide o preço pelo menor valor de crédito (R$ 0,30), que é o pior caso
 * para a margem, e arredonda para cima: a margem de 75% vale em qualquer pacote.
 */
export function cadCredits(inputChars: number, maxOutputTokens: number = CAD_LIMITS.maxOutputTokens): number {
  const price = cadPriceBrl(cadAiCostBrl(inputChars, maxOutputTokens));
  return Math.max(1, Math.ceil(price / CREDIT_VALUE_BRL.min - 1e-9));
}

/** Caracteres de uma chamada (prompt de sistema + mensagem do usuário). */
export function cadRequestChars(userMessage: string, systemPrompt: string = CAD_SYSTEM_PROMPT): number {
  return systemPrompt.length + userMessage.length;
}

// ─── Plano que a IA devolve ───────────────────────────────────────────────

export const CAD_SYSTEM_PROMPT = [
  "Você é arquiteto e desenhista técnico. Desenha plantas baixas executivas, com medidas coerentes e nomes de ambientes.",
  "Responda SOMENTE com um objeto JSON válido, sem texto fora dele, neste formato:",
  '{"title":"nome do projeto","scale":"1:50","titleBlock":{"project":"","drawing":"Planta baixa","architect":"","registration":"","sheet":"01/01"},',
  '"walls":[{"a":[x,y],"b":[x,y],"thickness":0.15}],',
  '"rooms":[{"name":"Sala","points":[[x,y],[x,y],[x,y],[x,y]]}],',
  '"openings":[{"kind":"door|window","a":[x,y],"b":[x,y]}],',
  '"dimensions":[{"a":[x,y],"b":[x,y],"offset":0.6}],',
  '"texts":[{"at":[x,y],"text":"Cozinha","height":0.25}]}',
  "Regras: todas as medidas em metros, origem (0,0) no canto inferior esquerdo, x para a direita, y para cima.",
  "Paredes são eixos (centro da parede) com espessura: externas 0,15 a 0,25 m, internas 0,10 a 0,15 m.",
  "Ambientes são polígonos no interior das paredes, em sentido horário. Cada ambiente tem nome.",
  "Portas e janelas têm a e b sobre o eixo da parede: a–b é o vão. Porta mínima 0,80 m; janela mínima 1,00 m.",
  "Cotas: cubram as dimensões externas totais e as larguras principais. Textos: um nome por ambiente, no centro dele.",
  "Respeite medidas mínimas usuais no Brasil: corredor 0,90 m, quarto com 8 m² ou mais, banheiro com 3 m² ou mais.",
  "Não invente elementos fora do pedido. Se o pedido for vago, escolha uma planta razoável e simples e diga o nome no campo title.",
  `Limite: no máximo ${CAD_LIMITS.maxElements} elementos no total.`,
].join("\n");

export type CadPlanResult = { ok: true; document: CadDocument } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Aceita [x,y] ou {x,y}. */
function readPt(v: unknown): Pt | null {
  let x: unknown;
  let y: unknown;
  if (Array.isArray(v) && v.length >= 2) [x, y] = v;
  else if (isObj(v)) [x, y] = [v.x, v.y];
  else return null;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > CAD_LIMITS.maxCoordM || Math.abs(y) > CAD_LIMITS.maxCoordM) return null;
  return { x: round(x), y: round(y) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function readText(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // Remove caracteres de controle; mantém quebras comuns como espaço.
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || fallback;
}

function readNumber(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Valida o JSON da IA e monta um CadDocument com ids. Itens inválidos são descartados; o resto segue. */
export function validateCadPlan(raw: unknown): CadPlanResult {
  if (!isObj(raw)) return { ok: false, error: "O plano não é um objeto JSON." };

  const counter = { w: 0, l: 0, r: 0, o: 0, d: 0, t: 0 };
  const walls: CadWall[] = [];
  for (const item of arr(raw.walls)) {
    if (!isObj(item)) continue;
    const a = readPt(item.a);
    const b = readPt(item.b);
    if (!a || !b || segLen(a, b) < CAD_LIMITS.minLengthM) continue;
    walls.push({
      id: `w${++counter.w}`,
      a,
      b,
      thickness: readNumber(item.thickness, CAD_LIMITS.defaultWallThicknessM, 0.05, CAD_LIMITS.maxWallThicknessM),
    });
  }

  const lines: CadLine[] = [];
  for (const item of arr(raw.lines)) {
    if (!isObj(item)) continue;
    const a = readPt(item.a);
    const b = readPt(item.b);
    if (!a || !b || segLen(a, b) < CAD_LIMITS.minLengthM) continue;
    lines.push({ id: `l${++counter.l}`, a, b });
  }

  const rooms: CadRoom[] = [];
  for (const item of arr(raw.rooms)) {
    if (!isObj(item)) continue;
    const points = arr(item.points).map(readPt).filter((p): p is Pt => p !== null);
    if (points.length < 3) continue;
    rooms.push({ id: `r${++counter.r}`, name: readText(item.name, CAD_LIMITS.maxTextChars, "Ambiente"), points });
  }

  const openings: CadOpening[] = [];
  for (const item of arr(raw.openings)) {
    if (!isObj(item)) continue;
    const a = readPt(item.a);
    const b = readPt(item.b);
    if (!a || !b || segLen(a, b) < 0.4) continue;
    openings.push({ id: `o${++counter.o}`, kind: item.kind === "window" ? "window" : "door", a, b });
  }

  const dimensions: CadDimension[] = [];
  for (const item of arr(raw.dimensions)) {
    if (!isObj(item)) continue;
    const a = readPt(item.a);
    const b = readPt(item.b);
    if (!a || !b || segLen(a, b) < CAD_LIMITS.minLengthM) continue;
    dimensions.push({ id: `d${++counter.d}`, a, b, offset: readNumber(item.offset, 0.6, -5, 5) });
  }

  const texts: CadText[] = [];
  for (const item of arr(raw.texts)) {
    if (!isObj(item)) continue;
    const at = readPt(item.at);
    const text = readText(item.text, CAD_LIMITS.maxTextChars);
    if (!at || !text) continue;
    texts.push({ id: `t${++counter.t}`, at, text, height: readNumber(item.height, CAD_LIMITS.defaultTextHeightM, 0.1, 1) });
  }

  const total = walls.length + lines.length + rooms.length + openings.length + dimensions.length + texts.length;
  if (total === 0) return { ok: false, error: "O plano não tem nenhum elemento válido." };
  if (total > CAD_LIMITS.maxElements) return { ok: false, error: "O plano tem elementos demais." };

  const tb = isObj(raw.titleBlock) ? raw.titleBlock : {};
  const scale = typeof raw.scale === "string" && (CAD_SCALES as readonly string[]).includes(raw.scale)
    ? raw.scale
    : CAD_LIMITS.defaultScale;
  const title = readText(raw.title, CAD_LIMITS.maxFieldChars);

  return {
    ok: true,
    document: emptyCadDocument({
      scale,
      titleBlock: emptyTitleBlock({
        project: readText(tb.project, CAD_LIMITS.maxFieldChars, title || "Projeto sem título"),
        drawing: readText(tb.drawing, CAD_LIMITS.maxFieldChars, "Planta baixa"),
        architect: readText(tb.architect, CAD_LIMITS.maxFieldChars),
        registration: readText(tb.registration, CAD_LIMITS.maxFieldChars),
        sheet: readText(tb.sheet, 20, "01/01"),
      }),
      walls,
      lines,
      rooms,
      openings,
      dimensions,
      texts,
    }),
  };
}

/** Tira cercas de markdown e pega o primeiro objeto JSON do texto. Lança erro se não houver. */
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("invalid_json");
  }
}

/** Mensagem do usuário enviada à IA: pedido + (no ajuste) o resumo do desenho atual. */
export function buildCadUserMessage(prompt: string, mode: "new" | "edit", currentSummary?: string): string {
  if (mode === "edit" && currentSummary) {
    return `Ajuste o desenho atual conforme o pedido e devolva a planta completa.\nPedido: ${prompt}\nDesenho atual:\n${currentSummary}`;
  }
  return `Pedido do arquiteto: ${prompt}`;
}

/**
 * Resumo compacto do desenho para a IA. Cabe em CAD_LIMITS.maxCurrentChars: os itens que não cabem são omitidos.
 */
export function summarizeCadDocument(doc: CadDocument, maxChars: number = CAD_LIMITS.maxCurrentChars): string {
  const f = (p: Pt) => `(${p.x},${p.y})`;
  const lines: string[] = [`escala ${doc.scale}`];
  const items: string[] = [
    ...doc.walls.map((w) => `parede ${f(w.a)}-${f(w.b)} esp ${w.thickness}`),
    ...doc.rooms.map((r) => `ambiente "${r.name}" ${r.points.map(f).join("")}`),
    ...doc.openings.map((o) => `${o.kind === "door" ? "porta" : "janela"} ${f(o.a)}-${f(o.b)}`),
    ...doc.dimensions.map((d) => `cota ${f(d.a)}-${f(d.b)}`),
    ...doc.texts.map((t) => `texto "${t.text}" ${f(t.at)}`),
  ];
  let used = lines[0].length;
  for (const item of items) {
    if (used + item.length + 1 > maxChars) break;
    lines.push(item);
    used += item.length + 1;
  }
  return lines.join("\n");
}

function segLen(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
