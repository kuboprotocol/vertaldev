// Teste de ponta a ponta do Vertal Navigator contra o E2B self-hosted, usando o
// MESMO código do Worker (worker/e2bClient.ts, navigatorCrypto.ts, navigatorCore.ts),
// sem Supabase: o "cofre" e o "perfil" são simulados em /tmp. Nada aqui imprime segredos.
//
//   E2B_API_KEY=… OPENROUTER_API_KEY=… (ou NAVIGATOR_LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=…) npx vite-node scripts/navigator-smoke.ts -- <cmd>
//   cmds: start [url] | task "<instrução>" | poll [segundos] | takeover | release | save | stop
//   Variáveis opcionais: SMOKE_SECRET_NAME/SMOKE_SECRET_BOUND/SMOKE_SECRET_VALUE (simula o cofre),
//   SMOKE_CODE (responde pedidos de código), SMOKE_APPROVE=1 (aprova pagamento; padrão: recusa).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createSandbox, killSandbox, navd, setSandboxTimeout, waitNavd, type E2BEnv } from '../worker/e2bClient';
import { decryptWithConnectorKey, encryptWithConnectorKey, randomPassword, randomToken } from '../worker/navigatorCrypto';
import { filterCookies } from '../worker/navigatorRoutes';
import { liveViewUrl, pickSecretForHost, sanitizeEvents, sanitizePending } from '../supabase/functions/_shared/navigatorCore';

const STATE = '/tmp/navigator-smoke.json';
const PROFILE = '/tmp/navigator-smoke-profile.json';
const env: E2BEnv = { E2B_API_KEY: process.env.E2B_API_KEY, E2B_API_URL: process.env.E2B_API_URL, E2B_DOMAIN: process.env.E2B_DOMAIN };
// Chave de teste local (não é a de produção).
const TEST_KEY = process.env.SMOKE_ENC_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

type State = { sandboxId: string; token: string; viewPassword: string; controlPassword: string; after: number; startedAt: number };
const load = (): State => JSON.parse(readFileSync(STATE, 'utf8'));
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s), { mode: 0o600 });
const target = (s: State) => ({ sandboxId: s.sandboxId, token: s.token });

async function saveProfile(s: State) {
  const { data } = await navd<{ ok?: boolean; cookies?: unknown }>(env, target(s), 'GET', '/cookies');
  const cookies = filterCookies(data.cookies);
  writeFileSync(PROFILE, JSON.stringify(await encryptWithConnectorKey(TEST_KEY, JSON.stringify(cookies))), { mode: 0o600 });
  console.log(`perfil salvo cifrado: ${cookies.length} cookies (${[...new Set(cookies.map((c) => c.domain))].slice(0, 8).join(', ')})`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2).filter((a) => a !== '--');
  if (cmd === 'start') {
    const t0 = Date.now();
    const { sandboxId } = await createSandbox(env, { timeoutSeconds: 900, metadata: { app: 'vertal-navigator', session: 'smoke' } });
    console.log('sandbox', sandboxId, `${Date.now() - t0}ms`);
    if (!(await waitNavd(env, sandboxId))) throw new Error('navd não respondeu');
    const s: State = { sandboxId, token: randomToken(), viewPassword: randomPassword(), controlPassword: randomPassword(), after: 0, startedAt: Date.now() };
    let cookies: unknown[] = [];
    if (existsSync(PROFILE)) cookies = JSON.parse(await decryptWithConnectorKey(TEST_KEY, JSON.parse(readFileSync(PROFILE, 'utf8'))));
    const init = await navd<{ ok?: boolean; cookiesImported?: number }>(env, { sandboxId }, 'POST', '/init', {
      token: s.token, viewPassword: s.viewPassword, controlPassword: s.controlPassword, cookies, ...(arg ? { startUrl: arg } : {}),
    }, 45_000);
    save(s);
    console.log('init', init.data, `total ${Date.now() - t0}ms`);
    console.log('live view (só ver):', liveViewUrl(sandboxId, env.E2B_DOMAIN || 'vertalrun.com', '********', false));
    return;
  }
  const s = load();
  await setSandboxTimeout(env, s.sandboxId, 900);
  if (cmd === 'task') {
    const secrets = process.env.SMOKE_SECRET_NAME ? [{ name: process.env.SMOKE_SECRET_NAME, boundTo: process.env.SMOKE_SECRET_BOUND ?? null }] : [];
    const res = await navd(env, target(s), 'POST', '/task', {
      task: arg, maxSteps: 25, secrets,
      ...(process.env.NAVIGATOR_LLM_PROVIDER === 'deepseek'
        ? { provider: 'deepseek', model: process.env.NAVIGATOR_MODEL || 'deepseek-flash', apiKey: process.env.DEEPSEEK_API_KEY }
        : { model: process.env.NAVIGATOR_MODEL || 'google/gemini-3-flash-preview', apiKey: process.env.OPENROUTER_API_KEY }),
    });
    console.log('task', res.status, res.data);
    return;
  }
  if (cmd === 'poll') {
    const until = Date.now() + Number(arg || 90) * 1000;
    const leaked: string[] = [];
    while (Date.now() < until) {
      const { data } = await navd<{ status?: string; events?: unknown; pending?: unknown; lastSeq?: number }>(env, target(s), 'GET', `/events?after=${s.after}`);
      const raw = JSON.stringify(data.events ?? []);
      for (const v of [process.env.SMOKE_SECRET_VALUE, process.env.SMOKE_CODE]) if (v && raw.includes(v)) leaked.push(v.slice(0, 2));
      for (const e of sanitizeEvents(data.events)) console.log(`#${e.seq} ${e.type}`, JSON.stringify({ ...e, seq: undefined, ts: undefined, type: undefined }).slice(0, 300));
      s.after = data.lastSeq ?? s.after;
      save(s);
      for (const p of sanitizePending(data.pending)) {
        if (p.kind === 'secret') {
          // Simula fulfillSecret do Worker: mesmo vínculo segredo↔domínio.
          const meta = [{ id: '00000000-0000-0000-0000-000000000000', owner_id: 'x', env_key: process.env.SMOKE_SECRET_NAME ?? '', bound_to: process.env.SMOKE_SECRET_BOUND ?? null, role: 'owner' as const }];
          const ok = pickSecretForHost(meta, p.name, p.host);
          console.log(`→ segredo ${p.name} para ${p.host}: ${ok ? 'liberado' : 'negado'}`);
          await navd(env, target(s), 'POST', '/input', { id: p.id, kind: 'secret', value: ok ? process.env.SMOKE_SECRET_VALUE : null });
        } else if (p.kind === 'approval') {
          const approve = process.env.SMOKE_APPROVE === '1';
          console.log(`→ aprovação pedida (${p.reason}) alvo="${p.target}" → ${approve ? 'APROVA' : 'RECUSA'}`);
          await navd(env, target(s), 'POST', '/input', { id: p.id, kind: 'approval', approve });
        } else if (p.kind === 'code' && process.env.SMOKE_CODE) {
          console.log(`→ código pedido: "${p.question}" → enviando`);
          await navd(env, target(s), 'POST', '/input', { id: p.id, kind: 'code', value: process.env.SMOKE_CODE });
        } else {
          console.log('pendente', p);
        }
      }
      if (data.status && ['done', 'failed', 'stopped'].includes(data.status)) {
        console.log('status final:', data.status);
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    console.log(leaked.length ? `VAZAMENTO: valor sensível apareceu nos eventos (${leaked.join(',')})` : 'nenhum valor sensível nos eventos');
    return;
  }
  if (cmd === 'save') return saveProfile(s);
  if (cmd === 'takeover' || cmd === 'release') {
    const res = await navd(env, target(s), 'POST', `/${cmd}`, { controlPassword: randomPassword() });
    console.log(cmd, res.data);
    return;
  }
  if (cmd === 'stop') {
    await saveProfile(s).catch((e) => console.log('save falhou', e.message));
    await navd(env, target(s), 'POST', '/stop', {}, 12_000).catch(() => undefined);
    await killSandbox(env, s.sandboxId);
    console.log('encerrado; minutos de uso ≈', Math.ceil((Date.now() - s.startedAt) / 60_000));
    return;
  }
  throw new Error(`comando desconhecido: ${cmd}`);
}

main().catch((e) => {
  console.error('ERRO', e instanceof Error ? e.message : e);
  process.exit(1);
});
