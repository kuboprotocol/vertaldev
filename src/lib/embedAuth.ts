/**
 * Sign-in for the vertal.dev embed (/embed), which any website may frame.
 *
 * 1. The embed makes a random nonce and opens a popup to /embed/login?nonce=…
 *    Sign-in always happens in that popup (a normal first-party window), never
 *    inside the frame.
 * 2. /embed/login sends the user through the normal /auth page when needed.
 *    Once signed in, it asks the Worker (POST /embed/api/session) for a
 *    single-use sign-in token and posts { type, nonce, tokenHash } to
 *    window.opener with targetOrigin = its own origin (only a vertal.dev window
 *    can read it), then closes.
 * 3. The embed accepts the message only from its own origin, from the popup it
 *    opened and with the same nonce, then calls supabase.auth.verifyOtp to get
 *    its own session (separate from the first-party one, so both can refresh
 *    tokens without signing each other out).
 *
 * Fallbacks: "Continue" uses the Storage Access API (Chrome/Edge 125+) to read
 * the first-party session when the popup lost its opener; "Open in Vertal Dev"
 * opens a new tab when the browser blocks everything (Safari, private windows).
 */

export const EMBED_AUTH_MESSAGE = 'vertal-dev:embed-auth'
export const EMBED_POPUP_NAME = 'vertal-dev-embed-signin'
/** sessionStorage key (popup tab only) that remembers an embed sign-in in progress. */
export const EMBED_HANDOFF_KEY = 'vertal:embed-handoff-nonce'

export type EmbedAuthMessage = { type: typeof EMBED_AUTH_MESSAGE; nonce: string; tokenHash: string }
export type EmbedTheme = 'dark' | 'light'

const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/
const REF_RE = /^[A-Za-z0-9_-]{4,64}$/

export function isEmbedPath(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith('/embed/')
}

export function newNonce(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isValidNonce(value: unknown): value is string {
  return typeof value === 'string' && NONCE_RE.test(value)
}

export function safeRef(value: unknown): string | null {
  return typeof value === 'string' && REF_RE.test(value) ? value : null
}

export function safeTheme(value: unknown): EmbedTheme {
  return value === 'light' ? 'light' : 'dark'
}

/** Popup URL. The referral code rides along so /auth can store it first-party. */
export function buildEmbedSignInUrl(origin: string, nonce: string, ref?: string | null): string {
  const url = new URL('/embed/login', origin)
  url.searchParams.set('nonce', nonce)
  const code = safeRef(ref)
  if (code) url.searchParams.set('ref', code)
  return url.toString()
}

/** /auth URL the popup goes to when the user is not signed in yet. */
export function buildAuthUrl(nonce: string, ref?: string | null): string {
  const params = new URLSearchParams()
  const code = safeRef(ref)
  if (code) params.set('ref', code)
  params.set('redirect', `/embed/login?nonce=${nonce}`)
  return `/auth?${params.toString()}`
}

/** Returns the token hash when the message is a valid handoff for this embed, else null. */
export function readEmbedAuthMessage(
  event: Pick<MessageEvent, 'origin' | 'data' | 'source'>,
  expected: { origin: string; nonce: string; source?: unknown },
): string | null {
  if (event.origin !== expected.origin) return null
  if (expected.source !== undefined && event.source !== expected.source) return null
  const data = event.data as Partial<EmbedAuthMessage> | null
  if (!data || typeof data !== 'object' || data.type !== EMBED_AUTH_MESSAGE) return null
  if (!isValidNonce(data.nonce) || data.nonce !== expected.nonce) return null
  if (typeof data.tokenHash !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(data.tokenHash)) return null
  return data.tokenHash
}

export function canUseLocalStorage(): boolean {
  try {
    const k = '__vertal_embed_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

/** Finds the Supabase session JSON (key sb-<ref>-auth-token) in a storage area. */
export function findSupabaseSession(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
): { access_token: string } | null {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key || !/^sb-[a-z0-9]+-auth-token$/.test(key)) continue
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? 'null')
      const session = parsed?.currentSession ?? parsed
      if (session && typeof session.access_token === 'string') return session
    } catch {
      /* ignore */
    }
  }
  return null
}

type StorageAccessHandle = { localStorage?: Storage }
type DocWithStorageAccess = Document & {
  requestStorageAccess?: (types?: { localStorage?: boolean }) => Promise<StorageAccessHandle | void>
}

/**
 * Storage Access API fallback (must run from a click). Returns the access token
 * of the first-party session, or null. Chrome/Edge 125+ return a localStorage
 * handle; Safari grants cookies only, so this returns null there.
 */
export async function readFirstPartyAccessToken(): Promise<string | null> {
  const doc = document as DocWithStorageAccess
  if (typeof doc.requestStorageAccess !== 'function') return null
  try {
    const handle = await doc.requestStorageAccess({ localStorage: true })
    const storage = handle && 'localStorage' in handle ? handle.localStorage : undefined
    if (!storage) return null
    return findSupabaseSession(storage)?.access_token ?? null
  } catch {
    return null
  }
}

/** Asks the Worker (POST /embed/api/session) for a single-use sign-in token. */
export async function requestEmbedTokenHash(accessToken: string): Promise<string> {
  const resp = await fetch('/embed/api/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (resp.status === 404) throw new Error('Embed sign-in is not available yet.')
  const body = (await resp.json().catch(() => null)) as { token_hash?: string; error?: string } | null
  if (!resp.ok || !body?.token_hash) throw new Error(body?.error === 'unauthorized' ? 'Your sign-in expired.' : 'Could not finish the sign-in.')
  return body.token_hash
}
