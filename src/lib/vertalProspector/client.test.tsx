import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import {
  callProspector, fetchProspectorAccess, isVertalProspectorEnabled, readProspectorHandoff, vertalProspectorHrefFromChat,
} from './client';
import { VertalProspectorEntryButton } from '@/components/vertal-prospector/VertalProspectorEntryButton';

describe('Vertal Prospector · front', () => {
  it('interruptor desligado por padrão', () => {
    expect(isVertalProspectorEnabled({})).toBe(false);
    expect(isVertalProspectorEnabled({ VITE_VERTAL_PROSPECTOR: 'false' })).toBe(false);
    expect(isVertalProspectorEnabled({ VITE_VERTAL_PROSPECTOR: 'true' })).toBe(true);
  });
  it('botão: desligado/não liberado não renderiza NADA (Vertal Chat e Code AI ficam idênticos)', () => {
    const { container } = render(
      <MemoryRouter>
        <VertalProspectorEntryButton from="chat" />
        <VertalProspectorEntryButton from="code" enabledOverride={false} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
  it('comando do chat vira endereço com os campos preenchidos', () => {
    const href = vertalProspectorHrefFromChat('prospectar clientes para Vertal Company 65.822.139/0001-66 vertal.dev');
    expect(href.startsWith('/vertal-code-ai/prospector?')).toBe(true);
    const h = readProspectorHandoff(href.split('?')[1]);
    expect(h).toEqual({ companyName: 'Vertal Company', cnpj: '65822139000166', website: 'https://vertal.dev/', from: 'chat' });
  });
  it('acesso: qualquer falha = não liberado; chama a action prospector', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'vertal_prospector_disabled' }), { status: 404 }));
    expect(await fetchProspectorAccess('tok', f as unknown as typeof fetch, 'https://x/functions/v1/vertal-code-ai')).toBe(false);
    expect(JSON.parse(String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body))).toEqual({ action: 'prospector', op: 'status' });
    const ok = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    expect(await fetchProspectorAccess('tok', ok as unknown as typeof fetch, 'https://x')).toBe(true);
    expect(await fetchProspectorAccess('', ok as unknown as typeof fetch, 'https://x')).toBe(false);
    await expect(callProspector('status', {}, { token: '', fetchImpl: ok as unknown as typeof fetch })).rejects.toThrow('not_signed_in');
  });
});
