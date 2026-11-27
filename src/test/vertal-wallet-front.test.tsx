// Conector MetaMask no front (flag VITE_VERTAL_METAMASK, padrão desligado): catálogo, rota, idioma, descoberta
// da extensão, comando do chat e botão (que não renderiza nada desligado).
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) }, functions: { invoke: vi.fn() } } }))

import { connectors } from '@/lib/connectorsConfig'
import { isMetaMaskSlug, isVertalMetaMaskEnabled, METAMASK_ROUTE, METAMASK_SLUG, metamaskCatalog, metamaskConnector } from '@/lib/vertalWallet/config'
import { MM_UI, mmError, mmLang } from '@/lib/vertalWallet/i18n'
import { metamaskDeepLink, pickMetaMask, utf8ToHex, type DiscoveredProvider } from '@/lib/vertalWallet/eip6963'
import { isVertalTraderCommand, vertalTraderHrefFromChat } from '@/lib/vertalWallet/client'
import { VertalWalletEntryButton } from '@/components/vertal-wallet/VertalWalletEntryButton'

describe('catálogo /connectors', () => {
  it('flag desligado por padrão; liga com true/1/on', () => {
    expect(isVertalMetaMaskEnabled({})).toBe(false)
    expect(isVertalMetaMaskEnabled({ VITE_VERTAL_METAMASK: 'false' })).toBe(false)
    expect(isVertalMetaMaskEnabled({ VITE_VERTAL_METAMASK: 'true' })).toBe(true)
    expect(metamaskCatalog({})).toEqual([])
    expect(metamaskCatalog({ VITE_VERTAL_METAMASK: 'on' }).map((c) => c.slug)).toEqual(['metamask'])
  })
  it('sem o flag o catálogo fica igual; nenhum slug repetido; o antigo "web-wallet" continua como estava', () => {
    if (!isVertalMetaMaskEnabled()) expect(connectors.some((c) => c.slug === METAMASK_SLUG)).toBe(false)
    const slugs = connectors.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(connectors.find((c) => c.slug === 'web-wallet')?.status).toBe('coming_soon')
  })
  it('rota própria e texto sem pedir segredo', () => {
    expect(isMetaMaskSlug('metamask')).toBe(true)
    expect(isMetaMaskSlug('github')).toBe(false)
    expect(metamaskConnector.internalRoute).toBe(METAMASK_ROUTE)
    expect(metamaskConnector.apiKeyLabel).toBe('')
  })
})

describe('idioma (pt-BR, en, es)', () => {
  it('mesmas chaves e mesmos erros nos três idiomas', () => {
    expect(mmLang('es-AR')).toBe('es')
    expect(mmLang('en-US')).toBe('en')
    expect(mmLang('pt-BR')).toBe('pt')
    expect(mmLang(null)).toBe('pt')
    const keys = Object.keys(MM_UI.pt).sort()
    expect(Object.keys(MM_UI.en).sort()).toEqual(keys)
    expect(Object.keys(MM_UI.es).sort()).toEqual(keys)
    const errs = Object.keys(MM_UI.pt.errors).sort()
    expect(Object.keys(MM_UI.en.errors).sort()).toEqual(errs)
    expect(Object.keys(MM_UI.es.errors).sort()).toEqual(errs)
    expect(mmError(MM_UI.en, 'desconhecido')).toBe(MM_UI.en.errors.network_error)
  })
  it('aviso de "não é recomendação de investimento" e testnet nos três', () => {
    expect(MM_UI.pt.traderDisclaimer).toMatch(/não é recomendação de investimento/i)
    expect(MM_UI.en.traderDisclaimer).toMatch(/not investment advice/i)
    expect(MM_UI.es.traderDisclaimer).toMatch(/no es una recomendación de inversión/i)
    for (const l of ['pt', 'en', 'es'] as const) expect(MM_UI[l].traderDisclaimer).toMatch(/Sepolia/)
  })
})

describe('descoberta da MetaMask (EIP-6963 / EIP-1193)', () => {
  const prov = (isMetaMask = false) => ({ request: vi.fn(), isMetaMask })
  it('prefere o rdns io.metamask; cai para window.ethereum.isMetaMask', () => {
    const mm = prov()
    const list: DiscoveredProvider[] = [
      { info: { uuid: '1', name: 'Outra', icon: '', rdns: 'com.outra' }, provider: prov() },
      { info: { uuid: '2', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider: mm },
    ]
    expect(pickMetaMask(list)).toBe(mm)
    const legacy = prov(true)
    expect(pickMetaMask([], legacy)).toBe(legacy)
    expect(pickMetaMask([], prov(false))).toBeNull()
    expect(pickMetaMask([], undefined)).toBeNull()
  })
  it('deep link do app no celular e mensagem em hex', () => {
    expect(metamaskDeepLink('https://vertal.dev/connectors/metamask/setup?tab=trader')).toBe('https://metamask.app.link/dapp/vertal.dev/connectors/metamask/setup?tab=trader')
    expect(utf8ToHex('Oi')).toBe('0x4f69')
  })
})

describe('Vertal Chat: comando do Trader', () => {
  it('só ordens que começam com o verbo; pergunta solta não vira ordem', () => {
    expect(isVertalTraderCommand('compre 0.01 ETH de UNI quando cair 5%')).toBe(true)
    expect(isVertalTraderCommand('/trade buy 0.01 eth of LINK')).toBe(true)
    expect(isVertalTraderCommand('vende 10 UNI cuando suba 2%')).toBe(true)
    expect(isVertalTraderCommand('quanto custa comprar 1 ETH?')).toBe(false)
    expect(isVertalTraderCommand('compre pão')).toBe(false)
    expect(isVertalTraderCommand('crie um app de vendas')).toBe(false)
    expect(vertalTraderHrefFromChat('compre 0.01 ETH de UNI')).toBe('/connectors/metamask/setup?tab=trader&prompt=compre%200.01%20ETH%20de%20UNI')
  })
  it('botão não renderiza nada com o flag desligado', () => {
    const { container } = render(<MemoryRouter><VertalWalletEntryButton enabledOverride={false} /></MemoryRouter>)
    expect(container.innerHTML).toBe('')
    const on = render(<MemoryRouter><VertalWalletEntryButton enabledOverride /></MemoryRouter>)
    expect(on.getByTestId('vertal-wallet-entry')).toBeTruthy()
  })
})

describe('cartão MetaMask no catálogo: só para quem o servidor libera', () => {
  const list = [{ slug: 'github' }, { slug: METAMASK_SLUG }, { slug: 'stripe' }]
  it('liberado mostra; carregando, negado ou erro escondem (falha fechada)', async () => {
    const { filterMetaMaskByAccess } = await import('@/lib/vertalWallet/config')
    expect(filterMetaMaskByAccess(list, 'allowed').map((c) => c.slug)).toEqual(['github', 'metamask', 'stripe'])
    expect(filterMetaMaskByAccess(list, 'checking').map((c) => c.slug)).toEqual(['github', 'stripe'])
    expect(filterMetaMaskByAccess(list, 'denied').map((c) => c.slug)).toEqual(['github', 'stripe'])
  })
  it('com o flag ligado e sem sessão (status falha), o acesso fica negado', async () => {
    vi.stubEnv('VITE_VERTAL_METAMASK', 'true')
    try {
      const { renderHook, waitFor } = await import('@testing-library/react')
      const { useVertalWalletAccess, resetWalletAccessCache } = await import('@/lib/vertalWallet/client')
      resetWalletAccessCache()
      const { result } = renderHook(() => useVertalWalletAccess())
      expect(result.current).toBe('checking')
      await waitFor(() => expect(result.current).toBe('denied'))
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
