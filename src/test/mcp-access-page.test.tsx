import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { McpKeyRecord } from '@/lib/mcpClientConfig'

const FRESH_KEY = 'vtl_mcp_' + 'B'.repeat(43)

const existing: McpKeyRecord = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Claude do notebook',
  key_prefix: 'vtl_mcp_AAAA',
  scopes: ['read'],
  created_at: '2026-11-01T10:00:00Z',
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
}

const create = vi.fn(async (input: { name: string; level: string }) => ({
  key: FRESH_KEY,
  record: {
    ...existing,
    id: '22222222-3333-4444-8555-666666666666',
    name: input.name,
    key_prefix: FRESH_KEY.slice(0, 12),
    scopes: input.level === 'write' ? ['read', 'write'] : ['read'],
  },
}))

vi.mock('@/hooks/useMcpAccessKeys', () => ({
  useMcpAccessKeys: () => ({
    keys: [existing],
    loading: false,
    error: null,
    create,
    revoke: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
  }),
}))

import McpAccessPage from '@/pages/McpAccessPage'

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  } as unknown as typeof IntersectionObserver
})

beforeEach(() => {
  create.mockClear()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <McpAccessPage />
    </MemoryRouter>,
  )
}

describe('página /mcp', () => {
  it('lista a chave existente sem mostrar o segredo', () => {
    renderPage()
    expect(screen.getByText('Claude do notebook')).toBeTruthy()
    expect(screen.getByText('vtl_mcp_AAAA…')).toBeTruthy()
    expect(screen.queryByText(FRESH_KEY)).toBeNull()
  })

  it('antes de gerar uma chave, a configuração usa o placeholder', () => {
    renderPage()
    expect(document.body.textContent).toContain('SUA_CHAVE_AQUI')
  })

  it('exige nome antes de gerar', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /gerar chave/i }))
    expect(await screen.findByText(/Dê um nome/)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('gera a chave, mostra uma única vez e a põe na configuração', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cursor do trabalho' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar chave/i }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cursor do trabalho', level: 'read' }))
    expect(await screen.findByText(FRESH_KEY)).toBeTruthy()
    expect(document.body.textContent).toContain(`Bearer ${FRESH_KEY}`)
    expect(document.body.textContent).not.toContain('SUA_CHAVE_AQUI')
  })
})
