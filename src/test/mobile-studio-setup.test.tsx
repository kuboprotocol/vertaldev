// Páginas de configuração: Android Studio, iOS / Xcode e Google Play Console (sem OAuth falso).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const invoke = vi.fn(async () => ({ data: { repos: [{ full_name: 'kuboprotocol/meu-app', private: true }] }, error: null }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) } } }))
vi.mock('@/lib/chatScheduler/client', () => ({ useSchedulerUiLang: () => 'pt-BR' }))
vi.mock('@/components/connectors/FluxosConnectPanel', () => ({
  FluxosConnectPanel: ({ app, name, returnPath }: { app: string; name: string; returnPath?: string }) => (
    <div data-testid={`fluxos-panel-${app}`} data-return={returnPath}>Entrar com {name}</div>
  ),
}))

import { MobileStudioSetupPage } from '@/components/connectors/MobileStudioSetup'

const renderAt = (slug: string, lang = '') =>
  render(<MemoryRouter initialEntries={[`/connectors/${slug}/setup${lang}`]}><MobileStudioSetupPage slug={slug} /></MemoryRouter>)

describe('MobileStudioSetupPage', () => {
  it('Google Play Console: Entrar com Google + aviso de acesso no Play Console', () => {
    renderAt('fluxos-google-play-console')
    const panel = screen.getByTestId('fluxos-panel-google-play-console')
    expect(panel.textContent).toBe('Entrar com Google')
    expect(panel.getAttribute('data-return')).toBe('/connectors/fluxos-google-play-console/setup')
    expect(screen.getByTestId('play-console-access-help').textContent).toMatch(/Usuários e permissões/)
  })

  it('Android Studio: diz que não há OAuth, usa a conexão Google do Play Console e abre pelo GitHub', async () => {
    renderAt('android-studio')
    expect(screen.getByTestId('android-studio-honest').textContent).toMatch(/não tem login OAuth/)
    expect(screen.getByTestId('fluxos-panel-google-play-console').getAttribute('data-return')).toBe('/connectors/android-studio/setup')
    expect(await screen.findByText('kuboprotocol/meu-app')).toBeTruthy()
  })

  it('iOS / Xcode: chave do App Store Connect (sem Entrar com Apple), em inglês com ?lang=en', () => {
    renderAt('ios-xcode', '?lang=en')
    expect(screen.getByTestId('ios-xcode-honest').textContent).toMatch(/no third-party OAuth/)
    expect(screen.getByTestId('fluxos-panel-app-store-connect')).toBeTruthy()
    expect(screen.queryByText(/Entrar com Apple|Sign in with Apple$/)).toBeNull()
    expect(screen.getByText('App Store Connect API key')).toBeTruthy()
  })

  it('slug desconhecido não renderiza nada', () => {
    const { container } = renderAt('github')
    expect(container.innerHTML).toBe('')
  })
})
