import { describe, expect, it } from 'vitest'
import {
  ENV_KEY_RE,
  MAX_VALUE_LENGTH,
  ORCHESTRATION_TARGETS,
  findTarget,
  isStale,
  maskSecret,
  normalizeEnvKey,
  parseSecretFields,
  planReadiness,
  summarizePlan,
  validateEnvKey,
  validateValue,
  type VisibleSecret,
} from '../../supabase/functions/_shared/kuboSecretsCore'

const NOW = new Date('2026-11-08T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

describe('normalizeEnvKey / validateEnvKey', () => {
  it('uppercases and trims the variable name', () => {
    expect(normalizeEnvKey('  openai_api_key ')).toBe('OPENAI_API_KEY')
  })

  it('accepts conventional env names', () => {
    expect(validateEnvKey('OPENAI_API_KEY')).toBeNull()
    expect(validateEnvKey('a1')).toBeNull()
  })

  it('rejects names that would break env injection', () => {
    expect(validateEnvKey('')).not.toBeNull()
    expect(validateEnvKey('1BAD')).not.toBeNull()
    expect(validateEnvKey('HAS SPACE')).not.toBeNull()
    expect(validateEnvKey('A')).not.toBeNull()
    expect(validateEnvKey('X=Y')).not.toBeNull()
  })

  it('regex matches the database check constraint', () => {
    expect(ENV_KEY_RE.test('STRIPE_SECRET_KEY')).toBe(true)
    expect(ENV_KEY_RE.test('lower')).toBe(false)
  })
})

describe('maskSecret', () => {
  it('never returns the full value', () => {
    const masked = maskSecret('sk-live-abcdef1234567890')
    expect(masked).toBe('sk-l••••7890')
    expect(masked).not.toContain('abcdef')
  })

  it('hides short values completely', () => {
    expect(maskSecret('short')).toBe('••••')
  })
})

describe('validateValue', () => {
  it('rejects empty, non-string and oversized values', () => {
    expect(validateValue('').ok).toBe(false)
    expect(validateValue(42).ok).toBe(false)
    expect(validateValue('x'.repeat(MAX_VALUE_LENGTH + 1)).ok).toBe(false)
  })

  it('keeps the value exactly as pasted (no trimming)', () => {
    const r = validateValue('  token-with-spaces  ')
    expect(r).toEqual({ ok: true, data: '  token-with-spaces  ' })
  })
})

describe('parseSecretFields', () => {
  it('requires name and key on create', () => {
    expect(parseSecretFields({ env_key: 'OPENAI_API_KEY' }, { partial: false }).ok).toBe(false)
    expect(parseSecretFields({ name: 'Chave' }, { partial: false }).ok).toBe(false)
  })

  it('defaults group on create', () => {
    const r = parseSecretFields({ name: 'Chave', env_key: 'openai_api_key' }, { partial: false })
    expect(r).toEqual({
      ok: true,
      data: { name: 'Chave', env_key: 'OPENAI_API_KEY', group_name: 'geral' },
    })
  })

  it('on edit, validates only the fields that were sent', () => {
    const r = parseSecretFields({ description: '  nota  ' }, { partial: true })
    expect(r).toEqual({ ok: true, data: { description: 'nota' } })
  })

  it('clears description when sent empty', () => {
    const r = parseSecretFields({ description: '   ' }, { partial: true })
    expect(r).toEqual({ ok: true, data: { description: null } })
  })

  it('rejects an invalid orchestration target slug', () => {
    expect(parseSecretFields({ name: 'x', env_key: 'XX', bound_to: 'Has Space' }, { partial: false }).ok).toBe(false)
  })
})

describe('isStale', () => {
  it('flags values not rotated for more than 90 days', () => {
    expect(isStale(daysAgo(91), NOW)).toBe(true)
    expect(isStale(daysAgo(89), NOW)).toBe(false)
  })

  it('does not flag missing or invalid dates', () => {
    expect(isStale(null, NOW)).toBe(false)
    expect(isStale('not-a-date', NOW)).toBe(false)
  })
})

describe('planReadiness', () => {
  const owned: VisibleSecret = { id: 'own-1', owner_id: 'me', env_key: 'OPENAI_API_KEY', rotated_at: daysAgo(1), role: 'owner' }
  const shared: VisibleSecret = { id: 'sh-1', owner_id: 'other', env_key: 'RESEND_API_KEY', rotated_at: daysAgo(1), role: 'grant' }

  it('marks keys with a usable secret as ready and reports the source', () => {
    const [openai, resend] = planReadiness(['OPENAI_API_KEY', 'RESEND_API_KEY'], [owned, shared], NOW)
    expect(openai).toMatchObject({ status: 'ready', source: 'owner', secret_id: 'own-1' })
    expect(resend).toMatchObject({ status: 'ready', source: 'grant', secret_id: 'sh-1' })
  })

  it('marks keys with no visible secret as missing', () => {
    const [stripe] = planReadiness(['STRIPE_SECRET_KEY'], [owned], NOW)
    expect(stripe).toMatchObject({ status: 'missing', source: null, secret_id: null })
    expect(stripe.warning).toBeTruthy()
  })

  it('prefers the owner secret over a shared one with the same key', () => {
    const sharedSameKey: VisibleSecret = { ...shared, id: 'sh-2', env_key: 'OPENAI_API_KEY' }
    const [entry] = planReadiness(['OPENAI_API_KEY'], [sharedSameKey, owned], NOW)
    expect(entry.secret_id).toBe('own-1')
    expect(entry.source).toBe('owner')
  })

  it('deduplicates and normalizes required keys', () => {
    const entries = planReadiness(['openai_api_key', 'OPENAI_API_KEY', ' '], [owned], NOW)
    expect(entries.map((e) => e.env_key)).toEqual(['OPENAI_API_KEY'])
  })

  it('warns about stale values without blocking readiness', () => {
    const old: VisibleSecret = { ...owned, rotated_at: daysAgo(200) }
    const [entry] = planReadiness(['OPENAI_API_KEY'], [old], NOW)
    expect(entry.status).toBe('ready')
    expect(entry.stale).toBe(true)
    expect(entry.warning).toMatch(/90 dias/)
  })
})

describe('summarizePlan', () => {
  const ready = { env_key: 'A', status: 'ready' as const, source: 'owner' as const, secret_id: '1', stale: false, warning: null }
  const missing = { env_key: 'B', status: 'missing' as const, source: null, secret_id: null, stale: false, warning: 'x' }

  it('reports ready, partial, missing and empty', () => {
    expect(summarizePlan([ready, ready])).toBe('ready')
    expect(summarizePlan([ready, missing])).toBe('partial')
    expect(summarizePlan([missing])).toBe('missing')
    expect(summarizePlan([])).toBe('empty')
  })
})

describe('orchestration targets', () => {
  it('have unique slugs and at least one key each', () => {
    const slugs = ORCHESTRATION_TARGETS.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const t of ORCHESTRATION_TARGETS) {
      expect(t.env_keys.length).toBeGreaterThan(0)
      for (const k of t.env_keys) expect(ENV_KEY_RE.test(k)).toBe(true)
    }
  })

  it('finds a target by slug', () => {
    expect(findTarget('github')?.env_keys).toContain('GITHUB_TOKEN')
    expect(findTarget('nope')).toBeUndefined()
  })
})
