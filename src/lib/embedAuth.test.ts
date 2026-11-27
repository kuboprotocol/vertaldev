import { describe, expect, it } from 'vitest'
import {
  EMBED_AUTH_MESSAGE,
  buildAuthUrl,
  buildEmbedSignInUrl,
  findSupabaseSession,
  isEmbedPath,
  isValidNonce,
  newNonce,
  readEmbedAuthMessage,
  safeRef,
  safeTheme,
} from './embedAuth'
import { VERTAL_DEV_EMBED_SNIPPET } from './ecosystem'

const ORIGIN = 'https://vertal.dev'
const nonce = 'a'.repeat(48)
const popup = {} as Window
const msg = (over: Record<string, unknown> = {}) => ({
  origin: ORIGIN,
  source: popup,
  data: { type: EMBED_AUTH_MESSAGE, nonce, tokenHash: 'pkce_abc123def456', ...over },
})

describe('vertal.dev embed sign-in', () => {
  it('detects the embed path family only', () => {
    expect(isEmbedPath('/embed')).toBe(true)
    expect(isEmbedPath('/embed/login')).toBe(true)
    expect(isEmbedPath('/embedded')).toBe(false)
    expect(isEmbedPath('/auth')).toBe(false)
  })

  it('makes valid random nonces', () => {
    const a = newNonce()
    expect(isValidNonce(a)).toBe(true)
    expect(a).not.toBe(newNonce())
    expect(isValidNonce('x')).toBe(false)
  })

  it('accepts only our origin, our popup and our nonce', () => {
    const expected = { origin: ORIGIN, nonce, source: popup }
    expect(readEmbedAuthMessage(msg(), expected)).toBe('pkce_abc123def456')
    expect(readEmbedAuthMessage({ ...msg(), origin: 'https://evil.example' }, expected)).toBeNull()
    expect(readEmbedAuthMessage({ ...msg(), source: {} as Window }, expected)).toBeNull()
    expect(readEmbedAuthMessage(msg({ nonce: 'b'.repeat(48) }), expected)).toBeNull()
    expect(readEmbedAuthMessage(msg({ type: 'x' }), expected)).toBeNull()
    expect(readEmbedAuthMessage(msg({ tokenHash: '<bad>' }), expected)).toBeNull()
  })

  it('builds popup and auth URLs on our own origin, keeping a valid ref', () => {
    const popupUrl = new URL(buildEmbedSignInUrl(ORIGIN, nonce, '5fe61d6f'))
    expect(popupUrl.origin).toBe(ORIGIN)
    expect(popupUrl.pathname).toBe('/embed/login')
    expect(popupUrl.searchParams.get('ref')).toBe('5fe61d6f')
    expect(new URL(buildEmbedSignInUrl(ORIGIN, nonce, 'bad ref!')).searchParams.get('ref')).toBeNull()
    const auth = new URL(buildAuthUrl(nonce, '5fe61d6f'), ORIGIN)
    expect(auth.pathname).toBe('/auth')
    expect(auth.searchParams.get('ref')).toBe('5fe61d6f')
    expect(auth.searchParams.get('redirect')).toBe(`/embed/login?nonce=${nonce}`)
  })

  it('validates ref and theme', () => {
    expect(safeRef('5fe61d6f')).toBe('5fe61d6f')
    expect(safeRef('javascript:alert(1)')).toBeNull()
    expect(safeTheme('light')).toBe('light')
    expect(safeTheme('pink')).toBe('dark')
  })

  it('finds the Supabase session in a storage area', () => {
    const data: Record<string, string> = { 'sb-sccizjlpwezsgaxkclot-auth-token': JSON.stringify({ access_token: 'jwt' }) }
    const keys = Object.keys(data)
    expect(findSupabaseSession({ length: 1, key: (i) => keys[i] ?? null, getItem: (k) => data[k] ?? null })?.access_token).toBe('jwt')
  })

  it('public snippet points to /embed, not to the auth page', () => {
    expect(VERTAL_DEV_EMBED_SNIPPET).toContain('src="https://vertal.dev/embed?ref=5fe61d6f"')
    expect(VERTAL_DEV_EMBED_SNIPPET).not.toContain('/auth')
    expect(VERTAL_DEV_EMBED_SNIPPET).toContain('allow="clipboard-write"')
    expect(VERTAL_DEV_EMBED_SNIPPET).toContain('loading="lazy"')
    expect(VERTAL_DEV_EMBED_SNIPPET).toContain('title="Vertal Dev"')
  })
})
