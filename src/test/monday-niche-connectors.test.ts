// monday.com por OAuth (app "Vertal Dev" do Vertal, token pessoal em "Avançado") e a volta de FreeScout,
// Firefly III, VirtualQ e Airbrake ao catálogo, com página de SEO de nicho e OAuth onde o provedor oferece.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  isTokenMode, platformOAuthData, PUBLIC_OAUTH_CLIENT_IDS, tokenModeFields, userAuthFields, type FluxosAppDef,
} from '../../supabase/functions/_shared/fluxosApps'
import { getConnectorBySlug } from '@/lib/connectorsConfig'
import { FLUXOS_SETUP_HELP } from '@/lib/fluxos/setupHelp'
import { findIntegration, integrationSeo, BANNED_PUBLIC_TERMS } from '@/config/integrations'
import { ENGINE_APPS } from '@/config/integrations/engineApps'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const MONDAY: FluxosAppDef = {
  key: 'monday', name: 'Monday', supportsConnections: true, oauth: true, actions: [], searches: [],
  authFields: [
    { key: 'clientId', required: true, oauthOnly: true },
    { key: 'clientSecret', required: true, oauthOnly: true },
    { key: 'apiToken', required: false, advanced: true },
  ],
}
const FIREFLY: FluxosAppDef = {
  key: 'firefly-iii', name: 'Firefly III', supportsConnections: true, oauth: true, actions: [], searches: [],
  authFields: [
    { key: 'instanceUrl', required: true },
    { key: 'clientId', required: true, oauthOnly: true },
    { key: 'clientSecret', required: true, oauthOnly: true },
    { key: 'personalAccessToken', required: false, advanced: true },
  ],
}

describe('monday.com por OAuth', () => {
  it('client ID público no código + FLUXOS_OAUTH_MONDAY_SECRET', () => {
    expect(PUBLIC_OAUTH_CLIENT_IDS.MONDAY).toBe('da03aca0085dc80432eeac8ebab9ed85')
    const env = (k: string) => ({ FLUXOS_OAUTH_MONDAY_SECRET: 's' } as Record<string, string>)[k]
    const platform = platformOAuthData('monday', env)
    expect(platform).toEqual({ clientId: PUBLIC_OAUTH_CLIENT_IDS.MONDAY, clientSecret: 's' })
    // Com o cliente do Vertal, o usuário só vê o token opcional do Avançado.
    expect(userAuthFields(MONDAY, platform).map((f) => f.key)).toEqual(['apiToken'])
    expect(platformOAuthData('monday', () => undefined)).toBeNull()
  })

  it('IDs movidos dos segredos (Pipedrive, Typeform) continuam valendo', () => {
    const env = (k: string) => ({ FLUXOS_OAUTH_PIPEDRIVE_SECRET: 'p', FLUXOS_OAUTH_TYPEFORM_SECRET: 't' } as Record<string, string>)[k]
    expect(platformOAuthData('pipedrive', env)?.clientId).toBe('2df039797d9b4f93')
    expect(platformOAuthData('typeform', env)?.clientId).toBe('QhuezgRDwP2eTVUrSjosCyKaFYPsHAg3fm8pXSTGJnn')
  })

  it('modo token (Avançado) só com token preenchido e sem client id/secret', () => {
    expect(isTokenMode(MONDAY, { apiToken: 'abc' })).toBe(true)
    expect(isTokenMode(MONDAY, { apiToken: '  ' })).toBe(false)
    expect(isTokenMode(MONDAY, {})).toBe(false)
    expect(isTokenMode({ ...MONDAY, oauth: false }, { apiToken: 'abc' })).toBe(false)
    expect(tokenModeFields(MONDAY).map((f) => f.key)).toEqual(['apiToken'])
    expect(tokenModeFields(FIREFLY).map((f) => f.key)).toEqual(['instanceUrl', 'personalAccessToken'])
  })

  it('o servidor não manda o cliente do Vertal no modo token e verifica direto', () => {
    const h = read('supabase/functions/_shared/fluxosAppsHandler.ts')
    expect(h).toMatch(/const tokenMode = isTokenMode\(def, op\.fields\)/)
    expect(h).toMatch(/const client = tokenMode \? null : platform/)
    expect(h).toMatch(/if \(def\.oauth && !tokenMode\)/)
  })

  it('a tela mostra "Entrar com …" e o token em "Avançado"', () => {
    const panel = read('src/components/connectors/FluxosConnectPanel.tsx')
    expect(panel).toMatch(/Advanced: use a personal token instead of sign-in/)
    expect(panel).toMatch(/connect\('token'\)/)
    expect(panel).not.toMatch(/automatisch|huginn/i)
    expect(getConnectorBySlug('fluxos-monday')?.name).toBe('monday.com')
    expect(ENGINE_APPS.monday.auth).toBe('vertal-oauth')
  })
})

describe('FreeScout, Firefly III, VirtualQ e Airbrake', () => {
  it('Firefly III: OAuth com cliente do próprio usuário na instância (sem segredo global)', () => {
    expect(ENGINE_APPS['firefly-iii'].auth).toBe('own-oauth')
    expect(platformOAuthData('firefly-iii', () => undefined)).toBeNull()
    expect(FLUXOS_SETUP_HELP['firefly-iii'].ownClient?.join(' ')).toMatch(/https:\/\/vertal\.dev\/fluxos\/oauth\/firefly-iii/)
    expect(FLUXOS_SETUP_HELP['firefly-iii'].advanced?.join(' ')).toMatch(/Personal Access Token/)
    expect(userAuthFields(FIREFLY, null).map((f) => f.key)).toEqual(['instanceUrl', 'clientId', 'clientSecret', 'personalAccessToken'])
  })

  it('FreeScout, Airbrake e VirtualQ: sem OAuth (dito na tela) e passos da chave', () => {
    for (const app of ['freescout', 'airbrake', 'virtualq']) {
      expect(FLUXOS_SETUP_HELP[app].noOAuth, app).toBe(true)
      expect(FLUXOS_SETUP_HELP[app].fields?.[0], app).toMatch(/(has no|does not offer)/)
      expect(ENGINE_APPS[app].auth, app).toBe('fields')
    }
  })

  it('ações novas no motor aparecem nas páginas', () => {
    expect(ENGINE_APPS.freescout.actions.map(([n]) => n)).toEqual(['Criar conversa', 'Responder conversa', 'Mudar status ou responsável', 'Listar conversas'])
    expect(ENGINE_APPS['firefly-iii'].actions.map(([n]) => n)).toContain('Criar transação')
    expect(ENGINE_APPS.airbrake.actions.map(([n]) => n)).toEqual(['Listar erros', 'Silenciar ou reativar erro'])
    expect(ENGINE_APPS.monday.actions.map(([n]) => n)).toContain('Comentar no item')
  })

  it('cada um tem página de SEO rica, única e com FAQ de nicho', () => {
    const titles = new Set<string>()
    for (const [slug, needle] of [['freescout', /FreeScout tem OAuth/], ['firefly-iii', /Firefly III tem OAuth/], ['virtualq', /VirtualQ tem OAuth/], ['airbrake', /Airbrake tem OAuth/], ['monday', /monday\.com conecta por OAuth/]] as const) {
      const i = findIntegration(slug)
      expect(i, slug).toBeDefined()
      expect(i!.uses.length, slug).toBeGreaterThanOrEqual(4)
      expect(i!.aliases.length, slug).toBeGreaterThanOrEqual(3)
      expect(i!.faq.some((f) => needle.test(f.q)), slug).toBe(true)
      expect(i!.actions.length, slug).toBeGreaterThanOrEqual(2)
      const seo = integrationSeo(i!)
      titles.add(seo.title)
      const text = JSON.stringify([i, seo]).toLowerCase()
      for (const banned of BANNED_PUBLIC_TERMS) expect(text, `${slug}: ${banned}`).not.toContain(banned)
    }
    expect(titles.size).toBe(5)
  })
})
