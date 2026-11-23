// Cliente mínimo da API do E2B self-hosted (vertalrun.com) e do navd dentro do
// sandbox "vertal-browser", sem o SDK do E2B (fetch puro, roda no Worker).
//   API:  POST   {E2B_API_URL}/sandboxes                 cria o sandbox (X-API-Key)
//         POST   {E2B_API_URL}/sandboxes/{id}/timeout    renova o timeout de inatividade
//         DELETE {E2B_API_URL}/sandboxes/{id}            encerra
//   navd: https://8787-{id}.{E2B_DOMAIN}/…               Bearer <token da sessão>
import { sandboxHost } from '../supabase/functions/_shared/navigatorCore.ts';

export interface E2BEnv {
  E2B_API_KEY?: string;
  /** Padrão https://api.vertalrun.com */
  E2B_API_URL?: string;
  /** Padrão vertalrun.com (portas do sandbox em https://<porta>-<id>.<domínio>). */
  E2B_DOMAIN?: string;
  /** Padrão vertal-browser */
  NAVIGATOR_TEMPLATE?: string;
}

export class E2BError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

export const NAVD_PORT = 8787;

/** O Cloudflare na frente do vertalrun.com recusa requisição sem User-Agent de navegador/serviço conhecido (erro 1010). */
const USER_AGENT = 'vertal-navigator-worker/1 (+https://vertal.dev)';

/** Redes que o navegador do sandbox nunca alcança (rede interna da VM, metadados). */
export const DENY_OUT_CIDRS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10', '127.0.0.0/8'];

const apiUrl = (env: E2BEnv) => (env.E2B_API_URL || 'https://api.vertalrun.com').replace(/\/+$/, '');
export const e2bDomain = (env: E2BEnv) => env.E2B_DOMAIN || 'vertalrun.com';

async function api(env: E2BEnv, method: string, path: string, body?: unknown): Promise<Response> {
  if (!env.E2B_API_KEY) throw new E2BError('E2B_API_KEY not configured');
  return fetch(`${apiUrl(env)}${path}`, {
    method,
    headers: { 'X-API-Key': env.E2B_API_KEY, 'User-Agent': USER_AGENT, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface CreatedSandbox {
  sandboxId: string;
}

export async function createSandbox(env: E2BEnv, opts: { timeoutSeconds: number; metadata: Record<string, string> }): Promise<CreatedSandbox> {
  const res = await api(env, 'POST', '/sandboxes', {
    templateID: env.NAVIGATOR_TEMPLATE || 'vertal-browser',
    timeout: opts.timeoutSeconds,
    // envd (comandos/arquivos) exige token: quem tem só o id do sandbox (que aparece
    // na URL da tela ao vivo) não executa nada lá dentro.
    secure: true,
    autoPause: false,
    allow_internet_access: true,
    network: { denyOut: DENY_OUT_CIDRS },
    metadata: opts.metadata,
  });
  const text = await res.text();
  if (!res.ok) throw new E2BError(`create ${res.status}: ${text.slice(0, 200)}`, res.status);
  const data = JSON.parse(text) as { sandboxID?: string };
  if (!data.sandboxID || !/^[a-z0-9]{8,40}$/i.test(data.sandboxID)) throw new E2BError('create: no sandboxID');
  return { sandboxId: data.sandboxID };
}

export async function setSandboxTimeout(env: E2BEnv, sandboxId: string, timeoutSeconds: number): Promise<boolean> {
  const res = await api(env, 'POST', `/sandboxes/${encodeURIComponent(sandboxId)}/timeout`, { timeout: timeoutSeconds });
  return res.ok;
}

export async function killSandbox(env: E2BEnv, sandboxId: string): Promise<void> {
  await api(env, 'DELETE', `/sandboxes/${encodeURIComponent(sandboxId)}`).catch(() => undefined);
}

export interface NavdTarget {
  sandboxId: string;
  token: string;
}

/** Chama o navd do sandbox. Lança E2BError em falha de rede/HTTP 5xx do proxy. */
export async function navd<T = Record<string, unknown>>(
  env: E2BEnv, target: NavdTarget | { sandboxId: string; token?: undefined }, method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 25_000,
): Promise<{ status: number; data: T }> {
  const url = `https://${sandboxHost(NAVD_PORT, target.sandboxId, e2bDomain(env))}${path}`;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new E2BError(`navd ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text().catch(() => '');
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // 502/503/504 do client-proxy = sandbox fora do ar.
  if (res.status >= 502 || data === null) throw new E2BError(`navd ${path}: HTTP ${res.status}`, res.status);
  return { status: res.status, data: data as T };
}

/**
 * GET do navd que devolve um stream (áudio do navegador, /audio). O timeout vale só
 * até os cabeçalhos chegarem: depois disso o corpo fica aberto enquanto o cliente
 * ouvir; quando ele sai, o cancelamento do body fecha a conexão com o navd.
 */
export async function navdStream(env: E2BEnv, target: NavdTarget, path: string, connectTimeoutMs = 15_000): Promise<Response> {
  const url = `https://${sandboxHost(NAVD_PORT, target.sandboxId, e2bDomain(env))}${path}`;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), connectTimeoutMs);
  try {
    return await fetch(url, { method: 'GET', headers, signal: ac.signal });
  } catch (e) {
    throw new E2BError(`navd ${path}: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Espera o navd responder (o sandbox acabou de ser criado). Fase 4: espera mais
 * (padrão 40 s) e com backoff (400 ms → 2,5 s), porque na 1ª abertura do dia o
 * proxy do E2B e o navd demoram mais para subir e o start falhava com
 * "O navegador na nuvem não respondeu" (start_failed) — a 2ª tentativa funcionava.
 */
export async function waitNavd(env: E2BEnv, sandboxId: string, totalMs = 40_000, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  const deadline = Date.now() + totalMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const left = deadline - Date.now();
      const { data } = await navd<{ ok?: boolean }>(env, { sandboxId }, 'GET', '/health', undefined, Math.max(1_000, Math.min(6_000, left)));
      if (data?.ok) return true;
    } catch {
      // ainda subindo
    }
    const wait = navdBackoffMs(attempt++);
    if (Date.now() + wait >= deadline) break;
    await sleep(wait);
  }
  return false;
}

/** Espera entre tentativas de /health: 400 ms, 700, 1.100, 1.600, 2.200, depois 2.500. */
export function navdBackoffMs(attempt: number): number {
  const steps = [400, 700, 1_100, 1_600, 2_200];
  return steps[attempt] ?? 2_500;
}
