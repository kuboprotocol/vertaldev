import { describe, it, expect } from 'vitest';
import { handleGmailOAuthCallback, isGmailOAuthCallback } from './gmailOAuthCallback';

const env = { SUPABASE_URL: 'https://sccizjlpwezsgaxkclot.supabase.co', APP_ORIGIN: 'https://vertal.dev' };

describe('callback OAuth do Gmail em vertal.dev', () => {
  it('reconhece a rota', () => {
    expect(isGmailOAuthCallback('/oauth/gmail/callback')).toBe(true);
    expect(isGmailOAuthCallback('/oauth/gmail/callback/')).toBe(true);
    expect(isGmailOAuthCallback('/oauth/gmail')).toBe(false);
  });

  it('repassa code/state com via=vertal e devolve o redirect da edge function', async () => {
    let called = '';
    const url = new URL('https://vertal.dev/oauth/gmail/callback?code=abc&state=n1&scope=x&extra=1');
    const res = await handleGmailOAuthCallback(new Request(url), env, url, async (input) => {
      called = input;
      return new Response(null, { status: 302, headers: { Location: 'https://vertal.dev/connectors/gmail?gmail=connected' } });
    });
    const target = new URL(called);
    expect(target.origin + target.pathname).toBe('https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/gmail-oauth-callback');
    expect(target.searchParams.get('code')).toBe('abc');
    expect(target.searchParams.get('state')).toBe('n1');
    expect(target.searchParams.get('via')).toBe('vertal');
    expect(target.searchParams.get('extra')).toBeNull();
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://vertal.dev/connectors/gmail?gmail=connected');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('volta para /connectors/gmail com erro se a edge function falhar', async () => {
    const url = new URL('https://vertal.dev/oauth/gmail/callback?code=abc&state=n1');
    const res = await handleGmailOAuthCallback(new Request(url), env, url, async () => { throw new Error('down'); });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://vertal.dev/connectors/gmail?error=callback_unavailable');
  });

  it('recusa POST', async () => {
    const url = new URL('https://vertal.dev/oauth/gmail/callback');
    const res = await handleGmailOAuthCallback(new Request(url, { method: 'POST' }), env, url);
    expect(res.status).toBe(405);
  });
});
