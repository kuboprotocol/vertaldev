// VERTAL Code AI · cliente (navegador). Lógica pura + chamadas à edge function vertal-code-ai.
// Desligado por padrão: só aparece com VITE_VERTAL_CODE_AI=true.

export const VERTAL_CODE_AI_ROUTE = '/vertal-code-ai';
export const VERTAL_CODE_AI_NAME = 'VERTAL Code AI';

export type VcaUiMode = 'plan' | 'build';
export type VcaUiEffort = 'auto' | 'low' | 'high' | 'max';
export type VcaFrom = 'chat' | 'vibe' | 'direct';
/** Opção Vertal escolhida (família de modelos). "auto" = roteamento padrão. */
export type VcaUiOption = 'auto' | 'code' | 'livre' | 'turbo' | 'pro' | 'imagem' | 'video';
export const VCA_UI_TEXT_OPTIONS: VcaUiOption[] = ['auto', 'code', 'livre', 'turbo', 'pro'];
export const VCA_UI_OPTION_LABEL: Record<VcaUiOption, string> = {
  auto: 'Vertal Auto',
  code: 'Vertal Code',
  livre: 'Vertal Livre',
  turbo: 'Vertal Turbo',
  pro: 'Vertal Pro',
  imagem: 'Vertal Imagem',
  video: 'Vertal Vídeo',
};
export const isMediaOption = (o: VcaUiOption) => o === 'imagem' || o === 'video';

type EnvLike = Record<string, unknown> | undefined;

/** Interruptor do front-end. Qualquer valor diferente de "true"/"1" = desligado. */
export function isVertalCodeAiEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_CODE_AI;
  return v === true || v === 'true' || v === '1';
}

export function vertalCodeAiHref(opts: { prompt?: string; from?: VcaFrom; projectId?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.from && opts.from !== 'direct') q.set('from', opts.from);
  if (opts.prompt?.trim()) q.set('prompt', opts.prompt.trim().slice(0, 4000));
  if (opts.projectId) q.set('project', opts.projectId);
  const s = q.toString();
  return s ? `${VERTAL_CODE_AI_ROUTE}?${s}` : VERTAL_CODE_AI_ROUTE;
}

export function readHandoff(search: string): { prompt: string; from: VcaFrom; projectId: string | null } {
  const q = new URLSearchParams(search);
  const from = q.get('from');
  const project = q.get('project');
  return {
    prompt: (q.get('prompt') ?? '').slice(0, 4000),
    from: from === 'chat' || from === 'vibe' ? from : 'direct',
    projectId: project && /^[0-9a-f-]{36}$/i.test(project) ? project : null,
  };
}

const CODE_INTENT_RE =
  /\b(c[óo]digo|programa(r|ção)?|refator|bug|erro de (build|compila)|typescript|react|componente|fun[cç][aã]o|endpoint|api|deploy|repo(sit[óo]rio)?|commit|pull request|teste[s]? unit|tsx?|jsx?|supabase|edge function|css|tailwind)\b/i;

/** Ponte Vertal Chat → VERTAL Code AI: a mensagem parece trabalho de programação? */
export function looksLikeCodingRequest(text: string): boolean {
  return CODE_INTENT_RE.test(text ?? '');
}

export interface VcaStreamEvent {
  kind: string;
  [k: string]: unknown;
}

/** Junta pedaços SSE ("data: {...}\n\n") e devolve os eventos completos + o resto. */
export function parseSseBuffer(buffer: string): { events: VcaStreamEvent[]; rest: string } {
  const events: VcaStreamEvent[] = [];
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    for (const line of part.split(/\r?\n/)) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt && typeof evt.kind === 'string') events.push(evt);
      } catch {
        /* linha inválida: ignora */
      }
    }
  }
  return { events, rest };
}

export function functionUrl(base: string | undefined = import.meta.env.VITE_SUPABASE_URL as string | undefined): string {
  return `${base ?? ''}/functions/v1/vertal-code-ai`;
}

export interface RunRequest {
  mode: VcaUiMode;
  effort: VcaUiEffort;
  /** Opção Vertal (padrão: auto). */
  option?: VcaUiOption;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  images?: string[];
  attachments?: Array<{ path: string; content: string }>;
  plan?: unknown;
  projectId?: string | null;
  origin?: 'vertal_code_ai' | 'vertal_chat' | 'vibe_code';
  /** "team_run" = Equipe Vertal (só para quem o servidor liberou). Padrão: "run". */
  action?: 'run' | 'team_run';
}

/**
 * VERTAL Code AI · Data Library: repassa ao servidor o consentimento que o visitante JÁ deu no banner de cookies
 * (mesmas chaves do ads-consent: "cookie_consent" e "cookie_consent_evidence") e o Global Privacy Control.
 * Não cria tela nem grava nada; sem escolha gravada devolve undefined (o servidor então não envia).
 */
export function readVertalCodeAiDataConsent(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  nav: { globalPrivacyControl?: boolean } | null = typeof navigator !== 'undefined' ? (navigator as { globalPrivacyControl?: boolean }) : null,
): { cookie: 'granted' | 'denied' | null; purposes: string[]; noticeVersion: string | null; gpc: boolean } | undefined {
  try {
    const gpc = nav?.globalPrivacyControl === true;
    const raw = storage?.getItem('cookie_consent');
    const cookie = raw === 'granted' || raw === 'denied' ? raw : null;
    if (!cookie && !gpc) return undefined;
    let purposes: string[] = [];
    let noticeVersion: string | null = null;
    try {
      const ev = JSON.parse(storage?.getItem('cookie_consent_evidence') ?? 'null');
      if (ev && Array.isArray(ev.purposes)) purposes = ev.purposes.filter((p: unknown): p is string => typeof p === 'string').slice(0, 10);
      if (ev && typeof ev.noticeVersion === 'string') noticeVersion = ev.noticeVersion.slice(0, 60);
    } catch {
      /* evidência ilegível: só a escolha */
    }
    return { cookie, purposes, noticeVersion, gpc };
  } catch {
    return undefined;
  }
}

export async function streamRun(
  token: string,
  req: RunRequest,
  onEvent: (e: VcaStreamEvent) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const r = await fetchImpl(functionUrl(), {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, action: req.action ?? 'run', projectId: req.projectId ?? undefined, dataConsent: readVertalCodeAiDataConsent() }),
  });
  if (!r.ok || !r.body) {
    let err = `http_${r.status}`;
    try {
      err = (await r.json())?.error ?? err;
    } catch {
      /* sem corpo */
    }
    throw new Error(err);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buf);
    buf = rest;
    events.forEach(onEvent);
  }
  if (buf.trim()) parseSseBuffer(buf + '\n\n').events.forEach(onEvent);
}

export async function postAction<T>(token: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const r = await fetchImpl(functionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body.action === 'image' || body.action === 'video' ? { ...body, dataConsent: readVertalCodeAiDataConsent() } : body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string })?.error ?? `http_${r.status}`);
  return data as T;
}

export const ERROR_TEXT: Record<string, string> = {
  vertal_code_ai_disabled: 'O VERTAL Code AI ainda não foi ativado no servidor.',
  rate_limited: 'Muitos pedidos em sequência. Espere um minuto.',
  no_model_configured: 'Nenhum modelo configurado no servidor.',
  project_not_found: 'Projeto não encontrado.',
  empty_prompt: 'Escreva o que você quer construir.',
  vertal_code_ai_media_disabled: 'Imagem e vídeo ainda não foram liberados na sua conta.',
  vca_media_failed: 'Não consegui gerar agora. Tente de novo em alguns minutos.',
  job_not_found: 'Esse vídeo não foi encontrado.',
  vertal_code_ai_team_disabled: 'A Equipe Vertal ainda não foi liberada na sua conta.',
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? 'Algo deu errado. Tente de novo.';
}
