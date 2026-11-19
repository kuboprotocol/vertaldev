// Cliente do navegador na nuvem servido pelo Worker do vertal.dev (/api/browser/*).
// Envia o JWT da sessão do Supabase, como o cliente do Spotify.
import { supabase } from '@/integrations/supabase/client';
import {
  BROWSER_FORM_MESSAGES, type BrowserFormStatus, type FormSchema, type FormValues,
} from './formCore';

export interface BrowserFormResponse {
  ok: boolean;
  status: BrowserFormStatus;
  message?: string;
  detail?: string;
  url?: string;
  schema?: FormSchema;
  /** data:image/jpeg;base64,… */
  screenshot?: string;
  captchaKind?: string;
  filled?: string[];
  unknownKeys?: string[];
  missingRequired?: string[];
  errors?: string[];
  pageErrors?: string[];
  confirmation?: string;
  navigated?: boolean;
  charged?: number;
}

const PRODUCTION_ORIGIN = 'https://vertal.dev';

/** No vertal.dev a API é do mesmo domínio; fora dele (localhost, previews, app nativo) chama o vertal.dev. */
export function browserApiBase(
  location: Pick<Location, 'hostname'> | undefined = typeof window !== 'undefined' ? window.location : undefined,
  override: string | undefined = import.meta.env.VITE_BROWSER_API_BASE,
): string {
  if (override) return override.replace(/\/+$/, '');
  const host = location?.hostname ?? '';
  return host === 'vertal.dev' || host === 'www.vertal.dev' ? '/api/browser' : `${PRODUCTION_ORIGIN}/api/browser`;
}

type Route = 'inspect' | 'fill-preview' | 'submit';

/** Chama uma rota do navegador. Sempre devolve o mesmo formato, mesmo se o HTTP falhar. */
export async function callBrowserForm(
  route: Route,
  body: { url: string; values?: FormValues; submitSelector?: string; confirmed?: true; runId?: string },
): Promise<BrowserFormResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 'unauthorized', message: BROWSER_FORM_MESSAGES.unauthorized };
  try {
    const res = await fetch(`${browserApiBase()}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as BrowserFormResponse | null;
    if (data && typeof data.status === 'string') return data;
    if (res.status === 404 || res.status === 405) return { ok: false, status: 'not_configured', message: BROWSER_FORM_MESSAGES.not_configured };
    return { ok: false, status: 'error', message: BROWSER_FORM_MESSAGES.error };
  } catch {
    return { ok: false, status: 'error', message: BROWSER_FORM_MESSAGES.error };
  }
}
