// Cliente do conector MetaMask: fala com a ação "wallet" da edge function vertal-code-ai (sem função nova).
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { functionUrl } from '@/lib/vertalCodeAi/client'
import { isVertalMetaMaskEnabled, METAMASK_TRADER_ROUTE } from './config'
import { ensureChain, type Eip1193Provider, utf8ToHex } from './eip6963'

export interface WalletConnection { address: string; chain_id: number; connected_at: string }

export interface WalletStatus {
  enabled: boolean
  trader: boolean
  mainnetTrade: boolean
  mainnetFlag: boolean
  walletConnectProjectId: string | null
  chains: Array<{ chainId: number; name: string; explorer: string }>
  connection: WalletConnection | null
  migrationPending: boolean
  /** App só-leitura no Vertal Fluxos liberado (VERTAL_METAMASK_FLUXOS_ENABLED). Ausente em servidores antigos. */
  fluxos?: boolean
}

export interface WalletRead {
  address: string
  network: { chainId: number; name: string; explorer: string; blockNumber: number }
  balance: { wei: string; eth: string }
  txCount: number
  recentTx: Array<{ hash: string; from: string; to: string; valueEth: string; timeStamp: number; status: string }> | null
}

export interface UnsignedTx { to: string; data: string; value: string; description: string }

export interface TradeOrder {
  chainId: number
  intent: { side: 'buy' | 'sell'; token: string; amount: string; trigger: 'now' | 'drop' | 'rise'; pct: number }
  token: { symbol: string; address: string; decimals: number }
  quote: { fee: number; amountIn: string; amountOut: string; amountInText: string; amountOutText: string; priceEthPerToken: number }
  trigger: { kind: 'now' | 'drop' | 'rise'; pct: number; basePrice: number; targetPrice: number | null; met: boolean }
  txs: UnsignedTx[]
  disclaimer: string
  futureNote: string
}

/** Resultado de uma chamada: ok + data, ou status + error (o projeto compila sem strictNullChecks). */
export interface WalletCall<T> { ok: boolean; data?: T; status: number; error?: string }

export async function callWallet<T>(op: string, payload: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch): Promise<WalletCall<T>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, status: 401, error: 'not_signed_in' }
  try {
    const r = await fetchImpl(functionUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action: 'wallet', op }),
    })
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) return { ok: false, status: r.status, error: String(d.error ?? 'request_failed') }
    return { ok: true, status: r.status, data: d as T }
  } catch {
    return { ok: false, status: 0, error: 'network_error' }
  }
}

/** Conecta: pede a conta, monta a mensagem SIWE no servidor, a MetaMask assina, o servidor confere e guarda. */
export async function connectWithSiwe(provider: Eip1193Provider, chainId: number): Promise<WalletCall<{ connection: WalletConnection }>> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  const address = accounts?.[0]
  if (!address) return { ok: false, status: 0, error: 'no_account' }
  await ensureChain(provider, chainId)
  const n = await callWallet<{ message: string }>('nonce', { address, chainId })
  if (!n.ok) return { ok: false, status: n.status, error: n.error }
  const signature = (await provider.request({ method: 'personal_sign', params: [utf8ToHex(n.data.message), address] })) as string
  return callWallet<{ connection: WalletConnection }>('verify', { message: n.data.message, signature })
}

/** Envia UMA transação montada pelo servidor: a MetaMask mostra e o usuário assina (ou recusa). */
export async function signAndSend(provider: Eip1193Provider, from: string, tx: UnsignedTx, chainId: number): Promise<string> {
  await ensureChain(provider, chainId)
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
  if (!accounts?.some((a) => a.toLowerCase() === from.toLowerCase())) throw new Error('account_mismatch')
  return (await provider.request({ method: 'eth_sendTransaction', params: [{ from, to: tx.to, data: tx.data, value: tx.value }] })) as string
}

// ───────────────────────────── acesso (botão no Vertal Chat) ─────────────────────────────

export type WalletAccess = 'checking' | 'allowed' | 'denied'
const cache = new Map<string, Promise<WalletStatus | null>>()

export function resetWalletAccessCache(): void {
  cache.clear()
}

export async function fetchWalletStatus(): Promise<WalletStatus | null> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user?.id
  if (!uid) return null
  let p = cache.get(uid)
  if (!p) {
    p = callWallet<WalletStatus>('status').then((r) => (r.ok ? r.data : null))
    cache.set(uid, p)
    p.then((s) => { if (!s) cache.delete(uid) })
  }
  return p
}

/** 'allowed' só com VITE_VERTAL_METAMASK ligado E o servidor liberando este usuário (e o trader, se pedido). */
export function useVertalWalletAccess(opts: { trader?: boolean; enabledOverride?: boolean } = {}): WalletAccess {
  const buildOn = isVertalMetaMaskEnabled()
  const { trader, enabledOverride } = opts
  const [state, setState] = useState<WalletAccess>(() =>
    enabledOverride === true ? 'allowed' : enabledOverride === false || !buildOn ? 'denied' : 'checking',
  )
  useEffect(() => {
    if (enabledOverride !== undefined || !buildOn) return
    let alive = true
    fetchWalletStatus()
      .then((s) => alive && setState(s && (!trader || s.trader) ? 'allowed' : 'denied'))
      .catch(() => alive && setState('denied'))
    return () => { alive = false }
  }, [enabledOverride, buildOn, trader])
  return state
}

/** Pedido de trade escrito no chat? (pt-BR, en, es) — "compre 0.01 ETH de UNI quando cair 5%". */
export function isVertalTraderCommand(text: string): boolean {
  const s = String(text ?? '').trim()
  if (!s || s.length > 300) return false
  // começa com o verbo (ou "/trade"): pergunta solta sobre preço não vira ordem
  const verb = /^(\/trade\s+)?(compr[aeo]\w*|vend[aeo]\w*|buy|sell|purchase)\b/i.test(s)
  const asset = /\b(eth|weth|uni|link|usdc|token|tokens)\b|0x[0-9a-fA-F]{40}/i.test(s)
  const amount = /\d/.test(s)
  return verb && asset && amount
}

export function vertalTraderHrefFromChat(text: string): string {
  return `${METAMASK_TRADER_ROUTE}&prompt=${encodeURIComponent(String(text ?? '').trim().slice(0, 300))}`
}

/** WalletConnect (celular sem MetaMask): só com project id na config do servidor. Carregado sob demanda. */
export async function openWalletConnect(projectId: string, chainId: number): Promise<Eip1193Provider> {
  const url = 'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'
  const mod = (await import(/* @vite-ignore */ url)) as { EthereumProvider: { init(o: Record<string, unknown>): Promise<Eip1193Provider & { enable(): Promise<string[]> }> } }
  const p = await mod.EthereumProvider.init({ projectId, chains: [chainId], showQrModal: true, methods: ['personal_sign', 'eth_sendTransaction'] })
  await p.enable()
  return p
}
