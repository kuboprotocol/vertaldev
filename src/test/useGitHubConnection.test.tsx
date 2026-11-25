import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * useGitHubConnection: "Entrar com GitHub" — `connect()` pede a URL de OAuth à
 * edge function `github-auth` e leva o navegador ao GitHub. O token pessoal
 * (PAT) continua como opção avançada (`connectWithToken()` → subpágina de setup).
 * `disconnect()` apaga a conexão e a credencial.
 */

const h = vi.hoisted(() => {
  const invokeMock = vi.fn()
  const deleteEq = vi.fn(async () => ({ error: null as unknown }))
  const fromMock = vi.fn((_name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: 'c1', github_username: 'kubo', github_avatar_url: null, scope: 'repo', connected_at: '2026-09-25' },
        }),
      }),
    }),
    delete: () => ({ eq: (..._args: unknown[]) => ({ eq: deleteEq, then: (r: (v: unknown) => void) => r({ error: null }) }) }),
  }))
  const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
  // Mesma referência em todo render, como o AuthProvider real — um objeto
  // novo a cada render faria o useCallback([user]) do hook refazer o fetch
  // sem parar.
  const user = { id: 'u1' }
  return { invokeMock, fromMock, toastMock, deleteEq, user }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (name: string, opts?: unknown) => h.invokeMock(name, opts) },
    from: (name: string) => h.fromMock(name),
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: h.user }) }))
vi.mock('sonner', () => ({ toast: h.toastMock }))
vi.mock('@/hooks/useConnectorLogs', () => ({ logConnectorEvent: vi.fn() }))

import { useGitHubConnection } from '@/hooks/useGitHubConnection'

const originalLocation = window.location

beforeEach(() => {
  h.invokeMock.mockClear(); h.fromMock.mockClear(); Object.values(h.toastMock).forEach((m) => m.mockClear())
  ;(window as unknown as { location: unknown }).location = {
    href: 'http://localhost/connectors/github',
    origin: 'http://localhost',
    pathname: '/connectors/github',
    search: '',
  }
})

afterEach(() => {
  ;(window as unknown as { location: Location }).location = originalLocation
})

describe('useGitHubConnection', () => {
  it('loads the existing connection for the signed-in user', async () => {
    const { result } = renderHook(() => useGitHubConnection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(h.fromMock).toHaveBeenCalledWith('github_connections_safe')
    expect(result.current.isConnected).toBe(true)
    expect(result.current.connection?.github_username).toBe('kubo')
  })

  it('connect() asks github-auth for the OAuth URL and sends the browser to GitHub', async () => {
    const authUrl = 'https://github.com/login/oauth/authorize?client_id=x&state=n'
    h.invokeMock.mockResolvedValueOnce({ data: { url: authUrl, state: 'n' }, error: null })
    const { result } = renderHook(() => useGitHubConnection())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.connect()
    })

    expect(h.invokeMock).toHaveBeenCalledWith('github-auth', {
      body: { returnUrl: `${window.location.origin}/connectors/github` },
    })
    expect(window.location.href).toBe(authUrl)
    expect(result.current.connecting).toBe(true)
  })

  it('connect() shows an error and stays put when the OAuth URL cannot be created', async () => {
    h.invokeMock.mockResolvedValueOnce({ data: { error: 'github_not_configured' }, error: null })
    const { result } = renderHook(() => useGitHubConnection())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.connect()
    })

    expect(window.location.href).toBe('http://localhost/connectors/github')
    expect(result.current.connecting).toBe(false)
    expect(h.toastMock.error).toHaveBeenCalled()
  })

  it('connectWithToken() keeps the PAT option (advanced) on the setup page', async () => {
    const { result } = renderHook(() => useGitHubConnection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.connectWithToken() })
    expect(window.location.href).toBe('/connectors/github/setup')
    expect(h.invokeMock).not.toHaveBeenCalled()
  })

  it('disconnect() removes the connection and the stored credential', async () => {
    const { result } = renderHook(() => useGitHubConnection())
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    await act(async () => {
      await result.current.disconnect()
    })

    expect(h.fromMock).toHaveBeenCalledWith('github_connections')
    expect(h.fromMock).toHaveBeenCalledWith('api_credentials')
    expect(result.current.isConnected).toBe(false)
    expect(h.toastMock.info).toHaveBeenCalledWith('GitHub desconectado.')
  })
})
