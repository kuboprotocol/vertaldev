// Apps do Vertal Fluxos conectados por usuário: validação das operações,
// clientes OAuth do Vertal, ferramenta do chat e retorno do OAuth.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import {
  compactResult, describeForAgent, oauthClientFields, oauthSecretGroup, parseFluxosOp, platformOAuthData,
  userAuthFields, whiteLabel, type FluxosAppDef,
} from '../../supabase/functions/_shared/fluxosApps'
import {
  buildAgentSystemPrompt, fluxosAppsInConversation, parseAgentOutput,
} from '../../supabase/functions/_shared/chatAgent'
import { oauthReturnParams } from '@/lib/fluxos/apps'

const env = (vals: Record<string, string>) => (k: string) => vals[k]

describe('parseFluxosOp', () => {
  it('aceita as operações válidas e tira o prefixo fluxos-', () => {
    expect(parseFluxosOp({ op: 'status' })).toEqual({ op: 'status' })
    expect(parseFluxosOp({ op: 'describe', app: 'fluxos-airbrake' })).toEqual({ op: 'describe', app: 'airbrake' })
    expect(parseFluxosOp({ op: 'start', app: 'airbrake', fields: { authToken: 'x', instanceUrl: 'https://a.airbrake.io' } }))
      .toEqual({ op: 'start', app: 'airbrake', fields: { authToken: 'x', instanceUrl: 'https://a.airbrake.io' } })
    expect(parseFluxosOp({ op: 'run', app: 'notion', kind: 'search', key: 'newDatabaseItems', parameters: { a: 1 } }))
      .toMatchObject({ op: 'run', kind: 'trigger', key: 'newDatabaseItems' })
  })
  it('recusa app, chave ou cobrança inválidos', () => {
    expect(parseFluxosOp({ op: 'describe', app: '../etc' })).toBeNull()
    expect(parseFluxosOp({ op: 'run', app: 'notion', key: 'a b' })).toBeNull()
    expect(parseFluxosOp({ op: 'run', app: 'notion', key: 'x', chatCharge: 'nope' })).toBeNull()
    expect(parseFluxosOp({ op: 'complete', app: 'notion' })).toBeNull()
    expect(parseFluxosOp({ op: 'delete_all' })).toBeNull()
  })
})

describe('clientes OAuth do Vertal', () => {
  it('apps Google usam um cliente só', () => {
    expect(oauthSecretGroup('google-sheets')).toBe('GOOGLE')
    expect(oauthSecretGroup('youtube')).toBe('GOOGLE')
    expect(oauthSecretGroup('you-need-a-budget')).toBe('YOU_NEED_A_BUDGET')
  })
  it('mapeia para os campos do motor', () => {
    expect(platformOAuthData('notion', env({ FLUXOS_OAUTH_NOTION_ID: 'id', FLUXOS_OAUTH_NOTION_SECRET: 's' })))
      .toEqual({ clientId: 'id', clientSecret: 's' })
    expect(platformOAuthData('twitter', env({ FLUXOS_OAUTH_TWITTER_ID: 'k', FLUXOS_OAUTH_TWITTER_SECRET: 's' })))
      .toEqual({ consumerKey: 'k', consumerSecret: 's' })
    expect(oauthClientFields('trello')).toEqual({ id: 'apiKey' })
    expect(platformOAuthData('notion', env({ FLUXOS_OAUTH_NOTION_ID: 'id' }))).toBeNull()
    expect(platformOAuthData('discord', env({ FLUXOS_OAUTH_DISCORD_ID: 'i', FLUXOS_OAUTH_DISCORD_SECRET: 's' }))).toBeNull()
  })
})

const AIRBRAKE: FluxosAppDef = {
  key: 'airbrake', name: 'Airbrake', supportsConnections: true, oauth: false,
  authFields: [
    { key: 'screenName', label: 'Screen Name', required: true },
    { key: 'instanceUrl', label: 'Instance URL', required: true },
    { key: 'authToken', label: 'Auth Token', required: true },
  ],
  actions: [],
  searches: [{ key: 'newErrors', name: 'New errors', arguments: [{ key: 'projectId', required: true, dynamicData: 'listProjects' }] }],
}

describe('definição do app', () => {
  it('campos do usuário tiram o que o Vertal fornece', () => {
    const def = { ...AIRBRAKE, oauth: true, authFields: [...AIRBRAKE.authFields, { key: 'clientId' }, { key: 'clientSecret' }] }
    expect(userAuthFields(def, { clientId: 'a', clientSecret: 'b' }).map((f) => f.key)).toEqual(['screenName', 'instanceUrl', 'authToken'])
  })
  it('texto para o agente lista buscas e opções', () => {
    const t = describeForAgent(AIRBRAKE)
    expect(t).toContain('busca newErrors')
    expect(t).toContain('options key=listProjects')
  })
  it('white-label nas mensagens', () => {
    expect(whiteLabel('Screen name used on Automatisch UI')).toBe('Screen name used on Vertal Fluxos UI')
    expect(compactResult({ a: 'x'.repeat(10) }, 5)).toContain('cortado')
  })
})

describe('ferramenta fluxos no chat', () => {
  it('só entra quando a conversa cita um app conectado', () => {
    expect(fluxosAppsInConversation(['notion', 'google-sheets'], ['crie uma página no Notion'])).toEqual([{ key: 'notion', name: 'Notion' }])
    expect(fluxosAppsInConversation(['google-sheets'], ['adicione uma linha na google sheets'])).toHaveLength(1)
    expect(fluxosAppsInConversation(['notion'], ['qual o clima hoje?'])).toEqual([])
    const p = buildAgentSystemPrompt({ secretNames: [], fluxosApps: [{ key: 'notion', name: 'Notion' }] })
    expect(p).toContain('"tool":"fluxos"')
    expect(buildAgentSystemPrompt({ secretNames: [] })).not.toContain('"tool":"fluxos"')
  })
  it('lê as ações do modelo', () => {
    const out = parseAgentOutput(JSON.stringify({ reply: 'ok', actions: [
      { tool: 'fluxos', op: 'actions', app: 'fluxos-notion' },
      { tool: 'fluxos', op: 'run', app: 'notion', kind: 'action', key: 'createPage', parameters: { title: 'Oi' } },
      { tool: 'fluxos', op: 'run', app: 'airbrake', search: 'newErrors' },
      { tool: 'fluxos', op: 'run', app: 'notion', key: 'bad key' },
    ] }))
    expect(out.turn.actions).toEqual([
      { tool: 'fluxos', op: 'actions', app: 'notion' },
      { tool: 'fluxos', op: 'run', app: 'notion', kind: 'action', key: 'createPage', parameters: { title: 'Oi' } },
      { tool: 'fluxos', op: 'run', app: 'airbrake', kind: 'search', key: 'newErrors' },
    ])
  })
})

describe('retorno do OAuth', () => {
  it('junta query e hash (query vence)', () => {
    expect(oauthReturnParams('?code=abc&state=s', '#access_token=t&state=h')).toEqual({ access_token: 't', state: 's', code: 'abc' })
  })
})

describe('clientes OAuth de anúncios, redes e marketplaces', () => {
  it('Facebook, Instagram, WhatsApp e Meta Ads usam o app da Meta', () => {
    for (const app of ['facebook', 'instagram', 'whatsapp', 'meta-ads']) expect(oauthSecretGroup(app)).toBe('META')
    expect(oauthSecretGroup('tiktok-ads')).toBe('TIKTOK_ADS')
    expect(oauthSecretGroup('amazon-ads')).toBe('AMAZON_ADS')
    const e = env({ FLUXOS_OAUTH_META_ID: 'a', FLUXOS_OAUTH_META_SECRET: 's', FLUXOS_OAUTH_META_ADS_CONFIG: 'cfg' })
    expect(platformOAuthData('meta-ads', e)).toEqual({ clientId: 'a', clientSecret: 's', configId: 'cfg' })
    expect(platformOAuthData('facebook', e)).toEqual({ clientId: 'a', clientSecret: 's' })
  })
  it('eBay usa produção quando há RuName de produção; senão sandbox', () => {
    expect(platformOAuthData('ebay', env({ FLUXOS_OAUTH_EBAY_ID: 'p', FLUXOS_OAUTH_EBAY_SECRET: 's' }))).toBeNull()
    expect(platformOAuthData('ebay', env({
      FLUXOS_OAUTH_EBAY_SANDBOX_ID: 'sb', FLUXOS_OAUTH_EBAY_SANDBOX_SECRET: 's2', FLUXOS_OAUTH_EBAY_SANDBOX_RUNAME: 'ru-sb',
    }))).toEqual({ clientId: 'sb', clientSecret: 's2', ruName: 'ru-sb', environment: 'sandbox' })
    expect(platformOAuthData('ebay', env({
      FLUXOS_OAUTH_EBAY_ID: 'p', FLUXOS_OAUTH_EBAY_SECRET: 's', FLUXOS_OAUTH_EBAY_RUNAME: 'ru',
      FLUXOS_OAUTH_EBAY_SANDBOX_ID: 'sb', FLUXOS_OAUTH_EBAY_SANDBOX_SECRET: 's2', FLUXOS_OAUTH_EBAY_SANDBOX_RUNAME: 'ru-sb',
    }))).toEqual({ clientId: 'p', clientSecret: 's', ruName: 'ru', environment: 'production' })
  })
})

describe('cliente OAuth da Microsoft', () => {
  it('Outlook, Microsoft 365 e Teams usam o mesmo app do Microsoft Entra', () => {
    for (const app of ['microsoft-outlook', 'microsoft-365', 'microsoft-teams']) expect(oauthSecretGroup(app)).toBe('MICROSOFT')
    const e = env({ FLUXOS_OAUTH_MICROSOFT_ID: 'cid', FLUXOS_OAUTH_MICROSOFT_SECRET: 'sec' })
    expect(platformOAuthData('microsoft-outlook', e)).toEqual({ clientId: 'cid', clientSecret: 'sec' })
    expect(platformOAuthData('microsoft-365', env({ FLUXOS_OAUTH_MICROSOFT_ID: 'cid' }))).toBeNull()
  })
})

describe('Google Ads, AdMob e AdSense', () => {
  it('usam o cliente Google do Vertal Fluxos; Google Ads aceita developer token opcional', () => {
    for (const app of ['google-ads', 'google-admob', 'google-adsense']) expect(oauthSecretGroup(app)).toBe('GOOGLE')
    const base = { FLUXOS_OAUTH_GOOGLE_ID: 'gid', FLUXOS_OAUTH_GOOGLE_SECRET: 'gsec' }
    expect(platformOAuthData('google-adsense', env(base))).toEqual({ clientId: 'gid', clientSecret: 'gsec' })
    expect(platformOAuthData('google-ads', env(base))).toEqual({ clientId: 'gid', clientSecret: 'gsec' })
    expect(platformOAuthData('google-ads', env({ ...base, FLUXOS_OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN: 'dt' })))
      .toEqual({ clientId: 'gid', clientSecret: 'gsec', developerToken: 'dt' })
    expect(platformOAuthData('google-admob', env({ FLUXOS_OAUTH_GOOGLE_ID: 'gid' }))).toBeNull()
  })
})
