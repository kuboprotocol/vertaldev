import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GameCreateModal from '../GameCreateModal'

function setup(isOpen = true) {
  const onCreate = vi.fn()
  const onClose = vi.fn()
  render(<GameCreateModal isOpen={isOpen} onClose={onClose} onCreate={onCreate} />)
  return { onCreate, onClose }
}

describe('GameCreateModal', () => {
  it('não renderiza nada quando fechado', () => {
    setup(false)
    expect(screen.queryByText('Criar novo Game')).toBeNull()
  })

  it('mostra os seis tipos e filtra as engines pelo tipo escolhido', () => {
    setup()
    for (const label of ['2D', '3D', 'Retro', 'Realista', 'Metaverso', '4D Ultra']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByText('2D'))
    expect(screen.getByText('Phaser')).toBeTruthy()
    expect(screen.queryByText('Babylon.js')).toBeNull()
  })

  it('segue o fluxo tipo → engine → detalhes e envia os dados ao criar', () => {
    const { onCreate } = setup()
    fireEvent.click(screen.getByText('3D'))
    fireEvent.click(screen.getByText('Babylon.js'))
    fireEvent.click(screen.getByText(/Próximo passo/))

    const title = screen.getByLabelText(/Título do Game/) as HTMLInputElement
    expect(screen.getByText('Criar Game').closest('button')!.disabled).toBe(true)
    fireEvent.change(title, { target: { value: 'Ilha dos Espelhos' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Um mundo instável' } })
    fireEvent.click(screen.getByText('Criar Game'))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Ilha dos Espelhos',
      description: 'Um mundo instável',
      game_type: '3d',
      engine: 'babylon',
      cover_image_url: '',
    })
  })

  it('volta ao passo de tipo sem perder a escolha', () => {
    setup()
    fireEvent.click(screen.getByText('Retro'))
    fireEvent.click(screen.getByText('Phaser'))
    fireEvent.click(screen.getByText(/Próximo passo/))
    fireEvent.click(screen.getByText(/Voltar/))
    expect(screen.getByText('Escolha a engine')).toBeTruthy()
    expect(screen.getByText('Phaser').closest('button')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('fecha pelo botão X', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByLabelText('Fechar'))
    expect(onClose).toHaveBeenCalled()
  })
})
