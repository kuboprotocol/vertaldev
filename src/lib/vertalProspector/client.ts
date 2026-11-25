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
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new ProspectorError('not_signed_in');
  const r = await (opts.fetchImpl ?? fetch)(opts.url ?? functionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prospector', op, ...payload }),
  });
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
 * Ordem: principal, depois espelhos com CORS liberado (mesmos dados, mesma licença ODbL).
 */
export const MAP_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Tempo máximo de cada tentativa no mapa e da busca inteira (antes não havia: a tela girava para sempre). */
export const MAP_ATTEMPT_TIMEOUT_MS = 30_000;
export const MAP_TOTAL_TIMEOUT_MS = 100_000;
export const GEOCODER_TIMEOUT_MS = 10_000;

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

/** Roda no navegador uma consulta do mapa (só consultas JSON montadas aqui/no servidor) e devolve os elementos (ou null). */
export async function runMapQueryInBrowser(
  query: string,
  fetchImpl: typeof fetch = fetch,
  opts: { endpoints?: string[]; attemptMs?: number; deadline?: number } = {},
): Promise<unknown[] | null> {
  if (!query || query.length > 4_000 || !query.startsWith('[out:json]')) return null;
  for (const url of opts.endpoints ?? MAP_ENDPOINTS) {
    const left = opts.deadline ? opts.deadline - Date.now() : Infinity;
    if (left < 2_000) break;
    try {
      const r = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        // Requisição "simples" (sem preflight): todos os servidores da lista aceitam CORS assim.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      }, Math.min(opts.attemptMs ?? MAP_ATTEMPT_TIMEOUT_MS, left));
      if (!r.ok) continue;
      const d = (await r.json()) as { elements?: unknown[]; remark?: string };
      // "remark" com runtime error = o servidor estourou o tempo da consulta; tenta o próximo.
      if (Array.isArray(d?.elements) && !(d.elements.length === 0 && /error/i.test(String(d.remark ?? '')))) return d.elements.slice(0, 400);
    } catch {
      /* prazo estourado, CORS ou rede: tenta o próximo */
    }
  }
  return null;
}

export interface MapPlace { areaId: number | null; bbox: [number, number, number, number] | null; name: string }

/**
 * Geocodificador público do mapa, chamado pelo navegador (uma consulta por busca, com cache na sessão).
 * Política de uso: até 1 req/s, identificação pelo Referer do site (o navegador envia), sem buscas em massa.
 */
export async function geocodeAreaInBrowser(area: string, fetchImpl: typeof fetch = fetch, ms = GEOCODER_TIMEOUT_MS): Promise<MapPlace | null> {
  const key = `vertal-prospector-geo:${area.trim().toLowerCase()}`;
  try {
    const hit = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (hit) return JSON.parse(hit) as MapPlace;
  } catch { /* sem cache */ }
  try {
    const r = await fetchWithTimeout(
      fetchImpl,
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(area)}`,
      { method: 'GET' },
      ms,
    );
    if (!r.ok) return null;
    const places = (await r.json()) as Array<{ osm_type?: string; osm_id?: number; display_name?: string; boundingbox?: string[] }>;
    if (!Array.isArray(places) || !places.length) return null;
    const p = places.find((x) => x.osm_type === 'relation') ?? places.find((x) => x.osm_type === 'way') ?? places[0];
    const bb = (p.boundingbox ?? []).map(Number);
    const out: MapPlace = {
      areaId: overpassAreaId(String(p.osm_type ?? ''), Number(p.osm_id)),
      // Nominatim: [sul, norte, oeste, leste] → Overpass: (sul, oeste, norte, leste)
      bbox: bb.length === 4 && bb.every(Number.isFinite) ? [bb[0], bb[2], bb[1], bb[3]] : null,
      name: String(p.display_name ?? area),
    };
    try { sessionStorage?.setItem(key, JSON.stringify(out)); } catch { /* sem cache */ }
    return out;
  } catch {
    return null;
  }
}

/** Consulta por retângulo (rápida em qualquer servidor); usada quando a consulta por área não responde. */
export function buildOverpassQueryByBbox(tags: OsmTag[], bbox: [number, number, number, number], limit = 200): string {
  const b = bbox.map((n) => Number(n).toFixed(6)).join(',');
  const lines = tags.slice(0, 6).map((t) => `  nwr["${t.key}"="${t.value}"]["name"](${b});`);
  return `[out:json][timeout:25];\n(\n${lines.join('\n')}\n);\nout center tags ${Math.max(1, Math.min(limit, 300))};`;
}

/** Retângulo pega cidades vizinhas: descarta quem declara outra cidade no endereço. */
export function keepSameCity(elements: unknown[], city: string | null): unknown[] {
  if (!city) return elements;
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const want = norm(city);
  return elements.filter((e) => {
    const c = (e as { tags?: Record<string, string> })?.tags?.['addr:city'];
    return !c || norm(c) === want;
  });
}

/**
 * Busca de empresas 100% no navegador do usuário, com prazo total e erro claro:
 * 1) geocodificador → área oficial do município; 2) consulta por área (servidor principal e espelhos);
 * 3) se não responder, consulta por retângulo (bem mais leve); 4) sem geocodificador, área pelo nome do município.
 * Devolve os elementos crus (o servidor filtra: só nome, site, telefone, e-mail e endereço) ou lança ProspectorError("map_timeout").
 */
export async function searchCompaniesInBrowser(
  icpRaw: unknown,
  fetchImpl: typeof fetch = fetch,
  opts: { totalMs?: number; attemptMs?: number; endpoints?: string[] } = {},
): Promise<{ elements: unknown[]; via: string }> {
  const icp = parseIcp(icpRaw);
  if (!icp.osmTags.length || !icp.area) throw new ProspectorError('icp_incomplete');
  const deadline = Date.now() + (opts.totalMs ?? MAP_TOTAL_TIMEOUT_MS);
  const run = (q: string) => runMapQueryInBrowser(q, fetchImpl, { endpoints: opts.endpoints, attemptMs: opts.attemptMs, deadline });
  const parsed = parseArea(icp.area);
  const place = await geocodeAreaInBrowser(icp.area, fetchImpl);
  if (place?.areaId) {
    const els = await run(buildOverpassQuery(icp.osmTags, place.areaId, 200));
    if (els) return { elements: els, via: 'área do município' };
  }
  if (place?.bbox) {
    const els = await run(buildOverpassQueryByBbox(icp.osmTags, place.bbox, 200));
    if (els) return { elements: keepSameCity(els, parsed?.city ?? null), via: 'região do município' };
  }
  if (!place && parsed) {
    const els = await run(buildOverpassQueryByName(icp.osmTags, parsed.city, parsed.uf, 200));
    if (els) return { elements: els, via: 'nome do município' };
  }
  if (!place && !parsed) throw new ProspectorError('area_not_found', { finding: `Não achei a região "${icp.area}" no mapa. Use "Cidade, UF" (ex.: "Campinas, SP").` });
  throw new ProspectorError('map_timeout');
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
