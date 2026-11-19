import { describe, expect, it } from 'vitest'
import { connectPendingText, type ConnectAccount } from './api'

const base: ConnectAccount = {
  id: 'acct_x', country: 'BR', defaultCurrency: 'BRL', chargesEnabled: false,
  payoutsEnabled: false, detailsSubmitted: true, pendingRequirements: 1,
}

describe('connectPendingText', () => {
  it('flags past-due requirements', () => {
    expect(connectPendingText({ ...base, pastDue: 1, disabledReason: 'requirements.past_due' })).toMatch(/prazo vencido/)
  })
  it('shows review state when nothing is due', () => {
    expect(connectPendingText({ ...base, pendingRequirements: 0 })).toMatch(/analisando/)
  })
  it('falls back to the pending count', () => {
    expect(connectPendingText({ ...base, detailsSubmitted: false, pendingRequirements: 3 })).toMatch(/Faltam 3/)
  })
})
