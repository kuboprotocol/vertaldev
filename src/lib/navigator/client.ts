// Cliente do Vertal Navigator servido pelo Worker do vertal.dev (/api/navigator/*).
// Envia o JWT da sessão do Supabase, como o cliente do navegador de formulários.
import { supabase } from '@/integrations/supabase/client';
import { NAVIGATOR_MESSAGES, type NavigatorEvent, type NavigatorPending, type NavigatorSettings, type NavigatorStatus } from './navigatorCore';

export type NavigatorRoute = 'start' | 'task' | 'status' | 'input' | 'takeover' | 'release' | 'stop' | 'forget' | 'settings' | 'activity' | 'audio-ticket';

export interface NavigatorSessionSummary {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  billed_minutes: number;
}

export interface NavigatorAuditEntry {
  id: string;
  session_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface NavigatorResponse {
  ok: boolean;
  status: NavigatorStatus;
  message?: string;
  detail?: string;
  sessionId?: string;
  liveViewUrl?: string | null;
  controlUrl?: string;
  expiresAt?: string;
  billedMinutes?: number;
  creditsPerMinute?: number;
  reused?: boolean;
  cookiesRestored?: number;
  cookiesSaved?: number | null;
  runId?: string;
  agentStatus?: 'idle' | 'running' | 'paused' | 'waiting' | 'done' | 'failed' | 'stopped';
  takeover?: boolean;
  url?: string;
  events?: NavigatorEvent[];
  lastSeq?: number;
  pending?: NavigatorPending[];
  filling?: Array<{ name?: string; host?: string; kind?: string }>;
  /** data:image/jpeg;base64,… */
  screenshot?: string;
  /** /settings (fase 2). */
  settings?: NavigatorSettings;
  capCents?: number;
  /** /activity (fase 2). */
  sessions?: NavigatorSessionSummary[];
  audit?: NavigatorAuditEntry[];
  /** /audio-ticket: ticket curto do stream de áudio (ver navigatorAudio.ts no Worker). */
  ticket?: string;
}

const PRODUCTION_ORIGIN = 'https://vertal.dev';

/** No vertal.dev a API é do mesmo domínio; fora dele (localhost, previews, app nativo) chama o vertal.dev. */
export function navigatorApiBase(
  location: Pick<Location, 'hostname'> | undefined = typeof window !== 'undefined' ? window.location : undefined,
  override: string | undefined = import.meta.env.VITE_BROWSER_API_BASE,
): string {
  if (override) return `${override.replace(/\/+$/, '').replace(/\/api\/browser$/, '')}/api/navigator`;
  const host = location?.hostname ?? '';
  return host === 'vertal.dev' || host === 'www.vertal.dev' ? '/api/navigator' : `${PRODUCTION_ORIGIN}/api/navigator`;
}

/**
 * URL do stream de áudio do navegador desta sessão, para o <audio> do celular.
 * O ticket vai na query (o elemento <audio> não envia cabeçalhos); vale 10 min para
 * abrir a conexão. Falha devolve a mensagem pronta para mostrar.
 */
export async function navigatorAudioUrl(sessionId: string): Promise<{ ok: true; url: string; expiresAt: number } | { ok: false; message: string }> {
  const res = await callNavigator('audio-ticket', { sessionId });
  if (!res.ok || !res.ticket) return { ok: false, message: res.message ?? NAVIGATOR_MESSAGES.error };
  const expiresAt = res.expiresAt ? Date.parse(res.expiresAt) : Date.now() + 5 * 60_000;
  return { ok: true, url: `${navigatorApiBase()}/audio?ticket=${encodeURIComponent(res.ticket)}`, expiresAt };
}

/** Chama uma rota do Navigator. Sempre devolve o mesmo formato, mesmo se o HTTP falhar. */
export async function callNavigator(route: NavigatorRoute, body: Record<string, unknown> = {}): Promise<NavigatorResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 'unauthorized', message: NAVIGATOR_MESSAGES.unauthorized };
  try {
    const res = await fetch(`${navigatorApiBase()}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as NavigatorResponse | null;
    if (data && typeof data.status === 'string') return data;
    if (res.status === 404 || res.status === 405) return { ok: false, status: 'not_configured', message: NAVIGATOR_MESSAGES.not_configured };
    return { ok: false, status: 'error', message: NAVIGATOR_MESSAGES.error };
  } catch {
    return { ok: false, status: 'error', message: NAVIGATOR_MESSAGES.error };
  }
}
