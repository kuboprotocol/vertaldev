import { describe, it, expect } from 'vitest'
import { canAccessVibePay } from '@/config/vibePayGate'
import { vibePayAllowed } from '../../supabase/functions/_shared/vibePayGate'

describe('Vibe Pay dev gate', () => {
  it('libera só as contas admin listadas', () => {
    for (const e of ['kuboprotocol@gmail.com', 'BrazilVerde1@gmail.com', ' erikaguiar21@gmail.com ']) {
      expect(canAccessVibePay(e)).toBe(true)
      expect(vibePayAllowed(e)).toBe(true)
    }
  })
  it('bloqueia os demais', () => {
    for (const e of ['fulano@gmail.com', '', null, undefined]) {
      expect(canAccessVibePay(e)).toBe(false)
      expect(vibePayAllowed(e)).toBe(false)
    }
    expect(vibePayAllowed('fulano@gmail.com', true)).toBe(true)
  })
})
