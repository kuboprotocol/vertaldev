// Ticket curto para o áudio do Vertal Navigator.
//
// O <audio> do navegador não envia cabeçalho Authorization, então o Worker não pode
// usar o JWT do Supabase nem o token do navd nessa chamada. Em vez disso, /audio-ticket
// (autenticado pelo JWT) devolve um ticket: HMAC-SHA256 de "sessionId.expiraEm",
// com chave derivada da chave de cifra mas com prefixo próprio (domain separation).
// GET /audio?ticket=… valida o HMAC e a validade, e só então abre o stream com o
// token do navd guardado cifrado na sessão. O ticket não dá acesso a mais nada.

export const AUDIO_TICKET_TTL_MS = 10 * 60_000;

const enc = new TextEncoder();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(`vertal-navigator-audio:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

/** Gera o ticket de uma sessão. `now` é injetável para teste. */
export async function signAudioTicket(secret: string, sessionId: string, now = Date.now(), ttlMs = AUDIO_TICKET_TTL_MS): Promise<{ ticket: string; expiresAt: number }> {
  const expiresAt = now + ttlMs;
  const payload = `${sessionId}.${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(payload));
  return { ticket: `${payload}.${toB64Url(new Uint8Array(sig))}`, expiresAt };
}

/** Devolve o sessionId se o ticket for autêntico e ainda valer; senão null. */
export async function verifyAudioTicket(secret: string, ticket: string, now = Date.now()): Promise<string | null> {
  const parts = ticket.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, expRaw, sigRaw] = parts;
  if (!UUID_RE.test(sessionId) || !/^\d{1,15}$/.test(expRaw)) return null;
  const expiresAt = Number(expRaw);
  // Não aceita ticket com validade além do TTL (ticket forjado com exp distante falha aqui).
  if (expiresAt <= now || expiresAt > now + AUDIO_TICKET_TTL_MS) return null;
  const sig = fromB64Url(sigRaw);
  if (!sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), sig, enc.encode(`${sessionId}.${expRaw}`));
  return ok ? sessionId : null;
}

// ─── Opção "Tocar no meu aparelho" ──────────────────────────────────────────
// POST /media {sessionId, action:"pause"} pausa o vídeo/áudio da aba na nuvem
// quando o usuário passa a ouvir pelo player oficial no próprio aparelho. Só ações
// desta lista chegam ao navd (que roda um script fixo para cada uma).
export const NAVIGATOR_MEDIA_ACTIONS = ['pause'] as const;
export type NavigatorMediaAction = (typeof NAVIGATOR_MEDIA_ACTIONS)[number];

export function parseMediaAction(body: Record<string, unknown>): NavigatorMediaAction | null {
  const a = body.action;
  return typeof a === 'string' && (NAVIGATOR_MEDIA_ACTIONS as readonly string[]).includes(a) ? (a as NavigatorMediaAction) : null;
}

/** Normaliza a resposta do navd (template antigo sem /media → null). */
export function mediaResult(status: number, data: unknown): { paused: number; currentTime: number } | null {
  if (status !== 200 || !data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) return null;
  const d = data as { paused?: unknown; currentTime?: unknown };
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(Math.floor(v), max)) : 0);
  return { paused: n(d.paused, 1000), currentTime: n(d.currentTime, 24 * 3600) };
}
