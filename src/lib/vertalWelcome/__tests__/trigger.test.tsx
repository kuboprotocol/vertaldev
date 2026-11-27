import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { isWelcomeV2FrontEnabled, shouldRequestWelcome, welcomeMarkKey, markWelcomeRequested } from '../trigger';

const invoke = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
const authUser = {
  id: '11111111-2222-4333-8444-555555555555',
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  email_confirmed_at: new Date().toISOString(),
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: authUser }) }));

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('welcome v2 · gatilho do front', () => {
  beforeEach(() => {
    invoke.mockClear();
    window.localStorage.clear();
  });

  it('flag do front desligada por padrão', () => {
    expect(isWelcomeV2FrontEnabled({})).toBe(false);
    expect(isWelcomeV2FrontEnabled({ VITE_VERTAL_WELCOME_EMAIL_V2: 'false' })).toBe(false);
    expect(isWelcomeV2FrontEnabled({ VITE_VERTAL_WELCOME_EMAIL_V2: 'true' })).toBe(true);
  });

  it('só pede para conta nova, confirmada e uma vez por navegador', () => {
    const s = mem();
    const now = Date.now();
    expect(shouldRequestWelcome(authUser, now, s)).toBe(true);
    expect(shouldRequestWelcome({ ...authUser, email_confirmed_at: null }, now, s)).toBe(false);
    expect(shouldRequestWelcome({ ...authUser, created_at: '2020-01-01T00:00:00Z' }, now, s)).toBe(false);
    markWelcomeRequested(authUser.id, s, now);
    expect(s.getItem(welcomeMarkKey(authUser.id))).toBeTruthy();
    expect(shouldRequestWelcome(authUser, now, s)).toBe(false);
  });

  it('flag desligada: o componente não chama o servidor (nenhum e-mail)', async () => {
    const { WelcomeEmailTrigger } = await import('@/components/vertal-welcome/WelcomeEmailTrigger');
    render(<WelcomeEmailTrigger enabled={false} />);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('flag ligada: chama send-welcome-email com trigger "session" uma única vez', async () => {
    const { WelcomeEmailTrigger } = await import('@/components/vertal-welcome/WelcomeEmailTrigger');
    const r = render(<WelcomeEmailTrigger enabled />);
    r.rerender(<WelcomeEmailTrigger enabled />);
    render(<WelcomeEmailTrigger enabled />);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('send-welcome-email', { body: { userId: authUser.id, trigger: 'session' } });
  });
});
