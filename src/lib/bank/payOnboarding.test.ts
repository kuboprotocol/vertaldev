import { describe, expect, it, vi } from 'vitest'
import {
  asaasAccountPayload,
  classifyAsaasError,
  classifyStripeError,
  combinePayStatus,
  runPayOpen,
  stripeAccountCreateParams,
  validatePayOpen,
  type PayOpenData,
  type PayOpenDeps,
  type StripeSnapshot,
} from '../../../supabase/functions/_shared/payOnboarding.ts'
import { encKeyState, parseEncKey } from '../../../supabase/functions/_shared/encKey.ts'
import { lookupCep, maskCep, maskCpfCnpj, maskPhone, parseBrlAmount } from './payOnboarding'

const TODAY = new Date('2026-11-20T12:00:00Z')
const CPF = '529.982.247-25'
const CNPJ = '11.222.333/0001-81'

const PF = {
  name: 'Maria  da Silva',
  cpfCnpj: CPF,
  birthDate: '1990-05-17',
  email: 'Maria@Exemplo.com ',
  mobilePhone: '+55 (11) 98765-4321',
  postalCode: '01310-100',
  address: 'Avenida Paulista',
  addressNumber: '1000',
  complement: 'Ap 12',
  province: 'Bela Vista',
  city: 'São Paulo',
  state: 'sp',
  incomeValue: '5.000,00',
}

const PJ = { ...PF, name: 'Vertal Tecnologia LTDA', cpfCnpj: CNPJ, birthDate: '', companyType: 'LIMITED' as const }

function data(input: Record<string, unknown> = PF): PayOpenData {
  const v = validatePayOpen(input, { today: TODAY })
  if (!v.ok) throw new Error(JSON.stringify(v.errors))
  return v.data
}

const codes = (input: Record<string, unknown>) => {
  const v = validatePayOpen(input, { today: TODAY })
  return v.ok ? [] : v.errors.map((e) => `${e.field}:${e.code}`)
}

describe('validatePayOpen', () => {
  it('normaliza um cadastro PF válido', () => {
    const d = data()
    expect(d).toMatchObject({
      personType: 'FISICA',
      name: 'Maria da Silva',
      firstName: 'Maria',
      lastName: 'da Silva',
      cpfCnpj: '52998224725',
      email: 'maria@exemplo.com',
      mobilePhone: '11987654321',
      phoneE164: '+5511987654321',
      postalCode: '01310100',
      state: 'SP',
      incomeValue: 5000,
      companyType: null,
      birthDate: '1990-05-17',
    })
  })

  it('aceita PJ sem data de nascimento, mas exige o tipo de empresa', () => {
    expect(data(PJ)).toMatchObject({ personType: 'JURIDICA', companyType: 'LIMITED', birthDate: null })
    expect(codes({ ...PJ, companyType: '' })).toEqual(['companyType:company_type_required'])
  })

  it('recusa documento, telefone, CEP, UF e renda inválidos', () => {
    expect(codes({ ...PF, cpfCnpj: '111.111.111-11' })).toContain('cpfCnpj:document_invalid')
    expect(codes({ ...PF, mobilePhone: '11 3456-7890' })).toContain('mobilePhone:phone_invalid')
    expect(codes({ ...PF, postalCode: '0131010' })).toContain('postalCode:postal_code_invalid')
    expect(codes({ ...PF, state: 'XX' })).toContain('state:state_invalid')
    expect(codes({ ...PF, incomeValue: '0' })).toContain('incomeValue:income_invalid')
    expect(codes({ ...PF, incomeValue: 'abc' })).toContain('incomeValue:income_invalid')
  })

  it('exige nome e sobrenome, data real e maioridade para CPF', () => {
    expect(codes({ ...PF, name: 'Maria' })).toEqual(['name:name_full'])
    expect(codes({ ...PF, birthDate: '' })).toEqual(['birthDate:birth_date_required'])
    expect(codes({ ...PF, birthDate: '1990-02-30' })).toEqual(['birthDate:birth_date_invalid'])
    expect(codes({ ...PF, birthDate: '2010-01-01' })).toEqual(['birthDate:birth_date_minor'])
  })

  it('lista todos os campos que faltam de uma vez', () => {
    const c = codes({})
    for (const f of ['cpfCnpj', 'name', 'email', 'mobilePhone', 'postalCode', 'address', 'addressNumber', 'province', 'city', 'state', 'incomeValue']) {
      expect(c.some((x) => x.startsWith(`${f}:`))).toBe(true)
    }
  })
})

describe('máscaras e valores', () => {
  it('formata CPF, CNPJ, celular e CEP', () => {
    expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25')
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(maskPhone('5511987654321')).toBe('(11) 98765-4321')
    expect(maskCep('01310100')).toBe('01310-100')
  })
  it('lê valores em reais', () => {
    expect(parseBrlAmount('R$ 12.345,67')).toBe(12345.67)
    expect(parseBrlAmount('5.000')).toBe(5000)
    expect(parseBrlAmount('2500.5')).toBe(2500.5)
    expect(parseBrlAmount(42)).toBe(42)
    expect(parseBrlAmount('1,2,3')).toBeNaN()
  })
})

describe('payloads dos provedores', () => {
  it('ASAAS: PF leva birthDate e não companyType', () => {
    const p = asaasAccountPayload(data(), null)
    expect(p).toMatchObject({ cpfCnpj: '52998224725', birthDate: '1990-05-17', mobilePhone: '11987654321', incomeValue: 5000, province: 'Bela Vista', postalCode: '01310100' })
    expect(p.companyType).toBeUndefined()
    expect(p.webhooks).toBeUndefined()
  })
  it('ASAAS: PJ leva companyType e webhook quando configurado', () => {
    const p = asaasAccountPayload(data(PJ), { url: 'https://x/asaas-webhook', email: 'ops@x', authToken: 't', events: ['PAYMENT_RECEIVED'] })
    expect(p.companyType).toBe('LIMITED')
    expect(p.birthDate).toBeUndefined()
    expect(p.webhooks?.[0]).toMatchObject({ url: 'https://x/asaas-webhook', authToken: 't', events: ['PAYMENT_RECEIVED'] })
  })
  it('Stripe: conta Express BR pré-preenchida (PF)', () => {
    const p = stripeAccountCreateParams(data(), { userId: 'u1', platformCnpj: '65.822.139/0001-66' })
    expect(p).toMatchObject({
      type: 'express',
      country: 'BR',
      business_type: 'individual',
      individual: {
        first_name: 'Maria',
        last_name: 'da Silva',
        id_number: '52998224725',
        phone: '+5511987654321',
        dob: { day: 17, month: 5, year: 1990 },
        address: { line1: 'Avenida Paulista, 1000', line2: 'Ap 12 - Bela Vista', postal_code: '01310-100', city: 'São Paulo', state: 'SP', country: 'BR' },
      },
      metadata: { supabase_user_id: 'u1', source: 'pay-open' },
    })
  })
  it('Stripe: PJ vira company com CNPJ', () => {
    const p = stripeAccountCreateParams(data(PJ), { userId: 'u1', platformCnpj: 'x' })
    expect(p).toMatchObject({ business_type: 'company', company: { name: 'Vertal Tecnologia LTDA', tax_id: '11222333000181' } })
    expect('individual' in p).toBe(false)
  })
})

describe('classificação de erros', () => {
  it('reconhece o erro real do ASAAS de e-mail em uso (2026-11-20)', () => {
    expect(classifyAsaasError({ status: 400, errors: [{ code: 'invalid_email', description: 'O email fabianarodrigues1084@gmail.com já está em uso.' }] })).toBe('email_in_use')
    expect(classifyAsaasError({ status: 400, errors: [{ description: 'O CPF/CNPJ informado já está em uso.' }] })).toBe('document_in_use')
    expect(classifyAsaasError({ status: 400, errors: [{ description: 'O campo incomeValue deve ser informado.' }] })).toBe('validation')
    expect(classifyAsaasError({ status: 503, errors: [] })).toBe('unavailable')
  })
  it('reconhece Connect desligado no Stripe', () => {
    expect(classifyStripeError({ message: "You can only create new accounts if you've signed up for Connect" })).toBe('connect_disabled')
    expect(classifyStripeError({ type: 'StripeConnectionError', message: 'ECONNRESET' })).toBe('unavailable')
    expect(classifyStripeError({ type: 'StripeInvalidRequestError', message: 'Invalid dob' })).toBe('validation')
  })
})

describe('CONNECTOR_ENC_KEY (causa do erro no cadastro)', () => {
  const hex = 'a1'.repeat(32)
  it('aceita hex de 64 caracteres (antes decodificava como base64 para 48 bytes)', () => {
    expect(parseEncKey(hex)?.length).toBe(32)
    expect(encKeyState(hex)).toBe('ok')
  })
  it('aceita base64 e base64url de 32 bytes', () => {
    const bytes = Array.from({ length: 32 }, (_, i) => (i * 37 + 250) % 256)
    const b64 = btoa(String.fromCharCode(...bytes))
    expect(Array.from(parseEncKey(b64)!)).toEqual(bytes)
    const url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(Array.from(parseEncKey(url)!)).toEqual(bytes)
    expect(parseEncKey(` ${b64}\n`)).not.toBeNull()
  })
  it('recusa chave ausente ou de outro tamanho', () => {
    expect(encKeyState('')).toBe('missing')
    expect(encKeyState(btoa('x'.repeat(48)))).toBe('invalid')
    expect(encKeyState('minha-senha-secreta')).toBe('invalid')
  })
})

// ── Orquestração: falha parcial e idempotência ─────────────────────────────

const READY: StripeSnapshot = { detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, requirementsDue: 5, disabledReason: 'requirements.past_due' }

function fakeDeps(over: { asaas?: Partial<NonNullable<PayOpenDeps['asaas']>> | null; stripe?: Partial<NonNullable<PayOpenDeps['stripe']>> | null } = {}) {
  const state = { asaasRow: null as null | { status: 'pending' }, stripeId: null as string | null }
  const asaas = {
    encryptionReady: vi.fn(() => true),
    getRow: vi.fn(async () => state.asaasRow),
    findOwn: vi.fn(async () => null),
    recoverKey: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'acc_1', walletId: 'w_1', apiKey: '$aact_prod_x' })),
    store: vi.fn(async () => { state.asaasRow = { status: 'pending' } }),
    webhook: null,
    ...(over.asaas ?? {}),
  }
  const stripe = {
    getExisting: vi.fn(async () => state.stripeId),
    create: vi.fn(async () => { state.stripeId = 'acct_1'; return 'acct_1' }),
    prefill: vi.fn(async () => {}),
    snapshot: vi.fn(async () => READY),
    onboardingLink: vi.fn(async () => 'https://connect.stripe.com/setup/e/acct_1/x'),
    ...(over.stripe ?? {}),
  }
  const deps: PayOpenDeps = {
    userId: 'user-1',
    platformCnpj: '65.822.139/0001-66',
    // FNV-1a simples: estável e sensível a qualquer mudança nos dados.
    hash: async (s) => {
      let h = 0x811c9dc5
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
      return h.toString(16).padStart(8, '0').repeat(3)
    },
    asaas: over.asaas === null ? null : asaas,
    stripe: over.stripe === null ? null : stripe,
  }
  return { deps, asaas, stripe, state }
}

describe('runPayOpen', () => {
  it('abre as duas contas e devolve o link do Stripe porque ainda falta o onboarding', async () => {
    const { deps, asaas, stripe } = fakeDeps()
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: true, created: true })
    expect(r.stripe).toMatchObject({ ok: true, created: true, accountId: 'acct_1' })
    expect(r.nextUrl).toMatch(/^https:\/\/connect\.stripe\.com/)
    expect(r.status).toMatchObject({ overall: 'action_required', nextStep: 'stripe_onboarding' })
    expect(asaas.create).toHaveBeenCalledTimes(1)
    expect(stripe.create).toHaveBeenCalledTimes(1)
  })

  it('não devolve link quando o Stripe não pede mais nada', async () => {
    const { deps } = fakeDeps({ stripe: { snapshot: vi.fn(async () => ({ detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsDue: 0, disabledReason: null })) } })
    const r = await runPayOpen(deps, data())
    expect(r.nextUrl).toBeNull()
  })

  it('falha parcial: ASAAS recusa, Stripe abre e fica', async () => {
    const err = Object.assign(new Error('O campo incomeValue é inválido.'), { status: 400, errors: [{ description: 'O campo incomeValue é inválido.' }] })
    const { deps, stripe } = fakeDeps({ asaas: { create: vi.fn(async () => { throw err }) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_validation', retryable: false })
    expect(r.asaas.ok ? '' : r.asaas.message).toContain('incomeValue')
    expect(r.stripe.ok).toBe(true)
    expect(stripe.create).toHaveBeenCalledTimes(1)
    expect(r.status).toMatchObject({ overall: 'partial', asaas: 'none', nextStep: 'retry' })
  })

  it('falha parcial: Stripe sem Connect, ASAAS abre e fica', async () => {
    const { deps, asaas } = fakeDeps({ stripe: { create: vi.fn(async () => { throw Object.assign(new Error("You can only create new accounts if you've signed up for Connect"), { type: 'StripeInvalidRequestError' }) }) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: true, created: true })
    expect(r.stripe).toMatchObject({ ok: false, error: 'stripe_connect_disabled' })
    expect(r.nextUrl).toBeNull()
    expect(asaas.store).toHaveBeenCalledTimes(1)
    expect(r.status.overall).toBe('partial')
  })

  it('idempotente: tentar de novo não recria o que já abriu', async () => {
    const { deps, asaas, stripe } = fakeDeps({ stripe: { create: vi.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), { type: 'StripeConnectionError' })).mockResolvedValue('acct_2') } })
    const first = await runPayOpen(deps, data())
    expect(first.asaas.ok).toBe(true)
    expect(first.stripe).toMatchObject({ ok: false, error: 'stripe_unavailable', retryable: true })

    const second = await runPayOpen(deps, data())
    expect(second.asaas).toMatchObject({ ok: true, created: false })
    expect(second.stripe).toMatchObject({ ok: true, created: true, accountId: 'acct_2' })
    expect(asaas.create).toHaveBeenCalledTimes(1)
    expect(stripe.create).toHaveBeenCalledTimes(2)
  })

  it('idempotente: conta Stripe existente só recebe o pré-preenchimento, sem criar outra', async () => {
    const { deps, stripe, state } = fakeDeps()
    state.stripeId = 'acct_old'
    const r = await runPayOpen(deps, data())
    expect(stripe.create).not.toHaveBeenCalled()
    expect(stripe.prefill).toHaveBeenCalledWith('acct_old', expect.objectContaining({ business_type: 'individual' }))
    expect(r.stripe).toMatchObject({ ok: true, created: false, accountId: 'acct_old' })
  })

  it('chave de idempotência do Stripe: igual para os mesmos dados, nova se os dados mudam', async () => {
    const keys: string[] = []
    const mk = () => fakeDeps({ stripe: { create: vi.fn(async (_p, key: string) => { keys.push(key); return 'acct_x' }) } })
    await runPayOpen(mk().deps, data())
    await runPayOpen(mk().deps, data())
    await runPayOpen(mk().deps, data({ ...PF, addressNumber: '1001' }))
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    expect(keys[0]).toMatch(/^vb-pay-open:user-1:/)
  })

  it('sem chave de cifragem não chama o ASAAS (evita subconta órfã), mas abre o Stripe', async () => {
    const { deps, asaas } = fakeDeps({ asaas: { encryptionReady: vi.fn(() => false) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'pay_config_error', retryable: true })
    expect(asaas.findOwn).not.toHaveBeenCalled()
    expect(asaas.create).not.toHaveBeenCalled()
    expect(r.stripe.ok).toBe(true)
  })

  it('subconta órfã da plataforma: recupera a chave e vincula sem criar outra', async () => {
    const { deps, asaas } = fakeDeps({ asaas: {
      findOwn: vi.fn(async () => ({ id: 'acc_orphan', walletId: 'w_o', linkedToOtherUser: false })),
      recoverKey: vi.fn(async () => '$aact_prod_new'),
    } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: true, created: false, recovered: true })
    expect(asaas.create).not.toHaveBeenCalled()
    expect(asaas.store).toHaveBeenCalledWith({ id: 'acc_orphan', walletId: 'w_o', apiKey: '$aact_prod_new' })
  })

  it('subconta órfã sem chave recuperável: avisa (asaas_orphan) e não tenta criar', async () => {
    const { deps, asaas } = fakeDeps({ asaas: { findOwn: vi.fn(async () => ({ id: 'acc_orphan', walletId: 'w_o', linkedToOtherUser: false })) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_orphan' })
    expect(asaas.create).not.toHaveBeenCalled()
  })

  it('CPF já vinculado a outro usuário: não reaproveita', async () => {
    const { deps, asaas } = fakeDeps({ asaas: { findOwn: vi.fn(async () => ({ id: 'acc_x', walletId: 'w', linkedToOtherUser: true })) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_document_in_use' })
    expect(asaas.recoverKey).not.toHaveBeenCalled()
  })

  it('e-mail usado por outra conta ASAAS (fora da plataforma): pede outro e-mail', async () => {
    const err = Object.assign(new Error('O email x@y.com já está em uso.'), { status: 400, errors: [{ description: 'O email x@y.com já está em uso.' }] })
    const { deps } = fakeDeps({ asaas: { create: vi.fn(async () => { throw err }) } })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_email_in_use' })
  })

  it('repete a gravação uma vez; se falhar de novo, avisa sem perder o Stripe', async () => {
    const once = fakeDeps({ asaas: { store: vi.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue(undefined) } })
    expect((await runPayOpen(once.deps, data())).asaas).toMatchObject({ ok: true, created: true })
    const twice = fakeDeps({ asaas: { store: vi.fn().mockRejectedValue(new Error('db')) } })
    const r = await runPayOpen(twice.deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_store_failed' })
    expect(r.stripe.ok).toBe(true)
  })

  it('provedor não configurado na plataforma não bloqueia o outro', async () => {
    const { deps } = fakeDeps({ asaas: null })
    const r = await runPayOpen(deps, data())
    expect(r.asaas).toMatchObject({ ok: false, error: 'asaas_not_configured' })
    expect(r.stripe.ok).toBe(true)
    expect(r.status.asaas).toBe('unavailable')
    expect(r.status.overall).toBe('action_required')
  })
})

describe('combinePayStatus', () => {
  const on = { asaasConfigured: true, stripeConfigured: true }
  const active: StripeSnapshot = { detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsDue: 0, disabledReason: null }
  it('nada aberto -> abrir', () => {
    expect(combinePayStatus(on, null, null)).toMatchObject({ overall: 'not_started', nextStep: 'open' })
  })
  it('uma conta só -> parcial', () => {
    expect(combinePayStatus(on, { status: 'approved' }, null)).toMatchObject({ overall: 'partial', stripe: 'none' })
  })
  it('Stripe pedindo dados -> onboarding do Stripe', () => {
    expect(combinePayStatus(on, { status: 'approved' }, READY)).toMatchObject({ overall: 'action_required', nextStep: 'stripe_onboarding' })
  })
  it('ASAAS pendente -> e-mail de ativação', () => {
    expect(combinePayStatus(on, { status: 'pending' }, active)).toMatchObject({ overall: 'action_required', nextStep: 'asaas_activation' })
  })
  it('em análise e ativo', () => {
    const review: StripeSnapshot = { ...active, chargesEnabled: false }
    expect(combinePayStatus(on, { status: 'awaiting_approval' }, review)).toMatchObject({ overall: 'in_review', nextStep: 'wait' })
    expect(combinePayStatus(on, { status: 'approved' }, active)).toMatchObject({ overall: 'active', nextStep: 'done' })
  })
  it('plataforma sem provedores', () => {
    expect(combinePayStatus({ asaasConfigured: false, stripeConfigured: false }, null, null)).toMatchObject({ overall: 'not_started', nextStep: 'wait' })
  })
})

describe('lookupCep (ViaCEP)', () => {
  it('preenche endereço pelo CEP', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' })))
    expect(await lookupCep('01310-100', f as unknown as typeof fetch)).toEqual({ address: 'Avenida Paulista', province: 'Bela Vista', city: 'São Paulo', state: 'SP' })
    expect(f).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/')
  })
  it('CEP inexistente ou serviço fora -> null', async () => {
    expect(await lookupCep('99999-999', (async () => new Response('{"erro":true}')) as unknown as typeof fetch)).toBeNull()
    expect(await lookupCep('01310-100', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
    expect(await lookupCep('123')).toBeNull()
  })
})
