import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import { fetchVcaAccess } from './access';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('VERTAL Code AI · checagem de acesso no servidor', () => {
  it('sem token: não liberado e nem chama o servidor', async () => {
    const f = vi.fn();
    expect(await fetchVcaAccess('', f as unknown as typeof fetch, 'u')).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('200 {allowed:true}: liberado, pedindo action=status com o token', async () => {
    const f = vi.fn(async () => res(200, { enabled: true, allowed: true }));
    expect(await fetchVcaAccess('tok', f as unknown as typeof fetch, 'u')).toBe(true);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ action: 'status' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
  it('404 (fora da lista ou desligado), 401 ou erro de rede: não liberado', async () => {
    expect(await fetchVcaAccess('tok', (async () => res(404, { error: 'vertal_code_ai_disabled' })) as unknown as typeof fetch, 'u')).toBe(false);
    expect(await fetchVcaAccess('tok', (async () => res(401, {})) as unknown as typeof fetch, 'u')).toBe(false);
    expect(await fetchVcaAccess('tok', (async () => { throw new Error('net'); }) as unknown as typeof fetch, 'u')).toBe(false);
    expect(await fetchVcaAccess('tok', (async () => res(200, { allowed: 'yes' })) as unknown as typeof fetch, 'u')).toBe(false);
  });
});
