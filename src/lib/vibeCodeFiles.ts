// Caixinhas de código do Vibe Code Agent: transforma os passos de uma resposta
// do agente na lista de arquivos que ele tocou, prontos para abrir no visualizador.
import type { VibeChatMessage, VibeStep } from "@/lib/vibeCodeAgentTypes";

export type CodeFileStatus = "preview" | "committed" | "reverted";

export interface CodeFile {
  path: string;
  /** Conteúdo completo, quando o agente enviou (sempre nas conversas novas). */
  content: string | null;
  diff: string | null;
  reason: string | null;
  status: CodeFileStatus;
  commitSha: string | null;
  repoUrl: string | null;
  /** Passo de origem: usado para desfazer a partir da caixinha. */
  stepId: string;
}

/** Conta linhas adicionadas e removidas de um diff unificado. */
export function diffStats(diff: string | null | undefined): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  if (!diff) return { added, removed };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/**
 * Um arquivo por caminho. Se o mesmo arquivo aparece mais de uma vez (preview
 * e depois commit), vale o último passo; o conteúdo antigo só é aproveitado
 * quando o passo mais novo não traz conteúdo.
 */
export function collectCodeFiles(steps: VibeStep[] | undefined): CodeFile[] {
  const byPath = new Map<string, CodeFile>();
  for (const s of steps ?? []) {
    if (!s.path || (s.kind !== "diff" && s.kind !== "commit")) continue;
    if (s.status !== "success") continue;
    const previous = byPath.get(s.path);
    byPath.set(s.path, {
      path: s.path,
      content: s.proposedContent ?? previous?.content ?? null,
      diff: s.diff ?? previous?.diff ?? null,
      reason: s.detail ?? previous?.reason ?? null,
      status: s.reverted ? "reverted" : s.kind === "commit" ? "committed" : "preview",
      commitSha: s.commitSha ?? null,
      repoUrl: s.repoUrl ?? null,
      stepId: s.id,
    });
  }
  return [...byPath.values()];
}

/** Texto da resposta do agente: o content guardado ou, durante o stream, o passo "reply". */
export function replyOf(message: VibeChatMessage): string {
  if (message.content.trim()) return message.content;
  const reply = [...(message.steps ?? [])].reverse().find((s) => s.kind === "reply");
  return reply?.detail?.trim() ?? "";
}

/** Passos que vão para "o que o agente fez" (o resto já aparece como balão ou caixinha). */
export function activitySteps(steps: VibeStep[] | undefined): VibeStep[] {
  return (steps ?? []).filter((s) => s.kind !== "conversation" && s.kind !== "reply");
}

export function fileName(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}
