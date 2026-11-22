import { describe, expect, it } from 'vitest';
import { runHuginnBridge, isFlowWebhookUrl, httpRequestParameters, postAgentOptions } from '../../../supabase/functions/_shared/huginnBridge';
import type { AutomatischFetch } from '../../../supabase/functions/_shared/automatischCore';
import { fakeHuginn, FAKE_BASE } from './fakeHuginn';

const FLOW = '11111111-1111-4111-8111-111111111111';
const TRIGGER = '22222222-2222-4222-8222-222222222222';
const ACTION = '33333333-3333-4333-8333-333333333333';
const ABASE = 'https://automatisch.example.com';
const ACREDS = { url: ABASE, email: 'eu@vertal.dev', password: 'senha-automatisch' };

/** Automatisch falso: login, get_flow e update_step (o resto 404). */
function fakeAutomatisch(opts: { webhook?: boolean; active?: boolean; login?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: string }> = [];
  const res = (status: number, v: unknown) => ({ status, ok: status < 300, text: async () => (v === undefined ? '' : JSON.stringify(v)) });
  const fetch: AutomatischFetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, body: init.body });
    if (u.pathname.endsWith('/access-tokens') && init.method === 'POST') {
      return opts.login === false ? res(422, { errors: { general: ['Incorrect email or password.'] } }) : res(200, { data: { token: 'tok-automatisch-123' } });
    }
    if (init.method === 'DELETE') return res(204, undefined);
    if (u.pathname.endsWith(`/flows/${FLOW}`)) {
      return res(200, { data: { id: FLOW, name: 'Avisar no Slack', active: !!opts.active, steps: [
        { id: TRIGGER, type: 'trigger', appKey: opts.webhook === false ? 'scheduler' : 'webhook', key: 'catchRawWebhook', webhookUrl: opts.webhook === false ? null : `${ABASE}/webhooks/flows/${FLOW}` },
        { id: ACTION, type: 'action', appKey: null, key: null },
      ] } });
    }
    if (u.pathname.endsWith(`/steps/${ACTION}`) && init.method === 'PATCH') {
      const b = JSON.parse(init.body ?? '{}');
      return res(200, { data: { id: ACTION, type: 'action', appKey: b.appKey, key: b.key, status: 'incomplete', parameters: b.parameters } });
    }
    return res(404, {});
  };
  return { fetch, calls };
}

describe('ponte Huginn ↔ Automatisch', () => {
  it('URL do gatilho precisa ser https e do mesmo fluxo', () => {
    expect(isFlowWebhookUrl(`${ABASE}/webhooks/flows/${FLOW}`, FLOW)).toBe(true);
    expect(isFlowWebhookUrl(`${ABASE}/webhooks/flows/${FLOW}/sync`, FLOW)).toBe(true);
    expect(isFlowWebhookUrl(`http://x/webhooks/flows/${FLOW}`, FLOW)).toBe(false);
    expect(isFlowWebhookUrl(`${ABASE}/webhooks/flows/${TRIGGER}`, FLOW)).toBe(false);
    expect(postAgentOptions('https://x')).toMatchObject({ post_url: 'https://x', content_type: 'json', no_merge: false });
    expect(httpRequestParameters('https://y')).toMatchObject({ method: 'POST', url: 'https://y', headers: [{ key: 'Content-Type', value: 'application/json' }] });
  });

  it('connect_to_automatisch cria um PostAgent ligado ao agente de origem e à URL do webhook', async () => {
    const h = fakeHuginn();
    const a = fakeAutomatisch();
    const r = await runHuginnBridge({ op: 'connect_to_automatisch', source_agent_id: 1, flow_id: FLOW }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const created = h.agents.find((x) => x.id === 100)!;
    expect(created).toMatchObject({ name: 'Vertal Agentes → Vertal Fluxos: Avisar no Slack', schedule: 'never', source_ids: [1] });
    expect((created.options as Record<string, unknown>).post_url).toBe(`${ABASE}/webhooks/flows/${FLOW}`);
    expect(JSON.parse(h.calls.find((c) => c.path === '/agents.json' && c.method === 'POST')!.body!).agent.type).toBe('Agents::PostAgent');
    expect(r.data).toMatchObject({ automatisch_flow: { id: FLOW, published: false }, post_agent: { id: 100 } });
    expect(String((r.data as { next: string }).next)).toContain('rascunho');
    expect(JSON.stringify(r)).not.toMatch(/tok-automatisch|senha-automatisch|senha-forte/);
  });

  it('fluxo sem gatilho webhook não cria nada no Huginn', async () => {
    const h = fakeHuginn();
    const a = fakeAutomatisch({ webhook: false });
    const r = await runHuginnBridge({ op: 'connect_to_automatisch', source_agent_id: 1, flow_id: FLOW }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(r).toMatchObject({ ok: false, code: 'flow_without_webhook' });
    expect(h.agents).toHaveLength(1);
  });

  it('login do Automatisch recusado vira automatisch_failed com o motivo', async () => {
    const h = fakeHuginn();
    const a = fakeAutomatisch({ login: false });
    const r = await runHuginnBridge({ op: 'connect_to_automatisch', source_agent_id: 1, flow_id: FLOW }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(r).toMatchObject({ ok: false, code: 'automatisch_failed' });
    if (!r.ok) expect(r.message).toContain('recusou o login');
  });

  it('connect_from_automatisch cria o WebhookAgent e configura o passo HTTP sem devolver o segredo', async () => {
    const h = fakeHuginn();
    const a = fakeAutomatisch();
    const r = await runHuginnBridge({ op: 'connect_from_automatisch', step_id: ACTION, data: '{"msg":"{{step.x.y}}"}' }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const webhook = h.agents.find((x) => x.id === 100)!;
    const secret = (webhook.options as Record<string, string>).secret;
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    const patch = JSON.parse(a.calls.find((c) => c.method === 'PATCH')!.body!);
    expect(patch).toMatchObject({ appKey: 'http-request', key: 'customRequest', parameters: { method: 'POST', data: '{"msg":"{{step.x.y}}"}', url: `${FAKE_BASE}/users/1/web_requests/100/${secret}` } });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.data).toMatchObject({ webhook_url: `${FAKE_BASE}/users/1/web_requests/100/[segredo]`, webhook_agent: { id: 100, created: true } });
    // O Automatisch chamando a URL vira evento no Huginn (o fake aceita o segredo certo).
    const res = await h.fetch(patch.parameters.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ok":1}' });
    expect(res.status).toBe(201);
  });

  it('reusa um WebhookAgent existente e recusa agente que não é webhook', async () => {
    const h = fakeHuginn({ agents: [
      { id: 1, user_id: 1, name: 'XKCD', options: { url: 'https://xkcd.com' } },
      { id: 9, user_id: 1, name: 'Hook', options: { secret: 'segredo-existente-9', payload_path: '$', verbs: 'post' } },
    ] });
    const a = fakeAutomatisch();
    const ok = await runHuginnBridge({ op: 'connect_from_automatisch', step_id: ACTION, webhook_agent_id: 9 }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(ok.ok && ok.data).toMatchObject({ webhook_agent: { id: 9, created: false } });
    expect(JSON.stringify(ok)).not.toContain('segredo-existente-9');
    const bad = await runHuginnBridge({ op: 'connect_from_automatisch', step_id: ACTION, webhook_agent_id: 1 }, { huginn: h.creds, automatisch: ACREDS }, { huginnFetch: h.fetch, automatischFetch: a.fetch });
    expect(bad).toMatchObject({ ok: false, code: 'not_webhook_agent' });
  });
});
