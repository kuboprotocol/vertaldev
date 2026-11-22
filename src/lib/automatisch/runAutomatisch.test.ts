import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { runAutomatisch, type ActionContext, type ApiApprovalRequest } from '@/lib/chatAgent/runAction';

const FLOW = '11111111-1111-4111-8111-111111111111';

function ctx(approve: boolean) {
  const approveApi = vi.fn(async (_r: ApiApprovalRequest) => approve);
  const c = {
    userId: 'u1', artifacts: [], newId: () => 'a1', approveApi,
    appBlockedReason: () => null, chargeAppEdit: async () => undefined, setChatOnly: () => undefined,
  } as unknown as ActionContext;
  return { c, approveApi };
}

/** Erro como o supabase-js devolve para respostas não-2xx (corpo em error.context). */
const fnError = (body: unknown) => ({ message: 'non-2xx', context: new Response(JSON.stringify(body), { status: 400 }) });

describe('runAutomatisch (navegador)', () => {
  beforeEach(() => invoke.mockReset());

  it('pede permissão em TODA chamada, inclusive leitura, com os nomes dos segredos no cartão', async () => {
    const { c, approveApi } = ctx(true);
    invoke.mockResolvedValue({ data: { ok: true, op: 'list_flows', data: { flows: [] }, summary: 'Nenhum fluxo encontrado.\n{}' }, error: null });
    const out = await runAutomatisch({ tool: 'automatisch', op: 'list_flows' }, c);
    expect(approveApi).toHaveBeenCalledTimes(1);
    const req = approveApi.mock.calls[0][0];
    expect(req.secrets).toEqual(['AUTOMATISCH_URL', 'AUTOMATISCH_EMAIL', 'AUTOMATISCH_PASSWORD']);
    expect(req.method).toBe('AUTOMATISCH');
    expect(req.hasBody).toBe(false);
    expect(out.result).toMatchObject({ tool: 'automatisch', ok: true });
    expect(out.result.summary).toContain('Nenhum fluxo');
    expect(out.needsFollowUp).toBe(true);
  });

  it('sem permissão não chama o servidor', async () => {
    const { c } = ctx(false);
    const out = await runAutomatisch({ tool: 'automatisch', op: 'set_flow_status', flow_id: FLOW, active: true }, c);
    expect(invoke).not.toHaveBeenCalled();
    expect(out.result.ok).toBe(false);
    expect(out.result.summary).toContain('não autorizou');
  });

  it('manda só a operação aprovada (confirmed: true), nunca credenciais', async () => {
    const { c, approveApi } = ctx(true);
    invoke.mockResolvedValue({ data: { ok: true, op: 'set_flow_status', data: { flow: { id: FLOW, active: true } }, summary: 'Fluxo publicado: agora roda sozinho.' }, error: null });
    await runAutomatisch({ tool: 'automatisch', op: 'set_flow_status', flow_id: FLOW, active: true }, c);
    expect(approveApi.mock.calls[0][0].hasBody).toBe(true);
    expect(approveApi.mock.calls[0][0].url).toContain('PUBLICAR');
    expect(invoke).toHaveBeenCalledWith('creative-router', {
      body: { tool: 'automatisch', automatisch: { op: 'set_flow_status', flow_id: FLOW, active: true, confirmed: true } },
    });
  });

  it('segredo faltando abre o painel do Cofre e diz quais criar', async () => {
    const { c } = ctx(true);
    invoke.mockResolvedValue({ data: null, error: fnError({ error: 'missing_secrets', missing: ['AUTOMATISCH_PASSWORD'] }) });
    const out = await runAutomatisch({ tool: 'automatisch', op: 'list_flows' }, c);
    expect(out.panel).toBe('secrets');
    expect(out.result.ok).toBe(false);
    expect(out.result.summary).toContain('AUTOMATISCH_PASSWORD');
  });

  it('login recusado também leva ao Cofre; outros erros só explicam', async () => {
    const { c } = ctx(true);
    invoke.mockResolvedValueOnce({ data: { ok: false, op: 'list_flows', code: 'auth_failed', message: 'O Automatisch recusou o login.' }, error: null });
    const denied = await runAutomatisch({ tool: 'automatisch', op: 'list_flows' }, c);
    expect(denied.panel).toBe('secrets');
    invoke.mockResolvedValueOnce({ data: { ok: false, op: 'set_flow_status', code: 'incomplete_flow', message: 'O fluxo ainda tem passos incompletos.' }, error: null });
    const incomplete = await runAutomatisch({ tool: 'automatisch', op: 'set_flow_status', flow_id: FLOW, active: true }, c);
    expect(incomplete.panel).toBeUndefined();
    expect(incomplete.error).toContain('incompletos');
  });
});
