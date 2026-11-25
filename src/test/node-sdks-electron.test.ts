// Camada de provedores do Vertal Node (native/node-sdks/electron). Os SDKs reais não estão no
// repositório: os testes injetam módulos falsos via `loadModule`.
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createAdapter, PROVIDER_IDS, PROVIDERS } = require('../../native/node-sdks/electron/adapters')
const { makeConfig, DEFAULT_PROVIDER } = require('../../native/node-sdks/electron/config')
const { setupVertalNode } = require('../../native/node-sdks/electron/main')

type Adapter = {
  id: string
  enabled: boolean
  init: (o: Record<string, unknown>) => Promise<void>
  requestConsent: (o?: Record<string, unknown>) => Promise<boolean>
  isOptedIn: () => Promise<boolean>
  isRunning: () => Promise<boolean>
  start: () => Promise<void>
  stop: () => Promise<void>
  optOut: () => Promise<void>
  onChange: (cb: (s: unknown) => void) => void
}

function memoryStore() {
  const data: Record<string, unknown> = {}
  return { get: (k: string) => data[k], set: (k: string, v: unknown) => void (data[k] = v), data }
}

// Espelha a API pública do @cashraven/electron 4.1.4 (index.d.ts do cr-sdk-electron.zip).
function fakeCashRaven({ accept = true } = {}) {
  type Inst = {
    opts: unknown
    consent: 'not_responded' | 'accepted' | 'declined' | 'revoked'
    running: boolean
    started: number
    stopped: number
    optedOut: number
    disposed: boolean
    optIn: () => void
  }
  const instances: Inst[] = []
  const eventHandlers: (() => void)[] = []
  class CashRaven {
    opts: unknown
    consent: Inst['consent'] = 'not_responded'
    running = false
    started = 0
    stopped = 0
    optedOut = 0
    disposed = false
    constructor(opts: unknown) {
      this.opts = opts
      instances.push(this as unknown as Inst)
    }
    optIn() {
      this.consent = 'accepted'
    }
    optOut() {
      this.consent = 'revoked'
      this.optedOut += 1
    }
    consentStatus() {
      return this.consent
    }
    isOptedIn() {
      return this.consent === 'accepted'
    }
    isRunning() {
      return this.running
    }
    start() {
      this.started += 1
      this.running = true
    }
    stop() {
      this.stopped += 1
      this.running = false
    }
    status() {
      return this.running ? 'SHARING' : 'STOPPED'
    }
    authStatus() {
      return { state: 'idle', code: 'idle', message: '', transient: true }
    }
    onEvent(handler: () => void) {
      eventHandlers.push(handler)
      return () => void eventHandlers.splice(eventHandlers.indexOf(handler), 1)
    }
    dispose() {
      this.disposed = true
    }
  }
  // showConsent: no aceite o próprio SDK chama optIn().
  const showConsent = vi.fn(async (client: Inst) => {
    if (accept) client.optIn()
    return accept
  })
  return { mod: { CashRaven, showConsent }, instances, showConsent, eventHandlers }
}

function fakeHoneygain() {
  const state = { isOptedIn: false, isRunning: false }
  class HgSdk {
    opts: unknown
    get isOptedIn() {
      return state.isOptedIn
    }
    get isRunning() {
      return state.isRunning
    }
    constructor(opts: unknown) {
      this.opts = opts
    }
    async requestConsent() {
      state.isOptedIn = true
    }
    async start() {
      state.isRunning = true
    }
    async stop() {
      state.isRunning = false
    }
    async optOut() {
      state.isOptedIn = false
      state.isRunning = false
    }
    on() {}
  }
  return { mod: { HgSdk }, state }
}

describe('node-sdks/electron — registro de provedores', () => {
  it('lista honeygain e cashraven ligados e os pendentes como stubs desligados', () => {
    expect(PROVIDER_IDS).toEqual(['honeygain', 'cashraven', 'pawns', 'bright', 'infatica', 'earnfm'])
    // Honeygain: código intacto e selecionável, mas marcado como aguardando aprovação.
    expect(PROVIDERS.honeygain).toMatchObject({ enabled: true, pending: 'aguardando aprovação' })
    expect(PROVIDERS.cashraven.pending).toBeUndefined()
    for (const id of ['pawns', 'bright', 'infatica', 'earnfm']) {
      const a: Adapter = createAdapter(id, { loadModule: () => { throw new Error('não deveria carregar') } })
      expect(a.enabled).toBe(false)
    }
  })

  it('recusa provedor desconhecido', () => {
    expect(() => createAdapter('foo')).toThrow(/NODE_SDK_PROVIDER inválido/)
  })

  it('stub desligado nunca inicia', async () => {
    const a: Adapter = createAdapter('pawns')
    await expect(a.start()).rejects.toThrow(/desativado/)
    expect(await a.isRunning()).toBe(false)
  })

  it('só carrega o pacote do provedor escolhido', () => {
    const loadModule = vi.fn()
    createAdapter('cashraven', { loadModule })
    expect(loadModule).not.toHaveBeenCalled() // carregado só no init()
  })
})

describe('node-sdks/electron — Cash Raven (API 4.1.4)', () => {
  it('consentimento primeiro: não inicia sem aceite', async () => {
    const fake = fakeCashRaven({ accept: false })
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1', store: memoryStore() })
    expect(await a.requestConsent({})).toBe(false)
    await expect(a.start()).rejects.toThrow(/sem consentimento/)
    expect(fake.instances[0].started).toBe(0)
  })

  it('aceite → start → status → optOut, com o estado sempre lido do SDK', async () => {
    const fake = fakeCashRaven()
    const store = memoryStore()
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1', store, appId: 'dev.vertal.node' })
    expect(fake.instances[0].opts).toEqual({ developerKey: 'k', uid: 'desk-1', appId: 'dev.vertal.node' })
    expect(await a.isOptedIn()).toBe(false)
    expect(await a.requestConsent({ parent: 'win' })).toBe(true)
    expect(fake.showConsent).toHaveBeenCalledWith(fake.instances[0], { parent: 'win' })
    // Já aceitou: não abre a tela de novo.
    expect(await a.requestConsent({ parent: 'win' })).toBe(true)
    expect(fake.showConsent).toHaveBeenCalledTimes(1)
    await a.start()
    expect(await a.isRunning()).toBe(true)
    expect(await a.status()).toEqual({ status: 'SHARING', authCode: null })
    expect(store.data).toEqual({}) // nada de cópia local do consentimento
    await a.optOut()
    expect(fake.instances[0].optedOut).toBe(1)
    expect(await a.isOptedIn()).toBe(false)
    expect(await a.isRunning()).toBe(false)
  })

  it('pausado continua "aceito" (consentStatus), sem pedir consentimento de novo', async () => {
    const fake = fakeCashRaven()
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1' })
    fake.instances[0].consent = 'accepted'
    expect(await a.requestConsent({})).toBe(true)
    expect(fake.showConsent).not.toHaveBeenCalled()
  })

  it('chave recusada aparece em status().authCode', async () => {
    const fake = fakeCashRaven()
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1' })
    const inst = fake.instances[0] as unknown as { authStatus: () => unknown; status: () => string }
    inst.authStatus = () => ({ state: 'rejected', code: 'unknown_key', message: 'x', transient: false })
    inst.status = () => 'ERROR'
    expect(await a.status()).toEqual({ status: 'ERROR', authCode: 'unknown_key' })
  })

  it('eventos do SDK (onEvent) avisam o onChange; dispose libera o cliente', async () => {
    const fake = fakeCashRaven()
    const a = createAdapter('cashraven', { loadModule: () => fake.mod }) as Adapter & { dispose: () => Promise<void> }
    await a.init({ apiKey: 'k', uid: 'desk-1' })
    const seen: unknown[] = []
    a.onChange((st) => seen.push(st))
    fake.eventHandlers[0]()
    expect(seen).toEqual([{ optedIn: false, running: false }])
    await a.dispose()
    expect(fake.instances[0].disposed).toBe(true)
    expect(fake.eventHandlers).toHaveLength(0)
  })

  it('exige developer key', async () => {
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fakeCashRaven().mod })
    await expect(a.init({ apiKey: '', uid: 'x' })).rejects.toThrow(/developer key ausente/)
  })
})

describe('node-sdks/electron — Bright (sem SDK Electron)', () => {
  it('desktop fica como stub desligado e nunca carrega pacote', async () => {
    const loadModule = vi.fn()
    const a: Adapter = createAdapter('bright', { loadModule })
    expect(a.enabled).toBe(false)
    await expect(a.init({ apiKey: 'x' })).rejects.toThrow(/desativado/)
    expect(loadModule).not.toHaveBeenCalled()
  })
})

describe('node-sdks/electron — Honeygain', () => {
  it('mantém o fluxo antigo (requestConsent nativo, start, optOut)', async () => {
    const fake = fakeHoneygain()
    const a: Adapter = createAdapter('honeygain', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k' })
    await expect(a.start()).rejects.toThrow(/sem consentimento/)
    expect(await a.requestConsent()).toBe(true)
    await a.start()
    expect(await a.isRunning()).toBe(true)
    await a.optOut()
    expect(await a.isOptedIn()).toBe(false)
  })
})

describe('node-sdks/electron — config', () => {
  it('provedor padrão cashraven (Honeygain religável por config) e chave por provedor, sem vazar valor no erro', () => {
    const c = makeConfig({ CASHRAVEN_API_KEY_DESKTOP: 'secret-value' })
    expect(DEFAULT_PROVIDER).toBe('cashraven')
    expect(c.provider()).toBe('cashraven')
    expect(makeConfig({ NODE_SDK_PROVIDER: 'Honeygain' }).provider()).toBe('honeygain')
    expect(c.appId()).toBeUndefined()
    expect(makeConfig({ VERTAL_NODE_APP_ID: ' dev.vertal.node ' }).appId()).toBe('dev.vertal.node')
    expect(c.apiKey('cashraven')).toBe('secret-value')
    expect(() => c.apiKey('honeygain')).toThrow(/HONEYGAIN_API_KEY$/)
    try {
      makeConfig({ HONEYGAIN_API_KEY: '' }).apiKey('cashraven')
    } catch (e) {
      expect(String(e)).not.toMatch(/secret-value/)
    }
  })
})

describe('node-sdks/electron — main (heartbeat com provider)', () => {
  it('envia provider no heartbeat para vertal-node-heartbeat', async () => {
    const fake = fakeCashRaven()
    const handlers: Record<string, (...a: unknown[]) => unknown> = {}
    const fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, credited: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    const config = {
      ...makeConfig({
        NODE_SDK_PROVIDER: 'cashraven',
        CASHRAVEN_API_KEY_DESKTOP: 'k',
        VERTAL_SUPABASE_URL: 'https://x.supabase.co',
        VERTAL_SUPABASE_ANON_KEY: 'anon',
      }),
    }
    const appHandlers: Record<string, () => void> = {}
    const node = setupVertalNode({
      app: { on: (ev: string, fn: () => void) => void (appHandlers[ev] = fn), getPath: () => '/tmp' },
      ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => void (handlers[ch] = fn) },
      getWindow: () => null,
      config,
      loadModule: () => fake.mod,
      store: memoryStore(),
    })
    expect(node.provider).toBe('cashraven')
    const st = (await handlers['vertal-node:activate']()) as { optedIn: boolean; running: boolean }
    expect(st).toMatchObject({ provider: 'cashraven', optedIn: true, running: true, sdkStatus: { status: 'SHARING', authCode: null } })
    node.setAccessToken('tok')
    await node.heartbeat()
    const calls = fetchMock.mock.calls as unknown as [string, { body: string }][]
    const [url, init] = calls[calls.length - 1]
    expect(url).toBe('https://x.supabase.co/functions/v1/vertal-node-heartbeat')
    expect(JSON.parse(init.body)).toMatchObject({ provider: 'cashraven', platform: 'desktop', opted_in: true, running: true })
    node.setAccessToken(null)
    appHandlers['before-quit']()
    await Promise.resolve()
    expect(fake.instances[0].disposed).toBe(true) // Cash Raven: dispose() ao sair
    vi.unstubAllGlobals()
  })
})
