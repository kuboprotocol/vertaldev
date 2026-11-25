// Deep link vertalnode://open no app de computador (native/node-sdks/electron/deeplink.js).
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { setupDeepLink, parseDeepLink, findLinkArg } = require('../../native/node-sdks/electron/deeplink')

function fakeApp({ lock = true } = {}) {
  const handlers: Record<string, (...a: unknown[]) => void> = {}
  return {
    handlers,
    requestSingleInstanceLock: vi.fn(() => lock),
    quit: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(() => true),
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => void (handlers[event] = cb)),
  }
}

function fakeWindow() {
  return {
    isDestroyed: () => false,
    isMinimized: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { isDestroyed: () => false, send: vi.fn() },
  }
}

describe('parseDeepLink', () => {
  it('aceita só vertalnode://open com appId/app_id, ref, source válidos', () => {
    expect(parseDeepLink('vertalnode://open?appId=site&source=vertal-js')).toEqual({ appId: 'site', ref: null, source: 'vertal-js' })
    expect(parseDeepLink('vertalnode://OPEN/?app_id=a.b&ref=x_1')).toEqual({ appId: 'a.b', ref: 'x_1', source: null })
    expect(parseDeepLink('vertalnode://open')).toEqual({ appId: null, ref: null, source: null })
  })

  it('ignora parâmetros desconhecidos, valores inválidos e repetidos', () => {
    expect(parseDeepLink('vertalnode://open?appId=%3Cscript%3E&start=1&ref=a&ref=b&token=xyz')).toEqual({ appId: null, ref: 'a', source: null })
    expect(parseDeepLink(`vertalnode://open?ref=${'a'.repeat(65)}`)).toEqual({ appId: null, ref: null, source: null })
  })

  it('outro esquema, host, caminho ou lixo = null', () => {
    for (const raw of ['https://open?appId=a', 'vertalnode://start', 'vertalnode://open/share', 'vertalnode:open', 'vertalnode://u:p@open', '', null, 42, `vertalnode://open?${'a'.repeat(3000)}`]) {
      expect(parseDeepLink(raw)).toBeNull()
    }
  })

  it('findLinkArg acha o link no argv (Windows/Linux)', () => {
    expect(findLinkArg(['C:\\Vertal Node.exe', '--flag', 'vertalnode://open?appId=a'])).toBe('vertalnode://open?appId=a')
    expect(findLinkArg(['app'])).toBeNull()
  })
})

describe('setupDeepLink', () => {
  it('registra o esquema, trava instância única e trata o link a frio do argv', () => {
    const app = fakeApp()
    const ipcMain = { handle: vi.fn() }
    const link = setupDeepLink({ app, ipcMain, getWindow: () => null, argv: ['vertal-node', 'vertalnode://open?appId=site'], proc: {} })
    expect(link.primary).toBe(true)
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('vertalnode')
    expect(link.pending()).toEqual({ appId: 'site', ref: null, source: null })
    const [channel, pendingHandler] = ipcMain.handle.mock.calls[0]
    expect(channel).toBe('vertal-node:deep-link-pending')
    expect(pendingHandler()).toEqual({ appId: 'site', ref: null, source: null })
  })

  it('modo dev (electron .) registra com execPath + script', () => {
    const app = fakeApp()
    setupDeepLink({ app, getWindow: () => null, argv: ['/bin/electron', 'main.js'], proc: { defaultApp: true, execPath: '/bin/electron' } })
    expect(app.setAsDefaultProtocolClient.mock.calls[0][0]).toBe('vertalnode')
    expect(app.setAsDefaultProtocolClient.mock.calls[0][1]).toBe('/bin/electron')
  })

  it('segunda instância sai sem registrar nada', () => {
    const app = fakeApp({ lock: false })
    expect(setupDeepLink({ app, getWindow: () => null, argv: [], proc: {} }).primary).toBe(false)
    expect(app.quit).toHaveBeenCalled()
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('second-instance e open-url: foca a janela e avisa o renderer; NUNCA liga o compartilhamento', () => {
    const app = fakeApp()
    const win = fakeWindow()
    const sdk = { activate: vi.fn(), start: vi.fn() }
    const onLink = vi.fn()
    setupDeepLink({ app, getWindow: () => win, onLink, argv: [], proc: {} })
    app.handlers['second-instance']({}, ['exe', 'vertalnode://open?appId=site&source=vertal-js'])
    expect(win.restore).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('vertal-node:deep-link', { appId: 'site', ref: null, source: 'vertal-js' })
    const ev = { preventDefault: vi.fn() }
    app.handlers['open-url'](ev, 'vertalnode://open?ref=r1')
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(onLink).toHaveBeenLastCalledWith({ appId: null, ref: 'r1', source: null })
    // link inválido: só foca (second-instance) ou ignora (open-url)
    win.webContents.send.mockClear()
    app.handlers['second-instance']({}, ['exe'])
    app.handlers['open-url'](ev, 'https://evil.example')
    expect(win.webContents.send).not.toHaveBeenCalled()
    expect(sdk.activate).not.toHaveBeenCalled()
    expect(sdk.start).not.toHaveBeenCalled()
  })
})
