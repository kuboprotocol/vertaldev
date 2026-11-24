// VERTAL Code AI · cliente (navegador). Lógica pura + chamadas à edge function vertal-code-ai.
// Desligado por padrão: só aparece com VITE_VERTAL_CODE_AI=true.

export const VERTAL_CODE_AI_ROUTE = '/vertal-code-ai';
export const VERTAL_CODE_AI_NAME = 'VERTAL Code AI';

export type VcaUiMode = 'plan' | 'build';
export type VcaUiEffort = 'auto' | 'low' | 'high' | 'max';
export type VcaFrom = 'chat' | 'vibe' | 'direct';

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
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  images?: string[];
  attachments?: Array<{ path: string; content: string }>;
  plan?: unknown;
  projectId?: string | null;
  origin?: 'vertal_code_ai' | 'vertal_chat' | 'vibe_code';
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
    body: JSON.stringify({ action: 'run', ...req, projectId: req.projectId ?? undefined }),
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
    body: JSON.stringify(body),
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
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? 'Algo deu errado. Tente de novo.';
}
