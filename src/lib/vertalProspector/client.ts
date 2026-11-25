// Vertal Prospector · cliente (navegador). Desligado por padrão: só aparece com
// VITE_VERTAL_PROSPECTOR=true E o servidor liberando este usuário (VERTAL_PROSPECTOR_USER_IDS).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionUrl } from '@/lib/vertalCodeAi/client';
import {
  buildOverpassQuery,
  buildOverpassQueryByName,
  isProspectCommand,
  overpassAreaId,
  parseArea,
  parseIcp,
  parseProspectCommand,
  PROSPECTOR_NAME,
  type OsmTag,
} from '../../../supabase/functions/_shared/vertalProspector/core';

export { isProspectCommand, parseProspectCommand, PROSPECTOR_NAME };

export const VERTAL_PROSPECTOR_ROUTE = '/vertal-code-ai/prospector';

type EnvLike = Record<string, unknown> | undefined;

/** Interruptor do front-end. Qualquer valor diferente de "true"/"1" = desligado. */
export function isVertalProspectorEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_PROSPECTOR;
  return v === true || v === 'true' || v === '1';
}

export function vertalProspectorHref(opts: { companyName?: string; cnpj?: string; website?: string; from?: 'chat' | 'code' } = {}): string {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.companyName?.trim()) q.set('empresa', opts.companyName.trim().slice(0, 120));
  if (opts.cnpj?.trim()) q.set('cnpj', opts.cnpj.trim().slice(0, 20));
  if (opts.website?.trim()) q.set('site', opts.website.trim().slice(0, 300));
  const s = q.toString();
  return s ? `${VERTAL_PROSPECTOR_ROUTE}?${s}` : VERTAL_PROSPECTOR_ROUTE;
}

/** Comando "prospectar clientes …" do Vertal Chat → endereço da tela com os campos já preenchidos. */
export function vertalProspectorHrefFromChat(text: string): string {
  return vertalProspectorHref({ ...parseProspectCommand(text), from: 'chat' });
}

export function readProspectorHandoff(search: string): { companyName: string; cnpj: string; website: string; from: string; campaignId: string } {
  const q = new URLSearchParams(search);
  const campaignId = q.get('campanha') ?? '';
  return {
    // Vertal Growth Team abre a captação direto na campanha dele.
    campaignId: /^[0-9a-f-]{36}$/i.test(campaignId) ? campaignId : '',
    companyName: (q.get('empresa') ?? '').slice(0, 120),
    cnpj: (q.get('cnpj') ?? '').replace(/[^\d./-]/g, '').slice(0, 20),
    website: (q.get('site') ?? '').slice(0, 300),
    from: q.get('from') ?? '',
  };
}

export class ProspectorError extends Error {
  constructor(public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

/** Chama uma operação do Vertal Prospector na edge function. */
export async function callProspector<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new ProspectorError('not_signed_in');
  const init: RequestInit = {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prospector', op, ...payload }),
  };
  const fetchImpl = opts.fetchImpl ?? fetch;
  let r: Response;
  try {
    // Com prazo (opcional): o servidor que não responde vira erro claro, não roda eterna.
    r = opts.timeoutMs ? await fetchWithTimeout(fetchImpl, opts.url ?? functionUrl(), init, opts.timeoutMs) : await fetchImpl(opts.url ?? functionUrl(), init);
  } catch (e) {
    if (opts.timeoutMs && e instanceof Error && e.message === 'timeout') throw new ProspectorError('server_timeout');
    throw e;
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ProspectorError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export type ProspectorAccess = 'checking' | 'allowed' | 'denied';

/** Pergunta ao servidor (op status). Qualquer falha = não liberado. */
export async function fetchProspectorAccess(token: string, fetchImpl: typeof fetch = fetch, url?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await callProspector('status', {}, { token, fetchImpl, url });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<boolean>>();
export function resetProspectorAccessCache(): void {
  cache.clear();
}

/** Hook: 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useVertalProspectorAccess(enabledOverride?: boolean): ProspectorAccess {
  const buildOn = isVertalProspectorEnabled();
  const [state, setState] = useState<ProspectorAccess>(() =>
    enabledOverride === true ? 'allowed' : enabledOverride === false || !buildOn ? 'denied' : 'checking',
  );
  useEffect(() => {
    if (enabledOverride !== undefined || !buildOn) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s?.access_token || !s.user?.id) return false;
      let p = cache.get(s.user.id);
      if (!p) {
        p = fetchProspectorAccess(s.access_token);
        cache.set(s.user.id, p);
        p.then((ok) => {
          if (!ok) cache.delete(s.user.id);
        });
      }
      return p;
    })()
      .then((ok) => alive && setState(ok ? 'allowed' : 'denied'))
      .catch(() => alive && setState('denied'));
    return () => {
      alive = false;
    };
  }, [enabledOverride, buildOn]);
  return state;
}

export const PROSPECTOR_ERROR_TEXT: Record<string, string> = {
  vertal_prospector_disabled: 'O Vertal Prospector não está liberado na sua conta.',
  vertal_code_ai_disabled: 'O Vertal Prospector não está liberado na sua conta.',
  rate_limited: 'Muitos pedidos em sequência. Espere um minuto.',
  company_name_required: 'Escreva o nome da empresa.',
  invalid_cnpj: 'Esse CNPJ não é válido (confira os dígitos).',
  invalid_website: 'Esse site não parece válido.',
  model_failed: 'A IA não respondeu agora. Tente de novo em instantes.',
  icp_incomplete: 'Falta informação no cliente ideal para buscar empresas.',
  icp_not_confirmed: 'Confirme o cliente ideal antes de buscar empresas.',
  area_not_found: 'Não achei essa região no mapa.',
  lead_cap_reached: 'Esta campanha já tem o máximo de leads.',
  map_busy: 'O mapa aberto não respondeu agora. Tente em 1 ou 2 minutos.',
  map_failed: 'A busca no mapa falhou. Tente de novo.',
  map_timeout: 'O mapa aberto (OpenStreetMap) demorou demais e nenhum servidor respondeu. Nada foi cobrado — tente de novo em 1 ou 2 minutos.',
  server_timeout: 'O servidor do Vertal demorou demais para gravar as empresas. Nada foi cobrado — tente de novo em instantes.',
  search_slow: 'A busca de empresas passou de 1 minuto e foi interrompida. Nada foi cobrado — tente de novo em 1 ou 2 minutos.',
  no_channel: 'Sem e-mail utilizável nem telefone para este lead.',
  message_locked: 'Essa mensagem já saiu e não pode ser editada.',
  send_blocked: 'Envio bloqueado pelas regras de segurança.',
  gmail_account_required: 'Conecte o Gmail em Conectores para enviar.',
  gmail_account_unavailable: 'Não consegui usar o Gmail conectado. Reconecte em Conectores.',
  gmail_needs_reconsent: 'O Gmail precisa ser reconectado (permissão).',
  gmail_send_failed: 'O Gmail recusou o envio. Nada foi enviado.',
  first_not_sent: 'Envie o primeiro e-mail antes do follow-up.',
  followup_not_due: 'Ainda não é hora deste follow-up.',
  whatsapp_is_manual: 'WhatsApp é enviado por você, pelo link.',
  invalid_phone: 'Telefone inválido para WhatsApp.',
  invalid_email: 'E-mail inválido.',
  invalid_booking_link: 'O link de agenda precisa começar com https://',
  not_signed_in: 'Entre na sua conta.',
  prospector_failed: 'Algo deu errado no servidor.',
};

export function prospectorErrorText(e: unknown): string {
  const code = e instanceof ProspectorError ? e.code : e instanceof Error ? e.message : String(e);
  const extra = e instanceof ProspectorError ? (e.detail.finding as string | undefined) ?? (Array.isArray(e.detail.problems) ? (e.detail.problems as string[]).join('; ') : '') : '';
  const base = PROSPECTOR_ERROR_TEXT[code] ?? 'Algo deu errado. Tente de novo.';
  return extra ? `${base} ${extra}` : base;
}

/**
 * Servidores públicos do mapa aberto (o navegador do usuário consulta; o servidor é recusado por eles).
 * Mesmos dados, mesma licença (ODbL). Ordem = quem respondeu mais rápido nos testes reais de 25/11/2026
 * (o espelho maps.mail.ru respondeu em ~6 s; o principal e os outros espelhos penduraram ou deram 504).
 */
export const MAP_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Prazos. A busca inteira (geocodificador + mapa) termina em até ~55 s, sempre com resultado ou erro claro.
 * Cada tentativa num servidor tem prazo que cobre também a leitura da resposta (antes só cobria o cabeçalho:
 * um servidor que mandava o corpo devagar segurava a tela).
 */
export const MAP_ATTEMPT_TIMEOUT_MS = 25_000;
export const MAP_TOTAL_TIMEOUT_MS = 55_000;
/** Pedido "em leque": se o servidor da vez não respondeu nesse tempo, o próximo começa junto (o 1º que responder vence). */
export const MAP_HEDGE_MS = 2_000;
export const GEOCODER_TIMEOUT_MS = 8_000;

/** fetch com prazo: aborta a requisição e rejeita com "timeout" quando passa do tempo. */
export async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('timeout'));
      ctrl?.abort();
    }, ms);
  });
  try {
    return await Promise.race([fetchImpl(url, { ...init, signal: ctrl?.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca JSON com prazo que cobre conexão E leitura do corpo; também para quando `outer` é abortado
 * (ex.: outro servidor já respondeu). Nunca lança: devolve { ok:false } em prazo, rede, CORS ou JSON inválido.
 */
export async function fetchJsonWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number,
  outer?: AbortSignal,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const onOuter = () => ctrl?.abort();
  if (outer?.aborted) return { ok: false, status: 0, data: null };
  outer?.addEventListener('abort', onOuter);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = new Promise<{ ok: boolean; status: number; data: unknown }>((resolve) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      resolve({ ok: false, status: 0, data: 'timeout' });
    }, Math.max(1, ms));
    outer?.addEventListener('abort', () => resolve({ ok: false, status: 0, data: 'aborted' }));
  });
  const work = (async () => {
    try {
      const r = await fetchImpl(url, { ...init, signal: ctrl?.signal });
      if (!r.ok) return { ok: false, status: r.status, data: null };
      return { ok: true, status: r.status, data: (await r.json()) as unknown };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  })();
  try {
    return await Promise.race([work, stop]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

function validElements(d: unknown): unknown[] | null {
  const x = d as { elements?: unknown[]; remark?: string } | null;
  // "remark" com runtime error = o servidor estourou o tempo da consulta: não vale como resposta.
  if (!x || !Array.isArray(x.elements)) return null;
  if (x.elements.length === 0 && /error/i.test(String(x.remark ?? ''))) return null;
  return x.elements.slice(0, 400);
}

/**
 * Roda no navegador uma consulta do mapa (só consultas JSON montadas aqui/no servidor) e devolve os elementos (ou null).
 * Pedido em leque: começa no 1º servidor; a cada MAP_HEDGE_MS sem resposta (ou na hora, se um falhar) entra o próximo;
 * o primeiro que devolver dados válidos vence e os demais são cancelados. Servidor que recusa rápido (504/429 de
 * "ocupado") volta para a fila e é tentado de novo após uma pausa. Nunca passa do `deadline`.
 */
export async function runMapQueryInBrowser(
  query: string,
  fetchImpl: typeof fetch = fetch,
  opts: { endpoints?: string[]; attemptMs?: number; deadline?: number; hedgeMs?: number; retries?: number; retryDelayMs?: number } = {},
): Promise<unknown[] | null> {
  if (!query || query.length > 4_000 || !query.startsWith('[out:json]')) return null;
  const deadline = opts.deadline ?? Date.now() + MAP_TOTAL_TIMEOUT_MS;
  const attemptMs = opts.attemptMs ?? MAP_ATTEMPT_TIMEOUT_MS;
  const hedgeMs = opts.hedgeMs ?? MAP_HEDGE_MS;
  const maxRetries = opts.retries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 2_000;
  if (deadline - Date.now() < 500) return null;
  const queue = (opts.endpoints ?? MAP_ENDPOINTS).map((url) => ({ url, tries: 0 }));
  const all = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  return new Promise<unknown[] | null>((resolve) => {
    let done = false;
    let running = 0; // tentativas em voo + novas tentativas agendadas
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const finish = (v: unknown[] | null) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadlineTimer);
      timers.forEach((t) => clearTimeout(t));
      all?.abort();
      resolve(v);
    };
    const deadlineTimer = setTimeout(() => finish(null), Math.max(1, deadline - Date.now()));
    const launch = () => {
      if (done) return;
      clearTimeout(hedgeTimer);
      const left = deadline - Date.now();
      const item = left >= 500 ? queue.shift() : undefined;
      if (!item) {
        if (running === 0) finish(null);
        return;
      }
      running++;
      item.tries++;
      const started = Date.now();
      fetchJsonWithTimeout(fetchImpl, item.url, {
        method: 'POST',
        // Requisição "simples" (sem preflight): todos os servidores da lista aceitam CORS assim.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      }, Math.min(attemptMs, left), all?.signal).then((r) => {
        running--;
        if (done) return;
        const els = r.ok ? validElements(r.data) : null;
        if (els) return finish(els);
        // Recusa rápida (servidor ocupado) → tenta o mesmo servidor de novo daqui a pouco.
        if (Date.now() - started < attemptMs / 3 && item.tries <= maxRetries && deadline - Date.now() > retryDelayMs + 1_000) {
          running++;
          const t = setTimeout(() => {
            timers.delete(t);
            running--;
            queue.push(item);
            launch();
          }, retryDelayMs * item.tries);
          timers.add(t);
        }
        launch(); // o próximo entra na hora
      });
      if (queue.length) hedgeTimer = setTimeout(launch, hedgeMs);
    };
    launch();
  });
}

export interface MapPlace { areaId: number | null; bbox: [number, number, number, number] | null; name: string }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Geocodificador público do mapa (Nominatim). Política de uso: 1 consulta por busca, Referer do site, com cache. */
async function geocodeNominatim(area: string, fetchImpl: typeof fetch, ms: number, signal?: AbortSignal): Promise<MapPlace | null> {
  const r = await fetchJsonWithTimeout(
    fetchImpl,
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(area)}`,
    { method: 'GET' },
    ms,
    signal,
  );
  const places = r.ok && Array.isArray(r.data) ? (r.data as Array<{ osm_type?: string; osm_id?: number; display_name?: string; boundingbox?: string[] }>) : [];
  if (!places.length) return null;
  const p = places.find((x) => x.osm_type === 'relation') ?? places.find((x) => x.osm_type === 'way') ?? places[0];
  const bb = (p.boundingbox ?? []).map(Number);
  return {
    areaId: overpassAreaId(String(p.osm_type ?? ''), Number(p.osm_id)),
    // Nominatim: [sul, norte, oeste, leste] → Overpass: (sul, oeste, norte, leste)
    bbox: bb.length === 4 && bb.every(Number.isFinite) ? [bb[0], bb[2], bb[1], bb[3]] : null,
    name: String(p.display_name ?? area),
  };
}

/**
 * Plano B do geocodificador: malha oficial do IBGE (API pública, CORS liberado), só para municípios do Brasil.
 * Devolve o retângulo do município ("regiao-limitrofe"). Não usa o mapa: funciona mesmo com o Nominatim recusando.
 */
async function geocodeIbge(area: string, fetchImpl: typeof fetch, ms: number, signal?: AbortSignal): Promise<MapPlace | null> {
  const parsed = parseArea(area);
  if (!parsed) return null;
  const started = Date.now();
  const listUrl = parsed.uf
    ? `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${parsed.uf}/municipios`
    : 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
  const list = await fetchJsonWithTimeout(fetchImpl, listUrl, { method: 'GET' }, ms, signal);
  const rows = list.ok && Array.isArray(list.data) ? (list.data as Array<{ id?: number; nome?: string }>) : [];
  const want = norm(parsed.city);
  const hit = rows.find((m) => norm(String(m.nome ?? '')) === want);
  if (!hit?.id) return null;
  const meta = await fetchJsonWithTimeout(
    fetchImpl,
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${Number(hit.id)}/metadados`,
    { method: 'GET' },
    Math.max(1, ms - (Date.now() - started)),
    signal,
  );
  const m = meta.ok && Array.isArray(meta.data) ? (meta.data[0] as { 'regiao-limitrofe'?: Array<{ latitude?: number; longitude?: number }> }) : null;
  const pts = (m?.['regiao-limitrofe'] ?? []).map((p) => [Number(p.latitude), Number(p.longitude)] as const);
  if (pts.length < 2 || !pts.every(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo))) return null;
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  return {
    areaId: null,
    bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)],
    name: `${hit.nome}${parsed.uf ? `, ${parsed.uf}` : ''}`,
  };
}

/**
 * Acha o município: Nominatim e IBGE ao mesmo tempo; vale o primeiro que trouxer o lugar (com cache na sessão).
 * Antes era só o Nominatim — quando ele recusava (bloqueio/limite), sobrava a consulta mais pesada do mapa e a busca estourava.
 */
export async function geocodeAreaInBrowser(area: string, fetchImpl: typeof fetch = fetch, ms = GEOCODER_TIMEOUT_MS): Promise<MapPlace | null> {
  const key = `vertal-prospector-geo:${area.trim().toLowerCase()}`;
  try {
    const hit = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (hit) return JSON.parse(hit) as MapPlace;
  } catch { /* sem cache */ }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const out = await new Promise<MapPlace | null>((resolve) => {
    let left = 2;
    let done = false;
    const take = (p: MapPlace | null) => {
      if (done) return;
      if (p?.bbox || p?.areaId) {
        done = true;
        resolve(p);
      } else if (--left === 0) {
        done = true;
        resolve(null);
      }
    };
    geocodeNominatim(area, fetchImpl, ms, ctrl?.signal).catch(() => null).then(take);
    geocodeIbge(area, fetchImpl, ms, ctrl?.signal).catch(() => null).then(take);
  });
  ctrl?.abort();
  if (out) {
    try { sessionStorage?.setItem(key, JSON.stringify(out)); } catch { /* sem cache */ }
  }
  return out;
}

/** Consulta por retângulo (rápida em qualquer servidor); é a 1ª tentativa — a consulta por área pendura nos espelhos. */
export function buildOverpassQueryByBbox(tags: OsmTag[], bbox: [number, number, number, number], limit = 200): string {
  const b = bbox.map((n) => Number(n).toFixed(6)).join(',');
  const lines = tags.slice(0, 6).map((t) => `  nwr["${t.key}"="${t.value}"]["name"](${b});`);
  return `[out:json][timeout:25];\n(\n${lines.join('\n')}\n);\nout center tags ${Math.max(1, Math.min(limit, 300))};`;
}

/** Retângulo pega cidades vizinhas: descarta quem declara outra cidade no endereço. */
export function keepSameCity(elements: unknown[], city: string | null): unknown[] {
  if (!city) return elements;
  const want = norm(city);
  return elements.filter((e) => {
    const c = (e as { tags?: Record<string, string> })?.tags?.['addr:city'];
    return !c || norm(c) === want;
  });
}

/**
 * Busca de empresas 100% no navegador do usuário, com prazo total (~55 s) e erro claro:
 * 1) município: Nominatim e IBGE em paralelo; 2) consulta por retângulo do município, em leque nos servidores do mapa
 * (leve: responde em segundos); 3) se não vier, consulta pela área oficial; 4) sem município achado, área pelo nome.
 * Devolve os elementos crus (o servidor filtra: só nome, site, telefone, e-mail e endereço) ou lança ProspectorError("map_timeout").
 */
export async function searchCompaniesInBrowser(
  icpRaw: unknown,
  fetchImpl: typeof fetch = fetch,
  opts: { totalMs?: number; attemptMs?: number; endpoints?: string[]; hedgeMs?: number; geocoderMs?: number } = {},
): Promise<{ elements: unknown[]; via: string }> {
  const icp = parseIcp(icpRaw);
  if (!icp.osmTags.length || !icp.area) throw new ProspectorError('icp_incomplete');
  const totalMs = opts.totalMs ?? MAP_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + totalMs;
  const run = (q: string) => runMapQueryInBrowser(q, fetchImpl, { endpoints: opts.endpoints, attemptMs: opts.attemptMs, hedgeMs: opts.hedgeMs, deadline });
  const parsed = parseArea(icp.area);
  const place = await geocodeAreaInBrowser(icp.area, fetchImpl, Math.min(opts.geocoderMs ?? GEOCODER_TIMEOUT_MS, Math.max(1, totalMs / 3)));
  if (!place && !parsed) throw new ProspectorError('area_not_found', { finding: `Não achei a região "${icp.area}" no mapa. Use "Cidade, UF" (ex.: "Campinas, SP").` });
  if (place?.bbox) {
    const els = await run(buildOverpassQueryByBbox(icp.osmTags, place.bbox, 200));
    if (els) return { elements: keepSameCity(els, parsed?.city ?? null), via: 'região do município' };
  }
  if (place?.areaId) {
    const els = await run(buildOverpassQuery(icp.osmTags, place.areaId, 200));
    if (els) return { elements: els, via: 'área do município' };
  }
  if (!place && parsed) {
    const els = await run(buildOverpassQueryByName(icp.osmTags, parsed.city, parsed.uf, 200));
    if (els) return { elements: els, via: 'nome do município' };
  }
  throw new ProspectorError('map_timeout');
}

/** Rede de segurança da tela: qualquer etapa que passe de `ms` vira erro claro (a roda nunca gira para sempre). */
export function withDeadline<T>(p: Promise<T>, ms: number, code = 'search_slow'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProspectorError(code)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
/** Baixa o CSV no navegador (com BOM para o Excel abrir acentos certo). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
