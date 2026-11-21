// Estado do cartão de confirmação do /github (Vibe Code): uma pergunta por vez.
import { useSyncExternalStore } from 'react';

interface Pending { text: string; resolve: (ok: boolean) => void }

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Abre o cartão e espera a decisão do usuário (fechar = cancelar). */
export function confirmGithubAction(text: string): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { text, resolve };
    emit();
  });
}

export function decideGithubAction(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export function useGithubConfirm(): { text: string } | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => pending,
    () => pending,
  );
}
