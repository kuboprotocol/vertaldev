// VERTAL · gatilho do e-mail de boas-vindas v2 no front: depois que o e-mail é confirmado (o link de
// confirmação abre o app já logado) ou no 1º login com Google, pede ao servidor o e-mail UMA vez por
// navegador. O servidor decide de verdade (flag, idade da conta, dedupe pelo log de envios).
// Desligado por padrão: só roda com VITE_VERTAL_WELCOME_EMAIL_V2=true no build (não está no .env.production).

type EnvLike = Record<string, unknown> | undefined;

export function isWelcomeV2FrontEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_WELCOME_EMAIL_V2;
  return v === true || v === 'true' || v === '1';
}

export const WELCOME_CLIENT_WINDOW_MS = 7 * 24 * 3_600_000;

export const welcomeMarkKey = (userId: string) => `vertal-welcome-requested:${userId}`;

export interface WelcomeTriggerUser {
  id: string;
  created_at?: string | null;
  email_confirmed_at?: string | null;
}

export interface MarkStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Conta nova (≤ 7 dias), e-mail confirmado e ainda não pedido neste navegador. */
export function shouldRequestWelcome(user: WelcomeTriggerUser | null | undefined, nowMs: number, storage: MarkStorage | null): boolean {
  if (!user?.id || !user.email_confirmed_at || !user.created_at) return false;
  const created = new Date(user.created_at).getTime();
  if (!Number.isFinite(created) || nowMs - created > WELCOME_CLIENT_WINDOW_MS || nowMs < created - 60_000) return false;
  try {
    if (storage?.getItem(welcomeMarkKey(user.id))) return false;
  } catch {
    return false;
  }
  return true;
}

export function markWelcomeRequested(userId: string, storage: MarkStorage | null, nowMs: number): void {
  try {
    storage?.setItem(welcomeMarkKey(userId), String(nowMs));
  } catch {
    /* armazenamento indisponível: o servidor deduplica de qualquer forma */
  }
}
