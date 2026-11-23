import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { runHuginn, actionLabel, type ActionContext, type ApiApprovalRequest } from '@/lib/chatAgent/runAction';

const FLOW = '11111111-1111-4111-8111-111111111111';

function ctx(approve: boolean) {
  const approveApi = vi.fn(async (_r: ApiApprovalRequest) => approve);
  const c = {
    userId: 'u1', artifacts: [], newId: () => 'a1', approveApi,
    appBlockedReason: () => null, chargeAppEdit: async () => undefined, setChatOnly: () => undefined,
  } as unknown as ActionContext;
  return { c, approveApi };
}

const fnError = (body: unknown) => ({ message: 'non-2xx', context: new Response(JSON.stringify(body), { status: 400 }) });

describe('runHuginn (navegador)', () => {
  beforeEach(() => invoke.mockReset());

  it('pede permissão em toda chamada, inclusive leitura, com os segredos no cartão', async () => {
    const { c, approveApi } = ctx(true);
    invoke.mockResolvedValue({ data: { ok: true, op: 'list_agents', data: { agents: [] }, summary: 'Nenhum agente.\n{}' }, error: null });
    const out = await runHuginn({ tool: 'huginn', op: 'list_agents' }, c);
    const req = approveApi.mock.calls[0][0];
    expect(req.method).toBe('VERTAL AGENTES');
    expect(req.secrets).toEqual(['HUGINN_URL', 'HUGINN_USERNAME', 'HUGINN_PASSWORD']);
    expect(req.hasBody).toBe(false);
    expect(out.result).toMatchObject({ tool: 'huginn', ok: true });
    expect(invoke).toHaveBeenCalledWith('creative-router', { body: { tool: 'huginn', huginn: { op: 'list_agents', confirmed: true } } });
  });

  it('a ponte mostra também os segredos do Automatisch e diz que mexe nos dois', async () => {
    const { c, approveApi } = ctx(true);
    invoke.mockResolvedValue({ data: { ok: true, op: 'connect_to_automatisch', data: {}, summary: 'Ligado.' }, error: null });
    await runHuginn({ tool: 'huginn', op: 'connect_to_automatisch', source_agent_id: 3, flow_id: FLOW }, c);
    const req = approveApi.mock.calls[0][0];
    expect(req.secrets).toEqual(['HUGINN_URL', 'HUGINN_USERNAME', 'HUGINN_PASSWORD', 'AUTOMATISCH_URL', 'AUTOMATISCH_EMAIL', 'AUTOMATISCH_PASSWORD']);
    expect(req.hasBody).toBe(true);
    expect(req.reason).toContain('Vertal Fluxos');
    expect(actionLabel({ tool: 'huginn', op: 'connect_to_automatisch', source_agent_id: 3, flow_id: FLOW })).toContain('Vertal Fluxos');
  });

  it('sem permissão não chama o servidor', async () => {
    const { c } = ctx(false);
    const out = await runHuginn({ tool: 'huginn', op: 'run_agent', agent_id: 2 }, c);
    expect(invoke).not.toHaveBeenCalled();
    expect(out.result.ok).toBe(false);
  });

  it('segredo faltando ou login recusado abrem o Cofre', async () => {
    const { c } = ctx(true);
    invoke.mockResolvedValueOnce({ data: null, error: fnError({ error: 'missing_secrets', missing: ['HUGINN_PASSWORD'] }) });
    const miss = await runHuginn({ tool: 'huginn', op: 'status' }, c);
    expect(miss.panel).toBe('secrets');
    expect(miss.result.summary).toContain('HUGINN_PASSWORD');
    invoke.mockResolvedValueOnce({ data: { ok: false, op: 'status', code: 'auth_failed', message: 'O Huginn recusou o login.' }, error: null });
    expect((await runHuginn({ tool: 'huginn', op: 'status' }, c)).panel).toBe('secrets');
    invoke.mockResolvedValueOnce({ data: { ok: false, op: 'run_agent', code: 'not_found', message: 'Não encontrado no Huginn.' }, error: null });
    const nf = await runHuginn({ tool: 'huginn', op: 'run_agent', agent_id: 9 }, c);
    expect(nf.panel).toBeUndefined();
    expect(nf.error).toContain('Não encontrado');
  });
});
