// Dublê mínimo do cliente do Supabase (só o que o handler do Vertal Prospector usa). Só para testes.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const t = (name: string) => (tables[name] ??= []);

  function query(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    let limitN = Infinity;
    let returning = false;
    const q: any = {
      select() { returning = true; return q; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return q; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
      is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return q; },
      gte(c: string, v: string) { filters.push((r) => r[c] != null && String(r[c]) >= v); return q; },
      order() { return q; },
      limit(k: number) { limitN = k; return q; },
      update(p: Row) { mode = 'update'; patch = p; return q; },
      delete() { mode = 'delete'; return q; },
      insert(rows: Row | Row[]) {
        mode = 'insert';
        inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: uuid(), created_at: new Date().toISOString(), meta: {}, ...r }));
        return q;
      },
      upsert(rows: Row | Row[]) {
        mode = 'upsert';
        inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: uuid(), ...r }));
        return q;
      },
      maybeSingle() { return run().then((r: any) => ({ data: r.data?.[0] ?? null, error: null })); },
      single() { return run().then((r: any) => ({ data: r.data?.[0] ?? null, error: null })); },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    async function run() {
      const rows = t(name);
      const match = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'insert') {
        rows.push(...inserted);
        return { data: returning ? inserted : null, error: null };
      }
      if (mode === 'upsert') {
        for (const r of inserted) {
          const dup = rows.find((x) => x.user_id === r.user_id && x.kind === r.kind && x.value === r.value);
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
        return { data: null, error: null };
      }
      return { data: match.slice(0, limitN), error: null };
    }
    return q;
  }

  return {
    tables,
    from: (name: string) => query(name),
    rpc: async () => ({ data: 1, error: null }),
  };
}
