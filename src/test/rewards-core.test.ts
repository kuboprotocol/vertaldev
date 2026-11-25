import { describe, expect, it } from 'vitest'
import {
  honeygainConfig,
  isValidNonce,
  newNonce,
  nodeConfig,
  nodeRewardKey,
  parseHeartbeat,
  rewardDay,
  rewardedVideoConfig,
  rewardedVideoStatus,
  sumCredits,
} from '../../supabase/functions/_shared/rewardsCore'

const env = (vars: Record<string, string>) => (n: string) => vars[n]
const cfg = rewardedVideoConfig(env({}))

describe('rewardsCore — config', () => {
  it('usa os padrões (1 crédito, 60s, 10/dia)', () => {
    expect(cfg).toEqual({ amount: 1, cooldownSeconds: 60, dailyCap: 10, nonceTtlSeconds: 1800 })
    expect(honeygainConfig(env({})).dailyAmount).toBe(2)
  })

  it('lê o env e ignora valores inválidos', () => {
    const c = rewardedVideoConfig(env({ REWARDED_VIDEO_CREDITS: '3', REWARDED_VIDEO_DAILY_CAP: 'abc', REWARDED_VIDEO_COOLDOWN_SECONDS: '-5' }))
    expect(c.amount).toBe(3)
    expect(c.dailyCap).toBe(10)
    expect(c.cooldownSeconds).toBe(60)
    expect(honeygainConfig(env({ HONEYGAIN_NODE_DAILY_CREDITS: '0' })).dailyAmount).toBe(0)
    expect(rewardedVideoConfig(env({ REWARDED_VIDEO_CREDITS: '1.5' })).amount).toBe(1)
  })

  it('Vertal Node: padrões, nome antigo do env e provedores liberados', () => {
    expect(nodeConfig(env({}))).toEqual({ dailyAmount: 2, creditPerProvider: false, enabledProviders: ['cashraven'] })
    expect(nodeConfig(env({ HONEYGAIN_NODE_DAILY_CREDITS: '3' })).dailyAmount).toBe(3)
    expect(nodeConfig(env({ HONEYGAIN_NODE_DAILY_CREDITS: '3', VERTAL_NODE_DAILY_CREDITS: '5' })).dailyAmount).toBe(5)
    expect(nodeConfig(env({ VERTAL_NODE_CREDIT_PER_PROVIDER: 'true' })).creditPerProvider).toBe(true)
    expect(nodeConfig(env({ VERTAL_NODE_CREDIT_PER_PROVIDER: 'talvez' })).creditPerProvider).toBe(false)
    expect(nodeConfig(env({ VERTAL_NODE_PROVIDERS: ' CashRaven, foo ,cashraven' })).enabledProviders).toEqual(['cashraven'])
    expect(nodeConfig(env({ VERTAL_NODE_PROVIDERS: 'foo' })).enabledProviders).toEqual(['cashraven'])
    // Honeygain: desligado por padrão (aguardando aprovação), religável por config.
    expect(nodeConfig(env({})).enabledProviders).not.toContain('honeygain')
    expect(nodeConfig(env({ VERTAL_NODE_PROVIDERS: 'cashraven,honeygain' })).enabledProviders).toEqual(['cashraven', 'honeygain'])
  })
})

describe('rewardsCore — dia em America/Sao_Paulo', () => {
  it('23:30 em SP ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    // 2026-11-25T02:30Z = 2026-11-24 23:30 em São Paulo (UTC-3)
    expect(rewardDay(Date.parse('2026-11-25T02:30:00Z'))).toBe('2026-11-24')
    expect(rewardDay(Date.parse('2026-11-25T03:00:00Z'))).toBe('2026-11-25')
  })
})

describe('rewardsCore — nonce', () => {
  it('gera 64 hex únicos e valida o formato', () => {
    const a = newNonce()
    const b = newNonce()
    expect(isValidNonce(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(isValidNonce('xyz')).toBe(false)
    expect(isValidNonce(undefined)).toBe(false)
  })
})

describe('rewardsCore — status do vídeo premiado', () => {
  const NOW = Date.parse('2026-11-24T20:00:00Z') // 17:00 em SP

  it('sem resgates pode assistir', () => {
    const s = rewardedVideoStatus([], NOW, cfg)
    expect(s).toMatchObject({ can_watch: true, claimed_today: 0, remaining_today: 10, reason: null, day: '2026-11-24' })
  })

  it('aplica o cooldown a partir do último resgate', () => {
    const s = rewardedVideoStatus([{ claimed_at: new Date(NOW - 20_000).toISOString(), reward_day: '2026-11-24' }], NOW, cfg)
    expect(s.can_watch).toBe(false)
    expect(s.reason).toBe('cooldown')
    expect(Date.parse(s.next_available_at!)).toBe(NOW + 40_000)
  })

  it('bloqueia no limite diário e não conta os de ontem', () => {
    const today = Array.from({ length: 10 }, (_, i) => ({
      claimed_at: new Date(NOW - (i + 2) * 3600_000).toISOString(),
      reward_day: i < 9 ? '2026-11-24' : '2026-11-23',
    }))
    const s = rewardedVideoStatus(today, NOW, cfg)
    expect(s.claimed_today).toBe(9)
    expect(s.can_watch).toBe(true)

    const full = today.map((r) => ({ ...r, reward_day: '2026-11-24' }))
    const s2 = rewardedVideoStatus(full, NOW, cfg)
    expect(s2).toMatchObject({ can_watch: false, reason: 'daily_cap_reached', remaining_today: 0, next_available_at: null })
  })
})

describe('rewardsCore — heartbeat', () => {
  it('aceita um corpo válido', () => {
    const r = parseHeartbeat({ device_id: 'desk-1234abcd', platform: 'desktop', provider: 'cashraven', opted_in: true, running: false })
    expect(r).toEqual({
      ok: true,
      value: { device_id: 'desk-1234abcd', platform: 'desktop', provider: 'cashraven', app_version: null, opted_in: true, running: false },
    })
  })

  it('sem provider = honeygain (apps antigos): recusado por padrão, aceito se o Honeygain for religado', () => {
    const legacy = { device_id: 'andr-1234abcd', platform: 'android', opted_in: true, running: true }
    expect(parseHeartbeat(legacy)).toEqual({ ok: false, error: 'provider_disabled' })
    const r = parseHeartbeat(legacy, ['cashraven', 'honeygain'])
    expect(r.ok && r.value.provider).toBe('honeygain')
  })

  it('recusa provedor desconhecido ou desligado', () => {
    const base = { device_id: 'desk-1234abcd', platform: 'desktop', opted_in: true, running: true }
    expect(parseHeartbeat({ ...base, provider: 'foo' })).toEqual({ ok: false, error: 'invalid_provider' })
    expect(parseHeartbeat({ ...base, provider: 'pawns' })).toEqual({ ok: false, error: 'provider_disabled' })
    expect(parseHeartbeat({ ...base, provider: 'cashraven' }, ['honeygain'])).toEqual({ ok: false, error: 'provider_disabled' })
    expect(parseHeartbeat({ ...base, provider: 'pawns' }, ['honeygain', 'pawns']).ok).toBe(true)
  })

  it('recusa campos inválidos', () => {
    expect(parseHeartbeat(null)).toEqual({ ok: false, error: 'invalid_body' })
    expect(parseHeartbeat({ device_id: 'x', platform: 'desktop', opted_in: true, running: true })).toEqual({ ok: false, error: 'invalid_device_id' })
    expect(parseHeartbeat({ device_id: 'desk-1234abcd', platform: 'ios', opted_in: true, running: true })).toEqual({ ok: false, error: 'invalid_platform' })
    expect(parseHeartbeat({ device_id: 'desk-1234abcd', platform: 'android', provider: 'cashraven', opted_in: 'yes', running: true })).toEqual({ ok: false, error: 'invalid_state' })
  })

  it('chave do crédito: 1x por dia para todos os provedores, ou 1x por provedor se configurado', () => {
    expect(nodeRewardKey('2026-11-24', 'honeygain', false)).toBe(nodeRewardKey('2026-11-24', 'cashraven', false))
    expect(nodeRewardKey('2026-11-24', 'honeygain', false)).toBe('vertal_node:2026-11-24')
    expect(nodeRewardKey('2026-11-24', 'cashraven', true)).toBe('vertal_node:cashraven:2026-11-24')
    expect(nodeRewardKey('2026-11-24', 'honeygain', true)).not.toBe(nodeRewardKey('2026-11-24', 'cashraven', true))
  })

  it('soma créditos do ledger', () => {
    expect(sumCredits([{ credits: 2 }, { credits: 2 }, { credits: 3 }])).toBe(7)
  })
})
