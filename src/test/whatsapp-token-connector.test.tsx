// WhatsApp por token (Cloud API oficial): validação, "Testar conexão" (Graph GET /{phone-number-id}),
// tela em pt/en/es e o login pelo Facebook "em breve" sem os segredos FLUXOS_OAUTH_META_*.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const invoke = vi.fn()
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { parseFluxosOp, whatsappTest, whatsappErrorHint } from '../../supabase/functions/_shared/fluxosApps'
import { fluxosAppName, fluxosAppsInConversation } from '../../supabase/functions/_shared/chatAgent'
import { validateWhatsAppToken, waLang, waTestErrorText, WA_UI } from '@/lib/fluxos/whatsappToken'
import { WhatsAppConnectPanel } from '@/components/connectors/WhatsAppConnectPanel'

const describeResp = (app: string, extra: Record<string, unknown> = {}) => ({
  ok: true, app: { key: app, name: app, oauth: app === 'whatsapp', supportsConnections: true },
  platformClient: app === 'whatsapp' ? false : null, fields: [], actions: [], searches: [], agentText: '', connection: null, ...extra,
})

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('whatsappTest (servidor)', () => {
  it('pede token e ID do número, e só aceita IDs numéricos', async () => {
    expect(await whatsappTest({})).toEqual({ ok: false, error: 'missing_fields', fields: ['accessToken', 'phoneNumberId'] })
    expect(await whatsappTest({ accessToken: 'x', phoneNumberId: '12ab' })).toMatchObject({ ok: false, error: 'invalid_id', fields: ['phoneNumberId'] })
  })
  it('chama GET /{phone-number-id} com Bearer e devolve o nome do número', async () => {
    const f = vi.fn(async () => jsonRes(200, { id: '123456789', display_phone_number: '+1 555-000-1111', verified_name: 'Loja Teste', quality_rating: 'GREEN' }))
    const r = await whatsappTest({ accessToken: 'EAAtoken', phoneNumberId: '123456789' }, f as unknown as typeof fetch)
    expect(r).toMatchObject({ ok: true, verifiedName: 'Loja Teste', displayPhoneNumber: '+1 555-000-1111' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/123456789?fields=id,display_phone_number,verified_name,quality_rating')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer EAAtoken')
  })
  it('traduz o erro do Graph (token inválido)', async () => {
    const f = vi.fn(async () => jsonRes(400, { error: { code: 190, message: 'Invalid OAuth access token' } }))
    const r = await whatsappTest({ accessToken: 'bad', phoneNumberId: '123456789' }, f as unknown as typeof fetch)
    expect(r).toMatchObject({ ok: false, error: 'graph_error', code: 190 })
    expect(whatsappErrorHint(190)).toBe('token_invalid')
    expect(waTestErrorText('pt', 'test_graph_error', 'token_invalid')).toMatch(/token/)
  })
  it('confere também a conta (WABA) quando informada', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes(200, { id: '123456789', verified_name: 'Loja' }))
      .mockResolvedValueOnce(jsonRes(200, { id: '99999', name: 'Minha WABA' }))
    const r = await whatsappTest({ accessToken: 't', phoneNumberId: '123456789', wabaId: '99999' }, f as unknown as typeof fetch)
    expect(r).toMatchObject({ ok: true, wabaName: 'Minha WABA' })
  })
  it('op "test" só existe para whatsapp-cloud', () => {
    expect(parseFluxosOp({ op: 'test', app: 'whatsapp-cloud', fields: { accessToken: 'x', phoneNumberId: '1' } }))
      .toEqual({ op: 'test', app: 'whatsapp-cloud', fields: { accessToken: 'x', phoneNumberId: '1' } })
    expect(parseFluxosOp({ op: 'test', app: 'notion', fields: {} })).toBeNull()
  })
})

describe('chat e idioma', () => {
  it('o app por token aparece como WhatsApp no chat', () => {
    expect(fluxosAppName('whatsapp-cloud')).toBe('WhatsApp')
    expect(fluxosAppsInConversation(['whatsapp-cloud'], ['manda um oi pelo WhatsApp'])).toEqual([{ key: 'whatsapp-cloud', name: 'WhatsApp' }])
  })
  it('idioma: pt (padrão), en, es, com guia completo nos três', () => {
    expect(waLang('en-US')).toBe('en')
    expect(waLang('es-AR')).toBe('es')
    expect(waLang(null)).toBe('pt')
    for (const l of ['pt', 'en', 'es'] as const) {
      expect(WA_UI[l].steps).toHaveLength(5)
      expect(WA_UI[l].steps.some((s) => s.link?.href.startsWith('https://developers.facebook.com/'))).toBe(true)
      expect(WA_UI[l].testNumberNote).toMatch(/5/)
    }
  })
  it('validação dos campos', () => {
    expect(validateWhatsAppToken({ accessToken: '', phoneNumberId: '', wabaId: '' })).toEqual({ accessToken: 'required', phoneNumberId: 'required' })
    expect(validateWhatsAppToken({ accessToken: 'EAA abc', phoneNumberId: '12a', wabaId: 'x' }))
      .toEqual({ accessToken: 'tokenSpaces', phoneNumberId: 'idDigits', wabaId: 'idDigits' })
    expect(validateWhatsAppToken({ accessToken: 'EAA'.padEnd(40, 'x'), phoneNumberId: '123456789', wabaId: '' })).toEqual({})
  })
})

describe('WhatsAppConnectPanel', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockImplementation(async (_fn: string, { body }: { body: { fluxos: { op: string; app: string } } }) => {
      const op = body.fluxos
      if (op.op === 'describe') return { data: describeResp(op.app), error: null }
      if (op.op === 'test') return { data: { ok: true, result: { id: '123456789', displayPhoneNumber: '+1 555-000-1111', verifiedName: 'Loja Teste', qualityRating: 'GREEN', wabaName: null } }, error: null }
      return { data: { ok: true }, error: null }
    })
  })

  const renderAt = (url = '/connectors/fluxos-whatsapp/setup?lang=pt') => render(<MemoryRouter initialEntries={[url]}><WhatsAppConnectPanel /></MemoryRouter>)

  it('mostra o modo token, o guia e o Facebook "em breve"', async () => {
    renderAt()
    expect(await screen.findByText('Conectar com token')).toBeTruthy()
    expect(screen.getByText('Em breve')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Entrar com Facebook/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Passo a passo (uns 10 minutos)')).toBeTruthy()
    expect(screen.getByText(/até 5 números/)).toBeTruthy()
  })

  it('valida antes de chamar o servidor', async () => {
    renderAt()
    fireEvent.click(await screen.findByText('Testar conexão'))
    expect(screen.getAllByText('Obrigatório.')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(/ID do número de telefone/), { target: { value: 'abc' } })
    expect(screen.getByText(/Use só os números do ID/)).toBeTruthy()
    expect(invoke.mock.calls.filter((c) => (c[1] as { body: { fluxos: { op: string } } }).body.fluxos.op === 'test')).toHaveLength(0)
  })

  it('"Testar conexão" mostra o nome do número', async () => {
    renderAt()
    fireEvent.change(await screen.findByLabelText(/Token de acesso/), { target: { value: 'EAA'.padEnd(40, 'x') } })
    fireEvent.change(screen.getByLabelText(/ID do número de telefone/), { target: { value: '123456789' } })
    fireEvent.click(screen.getByText('Testar conexão'))
    await waitFor(() => expect(screen.getByTestId('wa-test-ok').textContent).toContain('Loja Teste · +1 555-000-1111'))
  })

  it('em inglês com ?lang=en', async () => {
    renderAt('/connectors/whatsapp?lang=en')
    expect(await screen.findByText('Connect with token')).toBeTruthy()
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })
})
