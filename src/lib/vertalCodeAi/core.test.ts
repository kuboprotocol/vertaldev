import { describe, expect, it } from 'vitest';
import {
  applyActions,
  diffStats,
  indexFile,
  parseVcaTurn,
  rankRelevantFiles,
  resolveImport,
  runVertalCodeAi,
  unifiedDiff,
  verifyChanges,
  type ModelReply,
  type VcaEvent,
} from '../../../supabase/functions/_shared/vertalCodeAi/core';

const reply = (content: unknown, label = 'Vertal Livre · Código'): ModelReply => ({
  content: typeof content === 'string' ? content : JSON.stringify(content),
  label,
  cost: 'free',
  fellBack: false,
});

describe('parseVcaTurn', () => {
  it('lê ações de leitura, escrita, patch e apagar', () => {
    const t = parseVcaTurn(
      JSON.stringify({
        summary: 'ok',
        actions: [
          { type: 'read_file', path: 'src/a.ts' },
          { type: 'write_file', path: 'src/b.ts', content: 'export const b = 1;\n' },
          { type: 'patch_file', path: 'src/c.ts', search: 'x', replace: 'y' },
          { type: 'delete_file', path: 'src/d.ts' },
          { type: 'rm_rf', path: '/' },
        ],
      }),
    );
    expect(t.actions.map((a) => a.type)).toEqual(['read_file', 'write_file', 'patch_file', 'delete_file']);
    expect(t.final).toBe(false); // tem leitura pendente
  });

  it('aceita cerca ```json e texto em volta', () => {
    const t = parseVcaTurn('Claro!\n```json\n{"summary":"feito","actions":[],"final":true}\n```');
    expect(t.summary).toBe('feito');
    expect(t.final).toBe(true);
  });

  it('nunca aproveita a última edição de uma saída cortada', () => {
    const t = parseVcaTurn('{"summary":"x","actions":[{"type":"write_file","path":"a.ts","content":"ok"},{"type":"write_file","path":"b.ts","content":"export const');
    expect(t.actions.map((a) => a.path)).toEqual(['a.ts']);
    expect(t.final).toBe(false);
  });

  it('lixo vira retry', () => {
    expect(parseVcaTurn('desculpe, não consigo').retry).toBe(true);
  });

  it('lê o plano', () => {
    const t = parseVcaTurn(JSON.stringify({ summary: 's', actions: [], plan: { goal: 'g', steps: [{ title: 'Passo 1', files: ['a.ts'] }, 'Passo 2'] }, final: true }));
    expect(t.plan?.steps.map((s) => s.title)).toEqual(['Passo 1', 'Passo 2']);
  });
});

describe('edições e diffs', () => {
  const files: Record<string, string> = { 'src/c.ts': 'const a = 1;\nconst x = 2;\nexport { a, x };\n' };
  it('patch exige trecho único e existente', () => {
    const ok = applyActions([{ type: 'patch_file', path: 'src/c.ts', search: 'const x = 2;', replace: 'const x = 3;' }], (p) => files[p]);
    expect(ok.errors).toEqual([]);
    expect(ok.changes.get('src/c.ts')?.after).toContain('const x = 3;');
    const missing = applyActions([{ type: 'patch_file', path: 'src/c.ts', search: 'nope', replace: '' }], (p) => files[p]);
    expect(missing.errors[0]).toMatch(/não foi encontrado/);
    const dup = applyActions([{ type: 'patch_file', path: 'src/c.ts', search: 'const', replace: 'let' }], (p) => files[p]);
    expect(dup.errors[0]).toMatch(/mais de uma vez/);
  });

  it('bloqueia caminhos perigosos (.env, .git, absolutos, ..)', () => {
    const r = applyActions(
      ['.env', '.git/config', '/etc/passwd', '../x.ts', '.github/workflows/ci.yml'].map((path) => ({ type: 'write_file' as const, path, content: 'x' })),
      () => undefined,
    );
    expect(r.changes.size).toBe(0);
    expect(r.errors).toHaveLength(5);
  });

  it('patches em sequência no mesmo arquivo se acumulam e o "antes" continua o original', () => {
    const r = applyActions(
      [
        { type: 'patch_file', path: 'src/c.ts', search: 'const a = 1;', replace: 'const a = 10;' },
        { type: 'patch_file', path: 'src/c.ts', search: 'const x = 2;', replace: 'const x = 20;' },
      ],
      (p) => files[p],
    );
    const c = r.changes.get('src/c.ts')!;
    expect(c.before).toBe(files['src/c.ts']);
    expect(c.after).toBe('const a = 10;\nconst x = 20;\nexport { a, x };\n');
  });

  it('diff unificado com contagem de linhas', () => {
    const d = unifiedDiff('src/c.ts', 'a\nb\nc\n', 'a\nB\nc\n');
    expect(d).toContain('--- a/src/c.ts');
    expect(d).toContain('-b');
    expect(d).toContain('+B');
    expect(diffStats('a\nb\nc\n', 'a\nB\nc\n')).toEqual({ added: 1, removed: 1 });
    expect(unifiedDiff('n.ts', '', 'x')).toContain('--- /dev/null');
  });
});

describe('verificação', () => {
  it('acha placeholder, segredo, JSON inválido, delimitador, conflito e import quebrado', async () => {
    const issues = await verifyChanges(
      [
        { path: 'src/a.ts', before: '', after: 'export function a() {\n  // ... resto do código\n}\n' },
        { path: 'src/b.json', before: '', after: '{ nope' },
        { path: 'src/c.ts', before: '', after: 'export const c = () => { return 1;\n' },
        { path: 'src/d.ts', before: '', after: "import { z } from './naoExiste';\nexport const d = z;\n" },
        { path: 'src/e.ts', before: '', after: '<<<<<<< HEAD\nconst e = 1;\n=======\nconst e = 2;\n>>>>>>> x\n' },
        { path: 'src/f.ts', before: '', after: 'const key = "sk_live_abcdefghijklmnop1234";\n' },
      ],
      new Set(['src/a.ts']),
    );
    const by = (p: string) => issues.filter((i) => i.path === p).map((i) => i.problem).join(' | ');
    expect(by('src/a.ts')).toMatch(/placeholder/);
    expect(by('src/b.json')).toMatch(/JSON inválido/);
    expect(by('src/c.ts')).toMatch(/delimitador/);
    expect(by('src/d.ts')).toMatch(/naoExiste/);
    expect(by('src/e.ts')).toMatch(/conflito/);
    expect(by('src/f.ts')).toMatch(/segredo/);
  });

  it('só reclama de problemas NOVOS (TODO que já existia não trava a edição)', async () => {
    const before = '// TODO: antigo\nexport const a = 1;\n';
    const issues = await verifyChanges([{ path: 'src/a.ts', before, after: before.replace('1', '2') }], new Set(['src/a.ts']));
    expect(issues).toEqual([]);
  });

  it('usa o checador de sintaxe injetado e resolve alias @/', async () => {
    const issues = await verifyChanges(
      [{ path: 'src/x.tsx', before: '', after: "import { Button } from '@/components/ui/button';\nexport const X = () => <Button/>;\n" }],
      new Set(['src/components/ui/button.tsx']),
      () => ['linha 1: erro de teste'],
    );
    expect(issues).toEqual([{ path: 'src/x.tsx', problem: 'sintaxe: linha 1: erro de teste' }]);
  });
});

describe('índice do repositório', () => {
  it('extrai exports/imports e ranqueia com vizinhos de import', () => {
    const idx = [
      indexFile('src/lib/cart/total.ts', "import { money } from './money';\nexport function cartTotal() {}\n"),
      indexFile('src/lib/cart/money.ts', 'export const money = 1;\n'),
      indexFile('src/pages/Home.tsx', 'export default function Home() {}\n'),
    ];
    expect(idx[0].symbols).toEqual(['cartTotal']);
    const ranked = rankRelevantFiles(idx, 'corrigir o total do carrinho (cart total)', 3);
    expect(ranked[0]).toBe('src/lib/cart/total.ts');
    expect(ranked).toContain('src/lib/cart/money.ts');
    expect(ranked).not.toContain('src/pages/Home.tsx');
  });

  it('resolve imports relativos e com alias', () => {
    const paths = new Set(['src/a/b.ts', 'src/c/index.ts']);
    expect(resolveImport('src/a/x.ts', './b', paths)).toBe('src/a/b.ts');
    expect(resolveImport('src/a/x.ts', '../c', paths)).toBe('src/c/index.ts');
    expect(resolveImport('src/a/x.ts', '@/a/b', paths)).toBe('src/a/b.ts');
    expect(resolveImport('src/a/x.ts', 'react', paths)).toBeNull();
  });
});

describe('loop planejar → construir → verificar → auto-corrigir', () => {
  const project: Record<string, string> = {
    'src/lib/greet.ts': "export function greet(name: string) {\n  return 'Oi ' + name;\n}\n",
    'src/App.tsx': "import { greet } from './lib/greet';\nexport default function App() { return greet('Vertal'); }\n",
  };
  const deps = (replies: ModelReply[], events: VcaEvent[]) => ({
    callModel: async () => {
      const r = replies.shift();
      if (!r) throw new Error('sem resposta');
      return r;
    },
    listPaths: async () => Object.keys(project),
    readFile: async (p: string) => project[p],
    indexSource: async () => Object.entries(project).map(([path, content]) => ({ path, content })),
    emit: (e: VcaEvent) => events.push(e),
  });

  it('constrói, acha erro, corrige sozinho e entrega diff verificado (sem gravar nada)', async () => {
    const events: VcaEvent[] = [];
    const before = JSON.stringify(project);
    const result = await runVertalCodeAi(
      { mode: 'build', effort: 'auto', prompt: 'mude a saudação greet para Olá' },
      deps(
        [
          reply({ summary: 'lendo', actions: [{ type: 'read_file', path: 'src/lib/greet.ts' }], final: false }),
          // 1ª tentativa: deixa um placeholder → verificador reprova
          reply({ summary: 'troquei', actions: [{ type: 'write_file', path: 'src/lib/greet.ts', content: "export function greet(name: string) {\n  // ... resto do código\n  return 'Olá ' + name;\n}\n" }], final: true }),
          // auto-correção
          reply({ summary: 'Saudação trocada para Olá.', actions: [{ type: 'patch_file', path: 'src/lib/greet.ts', search: '  // ... resto do código\n', replace: '' }], final: true }),
        ],
        events,
      ),
    );
    expect(result.verified).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].after).toBe("export function greet(name: string) {\n  return 'Olá ' + name;\n}\n");
    const verifies = events.filter((e) => e.kind === 'verify') as Array<Extract<VcaEvent, { kind: 'verify' }>>;
    expect(verifies.map((v) => v.ok)).toEqual([false, true]);
    expect(events.some((e) => e.kind === 'diff')).toBe(true);
    expect(events[events.length - 1]).toEqual({ kind: 'done', files: 1, verified: true });
    expect(JSON.stringify(project)).toBe(before); // nada gravado: só proposta para revisão
  });

  it('modo Planejar devolve plano e nenhuma edição', async () => {
    const events: VcaEvent[] = [];
    const result = await runVertalCodeAi(
      { mode: 'plan', effort: 'high', prompt: 'adicionar login com Google' },
      deps(
        [
          reply({
            summary: 'Plano em 2 passos',
            actions: [{ type: 'write_file', path: 'src/x.ts', content: 'export {}' }],
            plan: { goal: 'Login', steps: [{ title: 'Criar botão', files: ['src/App.tsx'] }, { title: 'Configurar Supabase Auth', files: [] }], risks: [], questions: [] },
            final: true,
          }),
        ],
        events,
      ),
    );
    expect(result.plan?.steps).toHaveLength(2);
    expect(result.changes).toEqual([]); // edição ignorada no modo Planejar
    expect(events.some((e) => e.kind === 'plan')).toBe(true);
  });

  it('quando os modelos param no meio, entrega o que já estava pronto', async () => {
    const events: VcaEvent[] = [];
    const result = await runVertalCodeAi(
      { mode: 'build', effort: 'auto', prompt: 'greet' },
      deps([reply({ summary: 'ok', actions: [{ type: 'write_file', path: 'src/novo.ts', content: '// TODO\nexport const n = 1;\n' }], final: true })], events),
    );
    expect(result.changes.map((c) => c.path)).toEqual(['src/novo.ts']);
    expect(result.verified).toBe(false);
  });

  it('sem nenhum modelo disponível, o erro sobe', async () => {
    await expect(runVertalCodeAi({ mode: 'build', effort: 'auto', prompt: 'x' }, deps([], []))).rejects.toThrow();
  });

  it('JSON ilegível ganha uma nova tentativa', async () => {
    const events: VcaEvent[] = [];
    const result = await runVertalCodeAi(
      { mode: 'build', effort: 'low', prompt: 'crie src/ok.ts' },
      deps([reply('não sei responder em JSON'), reply({ summary: 'criado', actions: [{ type: 'write_file', path: 'src/ok.ts', content: 'export const ok = true;\n' }], final: true })], events),
    );
    expect(result.verified).toBe(true);
    expect(result.summary).toBe('criado');
  });
});
