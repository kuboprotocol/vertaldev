// Camada de provedores do Vertal Node (native/node-sdks/electron). Os SDKs reais não estão no
// repositório: os testes injetam módulos falsos via `loadModule`.
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createAdapter, PROVIDER_IDS } = require('../../native/node-sdks/electron/adapters')
const { makeConfig } = require('../../native/node-sdks/electron/config')
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

function fakeCashRaven({ accept = true } = {}) {
  const instances: Record<string, unknown>[] = []
  class CashRaven {
    opts: unknown
    started = 0
    optedOut = 0
    constructor(opts: unknown) {
      this.opts = opts
      instances.push(this as unknown as Record<string, unknown>)
    }
    start() {
      this.started += 1
    }
    optOut() {
      this.optedOut += 1
    }
  }
  const showConsent = vi.fn(async () => accept)
  return { mod: { CashRaven, showConsent }, instances, showConsent }
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

describe('node-sdks/electron — Cash Raven', () => {
  it('consentimento primeiro: não inicia sem aceite', async () => {
    const fake = fakeCashRaven({ accept: false })
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1', store: memoryStore() })
    expect(await a.requestConsent({})).toBe(false)
    await expect(a.start()).rejects.toThrow(/sem consentimento/)
    expect(fake.instances[0].started).toBe(0)
  })

  it('aceite → start → optOut, com estado local quando o SDK não expõe getters', async () => {
    const fake = fakeCashRaven()
    const store = memoryStore()
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fake.mod })
    await a.init({ apiKey: 'k', uid: 'desk-1', store })
    expect(fake.instances[0].opts).toEqual({ developerKey: 'k', uid: 'desk-1' })
    expect(await a.requestConsent({ parent: 'win' })).toBe(true)
    expect(fake.showConsent).toHaveBeenCalledWith(fake.instances[0], { parent: 'win' })
    await a.start()
    expect(await a.isRunning()).toBe(true)
    expect(store.data['cashraven.optedIn']).toBe(true)
    await a.optOut()
    expect(fake.instances[0].optedOut).toBe(1)
    expect(await a.isOptedIn()).toBe(false)
    expect(await a.isRunning()).toBe(false)
  })

  it('exige developer key', async () => {
    const a: Adapter = createAdapter('cashraven', { loadModule: () => fakeCashRaven().mod })
    await expect(a.init({ apiKey: '', uid: 'x' })).rejects.toThrow(/developer key ausente/)
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
  it('provedor padrão honeygain e chave por provedor, sem vazar valor no erro', () => {
    const c = makeConfig({ CASHRAVEN_API_KEY_DESKTOP: 'secret-value' })
    expect(c.provider()).toBe('honeygain')
    expect(makeConfig({ NODE_SDK_PROVIDER: 'CashRaven' }).provider()).toBe('cashraven')
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
    const node = setupVertalNode({
      app: { on: () => {}, getPath: () => '/tmp' },
      ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => void (handlers[ch] = fn) },
      getWindow: () => null,
      config,
      loadModule: () => fake.mod,
      store: memoryStore(),
    })
    expect(node.provider).toBe('cashraven')
    const st = (await handlers['vertal-node:activate']()) as { optedIn: boolean; running: boolean }
    expect(st).toMatchObject({ provider: 'cashraven', optedIn: true, running: true })
    node.setAccessToken('tok')
    await node.heartbeat()
    const calls = fetchMock.mock.calls as unknown as [string, { body: string }][]
    const [url, init] = calls[calls.length - 1]
    expect(url).toBe('https://x.supabase.co/functions/v1/vertal-node-heartbeat')
    expect(JSON.parse(init.body)).toMatchObject({ provider: 'cashraven', platform: 'desktop', opted_in: true, running: true })
    node.setAccessToken(null)
    vi.unstubAllGlobals()
  })
})
