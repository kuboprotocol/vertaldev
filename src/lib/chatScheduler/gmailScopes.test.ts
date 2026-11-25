import { describe, expect, it } from 'vitest';
import { calendarScopeAllowed, gmailOAuthScopes } from '../../../supabase/functions/_shared/gmailOAuthScopes';

// Lista exata que o conector pedia antes desta mudança (regressão: não pode mudar sem a flag).
const BEFORE = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');
const CAL = 'https://www.googleapis.com/auth/calendar.events';
const UID = '5441b397-0000-4000-8000-000000000000';
const envOf = (o: Record<string, string>) => (k: string) => o[k];

describe('escopos do conector Gmail', () => {
  it('sem flag: idêntico ao anterior', () => {
    expect(gmailOAuthScopes(UID, envOf({}))).toBe(BEFORE);
    expect(gmailOAuthScopes(UID, envOf({ VERTAL_CHAT_SCHEDULER_USER_IDS: UID }))).toBe(BEFORE);
  });
  it('flag ligada mas usuário fora da lista: idêntico ao anterior', () => {
    const env = envOf({ GMAIL_OAUTH_CALENDAR_SCOPE_ENABLED: 'true', VERTAL_CHAT_SCHEDULER_USER_IDS: 'outro-id' });
    expect(gmailOAuthScopes(UID, env)).toBe(BEFORE);
    expect(gmailOAuthScopes(null, env)).toBe(BEFORE);
  });
  it('flag ligada e usuário na lista: acrescenta só calendar.events', () => {
    const env = envOf({ GMAIL_OAUTH_CALENDAR_SCOPE_ENABLED: 'true', VERTAL_CHAT_SCHEDULER_USER_IDS: `x, ${UID.toUpperCase()}` });
    expect(calendarScopeAllowed(UID, env)).toBe(true);
    expect(gmailOAuthScopes(UID, env)).toBe(`${BEFORE} ${CAL}`);
  });
});
