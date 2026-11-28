// Consentimento do botão "Accept & activate" (action=consent da Edge Function vertal-node-heartbeat).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isMissingRelation,
  parseConsent,
  VERTAL_NODE_CONSENT_VERSION,
} from '../../supabase/functions/_shared/rewardsCore'
import { VERTAL_NODE_CONSENT_VERSION as SITE_VERSION } from '@/lib/vertalNode'

describe('parseConsent', () => {
  it('aceita o corpo do card e corta o user agent', () => {
    const r = parseConsent({ accept: true, consent_version: '2026-11-28', platform: 'android' }, `  ${'a'.repeat(400)} `)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toMatchObject({ accepted: true, consent_version: '2026-11-28', platform: 'android' })
      expect(r.value.user_agent).toHaveLength(300)
    }
    const revoke = parseConsent({ accept: false, consent_version: 'v1' })
    expect(revoke).toEqual({ ok: true, value: { accepted: false, consent_version: 'v1', platform: 'other', user_agent: null } })
  })

  it('recusa corpo inválido', () => {
    expect(parseConsent(null)).toEqual({ ok: false, error: 'invalid_body' })
    expect(parseConsent({ accept: 'yes', consent_version: 'v1' })).toEqual({ ok: false, error: 'invalid_accept' })
    expect(parseConsent({ accept: true, consent_version: 'v 1' })).toEqual({ ok: false, error: 'invalid_consent_version' })
    expect(parseConsent({ accept: true, consent_version: 'x'.repeat(33) })).toEqual({ ok: false, error: 'invalid_consent_version' })
    expect(parseConsent({ accept: true, consent_version: 'v1', platform: 'windows' })).toEqual({ ok: false, error: 'invalid_platform' })
  })

  it('site e função usam a mesma versão do texto', () => {
    expect(SITE_VERSION).toBe(VERTAL_NODE_CONSENT_VERSION)
  })

  it('reconhece tabela inexistente (migração pendente)', () => {
    expect(isMissingRelation({ code: '42P01', message: 'relation "public.vertal_nodes" does not exist' })).toBe(true)
    expect(isMissingRelation({ code: 'PGRST205', message: "Could not find the table 'public.vertal_node_consents'" })).toBe(true)
    expect(isMissingRelation({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingRelation(null)).toBe(false)
  })
})

describe('migração 20261128010000 (aditiva)', () => {
  const sql = readFileSync(
    join(__dirname, '../../supabase/migrations/20261128010000_vertal_node_providers_and_consent.sql'),
    'utf8',
  )
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('não renomeia nem apaga objetos e não recria a CHECK de fontes do ledger', () => {
    expect(code).not.toMatch(/RENAME\s+TO/i)
    expect(code).not.toMatch(/DROP\s+(TABLE|FUNCTION|CONSTRAINT)/i)
    expect(code).not.toMatch(/ADD\s+CONSTRAINT\s+reward_events_source_check/i)
  })

  it('tabelas novas com RLS, GRANT e escrita só pela service role', () => {
    for (const t of ['vertal_nodes', 'vertal_node_consents']) {
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
      expect(code).toMatch(new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${t} FROM authenticated`))
      expect(code).toMatch(new RegExp(`GRANT ALL ON public\\.${t} TO service_role`))
    }
    expect(code).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/)
  })
})
