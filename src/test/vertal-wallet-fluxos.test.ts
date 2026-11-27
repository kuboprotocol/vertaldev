// MetaMask → Vertal Fluxos (só leitura, ?app=wallet com a chave vfk1): flags, endereços conectados, Etherscan opcional.
import { describe, expect, it } from 'vitest'

import {
  etherscanList, handleWalletFluxos, isWalletFluxosEnabled, WALLET_SETUP_URL, type WalletFluxosDeps,
} from '../../supabase/functions/_shared/vertalWallet/fluxos'
import { handleWallet, type WalletConnection } from '../../supabase/functions/_shared/vertalWallet/handler'

const UID = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-2222-3333-4444-555555555555'
const ADDR = '0x6166b1c44eaf1102312f4B1Ccc82316B163F6D06'
const TOKEN = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const ON: Record<string, string> = {
  VERTAL_METAMASK_ENABLED: 'true', VERTAL_METAMASK_USER_IDS: UID, VERTAL_METAMASK_FLUXOS_ENABLED: 'true',
}
const CONN: WalletConnection = { address: ADDR, chain_id: 11155111, connected_at: '2026-11-27T12:00:00.000Z' }

function deps(over: Partial<WalletFluxosDeps> & { conn?: WalletConnection | null | 'missing_table' } = {}): WalletFluxosDeps & { calls: string[] } {
  const calls: string[] = []
  const conn = over.conn === undefined ? CONN : over.conn
  return {
    env: ON,
    userId: UID,
    store: { get: async () => conn },
    fetch: (async (url: string) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ status: '1', message: 'OK', result: [] }))
    }) as unknown as typeof fetch,
    calls,
    ...over,
  }
}

describe('MetaMask → Vertal Fluxos: flags', () => {
  it('is off unless the connector, the allowlist and the Fluxos flag all allow', () => {
    expect(isWalletFluxosEnabled({}, UID)).toBe(false)
    expect(isWalletFluxosEnabled({ VERTAL_METAMASK_ENABLED: 'true', VERTAL_METAMASK_USER_IDS: UID }, UID)).toBe(false)
    expect(isWalletFluxosEnabled({ ...ON, VERTAL_METAMASK_FLUXOS_ENABLED: 'false' }, UID)).toBe(false)
    expect(isWalletFluxosEnabled(ON, OTHER)).toBe(false)
    expect(isWalletFluxosEnabled({ ...ON, VERTAL_METAMASK_USER_IDS: '' }, UID)).toBe(false)
    expect(isWalletFluxosEnabled(ON, UID)).toBe(true)
  })

  it('answers 404 to users that are not enabled', async () => {
    const r = await handleWalletFluxos({ op: 'addresses' }, deps({ userId: OTHER }))
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('vertal_metamask_fluxos_disabled')
    const r2 = await handleWalletFluxos({ op: 'addresses' }, deps({ env: { ...ON, VERTAL_METAMASK_FLUXOS_ENABLED: '' } }))
    expect(r2.status).toBe(404)
  })

  it('status of the connector says whether the Fluxos app is enabled (default off)', async () => {
    const base = {
      userId: UID, origin: 'https://vertal.dev', hmac: async () => 'a'.repeat(32), recover: async () => null,
      store: { get: async () => null, upsert: async () => true as const, remove: async () => true as const }, fetch,
    }
    const off = await handleWallet({ op: 'status' }, { ...base, env: { VERTAL_METAMASK_ENABLED: 'true', VERTAL_METAMASK_USER_IDS: UID } })
    expect(off.body.fluxos).toBe(false)
    const on = await handleWallet({ op: 'status' }, { ...base, env: ON })
    expect(on.body.fluxos).toBe(true)
  })
})

describe('MetaMask → Vertal Fluxos: addresses', () => {
  it('returns only the public address, chain and date already connected by SIWE', async () => {
    const r = await handleWalletFluxos({ op: 'addresses' }, deps())
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      ok: true,
      wallets: [{ address: ADDR.toLowerCase(), chainId: 11155111, connectedAt: '2026-11-27T12:00:00.000Z' }],
      setupUrl: WALLET_SETUP_URL,
    })
  })

  it('returns an empty list and the setup link when nothing is connected', async () => {
    const r = await handleWalletFluxos({ op: 'addresses' }, deps({ conn: null }))
    expect(r.body).toEqual({ ok: true, wallets: [], setupUrl: 'https://vertal.dev/connectors/metamask/setup' })
  })

  it('reports a pending migration', async () => {
    const r = await handleWalletFluxos({ op: 'addresses' }, deps({ conn: 'missing_table' }))
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('migration_pending')
  })

  it('refuses anything that looks like a seed phrase or private key', async () => {
    const r = await handleWalletFluxos({ op: 'addresses', privateKey: 'x' }, deps())
    expect(r.body.error).toBe('secret_material_refused')
    const r2 = await handleWalletFluxos({ op: 'addresses', note: `0x${'ab'.repeat(32)}` }, deps())
    expect(r2.body.error).toBe('secret_material_refused')
  })

  it('rejects unknown ops (nothing that signs or sends exists here)', async () => {
    for (const op of ['send', 'sign', 'trade', 'verify', 'nonce']) {
      const r = await handleWalletFluxos({ op }, deps())
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('invalid_op')
    }
  })
})

describe('MetaMask → Vertal Fluxos: txlist (Etherscan optional)', () => {
  it('says "not available" without VERTAL_METAMASK_ETHERSCAN_KEY and makes no call', async () => {
    const d = deps()
    const r = await handleWalletFluxos({ op: 'txlist', chainId: 11155111 }, d)
    expect(r.body).toEqual({ ok: true, available: false })
    expect(d.calls).toEqual([])
  })

  it('uses Etherscan v2 for the connected address only, key never returned', async () => {
    const d = deps({
      env: { ...ON, VERTAL_METAMASK_ETHERSCAN_KEY: 'KEY123' },
      fetch: (async (url: string) => {
        d.calls.push(String(url))
        return new Response(JSON.stringify({
          status: '1', message: 'OK',
          result: [{ hash: '0xaa', blockNumber: '10', timeStamp: '1700000000', from: '0xF00', to: ADDR, value: '1000', isError: '0' }],
        }))
      }) as unknown as typeof fetch,
    })
    const r = await handleWalletFluxos({ op: 'txlist', chainId: 1, startBlock: 5, limit: 999, address: '0x0000000000000000000000000000000000000001' }, d)
    expect(r.status).toBe(200)
    expect(r.body.available).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain('KEY123')
    const u = new URL(d.calls[0])
    expect(u.searchParams.get('chainid')).toBe('1')
    expect(u.searchParams.get('action')).toBe('txlist')
    expect(u.searchParams.get('address')).toBe(ADDR) // ignora o endereço do pedido
    expect(u.searchParams.get('startblock')).toBe('5')
    expect(u.searchParams.get('offset')).toBe('50') // limite máximo
    expect((r.body.txs as unknown[])[0]).toMatchObject({ hash: '0xaa', blockNumber: 10, from: '0xf00', to: ADDR.toLowerCase(), valueWei: '1000', status: 'ok' })
  })

  it('uses tokentx for ERC-20 and validates the token address', async () => {
    const d = deps({ env: { ...ON, VERTAL_METAMASK_ETHERSCAN_KEY: 'K' } })
    const bad = await handleWalletFluxos({ op: 'txlist', tokenAddress: '0x123' }, d)
    expect(bad.body.error).toBe('invalid_token_address')
    await handleWalletFluxos({ op: 'txlist', tokenAddress: TOKEN }, d)
    const u = new URL(d.calls[0])
    expect(u.searchParams.get('action')).toBe('tokentx')
    expect(u.searchParams.get('contractaddress')).toBe(TOKEN.toLowerCase())
  })

  it('refuses chains other than Sepolia and Ethereum, and needs a connected wallet', async () => {
    const d = deps({ env: { ...ON, VERTAL_METAMASK_ETHERSCAN_KEY: 'K' } })
    expect((await handleWalletFluxos({ op: 'txlist', chainId: 137 }, d)).body.error).toBe('chain_not_allowed')
    const r = await handleWalletFluxos({ op: 'txlist' }, deps({ conn: null }))
    expect(r.status).toBe(409)
    expect(r.body.setupUrl).toBe(WALLET_SETUP_URL)
  })

  it('treats "No transactions found" as an empty list and other failures as null', async () => {
    const empty = (async () => new Response(JSON.stringify({ status: '0', message: 'No transactions found', result: [] }))) as unknown as typeof fetch
    expect(await etherscanList(empty, 'k', 1, ADDR, null, 0, 10)).toEqual([])
    const rate = (async () => new Response(JSON.stringify({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' }))) as unknown as typeof fetch
    expect(await etherscanList(rate, 'k', 1, ADDR, null, 0, 10)).toBeNull()
    const boom = (async () => { throw new Error('net') }) as unknown as typeof fetch
    expect(await etherscanList(boom, 'k', 1, ADDR, null, 0, 10)).toBeNull()
  })
})
