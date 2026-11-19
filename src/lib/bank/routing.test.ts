import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { routeReceive, routeSend } from './routing'

const both = { asaasReady: true, stripeReady: true }

describe('Vertal Vibe Pay routing', () => {
  it('Pix e boleto em BRL vão para o ASAAS', () => {
    expect(routeReceive({ method: 'pix', currency: 'BRL', ...both }).provider).toBe('asaas')
    expect(routeReceive({ method: 'boleto', currency: 'brl', ...both }).provider).toBe('asaas')
  })
  it('Pix fora do BRL ou sem ASAAS não tem rota', () => {
    expect(routeReceive({ method: 'pix', currency: 'USD', ...both }).provider).toBeNull()
    expect(routeReceive({ method: 'pix', currency: 'BRL', asaasReady: false, stripeReady: true }).provider).toBeNull()
  })
  it('outras moedas vão para o Stripe', () => {
    expect(routeReceive({ method: 'card', currency: 'USD', ...both }).provider).toBe('stripe')
    expect(routeReceive({ method: 'link', currency: 'EUR', ...both }).provider).toBe('stripe')
    expect(routeReceive({ method: 'card', currency: 'EUR', asaasReady: true, stripeReady: false }).provider).toBeNull()
  })
  it('cartão em BRL prefere ASAAS e cai no Stripe sem ASAAS', () => {
    expect(routeReceive({ method: 'card', currency: 'BRL', ...both }).provider).toBe('asaas')
    expect(routeReceive({ method: 'card', currency: 'BRL', asaasReady: false, stripeReady: true }).provider).toBe('stripe')
  })
  it('saídas: Pix pelo ASAAS, saque pelo Stripe', () => {
    expect(routeSend('pix')).toBe('asaas')
    expect(routeSend('payout')).toBe('stripe')
  })
  it('espelho do servidor é idêntico', () => {
    const strip = (s: string) => s.split('\n').filter((l) => !l.includes('Espelho de')).join('\n')
    const a = readFileSync(resolve(__dirname, 'routing.ts'), 'utf8')
    const b = readFileSync(resolve(__dirname, '../../../supabase/functions/_shared/bankRouting.ts'), 'utf8')
    expect(strip(b)).toBe(strip(a))
  })
})

describe('Vertal Vibe Pay countries', () => {
  it('espelho do servidor é idêntico e BR é o primeiro', async () => {
    const { CONNECT_COUNTRIES } = await import('./countries')
    expect(CONNECT_COUNTRIES[0].code).toBe('BR')
    expect(new Set(CONNECT_COUNTRIES.map((c) => c.code)).size).toBe(CONNECT_COUNTRIES.length)
    const strip = (s: string) => s.split('\n').filter((l) => !l.includes('Espelho de')).join('\n')
    const a = readFileSync(resolve(__dirname, 'countries.ts'), 'utf8')
    const b = readFileSync(resolve(__dirname, '../../../supabase/functions/_shared/bankCountries.ts'), 'utf8')
    expect(strip(b)).toBe(strip(a))
  })
})
