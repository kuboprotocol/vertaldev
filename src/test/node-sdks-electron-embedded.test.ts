// Vertal Node desktop embutido (fase 2): chave gravada no build, pausar lembrado e bandeja.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { makeConfig, loadBuildConfig } = require('../../native/node-sdks/electron/config')
const { setupVertalNode } = require('../../native/node-sdks/electron/main')
const { buildTemplate, createVertalNodeTray } = require('../../native/node-sdks/electron/tray')
const { buildConfig, writeBuildConfig } = require('../../native/node-sdks/electron/scripts/inject-build-config')

function memoryStore(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial }
  return { get: (k: string) => data[k], set: (k: string, v: unknown) => void (data[k] = v), data }
}

function fakeCashRaven({ accept = true, consent = 'not_responded' } = {}) {
  const inst = { consent, running: false, started: 0 }
  class CashRaven {
    constructor() {
      return Object.assign(this, { _i: inst })
    }
    consentStatus() { return inst.consent }
    isOptedIn() { return inst.consent === 'accepted' }
    isRunning() { return inst.running }
    start() { inst.started += 1; inst.running = true }
    stop() { inst.running = false }
    optIn() { inst.consent = 'accepted' }
    optOut() { inst.consent = 'revoked' }
    status() { return inst.running ? 'SHARING' : 'STOPPED' }
    authStatus() { return { state: 'idle', code: 'idle' } }
    dispose() {}
  }
  const showConsent = vi.fn(async () => {
    if (accept) inst.consent = 'accepted'
    return accept
  })
  return { mod: { CashRaven, showConsent }, inst, showConsent }
}

function setup(fake: ReturnType<typeof fakeCashRaven>, store = memoryStore()) {
  const handlers: Record<string, (...a: unknown[]) => unknown> = {}
  const node = setupVertalNode({
    app: { on: () => {}, getPath: () => os.tmpdir() },
    ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => void (handlers[ch] = fn) },
    getWindow: () => null,
    config: makeConfig({ NODE_SDK_PROVIDER: 'cashraven', CASHRAVEN_API_KEY_DESKTOP: 'k', VERTAL_SUPABASE_URL: 'https://x', VERTAL_SUPABASE_ANON_KEY: 'a' }, {}),
    loadModule: () => fake.mod,
    store,
  })
  return { node, handlers, store }
}

describe('node-sdks/electron — chave no build', () => {
  it('inject-build-config grava só as chaves conhecidas e não imprime valores', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vn-')), 'build-config.json')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = writeBuildConfig(file, { CASHRAVEN_API_KEY_DESKTOP: ' secret-desk ', OTHER: 'x', VERTAL_NODE_APP_ID: '' })
    expect(r.present).toEqual(['CASHRAVEN_API_KEY_DESKTOP'])
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ CASHRAVEN_API_KEY_DESKTOP: 'secret-desk' })
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('secret-desk'))
    log.mockRestore()
    expect(loadBuildConfig(file)).toEqual({ CASHRAVEN_API_KEY_DESKTOP: 'secret-desk' })
    expect(loadBuildConfig(path.join(os.tmpdir(), 'nao-existe.json'))).toEqual({})
    expect(buildConfig({})).toEqual({})
  })

  it('app empacotado lê a chave do build-config; variável de ambiente tem prioridade', () => {
    expect(makeConfig({}, { CASHRAVEN_API_KEY_DESKTOP: 'from-build' }).apiKey('cashraven')).toBe('from-build')
    expect(makeConfig({ CASHRAVEN_API_KEY_DESKTOP: 'from-env' }, { CASHRAVEN_API_KEY_DESKTOP: 'from-build' }).apiKey('cashraven')).toBe('from-env')
    expect(() => makeConfig({}, {}).apiKey('cashraven')).toThrow(/CASHRAVEN_API_KEY_DESKTOP$/)
  })
})

describe('node-sdks/electron — nada antes do toque, pausar lembrado', () => {
  it('sem aceite: abrir o app não inicia nem pede consentimento', async () => {
    const fake = fakeCashRaven()
    const { node } = setup(fake)
    await node.ready
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.showConsent).not.toHaveBeenCalled()
    expect(fake.inst.started).toBe(0)
  })

  it('Pausar fica lembrado: reabrir o app não religa; Ativar religa', async () => {
    const fake = fakeCashRaven({ consent: 'accepted' })
    const { node, handlers, store } = setup(fake, memoryStore({ userPaused: true }))
    await node.ready
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.inst.started).toBe(0)
    const s = (await handlers['vertal-node:activate']()) as { running: boolean; paused: boolean }
    expect(s).toMatchObject({ running: true, paused: false })
    const p = (await handlers['vertal-node:stop']()) as { running: boolean; paused: boolean }
    expect(p).toMatchObject({ running: false, paused: true })
    expect(store.data.userPaused).toBe(true)
  })

  it('recusou a tela do parceiro: nada liga', async () => {
    const fake = fakeCashRaven({ accept: false })
    const { handlers } = setup(fake)
    const s = (await handlers['vertal-node:activate']()) as { optedIn: boolean; running: boolean }
    expect(fake.showConsent).toHaveBeenCalledTimes(1)
    expect(s).toMatchObject({ optedIn: false, running: false })
  })
})

describe('node-sdks/electron — bandeja', () => {
  it('menu: Ativar sem consentimento; Pausar e Desativar quando compartilhando', () => {
    const a = { activate: vi.fn(), pause: vi.fn(), optOut: vi.fn() }
    const off = buildTemplate({ enabled: true, optedIn: false, running: false }, a)
    expect(off.find((i: { id?: string }) => i.id === 'activate')).toMatchObject({ label: 'Ativar…', enabled: true })
    expect(off.find((i: { id?: string }) => i.id === 'pause')).toMatchObject({ enabled: false })
    expect(off.find((i: { id?: string }) => i.id === 'optOut')).toMatchObject({ enabled: false })
    const on = buildTemplate({ enabled: true, optedIn: true, running: true }, a)
    expect(on.find((i: { id?: string }) => i.id === 'status').label).toMatch(/compartilhando/)
    expect(on.find((i: { id?: string }) => i.id === 'pause')).toMatchObject({ enabled: true })
    expect(on.find((i: { id?: string }) => i.id === 'optOut')).toMatchObject({ enabled: true })
    const disabled = buildTemplate({ enabled: false }, a)
    expect(disabled.find((i: { id?: string }) => i.id === 'activate')).toMatchObject({ enabled: false })
  })

  it('cria o ícone e não liga nada sozinho', async () => {
    const fake = fakeCashRaven()
    const { node } = setup(fake)
    const menus: unknown[] = []
    class Tray {
      setToolTip = vi.fn()
      setContextMenu = vi.fn((m: unknown) => void menus.push(m))
      destroy = vi.fn()
    }
    const t = createVertalNodeTray({ Tray, Menu: { buildFromTemplate: (x: unknown) => x }, node, iconPath: 'x.png' })
    await new Promise((r) => setTimeout(r, 0))
    expect(menus.length).toBeGreaterThan(0)
    expect(fake.showConsent).not.toHaveBeenCalled()
    expect(fake.inst.started).toBe(0)
    t.destroy()
  })
})
