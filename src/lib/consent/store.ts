// Pedido de assinatura do termo (consent gate) vindo de qualquer lugar do app: o chat, o
// executor de ferramentas, o Navigator, o Vibe Code. Um único cartão (ConsentTermsDialog)
// montado na tela atende; quem pediu espera a resposta (aceitou ou fechou).
import { useSyncExternalStore } from 'react';

export interface ConsentRequest {
  category: string;
  version?: string;
  title?: string;
}

interface State {
  open: ConsentRequest | null;
  hosts: number;
}

let state: State = { open: null, hosts: 0 };
const listeners = new Set<() => void>();
let waiters: Array<(accepted: boolean) => void> = [];

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useConsentRequest(): State {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state, () => state);
}

export function consentHostMounted(delta: 1 | -1) {
  set({ hosts: Math.max(0, state.hosts + delta) });
}

/**
 * Abre o termo e espera. Sem cartão montado na tela (ex.: página sem o chat), devolve false
 * na hora — quem chamou mostra a mensagem do servidor.
 */
export function requestConsent(req: ConsentRequest): Promise<boolean> {
  if (state.hosts === 0) return Promise.resolve(false);
  set({ open: req });
  return new Promise((resolve) => waiters.push(resolve));
}

export function resolveConsent(accepted: boolean) {
  const list = waiters;
  waiters = [];
  set({ open: null });
  for (const w of list) w(accepted);
}

/** Só para testes. */
export function __resetConsentStore() {
  state = { open: null, hosts: 0 };
  waiters = [];
}
