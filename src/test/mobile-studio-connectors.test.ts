// Android Studio, iOS / Xcode e Google Play Console em /connectors (aditivo, flag VITE_VERTAL_MOBILE_STUDIO).
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import {
  ASC_APP, MOBILE_STUDIO_SLUGS, PLAY_APP, isMobileStudioEnabled, isMobileStudioSlug, mobileStudioCatalog,
  mobileStudioConnectors, parseGitHubRepo, studioRecipe, suggestAppId,
} from '@/lib/mobileStudio/connectors'
import { MS_UI, msLang } from '@/lib/mobileStudio/i18n'
import { connectors } from '@/lib/connectorsConfig'
import { connectorPathFor } from '@/lib/fluxos/apps'
import { oauthSecretGroup, platformOAuthData, PUBLIC_OAUTH_CLIENT_IDS } from '../../supabase/functions/_shared/fluxosApps'
import { isHiddenFluxosApp } from '../../supabase/functions/_shared/hiddenFluxosApps'

describe('flag do catálogo', () => {
  it('desligado por padrão; liga com true/1/on', () => {
    expect(isMobileStudioEnabled({})).toBe(false)
    expect(isMobileStudioEnabled({ VITE_VERTAL_MOBILE_STUDIO: 'false' })).toBe(false)
    expect(isMobileStudioEnabled({ VITE_VERTAL_MOBILE_STUDIO: 'true' })).toBe(true)
    expect(isMobileStudioEnabled({ VITE_VERTAL_MOBILE_STUDIO: 'on' })).toBe(true)
    expect(mobileStudioCatalog({})).toEqual([])
    expect(mobileStudioCatalog({ VITE_VERTAL_MOBILE_STUDIO: 'true' }).map((c) => c.slug))
      .toEqual(['fluxos-google-play-console', 'android-studio', 'ios-xcode'])
  })

  it('sem o flag o catálogo atual fica igual (nenhum cartão novo, nenhum slug repetido)', () => {
    if (!isMobileStudioEnabled()) {
      for (const slug of Object.values(MOBILE_STUDIO_SLUGS)) expect(connectors.some((c) => c.slug === slug)).toBe(false)
    }
    const slugs = connectors.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('as páginas de configuração são reconhecidas pelo slug', () => {
    expect(isMobileStudioSlug('android-studio')).toBe(true)
    expect(isMobileStudioSlug('ios-xcode')).toBe(true)
    expect(isMobileStudioSlug('fluxos-google-play-console')).toBe(true)
    expect(isMobileStudioSlug('github')).toBe(false)
    for (const c of mobileStudioConnectors) expect(c.internalRoute).toBe(`/connectors/${c.slug}/setup`)
  })
})

describe('Google Play Console usa o cliente Google do Vertal Fluxos (sem segredo novo)', () => {
  it('grupo GOOGLE, ID público + FLUXOS_OAUTH_GOOGLE_SECRET', () => {
    expect(oauthSecretGroup(PLAY_APP)).toBe('GOOGLE')
    const env = (o: Record<string, string>) => (k: string) => o[k]
    expect(platformOAuthData(PLAY_APP, env({ FLUXOS_OAUTH_GOOGLE_SECRET: 's' })))
      .toEqual({ clientId: PUBLIC_OAUTH_CLIENT_IDS.GOOGLE, clientSecret: 's' })
    expect(platformOAuthData(PLAY_APP, env({}))).toBeNull()
  })
  it('o retorno do OAuth volta para a página do conector e os apps não estão escondidos', () => {
    expect(connectorPathFor(PLAY_APP)).toBe('/connectors/fluxos-google-play-console/setup')
    expect(isHiddenFluxosApp(PLAY_APP)).toBe(false)
    expect(isHiddenFluxosApp(ASC_APP)).toBe(false)
  })
})

describe('abrir no Android Studio / Xcode', () => {
  it('aceita owner/repo, URL https e .git; recusa o resto', () => {
    expect(parseGitHubRepo('kuboprotocol/vertaldev')).toEqual({ owner: 'kuboprotocol', repo: 'vertaldev' })
    expect(parseGitHubRepo('https://github.com/kuboprotocol/vertaldev.git')).toEqual({ owner: 'kuboprotocol', repo: 'vertaldev' })
    expect(parseGitHubRepo('git@github.com:a-b/c.d')).toEqual({ owner: 'a-b', repo: 'c.d' })
    expect(parseGitHubRepo('https://gitlab.com/a/b')).toBeNull()
    expect(parseGitHubRepo('a/b; rm -rf /')).toBeNull()
    expect(parseGitHubRepo('a/..')).toBeNull()
  })
  it('appId sugerido é um pacote válido', () => {
    expect(suggestAppId('Kubo-Protocol', 'meu-app')).toBe('com.kuboprotocol.meuapp')
    expect(suggestAppId('123', '---')).toBe('com.a123.app')
  })
  it('comandos do Capacitor por plataforma', () => {
    const a = studioRecipe('android', 'acme', 'shop')
    expect(a.cloneUrl).toBe('https://github.com/acme/shop.git')
    expect(a.zipUrl).toBe('https://github.com/acme/shop/archive/HEAD.zip')
    expect(a.commands).toContain('npx cap add android')
    expect(a.commands.at(-1)).toBe('npx cap open android')
    const i = studioRecipe('ios', 'acme', 'shop', 'Loja "X"')
    expect(i.commands).toContain('npm install @capacitor/core @capacitor/cli @capacitor/ios')
    expect(i.commands.find((c) => c.startsWith('npx cap init'))).toContain('"Loja X" com.acme.shop')
  })
})

describe('textos pt-BR / en / es', () => {
  it('idioma pelo prefixo; mesmas chaves nas três línguas', () => {
    expect(msLang('en-US')).toBe('en')
    expect(msLang('es-MX')).toBe('es')
    expect(msLang('pt-BR')).toBe('pt')
    expect(msLang(undefined)).toBe('pt')
    const keys = Object.keys(MS_UI.pt).sort()
    expect(Object.keys(MS_UI.en).sort()).toEqual(keys)
    expect(Object.keys(MS_UI.es).sort()).toEqual(keys)
  })
  it('é honesto: Android Studio e Xcode sem OAuth; Play Console pede acesso no Play Console', () => {
    expect(MS_UI.pt.androidHonest).toMatch(/não tem login OAuth/)
    expect(MS_UI.pt.iosHonest).toMatch(/não oferece login OAuth/)
    expect(MS_UI.pt.iosHonest).toMatch(/não dá acesso ao App Store Connect/)
    expect(MS_UI.pt.playAccessSteps.join(' ')).toMatch(/Usuários e permissões/)
    expect(MS_UI.en.playAccessSteps.join(' ')).toMatch(/Users and permissions/)
  })
})
