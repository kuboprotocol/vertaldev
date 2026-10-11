import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { shouldRedirect, buildTarget } from '@/lib/canonicalRedirect'

/**
 * Testes do redirect para o domínio canônico (vertal.dev) usado no
 * bootstrap de src/App.tsx. Exercitam a regra real exportada por
 * src/lib/canonicalRedirect.ts — não uma cópia.
 *
 * Regra (BRAND.primaryDomainLive = true): dev (localhost), previews do
 * Cloudflare (*.workers.dev), o próprio canônico e o fallback *.up.railway.app
 * ficam onde estão; qualquer outro host, inclusive o antigo kubovibe.dev, é
 * mandado para vertal.dev preservando caminho, query e hash.
 */

describe('Canonical-domain redirect → vertal.dev', () => {
  describe('shouldRedirect()', () => {
    it.each([
      ['kubovibe.dev'],            // domínio antigo passa a redirecionar
      ['www.kubovibe.dev'],
      ['kubo-vibe.com'],
      ['kubovibe.com.br'],
      ['app.kubovibe.dev'],
      ['kubovibe.onrender.com'],
      ['app.vertal.dev'],          // só o apex e o www do vertal.dev são canônicos
      ['vertal.dev.evil.com'],
      ['kubo-vibe.lovable.app'],   // Lovable não hospeda mais o app
    ])('redirects when host = %s', (host) => {
      expect(shouldRedirect(host)).toBe(true)
    })

    it.each([
      ['vertal.dev'],                             // canônico
      ['www.vertal.dev'],
      ['localhost'],
      ['127.0.0.1'],
      ['vertaldev.kuboprotocol.workers.dev'],     // preview do Cloudflare
      ['abc123-vertaldev.kuboprotocol.workers.dev'],
      ['kubo-vibe-dev-production.up.railway.app'], // fallback do Railway
    ])('does NOT redirect when host = %s', (host) => {
      expect(shouldRedirect(host)).toBe(false)
    })
  })

  describe('troca de domínio desligada (BRAND.primaryDomainLive = false)', () => {
    it.each([
      ['kubo-vibe.com'],
      ['app.kubovibe.dev'],
      ['app.vertal.dev'],
    ])('redirects when host = %s', (host) => {
      expect(shouldRedirect(host, false)).toBe(true)
    })

    it.each([
      ['kubovibe.dev'],            // canônico enquanto a troca está desligada
      ['www.kubovibe.dev'],
      ['vertal.dev'],              // o domínio novo também serve o app
      ['www.vertal.dev'],
      ['localhost'],
      ['kubo-vibe-dev-production.up.railway.app'],
    ])('does NOT redirect when host = %s', (host) => {
      expect(shouldRedirect(host, false)).toBe(false)
    })

    it('manda para kubovibe.dev preservando caminho, query e hash', () => {
      expect(buildTarget(
        { pathname: '/pricing', search: '?ref=x', hash: '#pro' },
        'https://kubovibe.dev',
      )).toBe('https://kubovibe.dev/pricing?ref=x#pro')
    })
  })

  describe('buildTarget()', () => {
    it('preserves path, query and hash exactly', () => {
      const url = buildTarget({
        pathname: '/connectors/github',
        search: '?run=abc123&tab=logs',
        hash: '#section-2',
      })
      expect(url).toBe(
        'https://vertal.dev/connectors/github?run=abc123&tab=logs#section-2',
      )
    })

    it('handles root path with no query/hash', () => {
      expect(buildTarget({ pathname: '/', search: '', hash: '' }))
        .toBe('https://vertal.dev/')
    })
  })

  describe('integration: simulated window.location.replace', () => {
    const originalLocation = window.location
    let replaceMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      replaceMock = vi.fn()
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      })
    })

    function stubLocation(href: string) {
      const u = new URL(href)
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: {
          href: u.href,
          hostname: u.hostname,
          pathname: u.pathname,
          search: u.search,
          hash: u.hash,
          replace: replaceMock,
        },
      })
    }

    function runRedirect() {
      const host = window.location.hostname
      if (shouldRedirect(host)) {
        window.location.replace(buildTarget(window.location))
      }
    }

    it('redirects kubo-vibe.com/foo?x=1#y → vertal.dev/foo?x=1#y', () => {
      stubLocation('https://kubo-vibe.com/foo?x=1#y')
      runRedirect()
      expect(replaceMock).toHaveBeenCalledWith('https://vertal.dev/foo?x=1#y')
    })

    it('redirects the old kubovibe.dev to vertal.dev, keeping the path', () => {
      stubLocation('https://kubovibe.dev/dashboard?tab=apps')
      runRedirect()
      expect(replaceMock).toHaveBeenCalledWith('https://vertal.dev/dashboard?tab=apps')
    })

    it('does not redirect when already on vertal.dev', () => {
      stubLocation('https://vertal.dev/dashboard')
      runRedirect()
      expect(replaceMock).not.toHaveBeenCalled()
    })

    it('does not redirect from a Cloudflare preview', () => {
      stubLocation('https://abc123-vertaldev.kuboprotocol.workers.dev/builder')
      runRedirect()
      expect(replaceMock).not.toHaveBeenCalled()
    })

    it('does not redirect from localhost (dev)', () => {
      stubLocation('http://localhost:8080/auth?redirect=/dashboard')
      runRedirect()
      expect(replaceMock).not.toHaveBeenCalled()
    })

    it('preserves nested query + multi-segment hash when redirecting', () => {
      stubLocation('https://kubo-vibe.com/app/proj-123/meu-app?ref=email&t=1#top')
      runRedirect()
      expect(replaceMock).toHaveBeenCalledWith(
        'https://vertal.dev/app/proj-123/meu-app?ref=email&t=1#top',
      )
    })
  })
})
