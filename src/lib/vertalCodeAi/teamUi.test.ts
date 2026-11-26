import { describe, expect, it } from 'vitest';
import { buildSandboxScript, parseTscOutput, runSandboxTest } from '../../../supabase/functions/_shared/vertalCodeAi/sandbox';
import { reduceEvent, type ChatItem } from './session';
import { emptyTeamState, fetchTeamStatus, reduceTeamEvent } from './team';
import { streamRun } from './client';

type Agent = Extract<ChatItem, { type: 'agent' }>;
const agent = (): Agent => ({ type: 'agent', id: 'a', steps: [], diffs: [], done: false });

describe('Equipe Vertal na tela · progresso por núcleo e papel (pt-BR)', () => {
  it('começa com os 5 papéis aguardando e os 3 núcleos', () => {
    const s = emptyTeamState();
    expect(s.roles.map((r) => r.label)).toEqual(['Gerente', 'Encarregado', 'Engenheiro', 'Revisor/QA', 'Entregador']);
    expect(s.cores).toEqual({ pensa: 'waiting', constroi: 'waiting', entrega: 'waiting' });
  });

  it('eventos da Equipe entram no balão; os de sempre continuam iguais', () => {
    let it1 = agent();
    const evs = [
      { kind: 'core', core: 'pensa', state: 'start' },
      { kind: 'role', role: 'gerente', label: 'Gerente', core: 'pensa', state: 'done', detail: '2 tarefa(s)' },
      { kind: 'core', core: 'pensa', state: 'done' },
      { kind: 'role', role: 'engenheiro', label: 'Engenheiro 1', core: 'constroi', state: 'working', agent: 1 },
      { kind: 'role', role: 'engenheiro', label: 'Engenheiro 2', core: 'constroi', state: 'working', agent: 2 },
      { kind: 'role', role: 'engenheiro', label: 'Engenheiro 1', core: 'constroi', state: 'done', agent: 1, detail: '1 arquivo(s)' },
      { kind: 'decision', role: 'revisor', key: 'passes', label: 'Aprovado', value: 'sim', confidence: 0.93, tier: 'act', source: 'own' },
      { kind: 'memory', available: true, used: 3, embeddings: true },
      { kind: 'memory', available: true, used: 0, saved: 2 },
      { kind: 'budget', decisions: 2, calls: 5, maxCalls: 16, tokens: 1, maxTokens: 2, ms: 1, maxMs: 2, stopped: false },
      { kind: 'package', files: [{ path: 'src/a.ts', added: 2, removed: 1 }], verified: true, checks: { static: 'ok', sandbox: 'not_available', review: 'approved' }, tasks: [], readyToShip: true, humanReview: false, questions: ['Revisar?'] },
      { kind: 'reply', text: 'Pronto' },
    ];
    for (const e of evs) it1 = reduceEvent(it1, e);
    const t = it1.team!;
    expect(t.cores).toEqual({ pensa: 'done', constroi: 'waiting', entrega: 'waiting' });
    // Engenheiros numerados substituem a linha genérica, na ordem dos núcleos
    expect(t.roles.map((r) => `${r.label}:${r.state}`)).toEqual([
      'Gerente:done', 'Encarregado:waiting', 'Engenheiro 1:done', 'Engenheiro 2:working', 'Revisor/QA:waiting', 'Entregador:waiting',
    ]);
    expect(t.roles.find((r) => r.label === 'Engenheiro 1')!.detail).toBe('1 arquivo(s)');
    expect(t.decisions).toEqual([{ label: 'Aprovado', value: 'sim', confidence: 0.93, tier: 'act' }]);
    expect(t.memory).toEqual({ available: true, used: 3, saved: 2 });
    expect(t.budget).toEqual({ calls: 5, maxCalls: 16, decisions: 2, stopped: false });
    expect(t.pkg).toMatchObject({ verified: true, readyToShip: true, questions: ['Revisar?'] });
    expect(it1.reply).toBe('Pronto');
    // evento estranho não quebra
    expect(reduceTeamEvent(undefined, { kind: 'role', role: 'hacker' })).toBeUndefined();
    expect(reduceTeamEvent(undefined, { kind: 'status' })).toBeUndefined();
  });

  it('team_status: só "sim" do servidor libera; 404 = escondido', async () => {
    const ok = async () => new Response(JSON.stringify({ team: true, memory: true, sandbox: false, decide: true }));
    const off = async () => new Response(JSON.stringify({ error: 'vertal_code_ai_team_disabled' }), { status: 404 });
    expect(await fetchTeamStatus('t', ok as unknown as typeof fetch)).toMatchObject({ team: true, memory: true });
    expect(await fetchTeamStatus('t', off as unknown as typeof fetch)).toBeNull();
    expect(await fetchTeamStatus('', ok as unknown as typeof fetch)).toBeNull();
  });

  it('streamRun manda action "team_run" só quando pedido; padrão continua "run"', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const f = async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response('data: {"kind":"done"}\n\n');
    };
    await streamRun('t', { mode: 'build', effort: 'auto', prompt: 'p' }, () => {}, undefined, f as unknown as typeof fetch);
    await streamRun('t', { mode: 'build', effort: 'auto', prompt: 'p', action: 'team_run' }, () => {}, undefined, f as unknown as typeof fetch);
    expect(bodies.map((b) => b.action)).toEqual(['run', 'team_run']);
  });
});

describe('Revisor/QA · teste no sandbox (orquestrador falso)', () => {
  const changes = [
    { path: 'src/a.ts', before: '', after: "export const a: number = 'x';\n" },
    { path: 'src/b.css', before: '', after: 'body{}' },
    { path: 'src/c.ts', before: 'x', after: null },
  ];
  it('script grava só arquivos TS/JS (base64, sem aspas soltas) e roda o tsc neles', () => {
    const { script, files } = buildSandboxScript(changes);
    expect(files).toEqual(['src/a.ts']);
    expect(script).toContain("mkdir -p 'src'");
    expect(script).toContain('base64 -d');
    expect(script).toContain('tsc --noEmit');
    expect(script).not.toContain("'x'");
  });
  it('lê erros do tsc, ignora "módulo não encontrado" e arquivos fora do pacote', () => {
    const out = [
      "src/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/a.ts(2,1): error TS2307: Cannot find module 'react'.",
      'node_modules/x.d.ts(1,1): error TS1000: fora',
    ].join('\n');
    expect(parseTscOutput(out, ['src/a.ts'])).toEqual([{ path: 'src/a.ts', problem: "sandbox (typecheck) linha 1: Type 'string' is not assignable to type 'number'." }]);
  });
  it('sobe, testa e SEMPRE derruba; falha ao subir = não rodou', async () => {
    const destroyed: string[] = [];
    const orch = {
      provision: async () => ({ container_ref: 'e2b:sb1:tok', driver: 'e2b' }),
      exec: async () => ({ logs: "src/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.\n__VCA_DONE__", exit_code: 0 }),
      destroy: async (ref: string) => destroyed.push(ref),
    };
    const r = await runSandboxTest(changes, orch, { runId: 'r1' });
    expect(r).toMatchObject({ ran: true, ok: false });
    expect(r.issues).toHaveLength(1);
    expect(destroyed).toEqual(['e2b:sb1:tok']);
    const down = await runSandboxTest(changes, { ...orch, exec: async () => { throw new Error('timeout'); } }, { runId: 'r2' });
    expect(down.ran).toBe(false);
    expect(destroyed).toHaveLength(2);
    const pending = await runSandboxTest(changes, { ...orch, provision: async () => ({ container_ref: 'pending:x', driver: null }) }, { runId: 'r3' });
    expect(pending.ran).toBe(false);
    expect(await runSandboxTest([changes[1]], orch, { runId: 'r4' })).toEqual({ ran: false, ok: true, issues: [] });
  });
});
