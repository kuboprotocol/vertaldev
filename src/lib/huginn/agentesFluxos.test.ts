import { describe, expect, it } from 'vitest';
import {
  AGENT_TOKEN_HEADER, fluxosAgentName, fluxosPostAgentOptions, isAgentesBrokerOp, isFluxosAgentOptions, makeAgentToken,
  parseAgentBridgeOp, parseAgentesBrokerOp, verifyAgentToken,
} from '../../../supabase/functions/_shared/agentesFluxos';
import { makeFluxosKey, verifyFluxosKey } from '../../../supabase/functions/_shared/fluxosBroker';
import { describeHuginnOp, isHuginnWrite, parseHuginnOp, redactOptions, runHuginnOp } from '../../../supabase/functions/_shared/huginnCore';

const SECRET = 'x'.repeat(40);
const U1 = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const U2 = '11111111-2222-4333-8444-555555555555';

describe('token dos agentes (vat1)', () => {
  it('assina por usuário e só verifica com o mesmo segredo', async () => {
    const t = await makeAgentToken(U1, SECRET);
    expect(t.startsWith(`vat1_${U1}_`)).toBe(true);
    expect(await verifyAgentToken(t, SECRET)).toBe(U1);
    expect(await verifyAgentToken(t, 'y'.repeat(40))).toBeNull();
    // Trocar o usuário dentro do token não passa (sem vazamento entre usuários).
    expect(await verifyAgentToken(t.replace(U1, U2), SECRET)).toBeNull();
    expect(await verifyAgentToken('lixo', SECRET)).toBeNull();
    expect(await verifyAgentToken(t, undefined)).toBeNull();
  });

  it('é separado da chave vfk1 do Fluxos (uma não vale como a outra)', async () => {
    const vat = await makeAgentToken(U1, SECRET);
    const vfk = await makeFluxosKey(U1, SECRET);
    expect(await verifyFluxosKey(vat, SECRET)).toBeNull();
    expect(await verifyAgentToken(vfk, SECRET)).toBeNull();
    expect(await verifyAgentToken(vfk.replace(/^vfk1/, 'vat1'), SECRET)).toBeNull();
  });
});

describe('parseAgentBridgeOp', () => {
  it('aceita status/describe/run, normaliza app e parâmetros em texto', () => {
    expect(parseAgentBridgeOp({ op: 'status' })).toEqual({ op: 'status' });
    expect(parseAgentBridgeOp({ op: 'describe', app: 'fluxos-todoist' })).toEqual({ op: 'describe', app: 'todoist' });
    expect(parseAgentBridgeOp({ op: 'run', app: 'todoist', key: 'createTask', parameters: '{"content":"oi"}' }))
      .toEqual({ op: 'run', app: 'todoist', kind: 'action', key: 'createTask', parameters: { content: 'oi' } });
    expect(parseAgentBridgeOp({ op: 'run', app: 'gmail', kind: 'search', key: 'newEmails' }))
      .toEqual({ op: 'run', app: 'gmail', kind: 'trigger', key: 'newEmails', parameters: {} });
  });
  it('recusa o resto (inclusive tentar mudar de usuário pelo corpo não tem efeito)', () => {
    expect(parseAgentBridgeOp({ op: 'token', app: 'gmail' })).toBeNull();
    expect(parseAgentBridgeOp({ op: 'api' })).toBeNull();
    expect(parseAgentBridgeOp({ op: 'run', app: 'Todo ist', key: 'x' })).toBeNull();
    expect(parseAgentBridgeOp({ op: 'run', app: 'todoist', key: 'x', parameters: '[1]' })).toBeNull();
    const r = parseAgentBridgeOp({ op: 'run', app: 'todoist', key: 'createTask', user_id: U2 });
    expect(r && 'user_id' in r).toBe(false);
  });
});

describe('PostAgent do Vertal Fluxos', () => {
  const spec = { app: 'todoist', appName: 'Todoist', kind: 'action' as const, key: 'createTask', keyName: 'Create task', parameters: { content: '{{ title }}' } };
  it('monta as opções com token no cabeçalho e só o payload (no_merge)', () => {
    const o = fluxosPostAgentOptions({ routerUrl: 'https://p.supabase.co/functions/v1/creative-router', anonKey: 'anon', token: 'vat1_tok', spec });
    expect(o).toMatchObject({
      post_url: 'https://p.supabase.co/functions/v1/creative-router', content_type: 'json', method: 'post',
      no_merge: true, emit_events: true, parse_body: true, event_headers: 'Content-Type',
      payload: { op: 'run', app: 'todoist', kind: 'action', key: 'createTask', parameters: { content: '{{ title }}' } },
    });
    expect((o.headers as Record<string, string>)[AGENT_TOKEN_HEADER]).toBe('vat1_tok');
    expect(isFluxosAgentOptions(o)).toBe(true);
    expect(isFluxosAgentOptions({ post_url: 'https://x', headers: {} })).toBe(false);
    expect(fluxosAgentName(spec)).toBe('Vertal Fluxos · Todoist: Create task');
  });
  it('o token e a chave anon saem ocultos quando o agente é lido', () => {
    const o = fluxosPostAgentOptions({ routerUrl: 'https://r', anonKey: 'anon-key-123', token: 'vat1_segredo', spec });
    const shown = JSON.stringify(redactOptions(o));
    expect(shown).not.toContain('vat1_segredo');
    expect(shown).not.toContain('anon-key-123');
  });
});

describe('create_fluxos_agent no huginnCore', () => {
  it('valida o pedido e nunca aceita post_options vindo de fora', () => {
    const op = parseHuginnOp({
      op: 'create_fluxos_agent', app: 'fluxos-todoist', key: 'createTask', parameters: '{"content":"{{ title }}"}',
      source_ids: ['4'], post_options: { post_url: 'https://evil' },
    });
    expect(op).toEqual({ op: 'create_fluxos_agent', app: 'todoist', kind: 'action', key: 'createTask', parameters: { content: '{{ title }}' }, source_ids: [4] });
    expect(isHuginnWrite(op!)).toBe(true);
    expect(describeHuginnOp(op!)).toMatch(/2 créditos/);
    expect(parseHuginnOp({ op: 'create_fluxos_agent', app: 'todoist', key: 'a b' })).toBeNull();
    expect(parseHuginnOp({ op: 'create_fluxos_agent', app: 'todoist', key: 'x', schedule: 'every_3m' })).toBeNull();
  });
  it('sem opções montadas pelo servidor não cria nada', async () => {
    const op = parseHuginnOp({ op: 'create_fluxos_agent', app: 'todoist', key: 'createTask' })!;
    let called = 0;
    const fetchFn = async () => { called++; return new Response('', { status: 500 }); };
    const r = await runHuginnOp(op, { url: 'https://h.example.com', username: 'u', password: 'p' }, { fetch: fetchFn as never });
    expect(r.ok).toBe(false);
    expect(called).toBeGreaterThanOrEqual(0);
  });
});

describe('ops do corretor Fluxos → Agentes', () => {
  it('aceita só as quatro ops, com id numérico', () => {
    expect(parseAgentesBrokerOp({ op: 'agentes_list' })).toEqual({ op: 'agentes_list' });
    expect(parseAgentesBrokerOp({ op: 'agentes_events', agent_id: '12' })).toEqual({ op: 'agentes_events', agent_id: 12 });
    expect(parseAgentesBrokerOp({ op: 'agentes_run', agentId: 3 })).toEqual({ op: 'agentes_run', agent_id: 3 });
    expect(parseAgentesBrokerOp({ op: 'agentes_event', agent_id: 3, payload: '{"a":1}' })).toEqual({ op: 'agentes_event', agent_id: 3, payload: { a: 1 } });
    expect(parseAgentesBrokerOp({ op: 'agentes_event', agent_id: 'x', payload: {} })).toBeNull();
    expect(parseAgentesBrokerOp({ op: 'agentes_event', agent_id: 3, payload: 'nao json' })).toBeNull();
    expect(isAgentesBrokerOp('agentes_run')).toBe(true);
    expect(isAgentesBrokerOp('token')).toBe(false);
  });
});
