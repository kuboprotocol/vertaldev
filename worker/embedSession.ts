// POST /embed/api/session — sign-in handoff for vertal.dev/embed.
//
// Called by the sign-in popup (/embed/login, a first-party window) with the
// user's access token. Returns a single-use magic-link token hash for the same
// user (Supabase Auth admin generate_link; no email is sent). The popup posts
// only that hash to the embed frame, which calls supabase.auth.verifyOtp and
// gets its OWN session. Sharing one refresh token between the frame and the
// first-party tab would look like token reuse to Supabase Auth and could sign
// the user out of both.
//
// Runs in the Worker (deployed with it) and uses the SUPABASE_SECRET_KEY the
// Worker already has, so no new Supabase edge function is needed.
import type { SupabaseEnv } from './supabaseRest';

export const EMBED_SESSION_PATH = '/embed/api/session';

export interface EmbedSessionEnv extends SupabaseEnv {
  APP_ORIGIN?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export async function handleEmbedSession(
  request: Request,
  env: EmbedSessionEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Only our own pages call this (same origin). Browsers always send Origin on POST.
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  const allowed = new Set([self, env.APP_ORIGIN ?? 'https://vertal.dev']);
  if (!origin || !allowed.has(origin)) return json(403, { error: 'forbidden_origin' });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]?.trim();
  if (!token) return json(401, { error: 'unauthorized' });
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
    return json(503, { error: 'not_configured' });
  }
  const base = env.SUPABASE_URL.replace(/\/+$/, '');

  const userRes = await fetchImpl(`${base}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json(401, { error: 'unauthorized' });
  const user = (await userRes.json().catch(() => null)) as { email?: string } | null;
  if (!user?.email) return json(400, { error: 'no_email' });

  const linkRes = await fetchImpl(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: user.email }),
  });
  const link = (await linkRes.json().catch(() => null)) as
    | { hashed_token?: string; properties?: { hashed_token?: string } }
    | null;
  const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
  if (!linkRes.ok || !tokenHash) return json(502, { error: 'link_generation_failed' });
  return json(200, { token_hash: tokenHash });
}
