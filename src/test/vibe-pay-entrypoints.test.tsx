// Pontos de entrada do Vertal Vibe Pay: banner (home/dashboard), cartão compacto
// (Painel Criativo/Perfil), conector no hub e no catálogo. Sem "banco/bank".
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { VibePayPromo } from '@/components/vibepay/VibePayPromo'
import { connectors, getConnectorBySlug } from '@/lib/connectorsConfig'
import { CONNECTOR_CATALOG, detectRequirements } from '@/config/connectorCatalog'
import { localizeConnector } from '@/lib/connectorsCopyEn'

const BANK_WORD = /\b(banco|bank)\b/i

function renderAt(node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={node} />
        <Route path="/pay" element={<p>pay aberto</p>} />
        <Route path="/vibe-pay" element={<p>landing aberta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Vertal Vibe Pay: divulgação', () => {
  it('banner grande abre /pay no app', () => {
    renderAt(<VibePayPromo />)
    const banner = screen.getByRole('link', { name: 'Open Vertal Vibe Pay' })
    expect(banner.textContent).toContain('Vertal Vibe Pay')
    expect(banner.querySelector('img')?.getAttribute('src')).toBe('/vibe-pay/logo.webp')
    fireEvent.click(banner)
    expect(screen.getByText('pay aberto')).toBeTruthy()
  })

  it('na home pública leva à landing /vibe-pay', () => {
    renderAt(<VibePayPromo to="/vibe-pay" />)
    fireEvent.click(screen.getByRole('link', { name: 'Open Vertal Vibe Pay' }))
    expect(screen.getByText('landing aberta')).toBeTruthy()
  })

  it('cartão compacto abre /pay com Enter', () => {
    renderAt(<VibePayPromo variant="compact" />)
    fireEvent.keyDown(screen.getByRole('link', { name: 'Open Vertal Vibe Pay' }), { key: 'Enter' })
    expect(screen.getByText('pay aberto')).toBeTruthy()
  })

  it('textos visíveis não chamam o produto de banco', () => {
    const { container } = renderAt(<><VibePayPromo /><VibePayPromo variant="compact" /></>)
    // A linha de conformidade cita "instituição financeira", nunca banco/bank.
    expect(BANK_WORD.test(container.textContent ?? '')).toBe(false)
  })
})

describe('Vertal Vibe Pay: conectores', () => {
  it('aparece em destaque no hub e abre /pay', () => {
    const c = getConnectorBySlug('vertal-vibe-pay')
    expect(c?.featured).toBe(true)
    expect(c?.category).toBe('ecosystem')
    expect(c?.status).toBe('available')
    expect(c?.internalRoute).toBe('/pay')
    expect(BANK_WORD.test(`${c?.name} ${c?.description} ${c?.longDescription}`)).toBe(false)
    expect(connectors.filter((x) => x.slug === 'vertal-vibe-pay')).toHaveLength(1)
  })

  it('English copy keeps the route and never calls the product a bank', () => {
    const en = localizeConnector(getConnectorBySlug('vertal-vibe-pay'))
    expect(en?.internalRoute).toBe('/pay')
    expect(en?.description).toMatch(/digital account/)
    expect(en?.longDescription).toMatch(/not a financial institution/)
    expect(BANK_WORD.test(`${en?.name} ${en?.description} ${en?.longDescription} ${en?.features.join(' ')}`)).toBe(false)
  })

  it('está no catálogo de requisitos com connectPath /pay', () => {
    const e = CONNECTOR_CATALOG.find((x) => x.slug === 'vertal-vibe-pay')
    expect(e?.connectPath).toBe('/pay')
    expect(e?.signals.some((r) => r.test('quero receber com Vertal Vibe Pay'))).toBe(true)
    expect(typeof detectRequirements).toBe('function')
  })
})
