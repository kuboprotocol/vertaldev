import { Wallet } from 'lucide-react'
import type { ConnectorConfig } from '@/lib/connectorsConfig'

/**
 * Conector MetaMask do Vertal Dev (aditivo, nov/2026).
 * - Conexão por Sign-In with Ethereum (EIP-4361): a MetaMask assina uma mensagem; o servidor confere e guarda só
 *   endereço, rede e data. Nunca pedimos frase-semente nem chave privada.
 * - Cartão no catálogo só com VITE_VERTAL_METAMASK=true (padrão: desligado). A página abre pelo link direto, mas
 *   o servidor só responde para quem está na lista (VERTAL_METAMASK_USER_IDS no VERTAL_GPU_CONFIG).
 */
export const METAMASK_SLUG = 'metamask'
export const METAMASK_ROUTE = `/connectors/${METAMASK_SLUG}/setup`
export const METAMASK_TRADER_ROUTE = `${METAMASK_ROUTE}?tab=trader`

export function isVertalMetaMaskEnabled(env: Record<string, unknown> = import.meta.env as Record<string, unknown>): boolean {
  const v = String(env?.VITE_VERTAL_METAMASK ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'on'
}

export function isMetaMaskSlug(slug: string): boolean {
  return slug === METAMASK_SLUG
}

export const metamaskConnector: ConnectorConfig = {
  name: 'MetaMask',
  slug: METAMASK_SLUG,
  icon: Wallet,
  logoUrl: '/connectors/metamask.svg',
  color: '#F6851B',
  authType: 'oauth',
  category: 'infrastructure',
  description: 'Conecte a sua carteira MetaMask com assinatura (Sign-In with Ethereum). Sem frase-semente, sem chave privada.',
  longDescription: 'Conecte a MetaMask ao Vertal Dev assinando uma mensagem (Sign-In with Ethereum, EIP-4361). O Vertal guarda só o endereço público, a rede e a data da conexão. Veja saldo, rede e transações recentes, baixe o Starter Web3 (wagmi + viem) para os seus apps e teste o Trader por prompt na testnet Sepolia: cada operação é assinada por você na MetaMask.',
  features: ['Sign-In with Ethereum (EIP-4361)', 'Extensão (EIP-6963) e celular', 'Saldo, rede e transações (só leitura)', 'Starter Web3: wagmi + viem', 'Trader por prompt (testnet)'],
  docsUrl: 'https://docs.metamask.io',
  status: 'available',
  internalRoute: METAMASK_ROUTE,
  apiKeyLabel: '',
  apiKeyPlaceholder: '',
  apiKeyHelp: 'A conexão é por assinatura na MetaMask — nunca cole frase-semente ou chave privada em lugar nenhum.',
  setupSteps: [
    { title: 'Abra a MetaMask', description: 'Extensão no computador ou o app no celular.' },
    { title: 'Assine a mensagem', description: 'Só prova que a carteira é sua; não gasta nada nem autoriza transações.' },
    { title: 'Pronto', description: 'Desconecte quando quiser.' },
  ],
}

/** Cartão que entra no catálogo /connectors (vazio com o flag desligado). */
export function metamaskCatalog(env?: Record<string, unknown>): ConnectorConfig[] {
  return isVertalMetaMaskEnabled(env) ? [metamaskConnector] : []
}

/**
 * Cartão visível no catálogo /connectors só para quem o servidor libera (ação "wallet" → status.enabled).
 * Falha fechada: carregando, erro ou negado = sem cartão. A rota direta continua protegida pelo servidor.
 */
export function filterMetaMaskByAccess<T extends { slug: string }>(list: T[], access: 'checking' | 'allowed' | 'denied'): T[] {
  return access === 'allowed' ? list : list.filter((c) => !isMetaMaskSlug(c.slug))
}
