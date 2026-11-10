import { describe, expect, it } from 'vitest'
import {
  AD_CLICK_COOLDOWN_MS,
  AD_TYPE_CLICK,
  AD_TYPE_WITHDRAWAL,
  deterministicUuid,
  handleAdReward,
  summarizeAdRewards,
  type AdRewardRow,
  type AdRewardStore,
} from '../../supabase/functions/_shared/adRewardsCore'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const USER = '11111111-1111-4111-8111-111111111111'

interface StoredRow extends AdRewardRow {
  id: string
  user_id: string
}

function memoryStore(initial: StoredRow[] = [], opts: { failTopup?: boolean; clock?: () => number } = {}) {
  const rows = [...initial]
  const topups: { amount: number; key: string }[] = []
  const store: AdRewardStore = {
    async listRows(userId) {
      return rows.filter((r) => r.user_id === userId)
    },
    async insertRow(row) {
      if (rows.some((r) => r.id === row.id)) return 'conflict'
      rows.push({ ...row, created_at: new Date((opts.clock ?? (() => NOW))()).toISOString() })
      return 'ok'
    },
    async deleteRow(id) {
      const i = rows.findIndex((r) => r.id === id)
      if (i >= 0) rows.splice(i, 1)
    },
    async topup(_userId, amount, key) {
      if (opts.failTopup) throw new Error('topup down')
      if (!topups.some((t) => t.key === key)) topups.push({ amount, key })
    },
  }
  return { store, rows, topups }
}

function clicks(n: number, lastAtMs: number): StoredRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    user_id: USER,
    ad_type: AD_TYPE_CLICK,
    reward_credits: 0.002,
    created_at: new Date(lastAtMs - (n - 1 - i) * AD_CLICK_COOLDOWN_MS).toISOString(),
  }))
}

describe('summarizeAdRewards', () => {
  it('começa zerado e liberado para clicar', () => {
    const s = summarizeAdRewards([], NOW)
    expect(s.pending).toBe(0)
    expect(s.can_click).toBe(true)
    expect(s.can_withdraw).toBe(false)
    expect(s.next_click_at).toBeNull()
  })

  it('soma 0,0020 por clique sem erro de arredondamento', () => {
    const s = summarizeAdRewards(clicks(2500, NOW - 2 * AD_CLICK_COOLDOWN_MS), NOW)
    expect(s.pending).toBe(5)
    expect(s.withdrawable).toBe(5)
    expect(s.can_withdraw).toBe(true)
  })

  it('bloqueia o clique por 1 hora depois do último', () => {
    const last = NOW - 10 * 60 * 1000
    const s = summarizeAdRewards(clicks(1, last), NOW)
    expect(s.can_click).toBe(false)
    expect(s.next_click_at).toBe(new Date(last + AD_CLICK_COOLDOWN_MS).toISOString())
    expect(summarizeAdRewards(clicks(1, NOW - AD_CLICK_COOLDOWN_MS), NOW).can_click).toBe(true)
  })

  it('não libera retirada abaixo de 5 créditos', () => {
    const s = summarizeAdRewards(clicks(2499, NOW - 2 * AD_CLICK_COOLDOWN_MS), NOW)
    expect(s.pending).toBe(4.998)
    expect(s.can_withdraw).toBe(false)
    expect(s.withdrawable).toBe(0)
  })

  it('ignora recompensas antigas de outros tipos', () => {
    const old: AdRewardRow = { ad_type: 'terra_smartlink', reward_credits: 0.5, created_at: new Date(NOW).toISOString() }
    const s = summarizeAdRewards([old], NOW)
    expect(s.pending).toBe(0)
    expect(s.can_click).toBe(true)
  })

  it('desconta as retiradas do saldo pendente', () => {
    const rows: AdRewardRow[] = [
      ...clicks(2600, NOW - 2 * AD_CLICK_COOLDOWN_MS),
      { ad_type: AD_TYPE_WITHDRAWAL, reward_credits: -5, created_at: new Date(NOW).toISOString() },
    ]
    const s = summarizeAdRewards(rows, NOW)
    expect(s.pending).toBe(0.2)
    expect(s.withdrawals).toBe(1)
  })
})

describe('handleAdReward', () => {
  it('credita um clique e passa a exigir a espera', async () => {
    const { store, rows } = memoryStore()
    const first = await handleAdReward('ad-click', USER, store, NOW)
    expect(first.status).toBe(200)
    expect(first.body.pending).toBe(0.002)
    expect(first.body.can_click).toBe(false)

    const second = await handleAdReward('ad-click', USER, store, NOW + 60_000)
    expect(second.status).toBe(429)
    expect(second.body.error).toBe('cooldown')
    expect(rows).toHaveLength(1)
  })

  it('aceita novo clique depois de 1 hora', async () => {
    let now = NOW
    const { store, rows } = memoryStore([], { clock: () => now })
    await handleAdReward('ad-click', USER, store, now)
    now = NOW + AD_CLICK_COOLDOWN_MS
    const again = await handleAdReward('ad-click', USER, store, now)
    expect(again.status).toBe(200)
    expect(rows).toHaveLength(2)
    expect(again.body.pending).toBe(0.004)
  })

  it('dois cliques simultâneos geram um crédito só', async () => {
    const { store, rows } = memoryStore()
    const results = await Promise.all([
      handleAdReward('ad-click', USER, store, NOW),
      handleAdReward('ad-click', USER, store, NOW),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 429])
    expect(rows).toHaveLength(1)
  })

  it('recusa retirada abaixo do mínimo', async () => {
    const { store, topups } = memoryStore(clicks(100, NOW - 2 * AD_CLICK_COOLDOWN_MS))
    const res = await handleAdReward('ad-withdraw', USER, store, NOW)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('below_minimum')
    expect(topups).toHaveLength(0)
  })

  it('retira os créditos inteiros e deixa a fração pendente', async () => {
    const { store, topups } = memoryStore(clicks(2600, NOW - 2 * AD_CLICK_COOLDOWN_MS))
    const res = await handleAdReward('ad-withdraw', USER, store, NOW)
    expect(res.status).toBe(200)
    expect(res.body.credits_withdrawn).toBe(5)
    expect(res.body.pending).toBe(0.2)
    expect(topups).toEqual([{ amount: 5, key: 'terra_ad_withdraw:0' }])
  })

  it('duas retiradas simultâneas creditam uma vez só', async () => {
    const { store, topups } = memoryStore(clicks(2500, NOW - 2 * AD_CLICK_COOLDOWN_MS))
    const results = await Promise.all([
      handleAdReward('ad-withdraw', USER, store, NOW),
      handleAdReward('ad-withdraw', USER, store, NOW),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(topups).toHaveLength(1)
    expect(summarizeAdRewards(await store.listRows(USER), NOW).pending).toBe(0)
  })

  it('devolve o saldo pendente se o crédito falhar', async () => {
    const { store } = memoryStore(clicks(2500, NOW - 2 * AD_CLICK_COOLDOWN_MS), { failTopup: true })
    await expect(handleAdReward('ad-withdraw', USER, store, NOW)).rejects.toThrow('topup down')
    expect(summarizeAdRewards(await store.listRows(USER), NOW).pending).toBe(5)
  })
})

describe('deterministicUuid', () => {
  it('é estável e tem formato de UUID', async () => {
    const a = await deterministicUuid('x')
    expect(a).toBe(await deterministicUuid('x'))
    expect(a).not.toBe(await deterministicUuid('y'))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
