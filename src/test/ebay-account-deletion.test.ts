// Endpoint de exclusão de conta do eBay (exigido para o keyset de produção).
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { challengeResponse, handle } from '../../supabase/functions/ebay-account-deletion/index'

const TOKEN = 'vertal_ebay_verification_token_0123456789abcdef'
const ENDPOINT = 'https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/ebay-account-deletion'
const env = (k: string) => ({ EBAY_VERIFICATION_TOKEN: TOKEN, EBAY_DELETION_ENDPOINT: ENDPOINT } as Record<string, string>)[k]

describe('ebay-account-deletion', () => {
  it('responde o desafio com sha256(code + token + endpoint)', async () => {
    const expected = createHash('sha256').update('abc123' + TOKEN + ENDPOINT).digest('hex')
    expect(await challengeResponse('abc123', TOKEN, ENDPOINT)).toBe(expected)
    const res = await handle(new Request(`${ENDPOINT}?challenge_code=abc123`), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ challengeResponse: expected })
  })
  it('aceita a notificação e não processa sem configuração', async () => {
    const ok = await handle(new Request(ENDPOINT, { method: 'POST', body: JSON.stringify({ metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' } }) }), env)
    expect(ok.status).toBe(204)
    const off = await handle(new Request(`${ENDPOINT}?challenge_code=x`), () => undefined)
    expect(off.status).toBe(503)
  })
})
