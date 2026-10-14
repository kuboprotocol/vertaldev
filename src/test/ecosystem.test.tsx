import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ECOSYSTEM, combinedMcpConfig, siblingsOf } from '@/lib/ecosystem'
import { connectors } from '@/lib/connectorsConfig'
import EcosystemShowcase from '@/components/ecosystem/EcosystemShowcase'

beforeAll(() => {
  // framer-motion (whileInView) precisa do IntersectionObserver, que o jsdom não tem.
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  } as unknown as typeof IntersectionObserver
})

describe('Ecossistema Vertal', () => {
  it('tem os três produtos e o Vertal Dev só aponta para os irmãos', () => {
    expect(ECOSYSTEM.map(p => p.id)).toEqual(['vertal-dev', 'vertal-run', 'vertal-app'])
    expect(siblingsOf('vertal-dev').map(p => p.id)).toEqual(['vertal-run', 'vertal-app'])
  })

  it('gera um único bloco MCP com os três servidores', () => {
    const { mcpServers } = JSON.parse(combinedMcpConfig())
    expect(Object.keys(mcpServers)).toEqual(['vertal-dev', 'vertal-run', 'vertal-app'])
    expect(mcpServers['vertal-app']).toEqual({ type: 'http', url: 'https://vertal.app/mcp' })
    expect(mcpServers['vertal-run'].args).toEqual(['-m', 'vertal2kubo.mcp'])
  })

  it('lista Vertal.app e Vertal Run nos conectores, com rota própria', () => {
    for (const slug of ['vertal-app', 'vertal-run']) {
      const c = connectors.find(x => x.slug === slug)
      expect(c?.featured).toBe(true)
      expect(c?.internalRoute).toBe(`/connectors/ecosystem/${slug}`)
    }
  })

  it('abre o produto no iframe', () => {
    render(
      <MemoryRouter>
        <EcosystemShowcase />
      </MemoryRouter>,
    )
    const runCard = screen.getByTestId('ecosystem-card-vertal-run')
    fireEvent.click(runCard.querySelector('button')!)
    const iframe = screen.getByTitle('Vertal Run') as HTMLIFrameElement
    expect(iframe.src).toContain('https://vertalrun.com/')
    expect(iframe.src).toContain('utm_source=vertal-dev')
  })

  it('mostra a configuração MCP do produto', () => {
    render(
      <MemoryRouter>
        <EcosystemShowcase />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Conectar MCP/ })[1])
    const dialog = screen.getByTestId('ecosystem-mcp-dialog')
    expect(dialog.textContent).toContain('https://vertal.app/mcp')
    expect(dialog.textContent).toContain('create_deployment')
  })
})
