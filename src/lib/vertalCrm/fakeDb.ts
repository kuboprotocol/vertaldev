// Dublê do cliente do Supabase para os testes do Vertal CRM (só o que o handler usa). Só para testes.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const get = (r: Row, col: string) => {
  const m = /^(\w+)->>(\w+)$/.exec(col);
  if (m) {
    const v = r[m[1]]?.[m[2]];
    return v === undefined || v === null ? null : String(v);
  }
  return r[col];
};

export function createCrmFakeDb(seed: Record<string, Row[]> = {}, users: Array<{ id: string; email: string }> = []) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const t = (name: string) => (tables[name] ??= []);
  const unique: Record<string, string[]> = { crm_ai_runs: ['user_id', 'idempotency_key'], crm_sync_connections: ['workspace_id', 'provider'] };

  function query(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    let limitN = Infinity;
    let returning = false;
    let countMode = false;
    let head = false;
    const q: any = {
      select(_c?: string, o?: { count?: string; head?: boolean }) {
        returning = true;
        if (o?.count) countMode = true;
        if (o?.head) head = true;
        return q;
      },
      eq(c: string, v: unknown) { filters.push((r) => get(r, c) === v); return q; },
      neq(c: string, v: unknown) { filters.push((r) => get(r, c) !== v); return q; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(get(r, c))); return q; },
      is(c: string, v: unknown) { filters.push((r) => (get(r, c) ?? null) === v); return q; },
      gte(c: string, v: any) { filters.push((r) => get(r, c) != null && get(r, c) >= v); return q; },
      lte(c: string, v: any) { filters.push((r) => get(r, c) != null && get(r, c) <= v); return q; },
      gt(c: string, v: any) { filters.push((r) => get(r, c) != null && get(r, c) > v); return q; },
      contains(c: string, vs: unknown[]) { filters.push((r) => vs.every((v) => (r[c] ?? []).includes(v))); return q; },
      ilike(c: string, v: string) {
        const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
        filters.push((r) => re.test(String(get(r, c) ?? '')));
        return q;
      },
      or() { return q; },
      not() { return q; },
      order() { return q; },
      limit(k: number) { limitN = k; return q; },
      update(p: Row) { mode = 'update'; patch = p; return q; },
      delete() { mode = 'delete'; return q; },
      insert(rows: Row | Row[]) {
        mode = 'insert';
        inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: uuid(), created_at: new Date().toISOString(), ...r }));
        return q;
      },
      upsert(rows: Row | Row[]) {
        mode = 'upsert';
        inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
        return q;
      },
      maybeSingle() { return run().then((r: any) => ({ data: r.data?.[0] ?? null, error: r.error })); },
      single() { return run().then((r: any) => ({ data: r.data?.[0] ?? null, error: r.error ?? (r.data?.[0] ? null : { message: 'no rows' }) })); },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    async function run(): Promise<{ data: any; error: any; count?: number }> {
      const rows = t(name);
      const match = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'insert') {
        const keys = unique[name];
        if (keys) {
          for (const r of inserted) if (rows.some((x) => keys.every((k) => x[k] === r[k]))) return { data: null, error: { message: 'duplicate key' } };
        }
        rows.push(...inserted);
        return { data: returning ? inserted : null, error: null };
      }
      if (mode === 'upsert') {
        for (const r of inserted) {
          const dup = rows.find((x) => x.workspace_id === r.workspace_id && x.user_id === r.user_id);
          if (!dup) rows.push(r);
        }
        return { data: null, error: null };
      }
      if (mode === 'update') {
        match.forEach((r) => Object.assign(r, patch));
        return { data: returning ? match : null, error: null };
      }
      if (mode === 'delete') {
        tables[name] = rows.filter((r) => !match.includes(r));
        return { data: returning ? match : null, error: null };
      }
      if (countMode) return { data: head ? null : match, error: null, count: match.length };
      return { data: match.slice(0, limitN), error: null };
    }
    return q;
  }

  return {
    tables,
    from: (name: string) => query(name),
    rpc: async () => ({ data: 1, error: null }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users.find((u) => u.id === id) ?? null }, error: null }),
        listUsers: async () => ({ data: { users }, error: null }),
      },
    },
  };
}
