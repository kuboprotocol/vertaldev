// Motor de fórmulas da planilha do Vertal Office.
//
// Sem eval: a fórmula é tokenizada, interpretada por um parser recursivo e
// avaliada sobre o mapa de células. Suporta referências (A1), intervalos
// (A1:B3), + - * / ^, parênteses, negação e as funções SUM, AVERAGE, MIN,
// MAX, COUNT, ROUND e ABS. Erros seguem a convenção de planilhas (#DIV/0!,
// #REF!, #VALUE!, #NAME?, #CYCLE!) e nunca quebram a tela.

/** Células em forma bruta: "A1" -> o que o usuário digitou ("12", "texto", "=SUM(A1:A3)"). */
export type CellMap = Record<string, string>;

export type ErrorCode = '#ERR' | '#REF!' | '#DIV/0!' | '#VALUE!' | '#NAME?' | '#CYCLE!';

export class FormulaError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

type Scalar = number | string | null;
type Result = Scalar | Scalar[];

type Tok =
  | { k: 'num'; n: number }
  | { k: 'ref'; v: string }
  | { k: 'range'; from: string; to: string }
  | { k: 'fn'; v: string }
  | { k: 'op'; v: string }
  | { k: '(' | ')' | ',' };

type Node =
  | { t: 'num'; n: number }
  | { t: 'ref'; v: string }
  | { t: 'range'; from: string; to: string }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'call'; name: string; args: Node[] };

/** Limite de células que um único intervalo pode expandir (proteção contra abuso). */
const MAX_RANGE_CELLS = 10_000;
const MAX_FORMULA_LENGTH = 500;

// ─── Referências ──────────────────────────────────────────────────────────

/** "A1" -> { col: 0, row: 1 }. Coluna 0-based, linha 1-based. Aceita minúsculas. */
export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]{1,3})([1-9]\d{0,4})$/.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

/** Índice 0-based de coluna -> letras ("A", "Z", "AA"...). */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function toRef(col: number, row: number): string {
  return `${columnLetters(col)}${row}`;
}

// ─── Tokenizador ──────────────────────────────────────────────────────────

function tokenize(source: string): Tok[] {
  const s = source.toUpperCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    const rest = s.slice(i);
    let m: RegExpExecArray | null;

    if ((m = /^\d+(\.\d+)?/.exec(rest))) {
      out.push({ k: 'num', n: Number(m[0]) });
    } else if ((m = /^([A-Z]{1,3}\d{1,5}):([A-Z]{1,3}\d{1,5})/.exec(rest))) {
      out.push({ k: 'range', from: m[1], to: m[2] });
    } else if ((m = /^[A-Z]+(?=\()/.exec(rest))) {
      out.push({ k: 'fn', v: m[0] });
    } else if ((m = /^[A-Z]{1,3}\d{1,5}(?![A-Z0-9(])/.exec(rest))) {
      out.push({ k: 'ref', v: m[0] });
    } else if (/^[+\-*/^]/.test(ch)) {
      out.push({ k: 'op', v: ch });
    } else if (ch === '(' || ch === ')' || ch === ',') {
      out.push({ k: ch });
    } else {
      throw new FormulaError('#ERR');
    }
    i += m ? m[0].length : 1;
  }
  return out;
}

// ─── Parser (descida recursiva) ───────────────────────────────────────────

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  parse(): Node {
    const node = this.expr();
    if (this.i !== this.toks.length) throw new FormulaError('#ERR');
    return node;
  }

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private eat(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new FormulaError('#ERR');
    return t;
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return !!t && t.k === 'op' && ops.includes(t.v);
  }

  private expr(): Node {
    let left = this.term();
    while (this.isOp('+', '-')) {
      const op = (this.eat() as { v: string }).v;
      left = { t: 'bin', op, l: left, r: this.term() };
    }
    return left;
  }

  private term(): Node {
    let left = this.power();
    while (this.isOp('*', '/')) {
      const op = (this.eat() as { v: string }).v;
      left = { t: 'bin', op, l: left, r: this.power() };
    }
    return left;
  }

  private power(): Node {
    const base = this.unary();
    if (this.isOp('^')) {
      this.eat();
      return { t: 'bin', op: '^', l: base, r: this.power() };
    }
    return base;
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.eat();
      return { t: 'neg', e: this.unary() };
    }
    if (this.isOp('+')) {
      this.eat();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.eat();
    switch (t.k) {
      case 'num':
        return { t: 'num', n: t.n };
      case 'ref':
        return { t: 'ref', v: t.v };
      case 'range':
        return { t: 'range', from: t.from, to: t.to };
      case 'fn': {
        if (this.eat().k !== '(') throw new FormulaError('#ERR');
        const args: Node[] = [];
        if (this.peek()?.k !== ')') {
          args.push(this.expr());
          while (this.peek()?.k === ',') {
            this.eat();
            args.push(this.expr());
          }
        }
        if (this.eat().k !== ')') throw new FormulaError('#ERR');
        return { t: 'call', name: t.v, args };
      }
      case '(': {
        const inner = this.expr();
        if (this.eat().k !== ')') throw new FormulaError('#ERR');
        return inner;
      }
      default:
        throw new FormulaError('#ERR');
    }
  }
}

// ─── Avaliação ────────────────────────────────────────────────────────────

/** Valor bruto de uma célula. null = vazia. Fórmulas são avaliadas recursivamente. */
function cellValue(cells: CellMap, ref: string, stack: Set<string>): Scalar {
  const raw = (cells[ref] ?? '').trim();
  if (raw === '') return null;
  if (!raw.startsWith('=')) {
    return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  if (stack.has(ref)) throw new FormulaError('#CYCLE!');
  stack.add(ref);
  try {
    const v = evalSource(raw.slice(1), cells, stack);
    if (Array.isArray(v)) throw new FormulaError('#VALUE!');
    return v;
  } finally {
    stack.delete(ref);
  }
}

function expandRange(from: string, to: string): string[] {
  const a = parseRef(from);
  const b = parseRef(to);
  if (!a || !b) throw new FormulaError('#REF!');
  const c1 = Math.min(a.col, b.col);
  const c2 = Math.max(a.col, b.col);
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);
  if ((c2 - c1 + 1) * (r2 - r1 + 1) > MAX_RANGE_CELLS) throw new FormulaError('#REF!');
  const refs: string[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) refs.push(toRef(c, r));
  }
  return refs;
}

function toNumber(v: Result): number {
  if (Array.isArray(v)) throw new FormulaError('#VALUE!');
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  throw new FormulaError('#VALUE!');
}

function evalNode(node: Node, cells: CellMap, stack: Set<string>): Result {
  switch (node.t) {
    case 'num':
      return node.n;
    case 'ref': {
      const ref = parseRef(node.v);
      if (!ref) throw new FormulaError('#REF!');
      return cellValue(cells, toRef(ref.col, ref.row), stack);
    }
    case 'range':
      return expandRange(node.from, node.to).map((r) => cellValue(cells, r, stack));
    case 'neg':
      return -toNumber(evalNode(node.e, cells, stack));
    case 'bin': {
      const l = toNumber(evalNode(node.l, cells, stack));
      const r = toNumber(evalNode(node.r, cells, stack));
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r === 0) throw new FormulaError('#DIV/0!');
          return l / r;
        case '^':
          return Math.pow(l, r);
        default:
          throw new FormulaError('#ERR');
      }
    }
    case 'call':
      return callFunction(node.name, node.args, cells, stack);
  }
}

function callFunction(name: string, args: Node[], cells: CellMap, stack: Set<string>): Scalar {
  const values = args.map((a) => evalNode(a, cells, stack));
  // Agregações ignoram texto e células vazias, como em planilhas comuns.
  const numbers = (): number[] =>
    values.flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is number => typeof v === 'number');

  switch (name) {
    case 'SUM':
      return numbers().reduce((acc, n) => acc + n, 0);
    case 'AVERAGE': {
      const ns = numbers();
      if (ns.length === 0) throw new FormulaError('#DIV/0!');
      return ns.reduce((acc, n) => acc + n, 0) / ns.length;
    }
    case 'MIN': {
      const ns = numbers();
      return ns.length ? Math.min(...ns) : 0;
    }
    case 'MAX': {
      const ns = numbers();
      return ns.length ? Math.max(...ns) : 0;
    }
    case 'COUNT':
      return numbers().length;
    case 'ROUND': {
      if (values.length < 1 || values.length > 2) throw new FormulaError('#ERR');
      const value = toNumber(values[0]);
      const digits = values.length === 2 ? Math.trunc(toNumber(values[1])) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    case 'ABS': {
      if (values.length !== 1) throw new FormulaError('#ERR');
      return Math.abs(toNumber(values[0]));
    }
    default:
      throw new FormulaError('#NAME?');
  }
}

function evalSource(source: string, cells: CellMap, stack: Set<string>): Result {
  if (source.length > MAX_FORMULA_LENGTH) throw new FormulaError('#ERR');
  const ast = new Parser(tokenize(source)).parse();
  return evalNode(ast, cells, stack);
}

// ─── API pública ──────────────────────────────────────────────────────────

/** Formata um número para exibição: inteiros sem casas, decimais com até 10 casas. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '#DIV/0!';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
}

/** Valor exibido de uma célula: resultado da fórmula, número formatado, texto ou código de erro. */
export function displayValue(cells: CellMap, ref: string): string {
  try {
    const v = cellValue(cells, ref, new Set());
    if (v === null) return '';
    return typeof v === 'number' ? formatNumber(v) : v;
  } catch (e) {
    return e instanceof FormulaError ? e.code : '#ERR';
  }
}

/** Valor exibido de todas as células preenchidas. */
export function evaluateAll(cells: CellMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of Object.keys(cells)) out[ref] = displayValue(cells, ref);
  return out;
}
