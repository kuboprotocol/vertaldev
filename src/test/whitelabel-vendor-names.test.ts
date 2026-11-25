// Marca branca: quem usa o Vertal Chat e o painel de agentes nunca vê o nome dos
// motores por trás do Vertal Agentes e do Vertal Fluxos, nem de provedores de
// hospedagem. Ids internos (ferramentas huginn/automatisch, segredos HUGINN_*/
// AUTOMATISCH_*, nomes no código) continuam iguais; o que é texto para o usuário não.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { connectors } from '@/lib/connectorsConfig';
import { PANEL_LIST } from '@/components/vertal-chat/panelList';
import { actionLabel } from '@/lib/chatAgent/runAction';
import { HUGINN_SETUP_ROUTE } from '@/components/huginn/HuginnAgentsCard';
import { buildAgentSystemPrompt } from '@/lib/chatAgent/contract';
import { BRAND_RULES } from '../../supabase/functions/_shared/chatAgent';
import {
  HUGINN_ERROR_MESSAGES, HUGINN_OPS, describeHuginnOp, summarizeHuginnResult, type HuginnOp,
} from '../../supabase/functions/_shared/huginnCore';
import {
  AUTOMATISCH_ERROR_MESSAGES, AUTOMATISCH_OPS, describeAutomatischOp, summarizeAutomatischResult, type AutomatischOp,
} from '../../supabase/functions/_shared/automatischCore';

/** Nomes que o usuário nunca pode ler. Ids em minúsculas/maiúsculas (huginn, HUGINN_URL) são internos. */
const VENDOR = /\b(Huginn|Automatisch|Railway)\b|railway\.app|automatisch\.io|github\.com\/huginn/;
const clean = (label: string, text: string) => expect(text, label).not.toMatch(VENDOR);

const FLOW = '11111111-1111-4111-8111-111111111111';
const STEP = '22222222-2222-4222-8222-222222222222';
const EXEC = '33333333-3333-4333-8333-333333333333';

const HUGINN_SAMPLES: Record<string, HuginnOp> = {
  status: { op: 'status' },
  list_agents: { op: 'list_agents', page: 2, scenario_id: 1 },
  get_agent: { op: 'get_agent', agent_id: 3 },
  list_events: { op: 'list_events', agent_id: 3, page: 2 },
  list_scenarios: { op: 'list_scenarios' },
  create_agent: { op: 'create_agent', type: 'Agents::WebsiteAgent', name: 'Preço', options: {}, schedule: 'every_1h' },
  import_scenario: { op: 'import_scenario', scenario: { name: 'Cenário', agents: [] } },
  run_agent: { op: 'run_agent', agent_id: 3 },
  set_agent_enabled: { op: 'set_agent_enabled', agent_id: 3, enabled: false },
  send_webhook_event: { op: 'send_webhook_event', agent_id: 3, payload: {} },
  connect_to_automatisch: { op: 'connect_to_automatisch', source_agent_id: 3, flow_id: FLOW },
  connect_from_automatisch: { op: 'connect_from_automatisch', step_id: STEP },
  create_fluxos_agent: { op: 'create_fluxos_agent', app: 'todoist', kind: 'action', key: 'createTask', parameters: { content: '{{ title }}' }, source_ids: [3] },
} as unknown as Record<string, HuginnOp>;

const AUTOMATISCH_SAMPLES: Record<string, AutomatischOp> = {
  list_flows: { op: 'list_flows' },
  get_flow: { op: 'get_flow', flow_id: FLOW },
  create_flow: { op: 'create_flow', name: 'Leads' },
  add_step: { op: 'add_step', flow_id: FLOW, previous_step_id: STEP },
  update_step: { op: 'update_step', step_id: STEP, app_key: 'webhook' },
  test_step: { op: 'test_step', step_id: STEP },
  set_flow_status: { op: 'set_flow_status', flow_id: FLOW, active: true },
  list_executions: { op: 'list_executions' },
  get_execution: { op: 'get_execution', execution_id: EXEC },
  list_apps: { op: 'list_apps', name: 'slack' },
  app_steps: { op: 'app_steps', app_key: 'webhook', kind: 'triggers' },
  app_fields: { op: 'app_fields', app_key: 'webhook', kind: 'triggers', key: 'catchRawWebhook' },
  list_connections: { op: 'list_connections', app_key: 'slack' },
  sync_connection: { op: 'sync_connection', app_key: 'gmail' },
} as unknown as Record<string, AutomatischOp>;

describe('marca branca: Vertal Agentes e Vertal Fluxos', () => {
  it('cobre todas as operações das duas ferramentas', () => {
    expect(Object.keys(HUGINN_SAMPLES).sort()).toEqual([...HUGINN_OPS].sort());
    expect(Object.keys(AUTOMATISCH_SAMPLES).sort()).toEqual([...AUTOMATISCH_OPS].sort());
  });

  it('conectores aparecem como produtos Vertal, sem documentação de fornecedor', () => {
    for (const slug of ['huginn', 'automatisch']) {
      const c = connectors.find((x) => x.slug === slug);
      expect(c, slug).toBeTruthy();
      const { slug: _slug, ...visible } = c as Record<string, unknown>;
      clean(`conector ${slug}`, JSON.stringify(visible));
    }
    expect(connectors.find((c) => c.slug === 'huginn')?.name).toBe('Vertal Agentes');
    expect(connectors.find((c) => c.slug === 'automatisch')?.name).toBe('Vertal Fluxos');
    clean('rota do Cofre', decodeURIComponent(HUGINN_SETUP_ROUTE));
    expect(decodeURIComponent(HUGINN_SETUP_ROUTE)).toContain('name=Vertal Agentes URL');
  });

  it('painel de habilidades, cartões de permissão e rótulos de progresso', () => {
    clean('painéis', JSON.stringify(PANEL_LIST.map((p) => [p.label, p.hint])));
    for (const [name, op] of Object.entries(HUGINN_SAMPLES)) {
      clean(`describeHuginnOp ${name}`, describeHuginnOp(op));
      clean(`label huginn ${name}`, actionLabel({ tool: 'huginn', ...op } as never));
      clean(`resumo huginn ${name}`, summarizeHuginnResult(op, { instance_url: 'https://h.up.railway.app', agents: [], scenarios: [], events: [] }));
    }
    for (const [name, op] of Object.entries(AUTOMATISCH_SAMPLES)) {
      clean(`describeAutomatischOp ${name}`, describeAutomatischOp(op));
      clean(`label automatisch ${name}`, actionLabel({ tool: 'automatisch', ...op } as never));
      clean(`resumo automatisch ${name}`, summarizeAutomatischResult(op, { flows: [], executions: [], apps: [], connections: [] }));
    }
  });

  it('mensagens de erro', () => {
    for (const [code, msg] of Object.entries(HUGINN_ERROR_MESSAGES)) clean(`huginn ${code}`, msg);
    for (const [code, msg] of Object.entries(AUTOMATISCH_ERROR_MESSAGES)) clean(`automatisch ${code}`, msg);
    expect(HUGINN_ERROR_MESSAGES.missing_secrets).toContain('Vertal Agentes');
    expect(AUTOMATISCH_ERROR_MESSAGES.missing_secrets).toContain('Vertal Fluxos');
  });

  it('o prompt do chat não cita os motores e manda não citar', () => {
    for (const ctx of [{ huginn: true }, { automatisch: true }, { huginn: true, automatisch: true }]) {
      const prompt = buildAgentSystemPrompt({ secretNames: [], ...ctx });
      clean(`prompt ${JSON.stringify(ctx)}`, prompt);
      expect(prompt).toContain(BRAND_RULES);
    }
    expect(BRAND_RULES).toMatch(/Nunca cite/);
    expect(buildAgentSystemPrompt({ secretNames: [] })).not.toContain(BRAND_RULES);
  });

  it('textos literais dos arquivos da integração não citam fornecedores', () => {
    const files = [
      'src/components/huginn/HuginnAgentsCard.tsx',
      'src/components/huginn/FluxosAgentBuilder.tsx',
      'src/components/vertal-chat/panelList.ts',
      'src/lib/huginn/client.ts',
      'src/lib/automatisch/client.ts',
      'src/lib/connectorsConfig.ts',
      'supabase/functions/_shared/huginnCore.ts',
      'supabase/functions/_shared/huginnBridge.ts',
      'supabase/functions/_shared/agentesFluxos.ts',
      'supabase/functions/_shared/automatischCore.ts',
    ];
    for (const f of files) {
      const lines = readFileSync(resolve(process.cwd(), f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const t = line.trim();
        if (/^(\/\/|\*|\/\*|import\b)/.test(t)) return;
        const code = line.replace(/\s\/\/\s.*$/, '');
        // Conteúdo de strings e texto de JSX (entre > e <).
        const pieces = [...code.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m.slice(1).join(''));
        for (const p of pieces) clean(`${f}:${i + 1}`, p);
      });
    }
  });
});
