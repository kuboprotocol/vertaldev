// OpenTimestamps mínimo (sem dependências): carimba um SHA-256 no Bitcoin pelos
// calendários públicos (grátis) e faz o "upgrade" do arquivo .ots quando o calendário
// já tem a prova no bloco. Formato: https://github.com/opentimestamps/python-opentimestamps
// (serialização de Timestamp, operações e atestações). Roda no Worker e no Vitest.
//
// Observação honesta: "confirmed" aqui significa que o calendário devolveu uma
// atestação de bloco do Bitcoin. A verificação independente contra a blockchain é
// feita com o cliente oficial (`ots verify arquivo.ots`), ver docs/CONSENT_GATE.md.

export const OTS_CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://a.pool.eternitywall.com",
  "https://ots.btc.catallaxy.com",
] as const;

const MAGIC = new Uint8Array([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00,
  0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const OP_SHA256 = 0x08;
const PENDING_TAG = "83dfe30d2ef90c8e";
const BITCOIN_TAG = "0588960d73d71901";

export type OtsOp =
  | { op: "append" | "prepend"; arg: Uint8Array }
  | { op: "sha256" | "sha1" | "ripemd160" | "keccak256" | "reverse" | "hexlify" };

export type OtsAttestation =
  | { type: "pending"; uri: string }
  | { type: "bitcoin"; height: number }
  | { type: "unknown"; tag: string; payload: Uint8Array };

export interface OtsNode {
  attestations: OtsAttestation[];
  ops: Array<{ op: OtsOp; child: OtsNode }>;
}

const OP_TAGS: Record<number, OtsOp["op"]> = { 0xf0: "append", 0xf1: "prepend", 0xf2: "reverse", 0xf3: "hexlify", 0x02: "sha1", 0x03: "ripemd160", 0x08: "sha256", 0x67: "keccak256" };
const TAG_OF: Record<OtsOp["op"], number> = { append: 0xf0, prepend: 0xf1, reverse: 0xf2, hexlify: 0xf3, sha1: 0x02, ripemd160: 0x03, sha256: 0x08, keccak256: 0x67 };

export const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export function bytesOfHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("hex inválido");
  return new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
}
export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// ─── Leitura / escrita ───────────────────────────────────────────────────

class Reader {
  i = 0;
  b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  byte(): number {
    if (this.i >= this.b.length) throw new Error("ots: fim inesperado");
    return this.b[this.i++];
  }
  bytes(n: number): Uint8Array {
    if (n < 0 || this.i + n > this.b.length) throw new Error("ots: fim inesperado");
    const out = this.b.slice(this.i, this.i + n);
    this.i += n;
    return out;
  }
  varuint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const b = this.byte();
      value += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return value;
      shift += 7;
      if (shift > 49) throw new Error("ots: varuint grande demais");
    }
  }
  varbytes(max = 8192): Uint8Array {
    const n = this.varuint();
    if (n > max) throw new Error("ots: varbytes grande demais");
    return this.bytes(n);
  }
}

function varuint(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  do {
    let b = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
  return new Uint8Array(out);
}
const varbytes = (b: Uint8Array) => concat(varuint(b.length), b);

function readAttestation(r: Reader): OtsAttestation {
  const tag = hexOf(r.bytes(8));
  const payload = r.varbytes();
  const p = new Reader(payload);
  if (tag === PENDING_TAG) return { type: "pending", uri: new TextDecoder().decode(p.varbytes(1000)) };
  if (tag === BITCOIN_TAG) return { type: "bitcoin", height: p.varuint() };
  return { type: "unknown", tag, payload };
}

function readNode(r: Reader, depth = 0): OtsNode {
  if (depth > 256) throw new Error("ots: profundo demais");
  const node: OtsNode = { attestations: [], ops: [] };
  const item = (tag: number) => {
    if (tag === 0x00) {
      node.attestations.push(readAttestation(r));
      return;
    }
    const name = OP_TAGS[tag];
    if (!name) throw new Error(`ots: operação desconhecida 0x${tag.toString(16)}`);
    const op: OtsOp = name === "append" || name === "prepend" ? { op: name, arg: r.varbytes(4096) } : { op: name };
    node.ops.push({ op, child: readNode(r, depth + 1) });
  };
  let tag = r.byte();
  while (tag === 0xff) {
    item(r.byte());
    tag = r.byte();
  }
  item(tag);
  return node;
}

function attestationBytes(a: OtsAttestation): Uint8Array {
  if (a.type === "pending") return concat(bytesOfHex(PENDING_TAG), varbytes(varbytes(new TextEncoder().encode(a.uri))));
  if (a.type === "bitcoin") return concat(bytesOfHex(BITCOIN_TAG), varbytes(varuint(a.height)));
  return concat(bytesOfHex(a.tag), varbytes(a.payload));
}

function opBytes(op: OtsOp): Uint8Array {
  const tag = new Uint8Array([TAG_OF[op.op]]);
  return "arg" in op ? concat(tag, varbytes(op.arg)) : tag;
}

export function serializeNode(node: OtsNode): Uint8Array {
  const items: Uint8Array[] = [
    ...node.attestations.map((a) => concat(new Uint8Array([0x00]), attestationBytes(a))).sort(cmpBytes),
    ...node.ops.map((o) => ({ head: opBytes(o.op), body: serializeNode(o.child) })).sort((a, b) => cmpBytes(a.head, b.head)).map((x) => concat(x.head, x.body)),
  ];
  if (!items.length) throw new Error("ots: nó vazio");
  return concat(...items.map((it, i) => (i < items.length - 1 ? concat(new Uint8Array([0xff]), it) : it)));
}

function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function parseNodeBytes(bytes: Uint8Array): OtsNode {
  const r = new Reader(bytes);
  const node = readNode(r);
  if (r.i !== bytes.length) throw new Error("ots: bytes sobrando");
  return node;
}

export interface OtsFile { digest: Uint8Array; root: OtsNode }

export function serializeOtsFile(file: OtsFile): Uint8Array {
  return concat(MAGIC, varuint(1), new Uint8Array([OP_SHA256]), file.digest, serializeNode(file.root));
}

export function parseOtsFile(bytes: Uint8Array): OtsFile {
  const r = new Reader(bytes);
  if (cmpBytes(r.bytes(MAGIC.length), MAGIC) !== 0) throw new Error("ots: não é um arquivo OpenTimestamps");
  if (r.varuint() !== 1) throw new Error("ots: versão desconhecida");
  if (r.byte() !== OP_SHA256) throw new Error("ots: só SHA-256");
  const digest = r.bytes(32);
  const root = readNode(r);
  if (r.i !== bytes.length) throw new Error("ots: bytes sobrando");
  return { digest, root };
}

/** Junta os itens de vários nós do MESMO resumo (respostas de calendários diferentes). */
export function mergeNodes(nodes: OtsNode[]): OtsNode {
  return { attestations: nodes.flatMap((n) => n.attestations), ops: nodes.flatMap((n) => n.ops) };
}

async function applyOp(op: OtsOp, msg: Uint8Array): Promise<Uint8Array | null> {
  switch (op.op) {
    case "append": return concat(msg, op.arg);
    case "prepend": return concat(op.arg, msg);
    case "sha256": return new Uint8Array(await crypto.subtle.digest("SHA-256", msg as Uint8Array<ArrayBuffer>));
    case "reverse": return msg.slice().reverse();
    case "hexlify": return new TextEncoder().encode(hexOf(msg));
    default: return null; // sha1/ripemd160/keccak: os calendários atuais não usam; o ramo fica como está
  }
}

export function otsSummary(root: OtsNode): { status: "pending" | "confirmed"; bitcoinHeight: number | null; pendingUris: string[] } {
  let height: number | null = null;
  const pending: string[] = [];
  const walk = (n: OtsNode) => {
    for (const a of n.attestations) {
      if (a.type === "bitcoin") height = height === null ? a.height : Math.min(height, a.height);
      if (a.type === "pending") pending.push(a.uri);
    }
    for (const o of n.ops) walk(o.child);
  };
  walk(root);
  return { status: height !== null ? "confirmed" : "pending", bitcoinHeight: height, pendingUris: pending };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const ALLOWED_CALENDAR_RE = /^https:\/\/([a-z0-9-]+\.)*(opentimestamps\.org|eternitywall\.com|catallaxy\.com)$/i;

/** Envia o resumo aos calendários e monta o .ots. Precisa de pelo menos um calendário respondendo. */
export async function otsStamp(digestHex: string, opts: { fetch?: FetchLike; calendars?: readonly string[]; timeoutMs?: number } = {}): Promise<{ ots: string; calendars: string[] }> {
  const digest = bytesOfHex(digestHex);
  if (digest.length !== 32) throw new Error("ots: resumo SHA-256 inválido");
  const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const results = await Promise.all((opts.calendars ?? OTS_CALENDARS).map(async (cal) => {
    try {
      const res = await doFetch(`${cal}/digest`, {
        method: "POST",
        headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "vertal-consent/1 (+https://vertal.dev)" },
        body: digest as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 10_000) return null;
      return { cal, node: parseNodeBytes(bytes) };
    } catch {
      return null;
    }
  }));
  const ok = results.filter((r): r is { cal: string; node: OtsNode } => !!r);
  if (!ok.length) throw new Error("ots: nenhum calendário respondeu");
  return { ots: toBase64(serializeOtsFile({ digest, root: mergeNodes(ok.map((r) => r.node)) })), calendars: ok.map((r) => r.cal) };
}

/**
 * Upgrade: para cada atestação "pending", pergunta ao calendário se já há prova no
 * Bitcoin (GET /timestamp/<mensagem>) e troca a pendência pela prova recebida.
 */
export async function otsUpgrade(otsB64: string, opts: { fetch?: FetchLike; timeoutMs?: number } = {}): Promise<{ ots: string; changed: boolean; status: "pending" | "confirmed"; bitcoinHeight: number | null }> {
  const file = parseOtsFile(fromBase64(otsB64));
  const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
  let changed = false;
  const visit = async (node: OtsNode, msg: Uint8Array) => {
    const keep: OtsAttestation[] = [];
    for (const a of node.attestations) {
      if (a.type !== "pending" || !ALLOWED_CALENDAR_RE.test(a.uri.replace(/\/+$/, ""))) {
        keep.push(a);
        continue;
      }
      try {
        const res = await doFetch(`${a.uri.replace(/\/+$/, "")}/timestamp/${hexOf(msg)}`, {
          headers: { Accept: "application/vnd.opentimestamps.v1", "User-Agent": "vertal-consent/1 (+https://vertal.dev)" },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
        });
        if (!res.ok) {
          keep.push(a);
          continue;
        }
        const upgraded = parseNodeBytes(new Uint8Array(await res.arrayBuffer()));
        if (!otsSummary(upgraded).bitcoinHeight) {
          keep.push(a);
          continue;
        }
        node.ops.push(...upgraded.ops);
        keep.push(...upgraded.attestations);
        changed = true;
      } catch {
        keep.push(a);
      }
    }
    node.attestations = keep;
    for (const o of [...node.ops]) {
      const next = await applyOp(o.op, msg);
      if (next) await visit(o.child, next);
    }
  };
  await visit(file.root, file.digest);
  const summary = otsSummary(file.root);
  return { ots: changed ? toBase64(serializeOtsFile(file)) : otsB64, changed, status: summary.status, bitcoinHeight: summary.bitcoinHeight };
}
