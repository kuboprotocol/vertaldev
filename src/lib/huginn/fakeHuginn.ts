// Huginn falso para os testes: imita o que o Rails/Devise do Huginn faz de
// verdade (conferido na instância real em 22/11/2026): cookie `_rails_session`
// renovado a cada resposta, token CSRF na <meta>, troca do token ao logar,
// 422 em JSON quando o X-CSRF-Token não bate e JSON do agente SEM o campo "type".
import type { HuginnFetch, HuginnResponse } from '../../../supabase/functions/_shared/huginnCore';

export interface FakeCall { method: string; path: string; headers: Record<string, string>; body?: string }

export interface FakeHuginnOptions {
  username?: string;
  password?: string;
  agents?: Array<Record<string, unknown>>;
}

export const FAKE_BASE = 'https://huginn.example.com';

function response(status: number, body: string, headers: Record<string, string> = {}, cookies: string[] = []): HuginnResponse {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null, getSetCookie: () => cookies },
    text: async () => body,
  };
}

export function fakeHuginn(opts: FakeHuginnOptions = {}) {
  const username = opts.username ?? 'laercio';
  const password = opts.password ?? 'senha-forte-123';
  const agents = (opts.agents ?? [
    { id: 1, user_id: 1, name: 'XKCD Source', schedule: 'every_1d', events_count: 3, disabled: false, options: { url: 'https://xkcd.com', api_key: 'k-123' } },
  ]).map((a) => ({ ...a }));
  const events: Array<Record<string, unknown>> = [];
  const calls: FakeCall[] = [];
  let sessionId = 0;
  const sessions = new Map<string, { user: boolean; csrf: string }>();
  let nextAgentId = 100;
  let nextScenario = 10;

  const newSession = (user: boolean) => {
    const sid = `sess-${++sessionId}-xxxxxxxx`;
    sessions.set(sid, { user, csrf: `csrf-${sessionId}-tokenvalue` });
    return sid;
  };
  const cookie = (sid: string) => [`_rails_session=${sid}; path=/; secure; HttpOnly; SameSite=Lax`];
  const html = (csrf: string) => `<html><head><meta name="csrf-param" content="authenticity_token" />\n<meta name="csrf-token" content="${csrf}" /></head><body>ok</body></html>`;

  const fetch: HuginnFetch = async (url, init) => {
    const u = new URL(url);
    const call: FakeCall = { method: init.method, path: u.pathname + u.search, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}) };
    calls.push(call);
    if (u.origin !== FAKE_BASE) throw new TypeError('wrong host');
    const sid = /_rails_session=([^;]+)/.exec(init.headers.Cookie ?? '')?.[1];
    const sess = sid ? sessions.get(sid) : undefined;
    const p = u.pathname;

    // Webhook público (sem login).
    const wh = /^\/users\/(\d+)\/web_requests\/(\d+)\/([^/]+)$/.exec(p);
    if (wh) {
      const ag = agents.find((a) => a.id === Number(wh[2]));
      if (!ag) return response(404, 'agent not found');
      if ((ag.options as Record<string, unknown>).secret !== decodeURIComponent(wh[3])) return response(401, 'Not Authorized');
      events.unshift({ id: events.length + 1, agent_id: ag.id, payload: JSON.parse(init.body ?? '{}'), created_at: '2026-11-22T12:00:00-03:00' });
      return response(201, 'Event Created');
    }

    if (p === '/users/sign_in' && init.method === 'GET') {
      const s = newSession(false);
      return response(200, html(sessions.get(s)!.csrf), { 'content-type': 'text/html' }, cookie(s));
    }
    if (p === '/users/sign_in' && init.method === 'POST') {
      const f = new URLSearchParams(init.body ?? '');
      if (!sess || f.get('authenticity_token') !== sess.csrf) return response(422, '<html>InvalidAuthenticityToken</html>');
      if (f.get('user[login]') !== username || f.get('user[password]') !== password) {
        return response(422, html(sess.csrf), { 'content-type': 'text/html' });
      }
      const s = newSession(true); // o Devise troca a sessão e apaga o token (clean_up_csrf_token_on_authentication)
      sessions.get(s)!.csrf = '';
      return response(302, '', { location: `${FAKE_BASE}/` }, cookie(s));
    }
    if (!sess?.user) return init.headers.Accept?.includes('json') ? response(401, '{"error":"You need to sign in or sign up before continuing."}') : response(302, '', { location: `${FAKE_BASE}/users/sign_in` });

    // Renova o cookie a cada resposta (como o cookie_store do Rails).
    const rotated = newSession(true);
    sessions.get(rotated)!.csrf = sess.csrf;
    const ck = cookie(rotated);

    if (init.method !== 'GET' && (!sess.csrf || init.headers['X-CSRF-Token'] !== sess.csrf)) {
      return response(422, '{"status":422,"error":"Unprocessable Content"}', {}, ck);
    }
    const json = (status: number, v: unknown) => response(status, JSON.stringify(v), { 'content-type': 'application/json' }, ck);

    if (p === '/' && init.method === 'GET') {
      // Página HTML gera o token da sessão se não houver (fica só no cookie novo).
      if (!sess.csrf) sessions.get(rotated)!.csrf = `csrf-new-${rotated}`;
      return response(200, html(sessions.get(rotated)!.csrf), { 'content-type': 'text/html' }, ck);
    }
    if (p === '/worker_status') return json(200, { pending: 0, awaiting_retry: 0, recent_failures: 1, event_count: events.length, max_id: 0 });
    if (p === '/agents.json' && init.method === 'GET') return json(200, agents);
    if (p === '/agents.json' && init.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}').agent ?? {};
      if (!body.name) return json(422, { name: ["can't be blank"] });
      const options = typeof body.options === 'string' ? JSON.parse(body.options) : body.options;
      const created = { id: nextAgentId++, user_id: 1, name: body.name, schedule: body.schedule, disabled: !!body.disabled, events_count: 0, options, source_ids: body.source_ids };
      agents.push(created);
      return json(200, created); // sem "type", como o Huginn real
    }
    const one = /^\/agents\/(\d+)(\.json|\/events\.json|\/run\.json)$/.exec(p);
    if (one) {
      const ag = agents.find((a) => a.id === Number(one[1]));
      if (!ag) return json(404, { error: 'not found' });
      if (one[2] === '/events.json') return json(200, events.filter((e) => e.agent_id === ag.id));
      if (one[2] === '/run.json' && init.method === 'POST') return response(200, '', {}, ck);
      if (init.method === 'PUT') {
        const body = JSON.parse(init.body ?? '{}').agent ?? {};
        if ('disabled' in body) ag.disabled = body.disabled;
        return json(200, ag);
      }
      return json(200, ag);
    }
    if (p === '/events.json') return json(200, events);
    if (p === '/scenarios.json') return json(200, [{ id: 1, name: 'default-scenario', description: 'Agentes de exemplo' }]);
    if (p === '/scenarios/scenario_imports' && init.method === 'POST') {
      const f = new URLSearchParams(init.body ?? '');
      const data = JSON.parse(f.get('scenario_import[data]') ?? '{}');
      if (f.get('scenario_import[do_import]') !== '1' || !data.guid || !data.name || !Array.isArray(data.agents)) return response(200, '<html>new</html>', {}, ck);
      if (data.agents.some((a: Record<string, unknown>) => !a.guid || typeof a.disabled !== 'boolean')) return response(500, '<html>error</html>', {}, ck);
      return response(302, '', { location: `${FAKE_BASE}/scenarios/${nextScenario++}` }, ck);
    }
    return json(404, { error: 'not found' });
  };

  return { fetch, calls, agents, events, creds: { url: FAKE_BASE, username, password } };
}
