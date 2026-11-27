// Conector MetaMask (aditivo, flag VITE_VERTAL_METAMASK / VERTAL_METAMASK_*): SIWE, flags, segredo recusado,
// Trader (testnet) e template Web3. A recuperação criptográfica real (noble) roda no Deno; aqui ela é simulada.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) }, functions: { invoke: vi.fn() } } }))

import {
  allowedDomains, bodyHasSecret, buildSiweMessage, expandWalletEnv, isMainnetTradeAllowed, isTraderEnabled, isWalletEnabled,
  isWeb3HintEnabled, looksLikeSecret, makeNonce, parseSiweMessage, validateSiwe, walletConnectProjectId,
} from '../../supabase/functions/_shared/vertalWallet/core'
import {
  buildOrderTxs, decodeQuote, encodeExactInputSingle, encodeMulticallDeadline, encodeQuote, fromUnits, minOut, parseTradeIntent,
  priceEthPerToken, SEPOLIA_DEX, SEPOLIA_TOKENS, targetPrice, toUnits, triggerMet,
} from '../../supabase/functions/_shared/vertalWallet/trade'
import { handleWallet, type WalletConnection, type WalletDeps, type WalletStore } from '../../supabase/functions/_shared/vertalWallet/handler'
import { isWeb3Prompt, WEB3_TEMPLATE_FILES, withWeb3Hint } from '../../supabase/functions/_shared/vertalWallet/web3Template'

const UID = '11111111-2222-3333-4444-555555555555'
const ADDR = '0x6166b1c44eaf1102312f4B1Ccc82316B163F6D06'
const ON: Record<string, string> = { VERTAL_METAMASK_ENABLED: 'true', VERTAL_METAMASK_USER_IDS: UID }
const hmac = async (m: string) => {
  // HMAC de teste determinístico (o real é HMAC-SHA256 com a service role na função)
  let h = 0
  for (const c of m) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(4)
}

function memStore(initial: WalletConnection | null = null, missing = false): WalletStore & { rows: Map<string, WalletConnection> } {
  const rows = new Map<string, WalletConnection>()
  if (initial) rows.set(UID, initial)
  return {
    rows,
    async get(u) { return missing ? 'missing_table' : rows.get(u) ?? null },
    async upsert(u, c) { if (missing) return 'missing_table'; rows.set(u, c); return true },
    async remove(u) { if (missing) return 'missing_table'; rows.delete(u); return true },
  }
}

function deps(over: Partial<WalletDeps> = {}): WalletDeps {
  return {
    env: ON,
    userId: UID,
    origin: 'https://vertal.dev',
    hmac,
    recover: async () => ADDR.toLowerCase(),
    store: memStore(),
    fetch: vi.fn() as unknown as typeof fetch,
    now: () => Date.parse('2026-11-27T12:00:00Z'),
    random: () => 'abcdef0123456789',
    ...over,
  }
}

describe('flags (todas desligadas por padrão)', () => {
  it('conector exige ENABLED + usuário na lista; lista vazia = ninguém', () => {
    expect(isWalletEnabled({}, UID)).toBe(false)
    expect(isWalletEnabled({ VERTAL_METAMASK_ENABLED: 'true' }, UID)).toBe(false)
    expect(isWalletEnabled(ON, UID)).toBe(true)
    expect(isWalletEnabled(ON, 'outro')).toBe(false)
    expect(isTraderEnabled(ON, UID)).toBe(false)
    expect(isTraderEnabled({ ...ON, VERTAL_METAMASK_TRADER_ENABLED: 'true' }, UID)).toBe(true)
    expect(isMainnetTradeAllowed(ON)).toBe(false)
    expect(isWeb3HintEnabled(ON, UID)).toBe(false)
    expect(walletConnectProjectId(ON)).toBeNull()
  })
  it('lê as chaves VERTAL_METAMASK_* de dentro do VERTAL_GPU_CONFIG (sem segredo novo); segredo avulso vence', () => {
    const env = expandWalletEnv({
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_METAMASK_ENABLED: true, VERTAL_METAMASK_USER_IDS: UID, VERTAL_OLLAMA_URL_2: 'x', OUTRA: 'y' }),
      VERTAL_METAMASK_USER_IDS: 'avulso',
    })
    expect(env.VERTAL_METAMASK_ENABLED).toBe('true')
    expect(env.VERTAL_METAMASK_USER_IDS).toBe('avulso')
    expect(env.OUTRA).toBeUndefined()
    expect(expandWalletEnv({ VERTAL_GPU_CONFIG: '{quebrado' })).toEqual({ VERTAL_GPU_CONFIG: '{quebrado' })
  })
})

describe('nunca aceita frase-semente nem chave privada', () => {
  it('detecta chave privada e frase de 12/24 palavras', () => {
    expect(looksLikeSecret(`0x${'a'.repeat(64)}`)).toBe(true)
    expect(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true)
    expect(looksLikeSecret('compre 0.01 ETH de UNI quando cair 5%')).toBe(false)
    expect(looksLikeSecret(ADDR)).toBe(false)
    expect(bodyHasSecret({ op: 'verify', signature: `0x${'b'.repeat(130)}` })).toBe(false)
    expect(bodyHasSecret({ op: 'nonce', mnemonic: 'x' })).toBe(true)
  })
  it('o handler recusa o pedido inteiro', async () => {
    const r = await handleWallet({ op: 'status', note: `0x${'c'.repeat(64)}` }, deps())
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('secret_material_refused')
  })
})

describe('SIWE (EIP-4361)', () => {
  it('monta e lê a mensagem; recusa mensagem com campo extra', () => {
    const f = { domain: 'vertal.dev', address: ADDR, statement: 'Oi', uri: 'https://vertal.dev', version: '1', chainId: 11155111, nonce: 'abcdefgh12', issuedAt: '2026-11-27T12:00:00.000Z', expirationTime: '2026-11-27T12:10:00.000Z' }
    const m = buildSiweMessage(f)
    expect(m.startsWith('vertal.dev wants you to sign in with your Ethereum account:\n')).toBe(true)
    expect(parseSiweMessage(m)).toEqual(f)
    expect(parseSiweMessage(`${m}\nResources: x`)).toBeNull()
    expect(allowedDomains({})).toContain('vertal.dev')
  })

  it('nonce → assinar → verify guarda só endereço, chain id e data; disconnect apaga', async () => {
    const store = memStore()
    const d = deps({ store })
    const n = await handleWallet({ op: 'nonce', address: ADDR, chainId: 11155111 }, d)
    expect(n.status).toBe(200)
    const message = String(n.body.message)
    expect(message).toContain('Chain ID: 11155111')
    const v = await handleWallet({ op: 'verify', message, signature: `0x${'1'.repeat(130)}` }, d)
    expect(v.status).toBe(200)
    expect(Object.keys(store.rows.get(UID)!)).toEqual(['address', 'chain_id', 'connected_at'])
    expect(store.rows.get(UID)!.address).toBe(ADDR.toLowerCase())
    const s = await handleWallet({ op: 'status' }, d)
    expect((s.body.connection as WalletConnection).chain_id).toBe(11155111)
    expect((await handleWallet({ op: 'disconnect' }, d)).status).toBe(200)
    expect(store.rows.size).toBe(0)
  })

  it('recusa: assinatura de outra carteira, outro usuário, expirada, domínio estranho, rede não aceita', async () => {
    const d = deps()
    const message = String((await handleWallet({ op: 'nonce', address: ADDR, chainId: 11155111 }, d)).body.message)
    const sig = `0x${'1'.repeat(130)}`
    expect((await handleWallet({ op: 'verify', message, signature: sig }, deps({ recover: async () => '0x0000000000000000000000000000000000000001' }))).body.error).toBe('bad_signature')
    expect((await validateSiwe(message, { env: ON, userId: 'outro-usuario', hmac, now: d.now!() })).ok).toBe(false)
    expect((await handleWallet({ op: 'verify', message, signature: sig }, deps({ now: () => d.now!() + 11 * 60_000 }))).body.error).toBe('expired')
    expect((await handleWallet({ op: 'nonce', address: ADDR, chainId: 11155111 }, deps({ origin: 'https://golpe.example' }))).body.error).toBe('domain_not_allowed')
    const evil = message.replace('vertal.dev wants', 'golpe.example wants').replace('URI: https://vertal.dev', 'URI: https://golpe.example')
    expect((await handleWallet({ op: 'verify', message: evil, signature: sig }, d)).body.error).toBe('domain_not_allowed')
    expect((await handleWallet({ op: 'nonce', address: ADDR, chainId: 56 }, d)).body.error).toBe('chain_not_allowed')
    expect((await handleWallet({ op: 'verify', message: message.replace('Chain ID: 11155111', 'Chain ID: 1'), signature: sig }, d)).body.error).toBe('bad_nonce')
  })

  it('sem a tabela (migração pendente) responde claro em vez de quebrar', async () => {
    const d = deps({ store: memStore(null, true) })
    const s = await handleWallet({ op: 'status' }, d)
    expect(s.body.migrationPending).toBe(true)
    const message = String((await handleWallet({ op: 'nonce', address: ADDR, chainId: 11155111 }, d)).body.message)
    const v = await handleWallet({ op: 'verify', message, signature: `0x${'1'.repeat(130)}` }, d)
    expect(v.status).toBe(503)
    expect(v.body.error).toBe('migration_pending')
  })

  it('desligado/fora da lista: 404 para tudo', async () => {
    expect((await handleWallet({ op: 'status' }, deps({ env: {} }))).status).toBe(404)
    expect((await handleWallet({ op: 'status' }, deps({ userId: 'outro' }))).status).toBe(404)
  })
})

describe('Trader por prompt (só testnet)', () => {
  it('entende pt-BR, en e es', () => {
    expect(parseTradeIntent('compre 0.01 ETH de UNI quando cair 5%')).toEqual({ side: 'buy', token: 'UNI', amount: '0.01', amountUnit: 'ETH', trigger: 'drop', pct: 5 })
    expect(parseTradeIntent('buy 0,005 eth of link when it drops 3%')).toMatchObject({ side: 'buy', token: 'LINK', amount: '0.005', trigger: 'drop', pct: 3 })
    expect(parseTradeIntent('vende 10 UNI cuando suba 2%')).toMatchObject({ side: 'sell', token: 'UNI', amount: '10', amountUnit: 'TOKEN', trigger: 'rise', pct: 2 })
    expect(parseTradeIntent('compre 0.01 ETH de UNI')).toMatchObject({ trigger: 'now', pct: 0 })
    expect(parseTradeIntent('qual o preço do UNI?')).toBeNull()
    expect(parseTradeIntent('compre UNI')).toBeNull()
  })

  it('números, preço e gatilho', () => {
    expect(toUnits('0.015', 18)).toBe(15_000_000_000_000_000n)
    expect(toUnits('1', 6)).toBe(1_000_000n)
    expect(toUnits('0', 18)).toBeNull()
    expect(fromUnits(1_500_000_000_000_000_000n, 18)).toBe('1.5')
    expect(minOut(10_000n, 100)).toBe(9_900n)
    const p = priceEthPerToken('buy', 10n ** 16n, 2n * 10n ** 18n, 18) // 0.01 ETH → 2 tokens
    expect(p).toBeCloseTo(0.005)
    const t = targetPrice('drop', 5, p)!
    expect(t).toBeCloseTo(0.00475)
    expect(triggerMet('drop', p, t)).toBe(false)
    expect(triggerMet('drop', 0.0047, t)).toBe(true)
    expect(triggerMet('rise', 0.0053, targetPrice('rise', 5, p))).toBe(true)
  })

  it('ABI: cotação e troca codificadas no formato do Uniswap v3 (seletor + palavras de 32 bytes)', () => {
    const q = encodeQuote(SEPOLIA_DEX.weth, SEPOLIA_TOKENS.UNI.address, 10n ** 16n, 3000)
    expect(q.startsWith('0xc6a5026a')).toBe(true)
    expect(q.length).toBe(10 + 64 * 5)
    const ret = `0x${(2n * 10n ** 18n).toString(16).padStart(64, '0')}${'0'.repeat(64 * 2)}${(90000).toString(16).padStart(64, '0')}`
    expect(decodeQuote(ret)).toEqual({ amountOut: 2n * 10n ** 18n, gasEstimate: 90000n })
    const swap = encodeExactInputSingle({ tokenIn: SEPOLIA_DEX.weth, tokenOut: SEPOLIA_TOKENS.UNI.address, fee: 3000, recipient: ADDR, amountIn: 1n, amountOutMinimum: 1n })
    expect(swap.startsWith('0x04e45aaf')).toBe(true)
    expect(swap.length).toBe(10 + 64 * 7)
    const mc = encodeMulticallDeadline(1_800_000_000, swap)
    expect(mc.startsWith('0x5ae401dc')).toBe(true)
    expect((mc.length - 10) % 64).toBe(0)
  })

  it('compra manda ETH no value; venda pede approve antes quando a permissão não basta', () => {
    const buy = buildOrderTxs({ side: 'buy', token: SEPOLIA_TOKENS.UNI, recipient: ADDR, amountIn: 10n ** 16n, amountOut: 10n ** 18n, fee: 3000, slippageBps: 100, deadline: 1 })
    expect(buy).toHaveLength(1)
    expect(buy[0].to).toBe(SEPOLIA_DEX.swapRouter02)
    expect(buy[0].value).toBe(`0x${(10n ** 16n).toString(16)}`)
    const sell = buildOrderTxs({ side: 'sell', token: SEPOLIA_TOKENS.UNI, recipient: ADDR, amountIn: 10n ** 19n, amountOut: 10n ** 16n, fee: 3000, slippageBps: 100, deadline: 1, allowance: 0n })
    expect(sell.map((x) => x.description)).toEqual(['approve:UNI', 'swap:sell:UNI'])
    expect(sell[0].data.startsWith('0x095ea7b3')).toBe(true)
  })

  it('handler: trader desligado = 404; mainnet bloqueada; ordem montada sem assinar nada', async () => {
    const traderEnv = { ...ON, VERTAL_METAMASK_TRADER_ENABLED: 'true' }
    expect((await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI', address: ADDR }, deps())).status).toBe(404)
    expect((await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI', address: ADDR, chainId: 1 }, deps({ env: traderEnv }))).body.error).toBe('mainnet_blocked')
    expect((await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI', address: ADDR, chainId: 1 }, deps({ env: { ...traderEnv, VERTAL_METAMASK_MAINNET_ENABLED: 'true' } }))).body.error).toBe('mainnet_not_supported_yet')
    expect((await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI', address: ADDR, chainId: 137 }, deps({ env: traderEnv }))).body.error).toBe('testnet_only')

    // RPC simulado: QuoterV2 devolve 2 UNI por 0.01 ETH na faixa 3000; as outras faixas falham.
    const calls: string[] = []
    const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const req = JSON.parse(String(init.body))
      calls.push(req.method)
      const data: string = req.params?.[0]?.data ?? ''
      if (req.method !== 'eth_call') return new Response(JSON.stringify({ result: '0x0' }))
      const fee = parseInt(data.slice(10 + 64 * 3, 10 + 64 * 4), 16)
      if (fee !== 3000) return new Response(JSON.stringify({ error: { message: 'revert' } }))
      return new Response(JSON.stringify({ result: `0x${(2n * 10n ** 18n).toString(16).padStart(64, '0')}${'0'.repeat(192)}` }))
    })
    const r = await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI quando cair 5%', address: ADDR }, deps({ env: traderEnv, fetch: fakeFetch as unknown as typeof fetch }))
    expect(r.body).toMatchObject({ chainId: 11155111 })
    expect(r.status).toBe(200)
    expect(calls.every((m) => m === 'eth_call')).toBe(true) // nunca eth_sendTransaction / eth_sign no servidor
    expect(r.body.custody).toBe('none')
    expect(r.body.disclaimer).toBe('not_investment_advice')
    expect((r.body.trigger as { met: boolean }).met).toBe(false)
    expect(r.body.txs).toEqual([]) // gatilho não atingido: nada para assinar ainda
    const now = await handleWallet({ op: 'trade', prompt: 'compre 0.01 ETH de UNI', address: ADDR }, deps({ env: traderEnv, fetch: fakeFetch as unknown as typeof fetch }))
    expect((now.body.txs as unknown[]).length).toBe(1)
    expect((now.body.quote as { fee: number }).fee).toBe(3000)
  })
})

describe('Starter Web3 + dica do VERTAL Code AI (aditivo)', () => {
  it('template tem wagmi + viem e cobre conectar, saldo, assinar e contrato', () => {
    const all = WEB3_TEMPLATE_FILES.map((f) => f.content).join('\n')
    for (const s of ['wagmi', 'viem', 'useConnect', 'useBalance', 'useSignMessage', 'useWriteContract', 'sepolia']) expect(all).toContain(s)
    expect(all).not.toMatch(/privateKey\s*[:=]|mnemonic\s*[:=]/)
  })
  it('dica só entra quando o pedido fala de carteira/dApp; pedido comum fica idêntico', () => {
    expect(isWeb3Prompt('crie um dApp com MetaMask')).toBe(true)
    expect(isWeb3Prompt('crie uma landing page de padaria')).toBe(false)
    expect(withWeb3Hint('crie uma landing page de padaria')).toBe('crie uma landing page de padaria')
    const h = withWeb3Hint('crie um dApp com carteira')
    expect(h.startsWith('crie um dApp com carteira')).toBe(true)
    expect(h).toContain('vertal-web3-starter')
    const huge = `carteira ${'x'.repeat(11_990)}`
    expect(withWeb3Hint(huge)).toBe(huge) // o pedido do usuário tem prioridade sobre a dica
  })
})

describe('nonce amarrado ao usuário, endereço, rede e validade', () => {
  it('muda se qualquer um muda', async () => {
    const a = await makeNonce(hmac, UID, ADDR, 11155111, '2026-11-27T12:10:00.000Z', 'r1r1r1r1r1r1r1r1')
    expect(a).toHaveLength(40)
    expect(await makeNonce(hmac, 'x', ADDR, 11155111, '2026-11-27T12:10:00.000Z', 'r1r1r1r1r1r1r1r1')).not.toBe(a)
    expect(await makeNonce(hmac, UID, ADDR, 1, '2026-11-27T12:10:00.000Z', 'r1r1r1r1r1r1r1r1')).not.toBe(a)
  })
})
