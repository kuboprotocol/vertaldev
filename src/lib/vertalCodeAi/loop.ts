// VERTAL Code AI — ciclo construir ─► testar no sandbox ─► corrigir sozinho.
// Lógica pura com a API injetada (testável sem rede). Nada é gravado no projeto:
// o resultado volta para a revisão de diffs e só vira commit no "Aplicar".
import type { BuildResponse, PollResponse, ProposedFile, RequestCommon, VcaiApi } from "./api";
import type { VcaiPlan } from "./core";

export type LoopEvent =
  | { kind: "build"; round: number; response: BuildResponse }
  | { kind: "sandbox"; round: number; status: "starting" | "running" }
  | { kind: "poll"; round: number; poll: PollResponse }
  | { kind: "fixing"; round: number; reason: string }
  | { kind: "done"; ok: boolean; rounds: number; reason: string };

export interface LoopOptions {
  api: VcaiApi;
  request: RequestCommon;
  plan?: VcaiPlan | null;
  /** Testar no sandbox depois de construir. */
  test: boolean;
  /** Rodadas de auto-correção depois da primeira construção (padrão 2). */
  maxFixRounds?: number;
  pollIntervalMs?: number;
  /** Tempo máximo esperando uma rodada de testes (padrão 12 min). */
  pollTimeoutMs?: number;
  onEvent?: (e: LoopEvent) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface LoopResult {
  ok: boolean;
  /** Estado final de cada arquivo proposto (acumulado entre rodadas). */
  files: ProposedFile[];
  summary: string;
  notes: string[];
  rounds: number;
  lastPoll: PollResponse | null;
  reason: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Junta a rodada nova com as anteriores: vale a versão mais nova de cada arquivo. */
export function mergeProposals(prev: ProposedFile[], next: ProposedFile[]): ProposedFile[] {
  const map = new Map(prev.map((f) => [f.path, f]));
  for (const f of next) {
    const old = map.get(f.path);
    // baseHash e isNew sempre se referem ao arquivo original do projeto.
    map.set(f.path, old ? { ...f, baseHash: old.baseHash, isNew: old.isNew } : f);
  }
  return [...map.values()];
}

export async function runBuildLoop(opts: LoopOptions): Promise<LoopResult> {
  const { api, request, onEvent } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const maxFix = Math.max(0, Math.min(5, opts.maxFixRounds ?? 2));
  const interval = opts.pollIntervalMs ?? 5000;
  const pollTimeout = opts.pollTimeoutMs ?? 12 * 60 * 1000;
  const aborted = () => opts.signal?.aborted === true;

  let round = 0;
  let build = await api.build({ ...request, plan: opts.plan ?? null }, opts.signal);
  onEvent?.({ kind: "build", round, response: build });
  let files = build.files;
  let summary = build.summary;
  let notes = build.notes;
  let failures = build.failures;
  let testCommand = build.testCommand;

  const finish = (ok: boolean, reason: string, lastPoll: PollResponse | null): LoopResult => {
    onEvent?.({ kind: "done", ok, rounds: round + 1, reason });
    return { ok, files, summary, notes, rounds: round + 1, lastPoll, reason };
  };

  if (!opts.test) {
    return finish(files.length > 0 && failures.length === 0, files.length ? "Pronto para revisar." : "O modelo não propôs mudanças.", null);
  }
  if (!files.length) return finish(false, "O modelo não propôs mudanças para testar.", null);

  let handle: string | null = null;
  let lastPoll: PollResponse | null = null;
  try {
    while (true) {
      if (aborted()) return finish(false, "Cancelado.", lastPoll);
      const payload = files.map((f) => ({ path: f.path, content: f.after }));
      onEvent?.({ kind: "sandbox", round, status: handle ? "running" : "starting" });
      handle = handle
        ? (await api.sandboxUpdate({ handle, files: payload, testCommand })).handle
        : (await api.sandboxStart({ projectId: request.projectId, files: payload, testCommand })).handle;

      const started = Date.now();
      lastPoll = null;
      while (!aborted()) {
        await sleep(interval);
        const p = await api.sandboxPoll(handle);
        onEvent?.({ kind: "poll", round, poll: p });
        if (p.done) {
          lastPoll = p;
          break;
        }
        if (Date.now() - started > pollTimeout) {
          return finish(false, "Os testes passaram do tempo limite. Revise as mudanças manualmente.", p);
        }
      }
      if (!lastPoll) return finish(false, "Cancelado.", null);
      if (lastPoll.exitCode === 0 && failures.length === 0) return finish(true, "Testes passaram no sandbox.", lastPoll);
      if (round >= maxFix) {
        return finish(false, `Os testes ainda falham depois de ${maxFix} correção(ões) automática(s). Revise o log antes de aplicar.`, lastPoll);
      }

      round++;
      const reason = lastPoll.exitCode === 0 ? "Algumas edições não puderam ser aplicadas." : "Testes falharam; corrigindo.";
      onEvent?.({ kind: "fixing", round, reason });
      build = await api.build(
        {
          ...request,
          plan: opts.plan ?? null,
          fix: { log: lastPoll.failure ?? lastPoll.log, files: files.map((f) => ({ path: f.path, content: f.after })), failures },
        },
        opts.signal,
      );
      onEvent?.({ kind: "build", round, response: build });
      files = mergeProposals(files, build.files);
      summary = build.summary || summary;
      notes = [...notes, ...build.notes].slice(-12);
      failures = build.failures;
      testCommand = build.testCommand ?? testCommand;
      if (!build.files.length) return finish(false, "A correção automática não propôs mudanças. Revise o log.", lastPoll);
    }
  } finally {
    if (handle) await api.sandboxStop(handle).catch(() => undefined);
  }
}
