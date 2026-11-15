// Comandos de barra do plano/executor, com apelidos em português.
import { normalizeAutonomy, normalizeModelPack, type AutonomyLevel, type ModelPack } from "./engine";

export type PlanSlashKind = "plan" | "tasks" | "next" | "run" | "apply" | "reject" | "rewind" | "debug" | "autonomy" | "pack" | "expand";

export interface PlanSlashDef {
  name: string;
  aliases: string[];
  kind: PlanSlashKind;
  label: string;
  description: string;
  argRequired?: boolean;
  argHint?: string;
}

export const PLAN_SLASH_COMMANDS: PlanSlashDef[] = [
  { name: "/plano", aliases: ["/plan", "/planejar", "/prd"], kind: "plan", label: "Criar plano", description: "Divide o pedido (ou um PRD colado) em tarefas com prioridade e dependências", argRequired: true, argHint: "o que você quer construir" },
  { name: "/tarefas", aliases: ["/tasks", "/lista"], kind: "tasks", label: "Ver tarefas", description: "Abre o painel do plano: status, dependências e a próxima tarefa" },
  { name: "/proxima", aliases: ["/próxima", "/next"], kind: "next", label: "Executar próxima", description: "Executa a próxima tarefa liberada e deixa as mudanças staged para você revisar", argHint: "número da tarefa (opcional)" },
  { name: "/executar", aliases: ["/run", "/executar-todas", "/todas"], kind: "run", label: "Executar todas", description: "Executa as tarefas em sequência; no semi-autônomo para e pergunta antes de cada aplicação" },
  { name: "/aplicar", aliases: ["/apply"], kind: "apply", label: "Aplicar staged", description: "Aplica as mudanças staged (todas ou um arquivo) pelo caminho normal com checkpoint", argHint: "arquivo (opcional)" },
  { name: "/rejeitar", aliases: ["/reject", "/descartar"], kind: "reject", label: "Rejeitar staged", description: "Descarta as mudanças staged (todas ou um arquivo); nada vai para o projeto", argHint: "arquivo (opcional)" },
  { name: "/voltar", aliases: ["/rewind", "/desfazer"], kind: "rewind", label: "Voltar uma tarefa", description: "Desfaz a última aplicação do plano e devolve a tarefa para pendente" },
  { name: "/debug", aliases: ["/depurar", "/autodebug"], kind: "debug", label: "Auto-debug", description: "Corrige os erros de build/preview da última tarefa (com limite de tentativas)", argHint: "cole o erro (opcional)" },
  { name: "/autonomia", aliases: ["/autonomy", "/auto"], kind: "autonomy", label: "Autonomia", description: "manual | basico | basico+ | semi | autonomo", argRequired: true, argHint: "nível" },
  { name: "/pacote", aliases: ["/pack", "/modelos"], kind: "pack", label: "Pacote de modelos", description: "economico | equilibrado | forte", argRequired: true, argHint: "pacote" },
  { name: "/dividir", aliases: ["/expand", "/subtarefas"], kind: "expand", label: "Dividir tarefa", description: "Divide uma tarefa complexa em subtarefas", argHint: "número da tarefa (opcional)" },
];

export interface ParsedPlanSlash {
  def: PlanSlashDef;
  arg: string;
  taskId?: number;
  autonomy?: AutonomyLevel;
  modelPack?: ModelPack;
  all?: boolean;
}

/** "/proxima 3" → { kind: next, taskId: 3 }. null se não for comando do plano. */
export function parsePlanSlash(input: string): ParsedPlanSlash | null {
  const text = input.trim();
  const match = text.match(/^(\/[^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const def = PLAN_SLASH_COMMANDS.find((c) => c.name === word || c.aliases.includes(word));
  if (!def) return null;
  const arg = (match[2] ?? "").trim();
  const num = arg.match(/^#?(\d+)$/);
  const out: ParsedPlanSlash = { def, arg };
  if (num) out.taskId = Number.parseInt(num[1], 10);
  if (/^(todas|tudo|all)$/i.test(arg)) out.all = true;
  if (def.kind === "autonomy" && arg) {
    const level = normalizeAutonomy(arg, "semi");
    // Só aceita um valor conhecido (normalizeAutonomy cai no padrão quando não reconhece).
    if (level !== "semi" || /semi/i.test(arg)) out.autonomy = level;
  }
  if (def.kind === "pack" && arg) {
    const pack = normalizeModelPack(arg, "balanced");
    if (pack !== "balanced" || /equilibrado|balanced/i.test(arg)) out.modelPack = pack;
  }
  return out;
}

export function matchPlanSlashHints(input: string): PlanSlashDef[] {
  if (!input.startsWith("/") || /\s/.test(input)) return [];
  const typed = input.toLowerCase();
  return PLAN_SLASH_COMMANDS.filter((c) => c.name.startsWith(typed) || c.aliases.some((a) => a.startsWith(typed)));
}
