import { describe, expect, it, vi } from 'vitest';
import {
  AUTOMATISCH_SECRETS,
  describeAutomatischOp,
  isAutomatischWrite,
  normalizeAutomatischUrl,
  parseAutomatischOp,
  runAutomatischOp,
  scrubSecrets,
  wantsAutomatisch,
  type AutomatischFetch,
  type AutomatischOp,
} from '../../../supabase/functions/_shared/automatischCore';

const FLOW = '11111111-1111-4111-8111-111111111111';
const TRIGGER = '22222222-2222-4222-8222-222222222222';
const ACTION = '33333333-3333-4333-8333-333333333333';
const EXEC = '44444444-4444-4444-8444-444444444444';
const CONN = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'tok-super-secreto-123';
const CREDS = { url: 'https://automatisch.exemplo.com/', email: 'dono@exemplo.com', password: 'senha-forte-987' };
const BASE = 'https://automatisch.exemplo.com/internal/api/v1';

type Handler = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  { status: number; body?: unknown } | undefined;

/** Instância Automatisch falsa: responde por método + caminho e grava todas as chamadas. */
function fakeAutomatisch(routes: Record<string, Handler | { status: number; body?: unknown }>) {
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body?: string }> = [];
  const fetchFn: AutomatischFetch = vi.fn(async (url, init) => {
    calls.push({ method: init.method, url, headers: init.headers, body: init.body });
    const path = url.replace(BASE, '').split('?')[0];
    const route = routes[`${init.method} ${path}`];
    const res = typeof route === 'function' ? route(url, init) : route;
    const status = res?.status ?? 404;
    const text = res?.body === undefined ? '' : JSON.stringify(res.body);
    return { status, ok: status >= 200 && status < 300, text: async () => text };
  });
  return { fetchFn, calls };
}

const meta = (type: string, extra: Record<string, unknown> = {}) => ({ type, count: 1, isArray: false, currentPage: null, totalPages: null, ...extra });
const LOGIN = { status: 200, body: { data: { token: TOKEN }, meta: meta('Object') } };
const REVOKE = { status: 204 };
const flowBody = (over: Record<string, unknown> = {}) => ({
  data: {
    id: FLOW, name: 'Name your flow', active: false, status: 'draft', createdAt: 1, updatedAt: 1_700_000_000_000,
    steps: [
      { id: TRIGGER, type: 'trigger', key: null, appKey: null, name: null, status: 'incomplete', position: 1, parameters: {} },
      { id: ACTION, type: 'action', key: null, appKey: null, name: null, status: 'incomplete', position: 2, parameters: {} },
    ],
    ...over,
  },
  meta: meta('Flow'),
});

describe('parseAutomatischOp', () => {
  it('aceita as operações válidas (snake_case e camelCase)', () => {
    expect(parseAutomatischOp({ op: 'list_flows', page: '2', name: 'Leads', status: 'published' }))
      .toEqual({ op: 'list_flows', page: 2, name: 'Leads', status: 'published' });
    expect(parseAutomatischOp({ op: 'get_flow', flowId: FLOW.toUpperCase() })).toEqual({ op: 'get_flow', flow_id: FLOW });
    expect(parseAutomatischOp({ op: 'create_flow', name: 'Novo\nlead' })).toEqual({ op: 'create_flow', name: 'Novo lead' });
    expect(parseAutomatischOp({ op: 'create_flow' })).toEqual({ op: 'create_flow' });
    expect(parseAutomatischOp({ op: 'set_flow_status', flow_id: FLOW, active: 'true' })).toEqual({ op: 'set_flow_status', flow_id: FLOW, active: true });
    expect(parseAutomatischOp({ op: 'app_fields', app_key: 'webhook', kind: 'trigger', key: 'catchRawWebhook' }))
      .toEqual({ op: 'app_fields', app_key: 'webhook', kind: 'triggers', key: 'catchRawWebhook' });
    expect(parseAutomatischOp({
      op: 'update_step', step_id: ACTION, app_key: 'http-request', key: 'customRequest', connection_id: CONN,
      parameters: { method: 'POST', url: 'https://exemplo.com' },
    })).toEqual({
      op: 'update_step', step_id: ACTION, app_key: 'http-request', key: 'customRequest', connection_id: CONN,
      parameters: { method: 'POST', url: 'https://exemplo.com' },
    });
  });

  it('recusa ids inválidos, chaves estranhas, operações desconhecidas e pedidos vazios', () => {
    expect(parseAutomatischOp({ op: 'get_flow', flow_id: '../../users' })).toBeNull();
    expect(parseAutomatischOp({ op: 'delete_flow', flow_id: FLOW })).toBeNull();
    expect(parseAutomatischOp({ op: 'set_flow_status', flow_id: FLOW })).toBeNull();
    expect(parseAutomatischOp({ op: 'update_step', step_id: ACTION })).toBeNull();
    expect(parseAutomatischOp({ op: 'update_step', step_id: ACTION, app_key: 'Http Request' })).toBeNull();
    expect(parseAutomatischOp({ op: 'update_step', step_id: ACTION, parameters: [1, 2] })).toBeNull();
    expect(parseAutomatischOp({ op: 'update_step', step_id: ACTION, parameters: { x: 'y'.repeat(30_000) } })).toBeNull();
    expect(parseAutomatischOp({ op: 'app_steps', app_key: 'webhook', kind: 'outros' })).toBeNull();
    expect(parseAutomatischOp({ op: 'app_fields', app_key: 'webhook', kind: 'actions', key: '../x' })).toBeNull();
    expect(parseAutomatischOp(null)).toBeNull();
  });

  it('marca o que altera ou executa algo e descreve no cartão de permissão', () => {
    expect(isAutomatischWrite({ op: 'list_flows' })).toBe(false);
    expect(isAutomatischWrite({ op: 'test_step', step_id: ACTION })).toBe(true);
    expect(describeAutomatischOp({ op: 'test_step', step_id: ACTION })).toContain('RODAR');
    expect(describeAutomatischOp({ op: 'set_flow_status', flow_id: FLOW, active: true })).toContain('PUBLICAR');
    expect(describeAutomatischOp({ op: 'create_flow', name: 'Leads' })).toBe('Criar o fluxo "Leads" (gatilho e ação vazios)');
  });
});

describe('normalizeAutomatischUrl', () => {
  it('só https, sem credenciais nem query; tira barra e sufixo da API', () => {
    expect(normalizeAutomatischUrl('https://automatisch-main-production.up.railway.app/'))
      .toBe('https://automatisch-main-production.up.railway.app');
    expect(normalizeAutomatischUrl('https://a.exemplo.com/internal/api/v1/')).toBe('https://a.exemplo.com');
    expect(normalizeAutomatischUrl('https://a.exemplo.com/auto/api/v1')).toBe('https://a.exemplo.com/auto');
    expect(normalizeAutomatischUrl('http://a.exemplo.com')).toBeNull();
    expect(normalizeAutomatischUrl('https://user:pw@a.exemplo.com')).toBeNull();
    expect(normalizeAutomatischUrl('não é url')).toBeNull();
    expect(normalizeAutomatischUrl(undefined)).toBeNull();
  });
});

describe('runAutomatischOp (fetch falso)', () => {
  it('cria, configura, testa, publica e lê a execução de ponta a ponta sem vazar credenciais', async () => {
    const { fetchFn, calls } = fakeAutomatisch({
      'POST /access-tokens': LOGIN,
      [`DELETE /access-tokens/${TOKEN}`]: REVOKE,
      'POST /flows': { status: 201, body: flowBody() },
      [`PATCH /flows/${FLOW}`]: { status: 200, body: flowBody({ name: 'Leads do site', steps: undefined }) },
      [`GET /flows/${FLOW}`]: { status: 200, body: flowBody({ name: 'Leads do site' }) },
      [`PATCH /steps/${TRIGGER}`]: { status: 200, body: { data: { id: TRIGGER, type: 'trigger', appKey: 'webhook', key: 'catchRawWebhook', status: 'incomplete', position: 1, webhookUrl: 'https://automatisch.exemplo.com/webhooks/flows/x', parameters: { workSynchronously: false } }, meta: meta('Step') } },
      [`POST /steps/${TRIGGER}/test-and-continue`]: { status: 200, body: { data: { id: TRIGGER, type: 'trigger', status: 'completed', lastExecutionStep: { id: 'e1', status: 'success', dataOut: { raw: { body: { email: 'cliente@x.com' } } } } }, meta: meta('Step') } },
      [`PATCH /flows/${FLOW}/status`]: (_u, init) => ({ status: 200, body: flowBody({ active: JSON.parse(init.body ?? '{}').active, status: 'published', steps: undefined }) }),
      [`GET /executions/${EXEC}`]: { status: 200, body: { data: { id: EXEC, testRun: false, status: 'success', createdAt: 1_700_000_000_000, updatedAt: 1, flow: { id: FLOW, name: 'Leads do site', steps: [] } }, meta: meta('Execution') } },
      [`GET /executions/${EXEC}/execution-steps`]: { status: 200, body: { data: [{ id: 'x1', status: 'success', dataIn: {}, dataOut: { ok: true }, errorDetails: null, createdAt: 1, updatedAt: 1, step: { id: TRIGGER, appKey: 'webhook', key: 'catchRawWebhook', position: 1 } }], meta: meta('ExecutionStep', { isArray: true, currentPage: 1, totalPages: 1 }) } },
    });

    const ops: AutomatischOp[] = [
      { op: 'create_flow', name: 'Leads do site' },
      { op: 'update_step', step_id: TRIGGER, app_key: 'webhook', key: 'catchRawWebhook', parameters: { workSynchronously: false } },
      { op: 'test_step', step_id: TRIGGER },
      { op: 'set_flow_status', flow_id: FLOW, active: true },
      { op: 'get_execution', execution_id: EXEC },
    ];
    const results = [];
    for (const op of ops) results.push(await runAutomatischOp(op, CREDS, { fetch: fetchFn }));

    expect(results.every((r) => r.ok)).toBe(true);
    const [created, updated, tested, published, execution] = results as Array<Extract<(typeof results)[number], { ok: true }>>;
    expect(created.data).toMatchObject({ flow: { id: FLOW, name: 'Leads do site', steps: [{ id: TRIGGER }, { id: ACTION }] } });
    expect(created.summary).toContain('Fluxo criado');
    expect(updated.data).toMatchObject({ step: { appKey: 'webhook', key: 'catchRawWebhook', webhookUrl: expect.stringContaining('/webhooks/') } });
    expect(tested.data).toMatchObject({ step: { status: 'completed', lastRun: { status: 'success' } } });
    expect(published.data).toMatchObject({ flow: { active: true, status: 'published' } });
    expect(published.summary).toContain('Fluxo publicado');
    expect(execution.data).toMatchObject({ execution: { id: EXEC, status: 'success', flow: { name: 'Leads do site' } }, steps: [{ status: 'success', dataOut: { ok: true } }] });

    // Login com e-mail/senha no corpo; token cru no Authorization; revogado no fim de cada operação.
    const logins = calls.filter((c) => c.method === 'POST' && c.url === `${BASE}/access-tokens`);
    expect(logins).toHaveLength(ops.length);
    expect(JSON.parse(logins[0].body!)).toEqual({ email: CREDS.email, password: CREDS.password });
    expect(logins[0].headers.Authorization).toBeUndefined();
    const authed = calls.filter((c) => !c.url.endsWith('/access-tokens'));
    expect(authed.every((c) => c.headers.Authorization === TOKEN)).toBe(true);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(ops.length);
    // Só rotas comunitárias.
    expect(calls.every((c) => c.url.startsWith(BASE))).toBe(true);
    expect(calls.some((c) => c.url.includes('/api/v1/') && !c.url.includes('/internal/api/v1/'))).toBe(false);
    // Nada de credenciais no que volta.
    const out = JSON.stringify(results);
    for (const s of [TOKEN, CREDS.password, CREDS.email]) expect(out).not.toContain(s);
  });

  it('lista fluxos com paginação e filtros na query', async () => {
    const { fetchFn, calls } = fakeAutomatisch({
      'POST /access-tokens': LOGIN,
      [`DELETE /access-tokens/${TOKEN}`]: REVOKE,
      'GET /flows': { status: 200, body: { data: [flowBody().data], meta: meta('Flow', { isArray: true, count: 11, currentPage: 2, totalPages: 2 }) } },
    });
    const r = await runAutomatischOp({ op: 'list_flows', page: 2, name: 'Leads' }, CREDS, { fetch: fetchFn });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data).toMatchObject({ flows: [{ id: FLOW }], page: { count: 11, currentPage: 2, totalPages: 2 } });
    expect(calls.find((c) => c.method === 'GET')!.url).toBe(`${BASE}/flows?page=2&name=Leads`);
  });

  it('login recusado (422) vira auth_failed e não chama mais nada', async () => {
    const { fetchFn, calls } = fakeAutomatisch({
      'POST /access-tokens': { status: 422, body: { errors: { general: ['Incorrect email or password.'] }, meta: { type: 'ValidationError' } } },
    });
    const r = await runAutomatischOp({ op: 'list_flows' }, CREDS, { fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, code: 'auth_failed' });
    expect(calls).toHaveLength(1);
  });

  it('publicar com passos incompletos vira incomplete_flow; o token é revogado mesmo com erro', async () => {
    const { fetchFn, calls } = fakeAutomatisch({
      'POST /access-tokens': LOGIN,
      [`DELETE /access-tokens/${TOKEN}`]: REVOKE,
      [`PATCH /flows/${FLOW}/status`]: { status: 422, body: { errors: { flow: ['All steps should be completed before updating flow status!'] }, meta: { type: 'incompleteStepsError' } } },
    });
    const r = await runAutomatischOp({ op: 'set_flow_status', flow_id: FLOW, active: true }, CREDS, { fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, code: 'incomplete_flow', status: 422 });
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: `${BASE}/access-tokens/${TOKEN}` });
  });

  it('404, redirecionamento, timeout e resposta fora do formato', async () => {
    const notFound = fakeAutomatisch({ 'POST /access-tokens': LOGIN, [`DELETE /access-tokens/${TOKEN}`]: REVOKE });
    expect(await runAutomatischOp({ op: 'get_flow', flow_id: FLOW }, CREDS, { fetch: notFound.fetchFn })).toMatchObject({ ok: false, code: 'not_found' });

    const redirect = fakeAutomatisch({ 'POST /access-tokens': { status: 302 } });
    expect(await runAutomatischOp({ op: 'list_flows' }, CREDS, { fetch: redirect.fetchFn })).toMatchObject({ ok: false, code: 'redirect_blocked' });

    const timeout: AutomatischFetch = async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
    expect(await runAutomatischOp({ op: 'list_flows' }, CREDS, { fetch: timeout })).toMatchObject({ ok: false, code: 'timeout' });

    const html = fakeAutomatisch({ 'POST /access-tokens': { status: 200, body: '<html>' } });
    expect(await runAutomatischOp({ op: 'list_flows' }, CREDS, { fetch: html.fetchFn })).toMatchObject({ ok: false, code: 'bad_response' });
  });

  it('URL do Cofre inválida nem chega a chamar a rede', async () => {
    const fetchFn = vi.fn() as unknown as AutomatischFetch;
    const r = await runAutomatischOp({ op: 'list_flows' }, { ...CREDS, url: 'http://inseguro.com' }, { fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, code: 'bad_url' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('apaga credenciais que a instância ecoe nos dados (ex.: parâmetros de um passo)', async () => {
    const { fetchFn } = fakeAutomatisch({
      'POST /access-tokens': LOGIN,
      [`DELETE /access-tokens/${TOKEN}`]: REVOKE,
      [`GET /flows/${FLOW}`]: { status: 200, body: flowBody({ name: `fluxo ${CREDS.password}`, steps: [{ id: ACTION, parameters: { header: `Bearer ${TOKEN}` } }] }) },
    });
    const r = await runAutomatischOp({ op: 'get_flow', flow_id: FLOW }, CREDS, { fetch: fetchFn });
    const out = JSON.stringify(r);
    expect(out).not.toContain(CREDS.password);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('[segredo]');
  });

  it('descobre apps, gatilhos, campos e conexões para o modelo montar o fluxo', async () => {
    const { fetchFn } = fakeAutomatisch({
      'POST /access-tokens': LOGIN,
      [`DELETE /access-tokens/${TOKEN}`]: REVOKE,
      'GET /apps': { status: 200, body: { data: [{ key: 'webhook', name: 'Webhook', supportsConnections: false, iconUrl: 'x' }], meta: meta('Object', { isArray: true }) } },
      'GET /apps/webhook/triggers': { status: 200, body: { data: [{ key: 'catchRawWebhook', name: 'Catch raw webhook', description: 'Triggers…' }], meta: meta('Object') } },
      'GET /apps/webhook/triggers/catchRawWebhook/substeps': { status: 200, body: { data: [{ key: 'chooseTrigger', name: 'Set up a trigger', arguments: [{ key: 'workSynchronously', label: 'Wait until flow is done', type: 'dropdown', required: true, options: [{ label: 'Yes', value: true }] }] }], meta: meta('Object') } },
      'GET /apps/slack/connections': { status: 200, body: { data: [{ id: CONN, key: 'slack', formattedData: { screenName: 'Equipe' }, verified: true }], meta: meta('Connection') } },
    });
    const apps = await runAutomatischOp({ op: 'list_apps' }, CREDS, { fetch: fetchFn });
    expect(apps.ok && apps.data).toEqual({ apps: [{ key: 'webhook', name: 'Webhook', supportsConnections: false }] });
    const triggers = await runAutomatischOp({ op: 'app_steps', app_key: 'webhook', kind: 'triggers' }, CREDS, { fetch: fetchFn });
    expect(triggers.ok && triggers.data).toEqual({ triggers: [{ key: 'catchRawWebhook', name: 'Catch raw webhook', description: 'Triggers…' }] });
    const fields = await runAutomatischOp({ op: 'app_fields', app_key: 'webhook', kind: 'triggers', key: 'catchRawWebhook' }, CREDS, { fetch: fetchFn });
    expect(fields.ok && fields.data).toMatchObject({ substeps: [{ arguments: [{ key: 'workSynchronously', required: true, options: [{ label: 'Yes', value: true }] }] }] });
    const conns = await runAutomatischOp({ op: 'list_connections', app_key: 'slack' }, CREDS, { fetch: fetchFn });
    expect(conns.ok && conns.data).toEqual({ connections: [{ id: CONN, screenName: 'Equipe', verified: true }] });
  });
});

describe('scrubSecrets e wantsAutomatisch', () => {
  it('scrubSecrets troca valores (inclusive com aspas) e ignora strings curtas', () => {
    expect(scrubSecrets({ a: 'x "abc"def y' }, ['"abc"def'])).toEqual({ a: 'x [segredo] y' });
    expect(scrubSecrets({ a: 'abc' }, ['ab'])).toEqual({ a: 'abc' });
  });

  it('liga a ferramenta quando a conversa fala de Automatisch, automação ou fluxos', () => {
    expect(wantsAutomatisch(['crie um fluxo no Automatisch'])).toBe(true);
    expect(wantsAutomatisch(['quero uma automação para leads'])).toBe(true);
    expect(wantsAutomatisch([{ tool: 'automatisch', summary: '' }])).toBe(true);
    expect(wantsAutomatisch(['monte meu fluxo de caixa'])).toBe(false);
    expect(wantsAutomatisch(['faça uma imagem de gato'])).toBe(false);
  });

  it('os nomes dos segredos são fixos', () => {
    expect([...AUTOMATISCH_SECRETS]).toEqual(['AUTOMATISCH_URL', 'AUTOMATISCH_EMAIL', 'AUTOMATISCH_PASSWORD']);
  });
});
