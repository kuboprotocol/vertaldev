// Trava de escritor único do lado do navegador: o executor do plano, a fila de
// correções e o "Aplicar" manual nunca disparam escritas ao mesmo tempo nesta
// conversa. O servidor tem a mesma regra (vibe_conversations.writer_lock_*);
// aqui ela evita até mandar o pedido, e permite que uma ação enfileirada
// espere a vez (ex.: "Executar todas" entre uma tarefa e outra).
import { lockBusyMessage, type WriterKind } from "./engine";

export class WriterBusyError extends Error {
  readonly heldBy: WriterKind;
  constructor(heldBy: WriterKind) {
    super(lockBusyMessage({ kind: heldBy }));
    this.name = "WriterBusyError";
    this.heldBy = heldBy;
  }
}

export interface WriterLock {
  /** Quem está gravando agora (null = livre). */
  holder(): WriterKind | null;
  /**
   * Roda `fn` como único escritor. Ocupado: `wait: false` (padrão) recusa na
   * hora com WriterBusyError (mensagem em pt-BR); `wait: true` entra na fila e
   * roda quando chegar a vez (até `timeoutMs`).
   */
  run<T>(kind: WriterKind, fn: () => Promise<T>, opts?: { wait?: boolean; timeoutMs?: number }): Promise<T>;
  subscribe(listener: (holder: WriterKind | null) => void): () => void;
}

export function createWriterLock(): WriterLock {
  let current: WriterKind | null = null;
  const waiters: Array<{ kind: WriterKind; resolve: () => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }> = [];
  const listeners = new Set<(holder: WriterKind | null) => void>();
  const notify = () => listeners.forEach((l) => l(current));

  const release = () => {
    const next = waiters.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      current = next.kind;
      notify();
      next.resolve();
    } else {
      current = null;
      notify();
    }
  };

  return {
    holder: () => current,
    async run<T>(kind: WriterKind, fn: () => Promise<T>, opts: { wait?: boolean; timeoutMs?: number } = {}) {
      if (current !== null) {
        if (!opts.wait) throw new WriterBusyError(current);
        const heldBy = current;
        await new Promise<void>((resolve, reject) => {
          const waiter: (typeof waiters)[number] = { kind, resolve, reject };
          if (opts.timeoutMs) {
            waiter.timer = setTimeout(() => {
              const idx = waiters.indexOf(waiter);
              if (idx >= 0) waiters.splice(idx, 1);
              reject(new WriterBusyError(heldBy));
            }, opts.timeoutMs);
          }
          waiters.push(waiter);
        });
      } else {
        current = kind;
        notify();
      }
      try {
        return await fn();
      } finally {
        release();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
