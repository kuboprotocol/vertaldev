// Vertal Growth Team · cliente (navegador). Desligado por padrão: só aparece com
// VITE_VERTAL_GROWTH_TEAM=true E o servidor liberando este usuário (VERTAL_GROWTH_TEAM_ENABLED + allowlist do Prospector).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionUrl } from '@/lib/vertalCodeAi/client';
import { callHuginnOp, type HuginnCallResult } from '@/lib/huginn/client';
import type { HuginnOp } from '../../../supabase/functions/_shared/huginnCore';
import {
  GROWTH_NAME, isGrowthCommand, parseGrowthCommand, type TeamPreset,
} from '../../../supabase/functions/_shared/vertalGrowth/core';

export { GROWTH_NAME, isGrowthCommand, parseGrowthCommand };

export const VERTAL_GROWTH_ROUTE = '/vertal-code-ai/growth';

type EnvLike = Record<string, unknown> | undefined;

/** Interruptor do front-end. Qualquer valor diferente de "true"/"1" = desligado. */
export function isVertalGrowthEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_GROWTH_TEAM;
  return v === true || v === 'true' || v === '1';
}

export function vertalGrowthHref(opts: { projectId?: string | null; project?: string; from?: 'chat' | 'code' | 'builder'; lang?: string; donors?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.projectId) q.set('projectId', opts.projectId);
  if (opts.project?.trim()) q.set('projeto', opts.project.trim().slice(0, 120));
  if (opts.lang) q.set('lang', opts.lang);
  if (opts.donors) q.set('doadores', '1');
  const s = q.toString();
  return s ? `${VERTAL_GROWTH_ROUTE}?${s}` : VERTAL_GROWTH_ROUTE;
}

/** Comando do Vertal Chat ("buscar clientes para meu app X") → endereço da tela já preenchida. */
export function vertalGrowthHrefFromChat(text: string): string {
  const p = parseGrowthCommand(text);
  return vertalGrowthHref({ project: p.project, from: 'chat', lang: p.lang, donors: p.donors });
}

export function readGrowthHandoff(search: string) {
  const q = new URLSearchParams(search);
  const id = q.get('projectId') ?? '';
  return {
    projectId: /^[0-9a-f-]{36}$/i.test(id) ? id : '',
    project: (q.get('projeto') ?? '').slice(0, 120),
    from: q.get('from') ?? '',
    lang: q.get('lang') ?? '',
    donors: q.get('doadores') === '1',
  };
}

export class GrowthError extends Error {
  constructor(public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function callGrowth<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new GrowthError('not_signed_in');
  const r = await (opts.fetchImpl ?? fetch)(opts.url ?? functionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'growth', op, ...payload }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new GrowthError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export type GrowthAccess = 'checking' | 'allowed' | 'denied';

export async function fetchGrowthAccess(token: string, fetchImpl: typeof fetch = fetch, url?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await callGrowth('status', {}, { token, fetchImpl, url });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<boolean>>();
export function resetGrowthAccessCache(): void {
  cache.clear();
}

/** Hook: 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useVertalGrowthAccess(enabledOverride?: boolean): GrowthAccess {
  const buildOn = isVertalGrowthEnabled();
  const [state, setState] = useState<GrowthAccess>(() =>
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
        p = fetchGrowthAccess(s.access_token);
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

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const randomHex = (n: number) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

export interface TeamAgent { preset: string; stage: string; event: string; triggerAgentId: number; agentId: number; app: string; key: string }
export interface BuiltTeam { webhookAgentId: number; agents: TeamAgent[] }

type HuginnCaller = (op: HuginnOp) => Promise<HuginnCallResult>;
const agentIdOf = (r: HuginnCallResult): number | null => {
  const id = Number((r.data as { agent?: { id?: unknown } } | undefined)?.agent?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Monta a equipe no Vertal Agentes com as operações que já existem (cada uma é uma chamada aprovada):
 * entrada (WebhookAgent) → filtro por tipo de evento (TriggerAgent) → agente do app do Vertal Fluxos
 * (create_fluxos_agent, 2 créditos por execução, devolvidos se falhar).
 */
export async function buildTeam(
  campaignName: string,
  presets: TeamPreset[],
  call: HuginnCaller = callHuginnOp,
): Promise<{ ok: true; team: BuiltTeam } | { ok: false; message: string; partial?: BuiltTeam }> {
  const label = campaignName.replace(/[\r\n]+/g, ' ').slice(0, 60);
  const hook = await call({
    op: 'create_agent', type: 'Agents::WebhookAgent', name: `Vertal Growth · ${label} · entrada`,
    options: { secret: randomHex(24), expected_receive_period_in_days: 30, payload_path: '$', verbs: 'post' },
  });
  const webhookAgentId = hook.ok ? agentIdOf(hook) : null;
  if (!webhookAgentId) return { ok: false, message: hook.message };
  const team: BuiltTeam = { webhookAgentId, agents: [] };
  for (const p of presets) {
    if (p.needs?.some((f) => !String((p.parameters as Record<string, unknown>)[f] ?? '').trim())) continue;
    const trig = await call({
      op: 'create_agent', type: 'Agents::TriggerAgent', name: `Vertal Growth · ${label} · ${p.event}`,
      options: { expected_receive_period_in_days: '30', keep_event: 'true', rules: [{ type: 'field==value', value: p.event, path: 'type' }] },
      source_ids: [webhookAgentId],
    });
    const triggerAgentId = trig.ok ? agentIdOf(trig) : null;
    if (!triggerAgentId) return { ok: false, message: trig.message, partial: team };
    const agent = await call({
      op: 'create_fluxos_agent', app: p.app, kind: 'action', key: p.key, parameters: p.parameters,
      source_ids: [triggerAgentId], name: `Vertal Growth · ${label} · ${p.id}`,
    });
    const agentId = agent.ok ? agentIdOf(agent) : null;
    if (!agentId) return { ok: false, message: agent.message, partial: team };
    team.agents.push({ preset: p.id, stage: p.stage, event: p.event, triggerAgentId, agentId, app: p.app, key: p.key });
  }
  return { ok: true, team };
}

/** Manda os eventos para a entrada da equipe (cada um vira execuções dos agentes que filtram por ele). */
export async function forwardEvents(webhookAgentId: number, events: Array<Record<string, unknown>>, call: HuginnCaller = callHuginnOp): Promise<number> {
  let sent = 0;
  for (const e of events.slice(0, 50)) {
    const r = await call({ op: 'send_webhook_event', agent_id: webhookAgentId, payload: e });
    if (r.ok) sent++;
  }
  return sent;
}
