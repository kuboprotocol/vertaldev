// Descoberta da MetaMask no navegador (EIP-6963) com fallback para window.ethereum (EIP-1193).
// Sem dependências: o próprio provedor da MetaMask faz tudo (contas, assinatura, troca de rede, transação).

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, cb: (...a: unknown[]) => void): void
  removeListener?(event: string, cb: (...a: unknown[]) => void): void
  isMetaMask?: boolean
}

export interface ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface DiscoveredProvider {
  info: ProviderInfo
  provider: Eip1193Provider
}

export const METAMASK_RDNS = ['io.metamask', 'io.metamask.flask', 'io.metamask.mobile']

/** Pede aos provedores injetados que se anunciem (EIP-6963) e espera um instante pelas respostas. */
export function discoverProviders(win: Window & typeof globalThis = window, waitMs = 300): Promise<DiscoveredProvider[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredProvider>()
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<DiscoveredProvider>).detail
      if (d?.info?.uuid && d.provider) found.set(d.info.uuid, d)
    }
    win.addEventListener('eip6963:announceProvider', onAnnounce as EventListener)
    win.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      win.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener)
      resolve([...found.values()])
    }, waitMs)
  })
}

/** Escolhe a MetaMask: primeiro pelo rdns do EIP-6963, depois window.ethereum.isMetaMask. */
export function pickMetaMask(list: DiscoveredProvider[], legacy?: unknown): Eip1193Provider | null {
  const byRdns = list.find((p) => METAMASK_RDNS.includes(p.info.rdns))
  if (byRdns) return byRdns.provider
  const eth = legacy as (Eip1193Provider & { providers?: Eip1193Provider[] }) | undefined
  if (eth?.providers?.length) return eth.providers.find((p) => p.isMetaMask) ?? null
  if (eth?.isMetaMask && typeof eth.request === 'function') return eth
  return null
}

export async function findMetaMask(win: Window & typeof globalThis = window): Promise<Eip1193Provider | null> {
  const list = await discoverProviders(win)
  return pickMetaMask(list, (win as unknown as { ethereum?: unknown }).ethereum)
}

export function isMobileUA(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

/**
 * Celular sem a extensão: abre esta mesma página dentro do navegador do app da MetaMask (deep link oficial),
 * onde o provedor é injetado e o fluxo é o mesmo.
 */
export function metamaskDeepLink(href: string): string {
  const u = new URL(href)
  return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}`
}

export const toHexChain = (id: number) => `0x${id.toString(16)}`

/** Troca a rede da MetaMask (Sepolia já vem cadastrada). */
export async function ensureChain(p: Eip1193Provider, chainId: number): Promise<void> {
  const current = Number.parseInt(String(await p.request({ method: 'eth_chainId' })), 16)
  if (current === chainId) return
  await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHexChain(chainId) }] })
}

/** personal_sign com a mensagem em hex UTF-8 (formato que a MetaMask mostra legível). */
export function utf8ToHex(s: string): string {
  return `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')}`
}
