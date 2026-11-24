// VERTAL Code AI — edições multi-arquivo e diff unificado para revisão.
// Módulo puro: roda na edge function, no navegador e no Vitest.

export type EditAction = "create" | "replace" | "edit";

export interface FileEdit {
  path: string;
  action: EditAction;
  /** create/replace: conteúdo completo. */
  content?: string;
  /** edit: trechos a trocar (cada "search" precisa aparecer exatamente uma vez). */
  changes?: Array<{ search: string; replace: string }>;
  /** Por que o arquivo muda (aparece na revisão). */
  reason?: string;
}

export interface AppliedEdit {
  path: string;
  action: EditAction;
  before: string;
  after: string;
  diff: string;
  added: number;
  removed: number;
  reason?: string;
}

export interface EditFailure {
  path: string;
  error: string;
}

/** Troca um trecho exato; se não achar, tenta casar ignorando espaços no fim/início de cada linha. */
export function replaceOnce(source: string, search: string, replace: string): { ok: true; text: string } | { ok: false; error: string } {
  if (!search) return { ok: false, error: "trecho de busca vazio" };
  const first = source.indexOf(search);
  if (first >= 0) {
    if (source.indexOf(search, first + 1) >= 0) return { ok: false, error: "o trecho aparece mais de uma vez; inclua mais contexto" };
    return { ok: true, text: source.slice(0, first) + replace + source.slice(first + search.length) };
  }
  // Tolerância: compara linha a linha com trim (modelos costumam errar indentação).
  const srcLines = source.split("\n");
  const needle = search.replace(/\n$/, "").split("\n").map((l) => l.trim());
  if (!needle.length) return { ok: false, error: "trecho de busca vazio" };
  const hits: number[] = [];
  for (let i = 0; i + needle.length <= srcLines.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (srcLines[i + j].trim() !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  if (hits.length === 0) return { ok: false, error: "trecho de busca não encontrado no arquivo atual" };
  if (hits.length > 1) return { ok: false, error: "o trecho aparece mais de uma vez; inclua mais contexto" };
  const start = hits[0];
  // Reindenta a troca com a indentação real do arquivo.
  const realIndent = srcLines[start].match(/^\s*/)?.[0] ?? "";
  const searchIndent = search.split("\n")[0].match(/^\s*/)?.[0] ?? "";
  const replLines = replace.replace(/\n$/, "").split("\n").map((l) => (l.startsWith(searchIndent) ? realIndent + l.slice(searchIndent.length) : realIndent + l));
  const out = [...srcLines.slice(0, start), ...replLines, ...srcLines.slice(start + needle.length)];
  return { ok: true, text: out.join("\n") };
}

/** Aplica uma edição sobre o conteúdo atual ("" = arquivo novo). */
export function applyEdit(current: string, edit: FileEdit): { ok: true; text: string } | { ok: false; error: string } {
  if (edit.action === "create" || edit.action === "replace") {
    if (typeof edit.content !== "string") return { ok: false, error: "conteúdo ausente" };
    return { ok: true, text: edit.content };
  }
  if (!edit.changes?.length) return { ok: false, error: "nenhuma troca informada" };
  if (!current) return { ok: false, error: "arquivo não existe; use create" };
  let text = current;
  for (const [i, c] of edit.changes.entries()) {
    const r = replaceOnce(text, c.search, c.replace);
    if (r.ok === false) return { ok: false, error: `troca ${i + 1}: ${(r as { error: string }).error}` };
    text = (r as { text: string }).text;
  }
  return { ok: true, text };
}

type Op = { t: " " | "-" | "+"; line: string };

/** Diff de linhas (Myers, O((N+M)·D)). Arquivos enormes caem num diff "tudo saiu / tudo entrou". */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  if (n * m > 25_000_000 && max > 20_000) {
    return [...a.map((line) => ({ t: "-" as const, line })), ...b.map((line) => ({ t: "+" as const, line }))];
  }
  const offset = max;
  let v: Int32Array = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  trace.push(v.slice());
  // Backtrack
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0; d--) {
    v = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = d === 0 ? 0 : v[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ t: " ", line: a[x - 1] });
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === prevX) ops.push({ t: "+", line: b[y - 1] });
    else ops.push({ t: "-", line: a[x - 1] });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push({ t: " ", line: a[x - 1] });
    x--;
    y--;
  }
  return ops.reverse();
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Diff unificado (estilo git) com `context` linhas em volta de cada mudança. */
export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffLines(a, b);
  if (!ops.some((o) => o.t !== " ")) return "";
  const header = [`--- ${before === "" ? "/dev/null" : `a/${path}`}`, `+++ b/${path}`];
  const hunks: string[] = [];
  // Índices das operações que mudam algo.
  const changed = ops.map((o, i) => (o.t !== " " ? i : -1)).filter((i) => i >= 0);
  let i = 0;
  while (i < changed.length) {
    let start = Math.max(0, changed[i] - context);
    let end = Math.min(ops.length - 1, changed[i] + context);
    let j = i + 1;
    while (j < changed.length && changed[j] - context <= end + 1) {
      end = Math.min(ops.length - 1, changed[j] + context);
      j++;
    }
    // Posição nas linhas originais.
    let aLine = 1;
    let bLine = 1;
    for (let k = 0; k < start; k++) {
      if (ops[k].t !== "+") aLine++;
      if (ops[k].t !== "-") bLine++;
    }
    let aCount = 0;
    let bCount = 0;
    const body: string[] = [];
    for (let k = start; k <= end; k++) {
      const o = ops[k];
      body.push(`${o.t}${o.line}`);
      if (o.t !== "+") aCount++;
      if (o.t !== "-") bCount++;
    }
    hunks.push(`@@ -${aCount ? aLine : aLine - 1},${aCount} +${bCount ? bLine : bLine - 1},${bCount} @@`, ...body);
    i = j;
    start = end;
  }
  return [...header, ...hunks].join("\n");
}

export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/**
 * Aplica um lote de edições sobre os arquivos atuais. Edições no mesmo arquivo
 * se acumulam. Devolve o que deu certo (com diff) e o que falhou (vai para o auto-reparo).
 */
export function applyEdits(currentFiles: Record<string, string>, edits: FileEdit[]): { applied: AppliedEdit[]; failures: EditFailure[] } {
  const working = new Map<string, { before: string; after: string; action: EditAction; reasons: string[] }>();
  const failures: EditFailure[] = [];
  for (const e of edits) {
    const prev = working.get(e.path);
    const base = prev ? prev.after : currentFiles[e.path] ?? "";
    const r = applyEdit(base, e);
    if (r.ok === false) {
      failures.push({ path: e.path, error: (r as { error: string }).error });
      continue;
    }
    working.set(e.path, {
      before: prev ? prev.before : currentFiles[e.path] ?? "",
      after: (r as { text: string }).text,
      action: prev ? prev.action : e.action,
      reasons: [...(prev?.reasons ?? []), ...(e.reason ? [e.reason] : [])],
    });
  }
  const applied: AppliedEdit[] = [];
  for (const [path, w] of working) {
    if (w.before === w.after) continue;
    const diff = unifiedDiff(path, w.before, w.after);
    const { added, removed } = diffStats(diff);
    applied.push({ path, action: w.before === "" ? "create" : w.action === "create" ? "replace" : w.action, before: w.before, after: w.after, diff, added, removed, reason: w.reasons.join(" ") || undefined });
  }
  return { applied, failures };
}
