import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { VaultSecret } from '@/hooks/useKuboSecrets'

const REAL_VALUE = 'sk-live-REAL-VALUE-DO-NOT-LEAK-9999'

const owned: VaultSecret = {
  id: 'own-1',
  owner_id: 'me',
  name: 'Chave OpenAI',
  env_key: 'OPENAI_API_KEY',
  group_name: 'ia',
  description: null,
  bound_to: 'ai-providers',
  masked_hint: 'sk-l••••9999',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  rotated_at: '2026-11-01T10:00:00Z',
  last_used_at: null,
  role: 'owner',
  can_reveal: true,
  grants: [{ grantee_id: 'u2', email: 'amigo@exemplo.com', can_reveal: false }],
}

const shared: VaultSecret = {
  ...owned,
  id: 'sh-1',
  name: 'Token Resend do time',
  env_key: 'RESEND_API_KEY',
  group_name: 'email',
  masked_hint: 're_••••abcd',
  role: 'grant',
  can_reveal: false,
  grants: [],
}

const reveal = vi.fn(async () => REAL_VALUE)

vi.mock('@/hooks/useKuboSecrets', () => ({
  useKuboSecrets: () => ({
    secrets: [owned, shared],
    loading: false,
    error: null,
    reload: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    rotate: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    reveal,
    grant: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
    loadAudit: vi.fn(async () => []),
  }),
}))

vi.mock('@/components/secrets/OrchestratorPanel', () => ({
  OrchestratorPanel: () => null,
}))

import SecretsVaultPage from '@/pages/SecretsVaultPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SecretsVaultPage />
    </MemoryRouter>,
  )
}

describe('SecretsVaultPage', () => {
  beforeEach(() => {
    reveal.mockClear()
  })

  it('shows names, variables and masked hints, never the real value', () => {
    renderPage()
    expect(screen.getByText('Chave OpenAI')).toBeTruthy()
    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy()
    expect(screen.getByText('sk-l••••9999')).toBeTruthy()
    expect(screen.queryByText(REAL_VALUE)).toBeNull()
    expect(document.body.innerHTML).not.toContain(REAL_VALUE)
    expect(reveal).not.toHaveBeenCalled()
  })

  it('marks secrets shared with the user and hides owner-only actions on them', () => {
    renderPage()
    expect(screen.getByText('Compartilhado')).toBeTruthy()
    // Só o segredo próprio tem Excluir/Editar/Acessos: exatamente um de cada.
    expect(screen.getAllByLabelText('Excluir segredo')).toHaveLength(1)
    expect(screen.getAllByLabelText('Editar segredo')).toHaveLength(1)
    expect(screen.getAllByLabelText('Gerenciar acessos')).toHaveLength(1)
    // Convidado sem can_reveal não tem botão de revelar: o do segredo próprio é o único.
    expect(screen.getAllByLabelText('Revelar valor')).toHaveLength(1)
  })

  it('reveals a value only after an explicit click', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Revelar valor'))
    await waitFor(() => expect(screen.getByText(REAL_VALUE)).toBeTruthy())
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(reveal).toHaveBeenCalledWith('own-1')
  })

  it('hides a revealed value again on demand', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('Revelar valor'))
    await waitFor(() => expect(screen.getByText(REAL_VALUE)).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Ocultar valor'))
    await waitFor(() => expect(screen.queryByText(REAL_VALUE)).toBeNull())
  })

  it('asks search engines not to index the vault page', () => {
    renderPage()
    const robots = document.head.querySelector('meta[name="robots"]')
    expect(robots?.getAttribute('content')).toContain('noindex')
  })
})
