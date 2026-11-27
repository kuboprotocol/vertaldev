import { describe, it, expect } from 'vitest'
import { remainingCredits } from './creditBalance'

describe('remainingCredits', () => {
  it('é edits_limit - edits_used', () => {
    expect(remainingCredits({ edits_limit: 64827, edits_used: 205 })).toBe(64622)
  })
  it('nunca fica negativo', () => {
    expect(remainingCredits({ edits_limit: 5, edits_used: 9 })).toBe(0)
  })
  it('sem assinatura é 0', () => {
    expect(remainingCredits(null)).toBe(0)
    expect(remainingCredits({ edits_limit: null, edits_used: null })).toBe(0)
  })
})
