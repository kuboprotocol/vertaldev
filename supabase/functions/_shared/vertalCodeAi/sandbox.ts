// VERTAL Code AI · teste das mudanças num sandbox (E2B), usado pelo Revisor/QA da Equipe.
// Lógica pura + orquestrador injetado (a edge function passa o _shared/orchestrator.ts, só leitura).
//
// O que roda: grava os arquivos mudados numa pasta limpa e passa o compilador TypeScript neles
// (sem instalar o projeto: imports de pacotes/arquivos de fora são ignorados). Pega erro de sintaxe e de
// tipo DENTRO dos arquivos; não substitui o build completo do projeto.
// Desligado por padrão (VERTAL_CODE_AI_TEAM_E2B=true + E2B_API_KEY). Falhou ao subir? ran:false, segue.

import type { FileChange, VerifyIssue } from "./core.ts";
import type { SandboxResult } from "./team.ts";

export interface SandboxOrchestrator {
  provision: (sessionId: string, timeoutSeconds: number) => Promise<{ container_ref: string; driver: string | null }>;
  exec: (ref: string, command: string, timeoutMs: number) => Promise<{ logs: string; exit_code: number }>;
  destroy: (ref: string) => Promise<unknown>;
}

const SANDBOX_DIR = "/home/user/vca-check";
const TS_FILE = /\.(?:[cm]?[jt]sx?)$/i;
/** Erros de "não achei o módulo/tipos" (o projeto não está instalado no sandbox) não contam. */
const IGNORED_TS = new Set(["2307", "2792", "7016", "2875", "2503", "7026", "2686", "2304", "2552", "2580", "2868"]);

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Script que grava os arquivos (base64, sem problemas de aspas) e roda o tsc só neles. */
export function buildSandboxScript(changes: FileChange[]): { script: string; files: string[] } {
  const files = changes.filter((c) => c.after !== null && TS_FILE.test(c.path) && !c.path.includes("..")).slice(0, 30);
  const lines = [`set -e`, `rm -rf ${SANDBOX_DIR} && mkdir -p ${SANDBOX_DIR} && cd ${SANDBOX_DIR}`];
  for (const f of files) {
    const dir = f.path.split("/").slice(0, -1).join("/");
    if (dir) lines.push(`mkdir -p ${shq(dir)}`);
    lines.push(`echo ${shq(b64(f.after as string))} | base64 -d > ${shq(f.path)}`);
  }
  lines.push(`set +e`);
  lines.push(
    `timeout 100 npx -y -p typescript@5.8.3 tsc --noEmit --pretty false --allowJs --checkJs false --jsx react-jsx --skipLibCheck ` +
      `--isolatedModules --noResolve --target es2022 --module esnext --moduleResolution bundler --strict false ` +
      `${files.map((f) => shq(f.path)).join(" ")} 2>&1 | head -200`,
  );
  lines.push(`echo "__VCA_DONE__"`);
  return { script: lines.join("\n"), files: files.map((f) => f.path) };
}

/** Lê a saída do tsc: "src/a.ts(3,7): error TS2322: ..." → problemas, só dos arquivos testados. */
export function parseTscOutput(out: string, files: string[]): VerifyIssue[] {
  const set = new Set(files);
  const issues: VerifyIssue[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
    if (!m) continue;
    const [, path, row, , code, msg] = m;
    if (IGNORED_TS.has(code) || !set.has(path)) continue;
    issues.push({ path, problem: `sandbox (typecheck) linha ${row}: ${msg.slice(0, 300)}` });
    if (issues.length >= 15) break;
  }
  return issues;
}

/** Sobe o sandbox, testa, derruba. Nunca lança. */
export async function runSandboxTest(changes: FileChange[], orch: SandboxOrchestrator, opts: { runId: string; timeoutMs?: number }): Promise<SandboxResult> {
  const { script, files } = buildSandboxScript(changes);
  if (!files.length) return { ran: false, ok: true, issues: [] };
  let ref: string | null = null;
  try {
    const p = await orch.provision(`vca-${opts.runId}`.slice(0, 60), 180);
    if (!p.container_ref || p.container_ref.startsWith("pending:")) return { ran: false, ok: false, issues: [] };
    ref = p.container_ref;
    const r = await orch.exec(ref, script, opts.timeoutMs ?? 110_000);
    if (!r.logs.includes("__VCA_DONE__")) return { ran: false, ok: false, issues: [], output: r.logs.slice(-2_000) };
    const issues = parseTscOutput(r.logs, files);
    return { ran: true, ok: issues.length === 0, issues, output: r.logs.slice(-2_000) };
  } catch (err) {
    return { ran: false, ok: false, issues: [], output: err instanceof Error ? err.message.slice(0, 300) : "erro" };
  } finally {
    if (ref) await Promise.resolve(orch.destroy(ref)).catch(() => {});
  }
}
