import { beforeEach, describe, expect, it } from 'vitest';
import {
  cosine,
  deleteMemories,
  formatMemoryContext,
  isMissingRelation,
  keywordOverlap,
  listMemories,
  mergeProjectSummary,
  parseEmbedding,
  rememberRun,
  resetMemoryAvailability,
  retrieveMemories,
  sanitizeDrafts,
  scoreMemory,
  toPgVector,
  VCA_EMBED_DIM,
  type MemoryStoreDeps,
} from '../../../supabase/functions/_shared/vertalCodeAi/memory';

const U = '11111111-1111-1111-1111-111111111111';
const P = '33333333-3333-3333-3333-333333333333';

type Row = Record<string, unknown>;
interface Op {
  table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  filters: Array<[string, ...unknown[]]>;
  payload?: unknown;
}

/** supabase-js falso: grava cada operação e responde pelo `respond`. */
function fakeDb(respond: (op: Op) => { data?: unknown; error?: unknown; count?: number }) {
  const ops: Op[] = [];
  const builder = (op: Op) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'or', 'order', 'limit', 'in']) {
      b[m] = (...args: unknown[]) => {
        if (m !== 'select' || op.kind === 'select') op.filters.push([m, ...args]);
        return b;
      };
    }
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      ops.push(op);
      return Promise.resolve(respond(op)).then(res, rej);
    };
    return b;
  };
  return {
    ops,
    from: (table: string) => ({
      select: (...a: unknown[]) => builder({ table, kind: 'select', filters: [['select', ...a]] }),
      insert: (payload: unknown) => builder({ table, kind: 'insert', filters: [], payload }),
      update: (payload: unknown) => builder({ table, kind: 'update', filters: [], payload }),
      delete: (opts?: unknown) => builder({ table, kind: 'delete', filters: [['delete', opts]] }),
    }),
    rpc: (fn: string, args: unknown) => builder({ table: fn, kind: 'rpc', filters: [], payload: args }),
  };
}

const vec = (i: number) => Array.from({ length: VCA_EMBED_DIM }, (_, j) => (j === i ? 1 : 0));
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.vertal_code_ai_memories' in the schema cache" };

const deps = (db: ReturnType<typeof fakeDb>, over: Partial<MemoryStoreDeps> = {}): MemoryStoreDeps => ({ admin: db, userId: U, projectId: P, ...over });

beforeEach(() => resetMemoryAvailability());

describe('memória · funções puras', () => {
  it('embedding: parse do pgvector, cosseno e formato de envio', () => {
    expect(parseEmbedding('[1,0,0.5]')).toEqual([1, 0, 0.5]);
    expect(parseEmbedding([0.1, 0.2])).toEqual([0.1, 0.2]);
    expect(parseEmbedding('lixo')).toBeNull();
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1], [1, 2])).toBe(0);
    expect(toPgVector([0.1234567, 1])).toBe('[0.123457,1]');
  });
  it('pontuação: semelhança pesa mais; palavras quando não há embedding; preferência ganha um pouco', () => {
    const q = vec(0);
    const near = scoreMemory({ content: 'nada a ver', embedding: toPgVector(vec(0)), importance: 3 }, 'login', q);
    const far = scoreMemory({ content: 'nada a ver', embedding: toPgVector(vec(1)), importance: 3 }, 'login', q);
    expect(near).toBeGreaterThan(far);
    expect(keywordOverlap('tela de login com Supabase', 'Login usa Supabase Auth')).toBeGreaterThanOrEqual(0.5);
    const pref = scoreMemory({ content: 'x', kind: 'preference' }, 'y', null);
    const note = scoreMemory({ content: 'x', kind: 'note' }, 'y', null);
    expect(pref).toBeGreaterThan(note);
  });
  it('sanitizeDrafts: tipos válidos, preferência vira do usuário, sem segredos, sem duplicata, com limite', () => {
    const out = sanitizeDrafts([
      { kind: 'decision', content: 'Usar Supabase Auth com magic link' },
      { kind: 'decision', content: 'Usar Supabase Auth com magic link' },
      { kind: 'preference', content: 'Gosta de UI escura com roxo neon' },
      { kind: 'project_summary', content: 'não pode vir por aqui', scope: 'user' },
      { kind: 'note', content: 'a chave é sk-or-v1-0123456789abcdef0123456789abcdef' },
      { kind: 'note', content: 'senha: hunter2hunter2' },
      { kind: 'code_fact', content: 'curto' },
      { kind: 'xpto', content: 'Tipo desconhecido vira nota', importance: 99 },
      null,
    ]);
    expect(out.map((d) => [d.kind, d.scope])).toEqual([
      ['decision', 'project'],
      ['preference', 'user'],
      ['note', 'user'],
      ['note', 'project'],
    ]);
    expect(out[3].importance).toBe(5);
    expect(sanitizeDrafts(Array.from({ length: 20 }, (_, i) => ({ content: `nota número ${i} longa` })), 3)).toHaveLength(3);
  });
  it('contexto curto para o prompt e resumo rolante que corta o começo', () => {
    expect(formatMemoryContext([], null)).toBe('');
    const ctx = formatMemoryContext([{ id: '1', scope: 'user', kind: 'preference', content: 'Prefere Tailwind', importance: 4, project_id: null }], 'App de vendas');
    expect(ctx).toContain('Resumo do projeto: App de vendas');
    expect(ctx).toContain('(preferência) Prefere Tailwind');
    expect(mergeProjectSummary(null, 'a')).toBe('a');
    expect(mergeProjectSummary('a', 'b')).toBe('a | b');
    const long = mergeProjectSummary('x'.repeat(50), 'novo', 30);
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith('novo')).toBe(true);
  });
  it('reconhece "tabela/função não existe"', () => {
    expect(isMissingRelation(MISSING)).toBe(true);
    expect(isMissingRelation({ code: '42P01' })).toBe(true);
    expect(isMissingRelation({ message: 'relation "x" does not exist' })).toBe(true);
    expect(isMissingRelation({ code: '23505' })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe('memória · banco (supabase-js falso)', () => {
  it('busca por embedding via função SQL, filtra pelo usuário e devolve as mais relevantes', async () => {
    const db = fakeDb((op) => {
      if (op.kind === 'select') return { data: [{ content: 'Resumo: loja' }] };
      if (op.kind === 'rpc')
        return {
          data: [
            { id: 'a', scope: 'project', kind: 'code_fact', content: 'Login fica em src/auth', importance: 3, project_id: P, embedding: toPgVector(vec(0)), updated_at: new Date().toISOString() },
            { id: 'b', scope: 'user', kind: 'note', content: 'Outra coisa', importance: 1, project_id: null, embedding: toPgVector(vec(5)), updated_at: '2020-01-01T00:00:00Z' },
          ],
        };
      return { data: null };
    });
    const r = await retrieveMemories(deps(db, { embed: async () => vec(0) }), 'onde fica o login?');
    expect(r.available).toBe(true);
    expect(r.usedEmbeddings).toBe(true);
    expect(r.projectSummary).toBe('Resumo: loja');
    expect(r.memories[0].id).toBe('a');
    expect(r.memories.find((m) => m.id === 'b')).toBeUndefined(); // pontuação baixa: fora
    const rpc = db.ops.find((o) => o.kind === 'rpc')!;
    expect(rpc.table).toBe('match_vertal_code_ai_memories');
    expect((rpc.payload as Record<string, unknown>).p_user_id).toBe(U);
    // marca last_used_at (só das minhas linhas)
    await new Promise((r2) => setTimeout(r2, 0));
    const upd = db.ops.find((o) => o.kind === 'update')!;
    expect(upd.filters).toContainEqual(['eq', 'user_id', U]);
  });

  it('sem a função SQL (ou sem embedding): lê as últimas linhas e ordena por palavras', async () => {
    const db = fakeDb((op) => {
      if (op.kind === 'rpc') return { error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (op.kind === 'select' && op.filters.some((f) => f[0] === 'neq'))
        return { data: [{ id: 'x', scope: 'project', kind: 'decision', content: 'Pagamento usa Stripe Checkout', importance: 4, project_id: P, updated_at: new Date().toISOString() }] };
      return { data: [] };
    });
    const r = await retrieveMemories(deps(db, { embed: async () => vec(1) }), 'pagamento com stripe');
    expect(r.memories.map((m) => m.id)).toEqual(['x']);
    const sel = db.ops.find((o) => o.kind === 'select' && o.filters.some((f) => f[0] === 'or'))!;
    expect(sel.filters).toContainEqual(['eq', 'user_id', U]);
    expect(sel.filters.find((f) => f[0] === 'or')![1]).toContain(`project_id.eq.${P}`);
  });

  it('tabela ausente (migração não aplicada): degrada sem lançar e não tenta de novo logo em seguida', async () => {
    let calls = 0;
    const db = fakeDb(() => {
      calls++;
      return { error: MISSING };
    });
    const warns: string[] = [];
    const r = await retrieveMemories(deps(db, { warn: (m) => warns.push(m) }), 'qualquer');
    expect(r).toEqual({ available: false, memories: [], projectSummary: null, usedEmbeddings: false });
    expect(warns[0]).toMatch(/migração não aplicada/);
    const before = calls;
    expect(await rememberRun(deps(db), [{ scope: 'project', kind: 'note', content: 'algo para lembrar' }], 'resumo', { runId: 'r' })).toBe(0);
    expect((await retrieveMemories(deps(db), 'x')).available).toBe(false);
    expect(calls).toBe(before); // nem chamou o banco
    expect(await listMemories(deps(db))).toEqual({ available: false, items: [] });
    expect(await deleteMemories(deps(db), { clearAll: true })).toEqual({ available: false, deleted: 0 });
  });

  it('erro qualquer do banco também não quebra o pedido', async () => {
    const db = fakeDb(() => {
      throw new Error('rede caiu');
    });
    expect((await retrieveMemories(deps(db), 'x')).available).toBe(false);
    expect(await rememberRun(deps(db), [{ scope: 'user', kind: 'preference', content: 'gosta de testes' }], null, { runId: 'r' })).toBe(0);
  });

  it('grava as memórias com embedding e escopo certo, e atualiza (ou cria) o resumo do projeto', async () => {
    const db = fakeDb((op) => (op.kind === 'select' ? { data: [{ id: 'sum-1' }] } : { data: null }));
    const n = await rememberRun(
      deps(db, { embed: async () => vec(2) }),
      [
        { scope: 'project', kind: 'decision', content: 'Usar Zod nos formulários', importance: 4 },
        { scope: 'user', kind: 'preference', content: 'Prefere commits pequenos' },
      ],
      'Projeto com formulários validados',
      { runId: 'run-9' },
    );
    expect(n).toBe(2);
    const ins = db.ops.find((o) => o.kind === 'insert')!;
    const rows = ins.payload as Row[];
    expect(rows[0]).toMatchObject({ user_id: U, project_id: P, scope: 'project', kind: 'decision', source_run_id: 'run-9' });
    expect(rows[1]).toMatchObject({ user_id: U, project_id: null, scope: 'user' });
    expect(String(rows[0].embedding)).toMatch(/^\[/);
    const upd = db.ops.find((o) => o.kind === 'update')!;
    expect(upd.payload).toMatchObject({ content: 'Projeto com formulários validados' });
    expect(upd.filters).toContainEqual(['eq', 'id', 'sum-1']);

    const db2 = fakeDb((op) => (op.kind === 'select' ? { data: [] } : { data: null }));
    await rememberRun(deps(db2, { projectId: null }), [], 'Cofre pessoal', { runId: 'r' });
    const ins2 = db2.ops.find((o) => o.kind === 'insert')!;
    expect(ins2.payload).toMatchObject({ kind: 'project_summary', scope: 'project', project_id: null });
  });

  it('listar e apagar usam o cliente do usuário (RLS) e sempre filtram pelo dono', async () => {
    const admin = fakeDb(() => ({ data: [] }));
    const user = fakeDb((op) => (op.kind === 'delete' ? { count: 2 } : { data: [{ id: 'm', content: 'x' }] }));
    const d = deps(admin, { userClient: user });
    expect((await listMemories(d)).items).toHaveLength(1);
    expect(await deleteMemories(d, { ids: ['44444444-4444-4444-4444-444444444444', 'não-uuid'] })).toEqual({ available: true, deleted: 2 });
    expect(admin.ops).toHaveLength(0);
    const del = user.ops.find((o) => o.kind === 'delete')!;
    expect(del.filters).toContainEqual(['eq', 'user_id', U]);
    expect(del.filters).toContainEqual(['in', 'id', ['44444444-4444-4444-4444-444444444444']]);
    // sem nada pedido: não apaga
    expect(await deleteMemories(d, {})).toEqual({ available: true, deleted: 0 });
    // "apagar a memória deste projeto"
    await deleteMemories(d, { clear: true });
    expect(user.ops.at(-1)!.filters).toContainEqual(['eq', 'project_id', P]);
  });
});
