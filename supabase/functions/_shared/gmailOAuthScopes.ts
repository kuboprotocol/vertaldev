// Escopos do conector Gmail. A lista base é a mesma de antes (não mudar).
// Agendador do Vertal Chat: o escopo de agenda (calendar.events) só entra quando
// GMAIL_OAUTH_CALENDAR_SCOPE_ENABLED=true E o usuário está em VERTAL_CHAT_SCHEDULER_USER_IDS.
// Desligado por padrão: sem a flag, a URL de consentimento fica idêntica à anterior.

export const GMAIL_BASE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  // Secretário: organizar (rótulos, arquivar, lido, lixeira) e rascunhos. Conta antiga reconecta (include_granted_scopes).
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

export const GMAIL_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

type EnvGet = (k: string) => string | undefined;

export function calendarScopeAllowed(userId: string | null | undefined, env: EnvGet): boolean {
  if ((env('GMAIL_OAUTH_CALENDAR_SCOPE_ENABLED') ?? '').trim().toLowerCase() !== 'true') return false;
  if (!userId) return false;
  const ids = (env('VERTAL_CHAT_SCHEDULER_USER_IDS') ?? '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ids.includes(userId.trim().toLowerCase());
}

export function gmailOAuthScopes(userId: string | null | undefined, env: EnvGet): string {
  const scopes: string[] = [...GMAIL_BASE_SCOPES];
  if (calendarScopeAllowed(userId, env)) scopes.push(GMAIL_CALENDAR_SCOPE);
  return scopes.join(' ');
}
