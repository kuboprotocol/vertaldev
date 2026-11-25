import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import { attachmentPath, callCrm, CrmError, fetchCrmAccess, isVertalCrmEnabled, VERTAL_CRM_ROUTE } from './client';
import { VERTAL_CRM_CONNECTOR } from './connector';
import { crmUi, uiLangFrom } from './i18n';
import { VertalCrmEntryButton } from '@/components/vertal-crm/VertalCrmEntryButton';
import { connectors } from '@/lib/connectorsConfig';

describe('Vertal CRM · front', () => {
  it('interruptor desligado por padrão', () => {
    expect(isVertalCrmEnabled({})).toBe(false);
    expect(isVertalCrmEnabled({ VITE_VERTAL_CRM: 'false' })).toBe(false);
    expect(isVertalCrmEnabled({ VITE_VERTAL_CRM: 'true' })).toBe(true);
  });
  it('botão do Vertal Chat: desligado/não liberado não renderiza NADA', () => {
    const { container } = render(<MemoryRouter><VertalCrmEntryButton /><VertalCrmEntryButton enabledOverride={false} /></MemoryRouter>);
    expect(container.innerHTML).toBe('');
  });
  it('liberado: mostra o botão', () => {
    const { getByTestId } = render(<MemoryRouter><VertalCrmEntryButton enabledOverride /></MemoryRouter>);
    expect(getByTestId('vertal-crm-entry')).toBeTruthy();
  });
  it('lista estática de conectores não muda (o Vertal CRM só entra quando o servidor libera)', () => {
    expect(connectors.some((c) => c.slug === 'vertal-crm')).toBe(false);
    expect(connectors.some((c) => c.pinned)).toBe(false);
    expect(VERTAL_CRM_CONNECTOR).toMatchObject({ slug: 'vertal-crm', pinned: true, internalRoute: VERTAL_CRM_ROUTE, status: 'available' });
    expect(VERTAL_CRM_ROUTE).toBe('/crm');
  });
  it('chamada ao servidor vai para ?app=crm com o token e trata erro', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'insufficient_credits' }), { status: 402 }));
    await expect(callCrm('ai', { kind: 'summary' }, { token: 't', fetchImpl: fetchImpl as unknown as typeof fetch, url: 'https://x/functions/v1/vertal-code-ai?app=crm' })).rejects.toBeInstanceOf(CrmError);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ op: 'ai', kind: 'summary' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
    expect(await fetchCrmAccess('', fetchImpl as unknown as typeof fetch)).toBe(false);
  });
  it('anexo na pasta do workspace e do próprio usuário (policy do Storage)', () => {
    expect(attachmentPath('ws', 'u1', 'Proposta final (v2).pdf', 'id1')).toBe('ws/u1/id1-Proposta_final_v2_.pdf');
  });
  it('idioma nativo: pt-BR padrão, en e es', () => {
    expect(uiLangFrom(null, 'es-AR')).toBe('es');
    expect(uiLangFrom()).toBe('pt');
    expect(crmUi('pt').tabs.deals).toBe('Negócios');
    expect(crmUi('en').ai.cost(1)).toBe('Costs 1 credit. Refunded if it fails.');
    expect(crmUi('es').tabs.settings).toBe('Configuración');
  });
});
