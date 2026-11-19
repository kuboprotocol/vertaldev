// Acesso mínimo ao Supabase a partir do Worker, sem o supabase-js:
// - getUser: valida o JWT da sessão do usuário (Auth /user).
// - table: PostgREST com a chave secreta (service role), só no servidor.

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  /** Chave publicável (sb_publishable_…): pública, usada só para validar a sessão. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** Chave secreta (sb_secret_…): ignora RLS. Segredo do Worker, nunca no front-end. */
  SUPABASE_SECRET_KEY?: string;
}

export class SupabaseConfigError extends Error {}

function baseUrl(env: SupabaseEnv): string {
  if (!env.SUPABASE_URL) throw new SupabaseConfigError('SUPABASE_URL not configured');
  return env.SUPABASE_URL.replace(/\/+$/, '');
}

/** Devolve o id do usuário dono do token, ou null se o token for inválido/expirado. */
export async function getUserId(env: SupabaseEnv, authorization: string | null): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1]?.trim();
  if (!token) return null;
  if (!env.SUPABASE_PUBLISHABLE_KEY) throw new SupabaseConfigError('SUPABASE_PUBLISHABLE_KEY not configured');
  const res = await fetch(`${baseUrl(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: string } | null;
  return user?.id ?? null;
}

/** Chama uma função SQL (PostgREST /rpc) com a chave secreta. Lança com a mensagem do banco. */
export async function rpc<T>(env: SupabaseEnv, fn: string, args: Record<string, unknown>): Promise<T> {
  if (!env.SUPABASE_SECRET_KEY) throw new SupabaseConfigError('SUPABASE_SECRET_KEY not configured');
  const res = await fetch(`${baseUrl(env)}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SECRET_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`supabase rpc ${fn} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

type Filters = Record<string, string>;

/** Cliente PostgREST de uma tabela. Filtros no formato do PostgREST: { user_id: 'eq.<uuid>' }. */
export function table(env: SupabaseEnv, name: string) {
  const call = async <T>(method: string, filters: Filters, body?: unknown, prefer?: string): Promise<T[]> => {
    if (!env.SUPABASE_SECRET_KEY) throw new SupabaseConfigError('SUPABASE_SECRET_KEY not configured');
    const url = new URL(`${baseUrl(env)}/rest/v1/${name}`);
    for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { apikey: env.SUPABASE_SECRET_KEY, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`supabase ${method} ${name} → ${res.status} ${detail.slice(0, 200)}`);
    }
    if (res.status === 204) return [];
    const text = await res.text();
    return text ? (JSON.parse(text) as T[]) : [];
  };

  return {
    select: <T>(filters: Filters) => call<T>('GET', { select: '*', ...filters }),
    insert: (row: Record<string, unknown>) => call('POST', {}, row, 'return=minimal'),
    upsert: (row: Record<string, unknown>, onConflict: string) =>
      call('POST', { on_conflict: onConflict }, row, 'resolution=merge-duplicates,return=minimal'),
    /** Atualiza e devolve as linhas alteradas (vazio = nenhuma casou com o filtro). */
    update: <T>(filters: Filters, patch: Record<string, unknown>) =>
      call<T>('PATCH', filters, patch, 'return=representation'),
    delete: (filters: Filters) => call('DELETE', filters, undefined, 'return=minimal'),
  };
}
