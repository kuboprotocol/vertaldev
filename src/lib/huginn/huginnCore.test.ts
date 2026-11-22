import { describe, expect, it } from 'vitest';
import {
  describeHuginnOp, extractCsrfToken, isHuginnWrite, looksLikeWebhookAgent, normalizeHuginnType, normalizeHuginnUrl,
  normalizeScenario, parseHuginnOp, redactOptions, runHuginnOp, wantsHuginn,
} from '../../../supabase/functions/_shared/huginnCore';
import { fakeHuginn, FAKE_BASE } from './fakeHuginn';

describe('parseHuginnOp', () => {
  it('aceita as operações e normaliza ids, tipo e camelCase', () => {
    expect(parseHuginnOp({ op: 'list_agents', page: '2', scenarioId: '3' })).toEqual({ op: 'list_agents', page: 2, scenario_id: 3 });
    expect(parseHuginnOp({ op: 'get_agent', agentId: '7' })).toEqual({ op: 'get_agent', agent_id: 7 });
    expect(parseHuginnOp({ op: 'run_agent', agent_id: 5 })).toEqual({ op: 'run_agent', agent_id: 5 });
    expect(parseHuginnOp({ op: 'set_agent_enabled', agent_id: 5, enabled: 'false' })).toEqual({ op: 'set_agent_enabled', agent_id: 5, enabled: false });
    expect(parseHuginnOp({
      op: 'create_agent', type: 'WebsiteAgent', name: 'Preço\nda loja', options: { url: 'https://x.com' }, schedule: 'every_1h', source_ids: [1, '2', 2],
    })).toEqual({ op: 'create_agent', type: 'Agents::WebsiteAgent', name: 'Preço da loja', options: { url: 'https://x.com' }, schedule: 'every_1h', source_ids: [1, 2] });
  });

  it('recusa entradas ruins e tipos perigosos', () => {
    expect(parseHuginnOp({ op: 'get_agent', agent_id: 'abc' })).toBeNull();
    expect(parseHuginnOp({ op: 'get_agent', agent_id: -1 })).toBeNull();
    expect(parseHuginnOp({ op: 'delete_agent', agent_id: 1 })).toBeNull();
    expect(parseHuginnOp({ op: 'create_agent', type: 'ShellCommandAgent', name: 'x', options: {} })).toBeNull();
    expect(parseHuginnOp({ op: 'create_agent', type: 'rm -rf', name: 'x', options: {} })).toBeNull();
    expect(parseHuginnOp({ op: 'create_agent', type: 'WebsiteAgent', name: 'x', options: [] })).toBeNull();
    expect(parseHuginnOp({ op: 'create_agent', type: 'WebsiteAgent', name: 'x', options: {}, schedule: 'every_3s' })).toBeNull();
    expect(parseHuginnOp({ op: 'create_agent', type: 'WebsiteAgent', name: 'x', options: {}, keep_events_for: 99 })).toBeNull();
    expect(parseHuginnOp({ op: 'import_scenario', scenario: { name: 'x', agents: [{ type: 'Agents::ShellCommandAgent' }] } })).toBeNull();
    expect(parseHuginnOp({ op: 'import_scenario', scenario: { name: 'x', agents: [] } })).toBeNull();
    expect(parseHuginnOp({ op: 'connect_to_automatisch', source_agent_id: 1, flow_id: 'nao-uuid' })).toBeNull();
    // Campos desconhecidos (senha, cookie) são descartados.
    expect(parseHuginnOp({ op: 'status', password: 'x', cookie: 'y' })).toEqual({ op: 'status' });
  });

  it('aceita cenário em texto JSON e a ponte com o Automatisch', () => {
    const op = parseHuginnOp({ op: 'import_scenario', scenario: JSON.stringify({ name: 'C', agents: [{ type: 'ManualEventAgent', name: 'M' }] }) });
    expect(op?.op).toBe('import_scenario');
    const FLOW = '11111111-1111-4111-8111-111111111111';
    expect(parseHuginnOp({ op: 'connect_to_automatisch', sourceAgentId: '4', flowId: FLOW })).toEqual({ op: 'connect_to_automatisch', source_agent_id: 4, flow_id: FLOW });
    expect(parseHuginnOp({ op: 'connect_from_automatisch', step_id: FLOW, data: { a: 1 } })).toEqual({ op: 'connect_from_automatisch', step_id: FLOW, data: '{"a":1}' });
  });

  it('escrita, cartão de permissão e quando ligar no prompt', () => {
    expect(isHuginnWrite({ op: 'list_agents' })).toBe(false);
    expect(isHuginnWrite({ op: 'run_agent', agent_id: 1 })).toBe(true);
    expect(describeHuginnOp({ op: 'run_agent', agent_id: 3 })).toContain('RODAR');
    expect(wantsHuginn(['liste meus agentes do Huginn'])).toBe(true);
    expect(wantsHuginn([{ tool: 'huginn', summary: '' }])).toBe(true);
    expect(wantsHuginn(['qual o clima hoje?'])).toBe(false);
  });
});

describe('utilitários', () => {
  it('normaliza a URL e o tipo', () => {
    expect(normalizeHuginnUrl('https://h.up.railway.app/users/sign_in/')).toBe('https://h.up.railway.app');
    expect(normalizeHuginnUrl('http://h.com')).toBeNull();
    expect(normalizeHuginnUrl('https://u:p@h.com')).toBeNull();
    expect(normalizeHuginnType('Agents::PostAgent')).toBe('Agents::PostAgent');
    expect(normalizeHuginnType('Agents::Post')).toBeNull();
  });

  it('lê o token CSRF da meta ou do formulário', () => {
    expect(extractCsrfToken('<meta name="csrf-token" content="abc+/=" />')).toBe('abc+/=');
    expect(extractCsrfToken('<input type="hidden" name="authenticity_token" value="t1" autocomplete="off" />')).toBe('t1');
    expect(extractCsrfToken('<html></html>')).toBeNull();
  });

  it('oculta opções com nome de segredo em qualquer nível', () => {
    expect(redactOptions({ url: 'u', api_key: 'k', nested: { password: 'p', ok: 1 }, list: [{ token: 't' }] }))
      .toEqual({ url: 'u', api_key: '[oculto]', nested: { password: '[oculto]', ok: 1 }, list: [{ token: '[oculto]' }] });
  });

  it('reconhece um WebhookAgent pelas opções (o JSON do Huginn não traz o tipo)', () => {
    expect(looksLikeWebhookAgent({ options: { secret: 's', payload_path: '$' } })).toBe(true);
    expect(looksLikeWebhookAgent({ options: { secret: 's', post_url: 'https://x' } })).toBe(false);
    expect(looksLikeWebhookAgent({ options: { url: 'https://x' } })).toBe(false);
  });

  it('completa o cenário para o importador do Huginn', () => {
    const s = normalizeScenario({ name: 'C', agents: [{ type: 'ManualEventAgent' }] });
    expect(s.guid).toMatch(/^[0-9a-f]{32}$/);
    expect(s.schema_version).toBe(1);
    const a = (s.agents as Array<Record<string, unknown>>)[0];
    expect(a).toMatchObject({ type: 'Agents::ManualEventAgent', disabled: false, options: {}, name: 'ManualEventAgent' });
    expect(a.guid).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('runHuginnOp (Huginn falso)', () => {
  it('faz o login com CSRF e lista os agentes sem vazar credenciais', async () => {
    const h = fakeHuginn();
    const r = await runHuginnOp({ op: 'list_agents' }, h.creds, { fetch: h.fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ agents: [{ id: 1, name: 'XKCD Source', enabled: true, schedule: 'every_1d', events: 3 }], instance_url: FAKE_BASE });
    const login = h.calls.find((c) => c.method === 'POST' && c.path === '/users/sign_in')!;
    expect(new URLSearchParams(login.body).get('authenticity_token')).toMatch(/^csrf-/);
    expect(new URLSearchParams(login.body).get('user[remember_me]')).toBe('0');
    const s = JSON.stringify(r);
    expect(s).not.toContain(h.creds.password);
    expect(s).not.toContain('sess-');
  });

  it('senha errada = auth_failed', async () => {
    const h = fakeHuginn();
    const r = await runHuginnOp({ op: 'status' }, { ...h.creds, password: 'errada-123' }, { fetch: h.fetch });
    expect(r).toMatchObject({ ok: false, code: 'auth_failed' });
  });

  it('escrita lê um token CSRF novo depois do login e manda com o cookie renovado', async () => {
    const h = fakeHuginn();
    const r = await runHuginnOp({
      op: 'create_agent', type: 'Agents::WebhookAgent', name: 'Recebe', options: { secret: 'segredo-do-webhook', payload_path: '$' },
    }, h.creds, { fetch: h.fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ agent: { id: 100, name: 'Recebe', type: 'WebhookAgent', options: { secret: '[oculto]' } } });
    const post = h.calls.find((c) => c.method === 'POST' && c.path === '/agents.json')!;
    expect(post.headers['X-CSRF-Token']).toMatch(/^csrf-new-/);
    // options vai como JSON em texto, como no formulário do Huginn.
    expect(JSON.parse(post.body!).agent.options).toBe(JSON.stringify({ secret: 'segredo-do-webhook', payload_path: '$' }));
  });

  it('get_agent traz opções ocultas e eventos recentes; enable/disable e run', async () => {
    const h = fakeHuginn();
    const g = await runHuginnOp({ op: 'get_agent', agent_id: 1 }, h.creds, { fetch: h.fetch });
    expect(g.ok && g.data).toMatchObject({ agent: { id: 1, options: { url: 'https://xkcd.com', api_key: '[oculto]' } }, recent_events: [] });
    const d = await runHuginnOp({ op: 'set_agent_enabled', agent_id: 1, enabled: false }, h.creds, { fetch: h.fetch });
    expect(d.ok && d.data).toMatchObject({ agent: { id: 1, enabled: false } });
    expect(JSON.parse(h.calls.find((c) => c.method === 'PUT')!.body!)).toEqual({ agent: { disabled: true } });
    const run = await runHuginnOp({ op: 'run_agent', agent_id: 1 }, h.creds, { fetch: h.fetch });
    expect(run.ok && run.summary).toContain('enfileirada');
    const nf = await runHuginnOp({ op: 'run_agent', agent_id: 999 }, h.creds, { fetch: h.fetch });
    expect(nf).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('send_webhook_event usa o segredo do agente sem devolvê-lo e sem cookie', async () => {
    const h = fakeHuginn({ agents: [{ id: 8, user_id: 1, name: 'Webhook', options: { secret: 'segredo-123456', payload_path: '$', verbs: 'post' } }] });
    const r = await runHuginnOp({ op: 'send_webhook_event', agent_id: 8, payload: { ola: 'vertal' } }, h.creds, { fetch: h.fetch });
    expect(r).toMatchObject({ ok: true, data: { http_status: 201 } });
    expect(h.events[0]).toMatchObject({ agent_id: 8, payload: { ola: 'vertal' } });
    const wh = h.calls.find((c) => c.path.includes('/web_requests/'))!;
    expect(wh.headers.Cookie).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('segredo-123456');
    const notWebhook = fakeHuginn();
    expect(await runHuginnOp({ op: 'send_webhook_event', agent_id: 1, payload: {} }, notWebhook.creds, { fetch: notWebhook.fetch }))
      .toMatchObject({ ok: false, code: 'not_webhook_agent' });
  });

  it('importa cenário completando guid/disabled e lê o id do redirecionamento', async () => {
    const h = fakeHuginn();
    const op = parseHuginnOp({ op: 'import_scenario', scenario: { name: 'Meu cenário', agents: [{ type: 'ManualEventAgent', name: 'M' }] } })!;
    const r = await runHuginnOp(op, h.creds, { fetch: h.fetch });
    expect(r).toMatchObject({ ok: true, data: { scenario_id: 10 } });
  });

  it('URL inválida não chama a rede', async () => {
    const h = fakeHuginn();
    expect(await runHuginnOp({ op: 'status' }, { ...h.creds, url: 'http://x' }, { fetch: h.fetch })).toMatchObject({ ok: false, code: 'bad_url' });
    expect(h.calls).toHaveLength(0);
  });

  it('erro de rede e tempo esgotado viram códigos próprios', async () => {
    const boom = async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
    expect(await runHuginnOp({ op: 'status' }, { url: FAKE_BASE, username: 'a', password: 'b' }, { fetch: boom }))
      .toMatchObject({ ok: false, code: 'timeout' });
  });
});
