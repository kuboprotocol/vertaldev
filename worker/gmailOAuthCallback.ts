// Callback OAuth do conector Gmail nativo em https://vertal.dev/oauth/gmail/callback.
//
// É o redirect_uri que o Google vê (a tela de consentimento mostra vertal.dev em
// vez do domínio do Supabase). O Worker não guarda nada: repassa code/state/error
// para a edge function gmail-oauth-callback com `via=vertal` (para ela trocar o
// code com este mesmo redirect_uri) e devolve o redirect que ela responder.
// Não depende de sessão no navegador: o state no banco identifica o usuário.

export const GMAIL_OAUTH_CALLBACK_PATH = '/oauth/gmail/callback';

const DEFAULT_SUPABASE_URL = 'https://sccizjlpwezsgaxkclot.supabase.co';
const PASS_PARAMS = ['code', 'state', 'error', 'error_description', 'scope'];

export interface GmailOAuthEnv {
  SUPABASE_URL?: string;
  APP_ORIGIN?: string;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  });
}

export function isGmailOAuthCallback(pathname: string): boolean {
  return pathname === GMAIL_OAUTH_CALLBACK_PATH || pathname === `${GMAIL_OAUTH_CALLBACK_PATH}/`;
}

export async function handleGmailOAuthCallback(
  request: Request,
  env: GmailOAuthEnv,
  url: URL,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<Response> {
  const origin = env.APP_ORIGIN || 'https://vertal.dev';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  }

  const target = new URL(`${(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '')}/functions/v1/gmail-oauth-callback`);
  for (const key of PASS_PARAMS) {
    const v = url.searchParams.get(key);
    if (v !== null) target.searchParams.set(key, v);
  }
  target.searchParams.set('via', 'vertal');

  try {
    const res = await fetcher(target.toString(), { method: 'GET', redirect: 'manual' });
    const location = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && location) return redirectTo(location);
    console.error('gmail oauth callback: resposta inesperada da edge function', res.status);
  } catch (e) {
    console.error('gmail oauth callback: edge function indisponível', (e as Error).message);
  }
  return redirectTo(`${origin}/connectors/gmail?error=callback_unavailable`);
}
