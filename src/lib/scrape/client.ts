// Cliente da coleta web com Scrapling (F5) e do consent gate, servidos pelo Worker do vertal.dev.
// Envia o JWT da sessão do Supabase. Sempre devolve {ok, status, ...}, mesmo se o HTTP falhar.
import { supabase } from '@/integrations/supabase/client';
import { navigatorApiBase } from '@/lib/navigator/client';
import { SCRAPE_MESSAGES, type ScrapePage, type ScrapePriceRow } from '../../../supabase/functions/_shared/scrapeCore';

export type ScrapeRoute = 'page' | 'crawl' | 'monitors' | 'monitor-create' | 'monitor-update' | 'monitor-delete' | 'monitor-check' | 'alerts' | 'alerts-seen' | 'pricing';
export type ConsentRoute = 'status' | 'accept' | 'classify';

export interface ScrapeMonitor {
  id: string;
  name: string;
  url: string;
  selector: { name: string; css?: string; xpath?: string; attr?: string };
  mode: 'fetch' | 'dynamic' | 'stealth';
  frequency_minutes: number;
  status: string;
  status_detail: string | null;
  last_value: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  next_check_at: string;
  credits_spent: number;
  unitCredits: number;
}

export interface ScrapeAlert {
  id: string;
  monitor_id: string;
  kind: 'changed' | 'error' | 'captcha' | 'no_credits';
  message: string;
  old_value: string | null;
  new_value: string | null;
  url: string | null;
  created_at: string;
}

export interface ScrapeResponse {
  ok: boolean;
  status: string;
  message?: string;
  detail?: string;
  pages?: ScrapePage[];
  captchaUrls?: string[];
  blocked?: Array<{ url: string; reason: string }>;
  credits?: number;
  unitCredits?: number;
  billedPages?: number;
  mode?: string;
  runId?: string;
  truncated?: boolean;
  needed?: number;
  /** consent_required */
  category?: string;
  version?: string;
  title?: string;
  reason?: string;
  monitors?: ScrapeMonitor[];
  monitor?: ScrapeMonitor | null;
  value?: string;
  alerts?: ScrapeAlert[];
  table?: ScrapePriceRow[];
  prices?: ScrapePriceRow[];
  outcome?: { kind: string; value?: string; changed?: boolean; message?: string; credits?: number; reason?: string };
}

export function apiBase(path: 'scrape' | 'consent'): string {
  return navigatorApiBase().replace(/\/api\/navigator$/, `/api/${path}`);
}

async function call<T extends { ok: boolean; status: string; message?: string }>(path: 'scrape' | 'consent', route: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 'unauthorized', message: SCRAPE_MESSAGES.unauthorized } as T;
  try {
    const res = await fetch(`${apiBase(path)}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (data && typeof data.status === 'string') return data;
    return { ok: false, status: 'error', message: SCRAPE_MESSAGES.error } as T;
  } catch {
    return { ok: false, status: 'error', message: SCRAPE_MESSAGES.error } as T;
  }
}

export const callScrape = (route: ScrapeRoute, body: Record<string, unknown> = {}) => call<ScrapeResponse>('scrape', route, body);
export const callConsent = <T extends { ok: boolean; status: string; message?: string } = ConsentStatusResponse>(route: ConsentRoute, body: Record<string, unknown> = {}) => call<T>('consent', route, body);

export interface ConsentStatusResponse {
  ok: boolean;
  status: string;
  message?: string;
  detail?: string;
  accepted?: Record<string, { version: string; acceptedAt: string; digest: string; documentMasked: string | null; locationKind: string; ots: { status: string; bitcoinHeight: number | null } | null }>;
  category?: string;
  version?: string;
  title?: string;
  document?: string;
  prefill?: {
    fullName: string;
    address: { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string } | null;
    organization: string;
    document: { type: string; country: string; masked: string } | null;
    documentLocked: boolean;
    source: string;
  } | null;
  digest?: string;
  ots?: { status: string };
  locationKind?: string;
  documentMasked?: string;
}
