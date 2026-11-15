// "Executar todas (semi-autônomo)": decide se o chat segue sozinho para a
// próxima tarefa depois de cada passo. O laço vive no navegador (cada passo é
// um pedido curto à edge function), então dá para parar a qualquer momento.
import { AUTONOMY, graphProgress, nextTask, type ClientAgentState } from "./engine";

export type RunAllStop =
  | { stop: false }
  | { stop: true; reason: "done" | "awaiting_approval" | "blocked" | "error" | "limit" | "cancelled"; message: string };

export function runAllDecision(state: ClientAgentState | null, ctx: { iterations: number; maxIterations: number; lastOk: boolean; cancelled: boolean }): RunAllStop {
  if (ctx.cancelled) return { stop: true, reason: "cancelled", message: "Execução em sequência interrompida." };
  if (!ctx.lastOk) return { stop: true, reason: "error", message: "Parei a sequência porque o último passo falhou." };
  if (!state?.graph) return { stop: true, reason: "done", message: "Não há plano nesta conversa." };
  if (state.staged.length) {
    return AUTONOMY[state.autonomy].autoApply
      ? { stop: true, reason: "awaiting_approval", message: "A revisão achou algo grave: revise e aplique para eu continuar." }
      : { stop: true, reason: "awaiting_approval", message: "Mudanças staged prontas: revise e aplique (ou rejeite) para eu seguir para a próxima." };
  }
  const p = graphProgress(state.graph);
  if (p.total && p.done + p.deferred === p.total) return { stop: true, reason: "done", message: `Plano concluído: ${p.done}/${p.total} tarefa(s).` };
  if (!nextTask(state.graph)) return { stop: true, reason: "blocked", message: "Nenhuma tarefa liberada: as que faltam dependem de outras ou estão bloqueadas." };
  if (ctx.iterations >= ctx.maxIterations) return { stop: true, reason: "limit", message: `Parei depois de ${ctx.iterations} passo(s) para você conferir.` };
  return { stop: false };
}
