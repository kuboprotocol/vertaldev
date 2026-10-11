import { describe, it, expect, vi } from 'vitest'
import { installServiceWorkerAutoReload } from './swAutoReload'

function setup({ controller = {} as object | null, visibility = 'visible' } = {}) {
  const swEvents = new EventTarget()
  const docEvents = new EventTarget()
  const update = vi.fn().mockResolvedValue(undefined)
  const sw = {
    controller,
    addEventListener: swEvents.addEventListener.bind(swEvents),
    getRegistration: vi.fn().mockResolvedValue({ update }),
  }
  const doc = { visibilityState: visibility, addEventListener: docEvents.addEventListener.bind(docEvents) }
  const reload = vi.fn()
  installServiceWorkerAutoReload({ serviceWorker: sw } as unknown as Navigator, doc as unknown as Document, reload)
  return {
    reload,
    update,
    doc,
    newVersionTakesControl: () => swEvents.dispatchEvent(new Event('controllerchange')),
    tabBecomes: (state: string) => {
      doc.visibilityState = state
      docEvents.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

describe('installServiceWorkerAutoReload', () => {
  it('reloads once when a new version takes control of an already controlled page', () => {
    const t = setup()
    t.newVersionTakesControl()
    t.newVersionTakesControl()
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('ignores the first install taking control, then reloads for the next version', () => {
    const t = setup({ controller: null })
    t.newVersionTakesControl()
    expect(t.reload).not.toHaveBeenCalled()
    t.newVersionTakesControl()
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('checks for an update when the tab becomes visible again', async () => {
    const t = setup()
    t.tabBecomes('hidden')
    expect(t.update).not.toHaveBeenCalled()
    t.tabBecomes('visible')
    await new Promise((r) => setTimeout(r, 0)) // let getRegistration() resolve
    expect(t.update).toHaveBeenCalledTimes(1)
  })

  it('does nothing without service worker support', () => {
    expect(() => installServiceWorkerAutoReload({} as Navigator, document, vi.fn())).not.toThrow()
  })
})
