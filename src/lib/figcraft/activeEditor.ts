// Ponte entre o Vertal Chat (ou o MCP, via chat) e o editor do figCraft.
//
// Um único editor fica montado por vez. Quando o agente manda comandos para um design:
//   - se ele já está aberto, os comandos rodam agora, no mesmo editor;
//   - se não está, os comandos ficam na fila e o editor os executa ao montar e ficar pronto.
// Quem executa é sempre o próprio figCraft (window.figcraft.execute, mesma origem), pelos mesmos
// comandos que o menu e o MCP usam.

export interface FigcraftCommand {
  command: string;
  params?: Record<string, unknown>;
}

export interface FigcraftCommandResult {
  command: string;
  ok: boolean;
  /** O que o comando devolveu (ex.: {id} de um node.create), para o agente usar em seguida. */
  result?: unknown;
  error?: string;
}

type Runner = (commands: FigcraftCommand[]) => Promise<FigcraftCommandResult[]>;

interface Active {
  designId: string | null;
  run: Runner;
}

let active: Active | null = null;
const queue = new Map<string, FigcraftCommand[]>();

export interface ActiveHandle {
  /** Atualiza o design aberto (o usuário abriu outro, ou salvou um documento novo). */
  setDesignId: (designId: string | null) => void;
  /** Sai do registro, se ainda for o editor ativo. */
  unregister: () => void;
}

/** O editor se registra ao montar e sai ao desmontar. */
export function registerActiveFigcraft(designId: string | null, run: Runner): ActiveHandle {
  const entry: Active = { designId, run };
  active = entry;
  return {
    setDesignId: (id) => {
      entry.designId = id;
    },
    unregister: () => {
      if (active === entry) active = null;
    },
  };
}

export function activeFigcraftDesignId(): string | null {
  return active?.designId ?? null;
}

/**
 * Manda comandos a um design. Roda já se o editor dele está aberto; senão, guarda na fila.
 * Devolve 'ran' com os resultados, ou 'queued' quando o editor ainda vai abrir.
 */
export async function sendFigcraftCommands(
  designId: string,
  commands: FigcraftCommand[],
): Promise<{ status: 'ran'; results: FigcraftCommandResult[] } | { status: 'queued' }> {
  if (active && active.designId === designId) {
    return { status: 'ran', results: await active.run(commands) };
  }
  queue.set(designId, [...(queue.get(designId) ?? []), ...commands]);
  return { status: 'queued' };
}

/** O editor pega os comandos que chegaram antes de ele abrir. */
export function takeQueuedFigcraftCommands(designId: string): FigcraftCommand[] {
  const commands = queue.get(designId) ?? [];
  queue.delete(designId);
  return commands;
}

/** Só para testes. */
export function resetFigcraftBridgeForTests() {
  active = null;
  queue.clear();
}
