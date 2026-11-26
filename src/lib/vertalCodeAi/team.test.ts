import { describe, expect, it } from 'vitest';
import type { ModelReply } from '../../../supabase/functions/_shared/vertalCodeAi/core';
import type { VcaChatMessage } from '../../../supabase/functions/_shared/vertalCodeAi/router';
import {
  assignTasks,
  expandTeamEnv,
  isVcaTeamEnabled,
  isVcaTeamMemoryEnabled,
  isVcaTeamSandboxEnabled,
  parseGerente,
  parseRevisor,
  runVertalTeam,
  teamBudgetFromEnv,
  VcaBudgetError,
  VcaBudgetGuard,
  type TeamDeps,
  type TeamRunInput,
  type VcaTeamEvent,
} from '../../../supabase/functions/_shared/vertalCodeAi/team';
import type { DecideFn, DecisionAnswer, DecisionResult } from '../../../supabase/functions/_shared/vertalCodeAi/decide';

const U = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const reply = (content: unknown, label = 'Vertal Própria 2', cost = 'self_hosted'): ModelReply => ({
  content: typeof content === 'string' ? content : JSON.stringify(content),
  label,
  cost,
  fellBack: false,
});

const text = (msgs: VcaChatMessage[]) => msgs.map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join(' '))).join('\n');
const sys = (msgs: VcaChatMessage[]) => (typeof msgs[0].content === 'string' ? msgs[0].content : '');

const PROJECT: Record<string, string> = {
  'src/App.tsx': "import { Header } from './components/Header';\nexport default function App() { return <Header />; }\n",
  'src/components/Header.tsx': 'export function Header() { return <h1>Oi</h1>; }\n',
  'src/lib/price.ts': 'export const price = (n: number) => n * 2;\n',
};

/** Fakes de modelo: coordenação responde pelo papel (prompt do sistema), Engenheiros pelo número. */
function makeDeps(over: Partial<TeamDeps> & { engineer?: (msgs: VcaChatMessage[], n: number) => unknown; revisor?: unknown; gerente?: unknown } = {}) {
  const events: VcaTeamEvent[] = [];
  const calls = { coordinator: [] as string[], engineer: [] as number[] };
  const remembered: Array<{ drafts: unknown[]; summary: string | null }> = [];
  const deps: TeamDeps = {
    callCoordinator: async (msgs) => {
      const s = sys(msgs);
      if (s.includes('GERENTE')) {
        calls.coordinator.push('gerente');
        return reply(
          over.gerente ?? {
            summary: 'Duas partes',
            goal: 'Cabeçalho com preço',
            tasks: [
              { title: 'Atualizar cabeçalho', detail: 'mostrar título', files: ['src/components/Header.tsx'] },
              { title: 'Ajustar preço', detail: 'desconto', files: ['src/lib/price.ts'] },
            ],
            risks: ['nenhum'],
            questions: [],
          },
        );
      }
      if (s.includes('REVISOR')) {
        calls.coordinator.push('revisor');
        return reply(over.revisor ?? { approved: true, issues: [], notes: 'ok' });
      }
      if (s.includes('ENTREGADOR')) {
        calls.coordinator.push('entregador');
        return reply({ summary: 'Feito: cabeçalho e preço.', projectSummary: 'App com cabeçalho e preço com desconto.', memory: [{ kind: 'decision', content: 'Preço usa desconto fixo de 10%', importance: 4 }, { kind: 'note', content: 'sk-or-v1-abcdefabcdefabcdefabcdefabcdef0123456789' }] });
      }
      if (text(msgs).includes('ENGENHEIRO')) {
        // Engenheiro no modelo rápido (decisão "padrão" confiante).
        const n = Number(/ENGENHEIRO (\d)/.exec(text(msgs))?.[1] ?? 1);
        calls.engineer.push(n);
        return reply(over.engineer ? over.engineer(msgs, n) : defaultEngineer(n));
      }
      calls.coordinator.push('outro');
      return reply({ final: true, summary: 'ok', actions: [] });
    },
    callEngineer: async (msgs) => {
      const n = Number(/ENGENHEIRO (\d)/.exec(text(msgs))?.[1] ?? 1);
      calls.engineer.push(n);
      return reply(over.engineer ? over.engineer(msgs, n) : defaultEngineer(n), 'Vertal Code · Pro', 'paid');
    },
    listPaths: async () => Object.keys(PROJECT),
    readFile: async (p) => PROJECT[p],
    indexSource: async () => Object.entries(PROJECT).map(([path, content]) => ({ path, content })),
    memory: {
      retrieve: async () => ({ available: true, memories: [{ id: 'm1', scope: 'user', kind: 'preference', content: 'Prefere Tailwind', importance: 4, project_id: null }], projectSummary: 'App de vendas', usedEmbeddings: true }),
      remember: async (drafts, summary) => {
        remembered.push({ drafts, summary });
        return drafts.length;
      },
    },
    emit: (e) => events.push(e),
    budget: new VcaBudgetGuard({ maxCalls: 16, maxTokens: 500_000, maxMs: 140_000, maxDecisions: 8 }),
    ...over,
  };
  return { deps, events, calls, remembered };
}

function defaultEngineer(n: number) {
  if (n === 1) return { summary: 'Cabeçalho', final: true, actions: [{ type: 'write_file', path: 'src/components/Header.tsx', content: 'export function Header() { return <h1>Loja Vertal</h1>; }\n' }] };
  return { summary: 'Preço', final: true, actions: [{ type: 'write_file', path: 'src/lib/price.ts', content: 'export const price = (n: number) => n * 2 * 0.9;\n' }] };
}

const input = (over: Partial<TeamRunInput> = {}): TeamRunInput => ({ mode: 'build', effort: 'auto', prompt: 'Mude o cabeçalho para Loja Vertal e aplique 10% de desconto no preço', runId: 'run-1', ...over });

const answer = (a: Partial<DecisionAnswer> & Pick<DecisionAnswer, 'type' | 'value'>): DecisionAnswer => ({ confidence: 0.95, tier: 'act', ...a });
/** Vertal Decide falso: responde cada chave com o que o teste mandar (padrão: neutro em "sobe"). */
function fakeDecide(map: Record<string, DecisionAnswer>, log: string[] = []): DecideFn {
  return async (_state, questions): Promise<DecisionResult> => {
    const answers: Record<string, DecisionAnswer> = {};
    for (const k of Object.keys(questions)) {
      log.push(k);
      if (map[k]) answers[k] = map[k];
    }
    return { source: 'own', answers, ms: 3 };
  };
}

const roles = (events: VcaTeamEvent[]) => events.filter((e): e is Extract<VcaTeamEvent, { kind: 'role' }> => e.kind === 'role');

describe('Equipe Vertal · interruptor (desligado por padrão)', () => {
  const base = { VERTAL_CODE_AI_ENABLED: 'true' };
  it('sem flag ou sem lista própria = ninguém', () => {
    expect(isVcaTeamEnabled(base, U)).toBe(false);
    expect(isVcaTeamEnabled({ ...base, VERTAL_CODE_AI_TEAM_ENABLED: 'true' }, U)).toBe(false); // lista vazia = ninguém
    expect(isVcaTeamEnabled({ ...base, VERTAL_CODE_AI_TEAM_ENABLED: 'true', VERTAL_CODE_AI_TEAM_USER_IDS: OTHER }, U)).toBe(false);
  });
  it('liga só para o usuário da lista e só se o VERTAL Code AI já o libera', () => {
    const e = { ...base, VERTAL_CODE_AI_TEAM_ENABLED: 'true', VERTAL_CODE_AI_TEAM_USER_IDS: `${U}, ${OTHER}` };
    expect(isVcaTeamEnabled(e, U)).toBe(true);
    expect(isVcaTeamEnabled({ ...e, VERTAL_CODE_AI_USER_IDS: OTHER }, U)).toBe(false); // lista geral intocada manda
    expect(isVcaTeamEnabled({ ...e, VERTAL_CODE_AI_ENABLED: 'false' }, U)).toBe(false);
    expect(isVcaTeamEnabled(e, null)).toBe(false);
  });
  it('aceita as chaves da Equipe e do Vertal Decide dentro do VERTAL_GPU_CONFIG, sem tocar em mais nada', () => {
    const e = expandTeamEnv({
      ...base,
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_CODE_AI_TEAM_ENABLED: true, VERTAL_CODE_AI_TEAM_USER_IDS: U, VERTAL_DECIDE_URL: 'https://d.example', VERTAL_CODE_AI_USER_IDS: OTHER, VERTAL_CODE_AI_ALLOW_PAID: 'true' }),
    });
    expect(isVcaTeamEnabled(e, U)).toBe(true);
    expect(e.VERTAL_DECIDE_URL).toBe('https://d.example');
    expect(e.VERTAL_CODE_AI_USER_IDS).toBeUndefined();
    expect(e.VERTAL_CODE_AI_ALLOW_PAID).toBeUndefined();
    // segredo avulso vence
    expect(expandTeamEnv({ VERTAL_CODE_AI_TEAM_MAX_CALLS: '5', VERTAL_GPU_CONFIG: '{"VERTAL_CODE_AI_TEAM_MAX_CALLS":"9"}' }).VERTAL_CODE_AI_TEAM_MAX_CALLS).toBe('5');
    expect(expandTeamEnv({ VERTAL_GPU_CONFIG: 'not json' }).VERTAL_GPU_CONFIG).toBe('not json');
  });
  it('memória ligada por padrão com a Equipe; sandbox só com flag + chave', () => {
    expect(isVcaTeamMemoryEnabled({})).toBe(true);
    expect(isVcaTeamMemoryEnabled({ VERTAL_CODE_AI_TEAM_MEMORY: 'false' })).toBe(false);
    expect(isVcaTeamSandboxEnabled({ VERTAL_CODE_AI_TEAM_E2B: 'true' })).toBe(false);
    expect(isVcaTeamSandboxEnabled({ VERTAL_CODE_AI_TEAM_E2B: 'true', E2B_API_KEY: 'k' })).toBe(true);
  });
});

describe('Encarregado · assignTasks (sem dois Engenheiros no mesmo arquivo)', () => {
  it('junta tarefas que dividem arquivo e respeita o máximo de Engenheiros', () => {
    const a = assignTasks(
      [
        { title: 'A', detail: '', files: ['a.ts', 'b.ts'] },
        { title: 'B', detail: '', files: ['b.ts'] },
        { title: 'C', detail: '', files: ['c.ts'] },
        { title: 'D', detail: '', files: ['d.ts'] },
        { title: 'E', detail: '', files: [] },
        { title: 'F', detail: '', files: [] },
      ],
      3,
    );
    expect(a).toHaveLength(3);
    const all = a.flatMap((x) => x.files);
    expect(new Set(all).size).toBe(all.length); // nenhum arquivo em dois Engenheiros
    expect(a.find((x) => x.files.includes('a.ts'))!.files).toContain('b.ts');
    expect(a.map((x) => x.agent)).toEqual([1, 2, 3]);
  });
  it('vazio → nenhum; 1 Engenheiro → tudo junto', () => {
    expect(assignTasks([], 3)).toEqual([]);
    expect(assignTasks([{ title: 'A', detail: '', files: ['a'] }, { title: 'B', detail: '', files: ['b'] }], 1)).toHaveLength(1);
  });
});

describe('parse do Gerente e do Revisor', () => {
  it('Gerente: tarefas com arquivos seguros; ilegível = null', () => {
    const g = parseGerente(JSON.stringify({ goal: 'x', tasks: [{ title: 'T', files: ['src/a.ts', '../etc/passwd', '.env'] }, 'Passo solto'] }));
    expect(g!.tasks[0].files).toEqual(['src/a.ts']);
    expect(g!.tasks[1].title).toBe('Passo solto');
    expect(parseGerente('blá')).toBeNull();
  });
  it('Revisor: só vale problema em arquivo que mudou', () => {
    const r = parseRevisor(JSON.stringify({ approved: false, issues: [{ path: 'src/a.ts', problem: 'bug' }, { path: 'src/z.ts', problem: 'fora' }] }), new Set(['src/a.ts']));
    expect(r!.issues).toEqual([{ path: 'src/a.ts', problem: 'bug' }]);
    expect(r!.approved).toBe(false);
    expect(parseRevisor(JSON.stringify({ approved: true, issues: [] }), new Set())!.approved).toBe(true);
  });
});

describe('Orçamento por execução', () => {
  it('recusa chamada além do máximo de chamadas, tokens ou tempo', () => {
    let now = 0;
    const g = new VcaBudgetGuard({ maxCalls: 2, maxTokens: 100, maxMs: 1_000 }, () => now);
    const m: VcaChatMessage[] = [{ role: 'user', content: 'x'.repeat(35) }]; // 10 tokens
    g.check(m, 0);
    g.check(m, 0);
    expect(() => g.check(m, 0)).toThrow(VcaBudgetError);
    const t = new VcaBudgetGuard({ maxCalls: 9, maxTokens: 15, maxMs: 1_000 }, () => now);
    t.check(m, 0);
    expect(() => t.check(m, 0)).toThrow('vca_budget_tokens');
    const c = new VcaBudgetGuard({ maxCalls: 9, maxTokens: 999, maxMs: 1_000 }, () => now);
    now = 900;
    expect(() => c.check(m, 200)).toThrow('vca_budget_time');
    expect(c.snapshot().stopped).toBe(true);
  });
  it('lê do ambiente com tetos', () => {
    expect(teamBudgetFromEnv({}, 140_000)).toEqual({ maxCalls: 16, maxDecisions: 8, maxTokens: 200_000, maxMs: 140_000 });
    expect(teamBudgetFromEnv({ VERTAL_CODE_AI_TEAM_MAX_CALLS: '999', VERTAL_CODE_AI_TEAM_MAX_MS: '500000' }, 140_000).maxCalls).toBe(60);
    expect(teamBudgetFromEnv({ VERTAL_CODE_AI_TEAM_MAX_MS: '500000' }, 140_000).maxMs).toBe(140_000);
  });
});

describe('runVertalTeam · fluxo completo com modelos falsos', () => {
  it('Pensa → Constrói (2 Engenheiros em paralelo) → Entrega, com progresso por papel, diffs, pacote e memória', async () => {
    const { deps, events, calls, remembered } = makeDeps();
    const res = await runVertalTeam(input(), deps);

    expect(calls.coordinator).toEqual(['gerente', 'revisor', 'entregador']);
    expect(calls.engineer.sort()).toEqual([1, 2]);
    expect(res.changes.map((c) => c.path).sort()).toEqual(['src/components/Header.tsx', 'src/lib/price.ts']);
    expect(res.verified).toBe(true);
    // núcleos na ordem
    expect(events.filter((e) => e.kind === 'core').map((e) => `${(e as { core: string }).core}:${(e as { state: string }).state}`)).toEqual([
      'pensa:start', 'pensa:done', 'constroi:start', 'constroi:done', 'entrega:start', 'entrega:done',
    ]);
    // os 5 papéis aparecem, com rótulos pt-BR
    const labels = new Set(roles(events).map((r) => r.label));
    for (const l of ['Gerente', 'Encarregado', 'Engenheiro 1', 'Engenheiro 2', 'Revisor/QA', 'Entregador']) expect(labels).toContain(l);
    // nenhum nome de fornecedor nos eventos
    expect(JSON.stringify(events)).not.toMatch(/openrouter|qwen|deepseek|gemini|groq|typesafe|jev/i);
    // diffs no mesmo formato do modo de sempre (o botão Aplicar funciona igual)
    const diffs = events.filter((e) => e.kind === 'diff');
    expect(diffs).toHaveLength(2);
    const pkg = events.find((e) => e.kind === 'package') as Extract<VcaTeamEvent, { kind: 'package' }>;
    expect(pkg.verified).toBe(true);
    expect(pkg.checks).toEqual({ static: 'ok', sandbox: 'not_available', review: 'approved' });
    expect(events.find((e) => e.kind === 'reply')).toEqual({ kind: 'reply', text: 'Feito: cabeçalho e preço.' });
    expect(events.at(-1)).toEqual({ kind: 'done', files: 2, verified: true });
    // memória: usou a do usuário e guardou a decisão (o "segredo" foi barrado) + resumo do projeto mesclado
    expect(events.find((e) => e.kind === 'memory' && (e as { used: number }).used > 0)).toBeTruthy();
    expect(remembered).toHaveLength(1);
    const contents = (remembered[0].drafts as Array<{ content: string }>).map((d) => d.content);
    expect(contents).toContain('Preço usa desconto fixo de 10%');
    expect(contents.join(' ')).not.toContain('sk-or-v1');
    expect(remembered[0].summary).toContain('App de vendas');
    expect(remembered[0].summary).toContain('desconto');
    // a memória chega ao Gerente
    const budget = events.find((e) => e.kind === 'budget') as Extract<VcaTeamEvent, { kind: 'budget' }>;
    expect(budget.calls).toBe(5);
    expect(budget.stopped).toBe(false);
  });

  it('Engenheiro que mexe no arquivo de outro tem essa edição descartada', async () => {
    const { deps, events } = makeDeps({
      engineer: (_m, n) =>
        n === 1
          ? { summary: 'x', final: true, actions: [{ type: 'write_file', path: 'src/components/Header.tsx', content: 'export function Header() { return <h1>A</h1>; }\n' }, { type: 'write_file', path: 'src/lib/price.ts', content: 'export const price = () => 0;\n' }] }
          : defaultEngineer(2),
    });
    const res = await runVertalTeam(input(), deps);
    expect(res.changes.find((c) => c.path === 'src/lib/price.ts')!.after).toContain('0.9'); // ficou a do dono (Engenheiro 2)
    expect(roles(events).some((r) => r.label === 'Engenheiro 1' && /fora da tarefa descartado/.test(r.detail ?? ''))).toBe(true);
  });

  it('Revisor reprova → volta ao Engenheiro dono do arquivo → corrigido e aprovado', async () => {
    let reviews = 0;
    const { deps, events, calls } = makeDeps({
      engineer: (msgs, n) => {
        const t = text(msgs);
        if (t.includes('reprovou')) {
          expect(t).toContain('price.ts: desconto não aplicado');
          return { summary: 'corrigido', final: true, actions: [{ type: 'write_file', path: 'src/lib/price.ts', content: 'export const price = (n: number) => n * 0.9;\n' }] };
        }
        return n === 2 ? { summary: 'p', final: true, actions: [{ type: 'write_file', path: 'src/lib/price.ts', content: 'export const price = (n: number) => n;\n' }] } : defaultEngineer(1);
      },
    });
    const call0 = deps.callCoordinator;
    deps.callCoordinator = async (m, o) => {
      if (sys(m).includes('REVISOR')) {
        reviews++;
        return reply(reviews === 1 ? { approved: false, issues: [{ path: 'src/lib/price.ts', problem: 'desconto não aplicado' }] } : { approved: true, issues: [] });
      }
      return call0(m, o);
    };
    const res = await runVertalTeam(input(), deps);
    expect(reviews).toBe(2);
    expect(res.verified).toBe(true);
    const price = res.changes.find((c) => c.path === 'src/lib/price.ts')!;
    expect(price.before).toBe(PROJECT['src/lib/price.ts']); // "antes" continua o original (diff certo)
    expect(price.after).toContain('0.9');
    expect(roles(events).some((r) => r.role === 'revisor' && r.state === 'rejected')).toBe(true);
    expect(calls.engineer.filter((n) => n === 2)).toHaveLength(2);
  });

  it('verificação automática reprova import quebrado mesmo com o Revisor aprovando; sem rodadas = não verificado', async () => {
    const { deps } = makeDeps({
      engineer: (_m, n) =>
        n === 1
          ? { summary: 'x', final: true, actions: [{ type: 'write_file', path: 'src/components/Header.tsx', content: "import { x } from './nao-existe';\nexport function Header() { return <h1>{x}</h1>; }\n" }] }
          : defaultEngineer(2),
    });
    const res = await runVertalTeam(input({ maxReviewRounds: 0 }), deps);
    expect(res.verified).toBe(false);
    expect(res.issues.some((i) => /não existe/.test(i.problem))).toBe(true);
  });

  it('orçamento curto: para cedo, entrega o que tiver e marca o limite', async () => {
    const { deps, events } = makeDeps({ budget: new VcaBudgetGuard({ maxCalls: 2, maxTokens: 500_000, maxMs: 140_000 }) });
    const res = await runVertalTeam(input(), deps);
    const budget = events.find((e) => e.kind === 'budget') as Extract<VcaTeamEvent, { kind: 'budget' }>;
    expect(budget.stopped).toBe(true);
    expect(budget.calls).toBeLessThanOrEqual(2);
    expect(res.verified).toBe(false);
    expect(events.at(-1)?.kind).toBe('done');
  });

  it('modo Planejar: só o Gerente trabalha, devolve plano e nenhum Engenheiro é chamado', async () => {
    const { deps, events, calls } = makeDeps();
    const res = await runVertalTeam(input({ mode: 'plan' }), deps);
    expect(calls.engineer).toEqual([]);
    expect(calls.coordinator).toEqual(['gerente']);
    expect(res.plan!.steps).toHaveLength(2);
    expect(events.some((e) => e.kind === 'plan')).toBe(true);
  });

  it('sem resposta dos modelos de coordenação: segue com tarefa única e resumo padrão', async () => {
    const { deps } = makeDeps();
    deps.callCoordinator = async () => {
      throw new Error('vca_all_models_failed');
    };
    const res = await runVertalTeam(input(), deps);
    expect(res.changes.length).toBeGreaterThan(0);
    expect(res.summary).toMatch(/arquivo\(s\) prontos/);
  });

  it('teste no sandbox reprova → volta ao Engenheiro', async () => {
    let sandboxRuns = 0;
    const { deps } = makeDeps({
      sandboxTest: async (changes) => {
        sandboxRuns++;
        const bad = changes.find((c) => c.path === 'src/lib/price.ts' && !c.after!.includes('Number'));
        return bad ? { ran: true, ok: false, issues: [{ path: 'src/lib/price.ts', problem: 'sandbox: tipo errado' }] } : { ran: true, ok: true, issues: [] };
      },
      engineer: (msgs, n) =>
        text(msgs).includes('reprovou')
          ? { summary: 'fix', final: true, actions: [{ type: 'write_file', path: 'src/lib/price.ts', content: 'export const price = (n: number) => Number(n) * 0.9;\n' }] }
          : defaultEngineer(n),
    });
    const res = await runVertalTeam(input(), deps);
    expect(sandboxRuns).toBe(2);
    expect(res.verified).toBe(true);
  });
});

describe('runVertalTeam · Vertal Decide nas bifurcações', () => {
  it('pedido trivial com confiança alta: pula a chamada do Gerente, Engenheiro no modelo rápido, Revisor aprova sem LLM', async () => {
    const asked: string[] = [];
    const { deps, calls, events } = makeDeps({
      decide: fakeDecide(
        {
          size: answer({ type: 'score', value: 0.1 }),
          engineer_tier: answer({ type: 'choice', value: 'padrao' }),
          needs_sandbox: answer({ type: 'noul', value: false, yes: 0.03 }),
          needs_human_review: answer({ type: 'noul', value: false, yes: 0.02 }),
          passes: answer({ type: 'noul', value: true, yes: 0.97 }),
          ready_to_ship: answer({ type: 'noul', value: true, yes: 0.96 }),
        },
        asked,
      ),
      engineer: () => defaultEngineer(1),
    });
    let sandboxCalled = false;
    deps.sandboxTest = async () => {
      sandboxCalled = true;
      return { ran: true, ok: true, issues: [] };
    };
    const res = await runVertalTeam(input({ prompt: 'Troque o título do Header para Loja Vertal' }), deps);
    expect(calls.coordinator).toEqual(['entregador']); // sem Gerente e sem Revisor por LLM
    expect(calls.engineer).toEqual([1]);
    expect(sandboxCalled).toBe(false); // decisão confiante: não precisa de sandbox
    expect(res.verified).toBe(true);
    expect(asked).toEqual(['size', 'engineer_tier', 'needs_sandbox', 'needs_human_review', 'passes', 'ready_to_ship']);
    const pkg = events.find((e) => e.kind === 'package') as Extract<VcaTeamEvent, { kind: 'package' }>;
    expect(pkg.readyToShip).toBe(true);
    expect(pkg.humanReview).toBe(false);
    expect(events.filter((e) => e.kind === 'decision')).toHaveLength(6);
  });

  it('confiança média sobe para o modelo maior (Revisor por LLM); baixa vira pergunta ao usuário', async () => {
    const { deps, calls, events } = makeDeps({
      decide: fakeDecide({
        size: answer({ type: 'score', value: 2, confidence: 0.9 }),
        engineer_tier: answer({ type: 'choice', value: 'padrao', confidence: 0.6, tier: 'escalate' }),
        needs_human_review: answer({ type: 'noul', value: true, yes: 0.6, confidence: 0.2, tier: 'ask' }),
        passes: answer({ type: 'noul', value: true, yes: 0.7, confidence: 0.4, tier: 'ask' }),
        ready_to_ship: answer({ type: 'noul', value: true, yes: 0.75, confidence: 0.5, tier: 'escalate' }),
      }),
    });
    const res = await runVertalTeam(input(), deps);
    expect(calls.coordinator).toEqual(['gerente', 'revisor', 'entregador']); // Gerente e Revisor por LLM
    expect(calls.engineer.length).toBe(2); // modelo forte (média não basta para o rápido)
    expect(res.verified).toBe(true);
    const pkg = events.find((e) => e.kind === 'package') as Extract<VcaTeamEvent, { kind: 'package' }>;
    expect(pkg.questions.length).toBeGreaterThanOrEqual(2);
    expect(pkg.readyToShip).toBe(true); // média + verificado + revisor aprovou
  });

  it('revisão humana confiante sinaliza o pacote; "pronto" nunca passa por cima de problema pendente', async () => {
    const { deps, events } = makeDeps({
      decide: fakeDecide({
        needs_human_review: answer({ type: 'noul', value: true, yes: 0.97 }),
        ready_to_ship: answer({ type: 'noul', value: true, yes: 0.99 }),
      }),
      engineer: (_m, n) =>
        n === 1
          ? { summary: 'x', final: true, actions: [{ type: 'write_file', path: 'src/components/Header.tsx', content: "import { y } from './sumiu';\nexport const Header = () => y;\n" }] }
          : defaultEngineer(2),
    });
    await runVertalTeam(input({ maxReviewRounds: 0 }), deps);
    const pkg = events.find((e) => e.kind === 'package') as Extract<VcaTeamEvent, { kind: 'package' }>;
    expect(pkg.humanReview).toBe(true);
    expect(pkg.readyToShip).toBe(false);
  });

  it('Vertal Decide fora do ar ("none") ou sem orçamento: a Equipe segue com as chamadas de sempre', async () => {
    const { deps, calls } = makeDeps({ decide: async () => ({ source: 'none', answers: {}, ms: 0 }) });
    const res = await runVertalTeam(input(), deps);
    expect(calls.coordinator).toEqual(['gerente', 'revisor', 'entregador']);
    expect(res.verified).toBe(true);
    const { deps: d2, calls: c2 } = makeDeps({
      decide: fakeDecide({ size: answer({ type: 'score', value: 0 }) }),
      budget: new VcaBudgetGuard({ maxCalls: 16, maxTokens: 500_000, maxMs: 140_000, maxDecisions: 0 }),
    });
    await runVertalTeam(input(), d2);
    expect(c2.coordinator[0]).toBe('gerente'); // sem orçamento de decisão: não pulou
  });
});
