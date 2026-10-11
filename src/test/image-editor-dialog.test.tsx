import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const exportCrop = vi.fn()
const triggerDownload = vi.fn()

vi.mock('@/lib/imageExport', async (orig) => ({
  ...(await orig<typeof import('@/lib/imageExport')>()),
  loadEditableSource: vi.fn(async () => ({ url: 'blob:src', width: 1000, height: 500 })),
  exportCrop: (...a: unknown[]) => exportCrop(...a),
  triggerDownload: (...a: unknown[]) => triggerDownload(...a),
}))

import { ImageEditorDialog } from '@/components/creative/ImageEditorDialog'

// jsdom has no PointerEvent; without it the coordinates of fireEvent.pointer* are dropped.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill
}

const stageBox = { left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }

describe('Image editor dialog', () => {
  beforeEach(() => {
    exportCrop.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    triggerDownload.mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:result')
    URL.revokeObjectURL = vi.fn()
  })

  it('lets you draw the crop with a finger, then download the cropped image', async () => {
    const onConfirm = vi.fn()
    render(<ImageEditorDialog open imageUrl="https://img.example/a.png" onCancel={() => {}} onConfirm={onConfirm} />)

    const stage = await screen.findByTestId('crop-stage')
    stage.getBoundingClientRect = () => stageBox as DOMRect
    // Drag from (40,20) to (240,120) on a 400x200 stage = 10%..60% wide, 10%..60% tall.
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 20, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 240, clientY: 120, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 240, clientY: 120, pointerId: 1 })
    expect(screen.getByText(/Corte: 500 × 250 px/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Cortar e salvar/ }))
    await screen.findByTestId('editor-result')
    expect(exportCrop).toHaveBeenCalledWith(expect.objectContaining({
      url: 'blob:src',
      area: { x: 100, y: 50, width: 500, height: 250 },
      size: { width: 500, height: 250 },
      format: 'png',
    }))
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Blob), { width: 500, height: 250, format: 'png' })

    fireEvent.click(screen.getByRole('button', { name: /Baixar imagem/ }))
    expect(triggerDownload).toHaveBeenCalledWith('blob:result', expect.stringMatching(/^vertal-imagem-500x250-\d+\.png$/))
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:result') // the link must stay valid for the download
  })

  it('moves the box and keeps a chosen ratio', async () => {
    render(<ImageEditorDialog open imageUrl="https://img.example/a.png" onCancel={() => {}} />)
    const stage = await screen.findByTestId('crop-stage')
    stage.getBoundingClientRect = () => stageBox as DOMRect

    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
    expect(screen.getByText(/Corte: 500 × 500 px/)).toBeInTheDocument() // largest square on 1000x500

    const handle = document.querySelector('[data-handle="se"]')!
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 200, pointerId: 2 })
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 200, pointerId: 2 })
    fireEvent.pointerUp(stage, { pointerId: 2 })
    expect(screen.getByText(/Corte: 250 × 250 px/)).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId('crop-box'), { clientX: 150, clientY: 50, pointerId: 3 })
    fireEvent.pointerMove(stage, { clientX: 400, clientY: 50, pointerId: 3 })
    fireEvent.pointerUp(stage, { pointerId: 3 })
    await waitFor(() => expect(screen.getByTestId('crop-box').style.left).toBe('75%'))
  })
})
