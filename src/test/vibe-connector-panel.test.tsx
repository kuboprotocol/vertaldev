import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}))

import { VibeConnectorPanel } from '@/components/vibe-code/VibeConnectorPanel'

const renderPanel = () => render(<MemoryRouter><VibeConnectorPanel /></MemoryRouter>)

describe('VibeConnectorPanel', () => {
  it('leva cada botão de conector a uma página real, sem rotas inexistentes', () => {
    renderPanel()

    const expected: Record<string, string> = {
      GitHub: '/connectors/github',
      Stripe: '/connect',
      IONOS: '/domains',
      MCP: '/docs/mcp',
    }

    for (const [label, href] of Object.entries(expected)) {
      const row = screen.getByText(label).closest('div.flex.items-start') as HTMLElement
      const link = within(row).getByRole('link')
      expect(link.getAttribute('href')).toBe(href)
    }
  })

  it('não gera link para /connectors/ionos nem /connectors/mcp', () => {
    renderPanel()
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).not.toContain('/connectors/ionos')
    expect(hrefs).not.toContain('/connectors/mcp')
  })
})
