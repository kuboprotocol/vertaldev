// VERTAL Code AI — scripts do ciclo construir → testar → corrigir no sandbox E2B
// já existente (o mesmo orquestrador de _shared/orchestrator.ts). Módulo puro:
// só monta comandos e lê logs; quem executa é a edge function.
//
// Por que em segundo plano: npm install + checagens passam fácil do limite de
// tempo de uma edge function. O servidor dispara o script com nohup e o
// navegador consulta o andamento (poll) a cada poucos segundos.

export const WORKDIR = "/home/user/app";
export const STATE_DIR = "/tmp/vcai";
/** Limite por argumento do bash -c (MAX_ARG_STRLEN = 128 KiB); fica folga. */
export const MAX_CHUNK = 90_000;
export const MAX_SANDBOX_FILES = 400;
export const MAX_SANDBOX_BYTES = 6_000_000;

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Clona o repositório sem gravar o token: ele vai só no cabeçalho desta execução
 * (http.extraHeader via -c), nunca em .git/config nem na URL do remote.
 */
export function cloneCommand(repo: string, branch: string, token: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("repo inválido");
  if (!/^[\w./-]+$/.test(branch)) throw new Error("branch inválida");
  const basic = b64(`x-access-token:${token}`);
  return [
    `rm -rf ${WORKDIR} ${STATE_DIR} && mkdir -p ${STATE_DIR}`,
    `git -c http.extraHeader=${shellQuote(`Authorization: Basic ${basic}`)} clone --depth 1 --branch ${shellQuote(branch)} https://github.com/${repo}.git ${WORKDIR} > ${STATE_DIR}/clone.log 2>&1`,
    `echo ok`,
  ].join(" && ");
}

export function emptyProjectCommand(): string {
  return `rm -rf ${WORKDIR} ${STATE_DIR} && mkdir -p ${WORKDIR} ${STATE_DIR} && cd ${WORKDIR} && git init -q && echo ok`;
}

function safeRel(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.includes("\0") || path.includes("\\")) return false;
  return !path.split("/").some((p) => p === ".." || p === "." || p === "" || p === ".git");
}

/**
 * Comandos que gravam os arquivos no sandbox, cada um abaixo do limite de
 * argumento. Arquivos grandes são gravados em partes (>>).
 */
export function writeFilesCommands(files: Array<{ path: string; content: string }>): string[] {
  const cmds: string[] = [];
  let current: string[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) cmds.push(current.join(" && "));
    current = [];
    size = 0;
  };
  for (const f of files) {
    if (!safeRel(f.path)) throw new Error(`caminho recusado: ${f.path}`);
    const target = `${WORKDIR}/${f.path}`;
    const dir = target.slice(0, target.lastIndexOf("/"));
    const data = b64(f.content);
    const parts: string[] = [];
    for (let i = 0; i < data.length; i += MAX_CHUNK - 400) parts.push(data.slice(i, i + MAX_CHUNK - 400));
    if (parts.length === 0) parts.push("");
    parts.forEach((part, idx) => {
      const piece = `mkdir -p ${shellQuote(dir)} && printf %s ${shellQuote(part)} | base64 -d ${idx === 0 ? ">" : ">>"} ${shellQuote(target)}`;
      if (size + piece.length > MAX_CHUNK) flush();
      current.push(piece);
      size += piece.length + 4;
    });
  }
  flush();
  return cmds;
}

/** Comando de teste aceito do modelo/usuário: uma linha, sem redirecionar para fora do projeto. */
export function sanitizeTestCommand(cmd: string | undefined): string | null {
  if (!cmd) return null;
  const c = cmd.trim();
  if (!c || c.length > 300 || /[\n\r`]/.test(c) || /\$\(/.test(c)) return null;
  if (/\b(curl|wget|ssh|scp|nc|ncat|sudo|rm\s+-rf\s+\/)\b/.test(c)) return null;
  return c;
}

export interface CheckPlan {
  install: boolean;
  testCommand?: string | null;
}

/**
 * Script das checagens (roda em segundo plano). Cada etapa escreve um marcador
 * "::vcai:: <etapa> <código>" no log; o fim grava o código em exit.
 */
export function checkScript(plan: CheckPlan): string {
  const lines = [
    "#!/bin/bash",
    "set -o pipefail",
    `cd ${WORKDIR} || { echo 97 > ${STATE_DIR}/exit; exit 0; }`,
    "export CI=1 NODE_OPTIONS=--max-old-space-size=3072 npm_config_fund=false npm_config_audit=false",
    "status=0",
    'step() { name="$1"; shift; echo "::vcai:: start $name"; "$@"; code=$?; echo "::vcai:: end $name $code"; [ $code -ne 0 ] && status=$code; return 0; }',
  ];
  if (plan.install) {
    lines.push(
      "if [ -f package.json ]; then",
      "  if [ -f bun.lockb ] || [ -f bun.lock ]; then command -v bun >/dev/null 2>&1 || npm i -g bun >/dev/null 2>&1; fi",
      "  if [ -f package-lock.json ]; then step install npm ci --no-audit --no-fund --loglevel=error;",
      "  elif [ -f pnpm-lock.yaml ]; then step install npx -y pnpm@9 install --frozen-lockfile=false;",
      "  else step install npm install --no-audit --no-fund --loglevel=error; fi",
      "fi",
    );
  }
  if (plan.testCommand) {
    lines.push(`step custom bash -lc ${shellQuote(plan.testCommand)}`);
  } else {
    lines.push(
      "if [ -f tsconfig.json ] && [ -x node_modules/.bin/tsc ]; then",
      "  if [ -f tsconfig.app.json ]; then step typecheck node_modules/.bin/tsc --noEmit -p tsconfig.app.json; else step typecheck node_modules/.bin/tsc --noEmit; fi",
      "fi",
      `if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.test ? 0 : 1)"; then step test timeout 600 npm test --silent; fi`,
      `if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts?.build ? 0 : 1)"; then step build timeout 900 npm run build --silent; fi`,
    );
  }
  lines.push(`echo $status > ${STATE_DIR}/exit`);
  return lines.join("\n");
}

/** Grava o script e dispara em segundo plano (retorna na hora). */
export function launchCommand(plan: CheckPlan): string {
  const script = checkScript(plan);
  return [
    `mkdir -p ${STATE_DIR}`,
    `rm -f ${STATE_DIR}/exit`,
    `printf %s ${shellQuote(b64(script))} | base64 -d > ${STATE_DIR}/check.sh`,
    `chmod +x ${STATE_DIR}/check.sh`,
    `(nohup ${STATE_DIR}/check.sh > ${STATE_DIR}/check.log 2>&1 &)`,
    "echo started",
  ].join(" && ");
}

export function pollCommand(): string {
  return `if [ -f ${STATE_DIR}/exit ]; then echo "::vcai-exit:: $(cat ${STATE_DIR}/exit)"; else echo "::vcai-exit:: running"; fi; tail -c 20000 ${STATE_DIR}/check.log 2>/dev/null`;
}

export interface PollResult {
  done: boolean;
  exitCode: number | null;
  steps: Array<{ name: string; code: number | null }>;
  log: string;
}

export function parsePoll(output: string): PollResult {
  const m = output.match(/::vcai-exit:: (\S+)/);
  const raw = m?.[1] ?? "running";
  const done = raw !== "running";
  const exitCode = done ? Number(raw) : null;
  const steps: PollResult["steps"] = [];
  for (const line of output.split("\n")) {
    const s = line.match(/^::vcai:: start (\S+)/);
    if (s) steps.push({ name: s[1], code: null });
    const e = line.match(/^::vcai:: end (\S+) (\d+)/);
    if (e) {
      const st = [...steps].reverse().find((x) => x.name === e[1] && x.code === null);
      if (st) st.code = Number(e[2]);
    }
  }
  const log = output.replace(/^::vcai-exit::.*\n?/m, "");
  return { done, exitCode: Number.isFinite(exitCode) ? exitCode : done ? 1 : null, steps, log };
}

const ERROR_LINE =
  /(error TS\d+|\berror\b|Error:|ERR!|FAIL|✗|×|Cannot find|is not assignable|Unexpected token|SyntaxError|TypeError|ReferenceError|failed|AssertionError|Expected|Received)/i;

/** Linhas de erro relevantes (com 1 linha de contexto), para o modo Corrigir. */
export function summarizeFailure(log: string, max = 6000): string {
  const lines = log.split("\n").filter((l) => !l.startsWith("::vcai::"));
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (ERROR_LINE.test(l)) {
      keep.add(i - 1);
      keep.add(i);
      keep.add(i + 1);
    }
  });
  const picked = [...keep].filter((i) => i >= 0 && i < lines.length).sort((a, b) => a - b).map((i) => lines[i]);
  const text = (picked.length ? picked : lines.slice(-80)).join("\n");
  return text.length > max ? text.slice(0, max) : text;
}

/** Os arquivos mudados mexem em dependências? Então precisa reinstalar. */
export function needsReinstall(paths: string[]): boolean {
  return paths.some((p) => /(^|\/)(package\.json|package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock)$/.test(p));
}
