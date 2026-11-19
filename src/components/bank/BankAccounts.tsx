import { useState } from 'react'
import { ArrowUpRight, Building2, Globe2, Landmark, Loader2, Lock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { walletApi } from '@/lib/wallet/api'
import { formatMinor } from '@/lib/wallet/currency'
import { CONNECT_COUNTRIES, findConnectCountry } from '@/lib/bank/countries'
import { bankApi, ASAAS_STATUS_LABEL, type AsaasOpenInput, type BankOverview } from '@/lib/bank/api'

// ── Conta global (Stripe Connect) ──────────────────────────────────────────
export function GlobalAccountCard({ overview, onChange }: { overview: BankOverview | null; onChange: () => void }) {
  const [country, setCountry] = useState('BR')
  const [busy, setBusy] = useState<null | 'onboard' | 'dashboard' | 'mode'>(null)
  const acct = overview?.stripe.account ?? null
  const flags = overview?.flags

  const go = async (kind: 'onboard' | 'dashboard') => {
    setBusy(kind)
    try {
      const { url } = kind === 'onboard'
        ? await walletApi.connectOnboard({ country, returnPath: '/pay' })
        : await walletApi.connectDashboard('/pay')
      window.location.assign(url)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(null)
    }
  }

  const toggleManual = async (manual: boolean) => {
    setBusy('mode')
    try {
      await bankApi.payoutMode(manual ? 'manual' : 'automatic')
      toast.success(manual ? 'Saques manuais: o saldo fica na conta até você sacar' : 'Saques automáticos diários')
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const c = findConnectCountry(acct?.country)
  const fa = overview?.stripe.financialAccounts

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-[#635bff]/20 via-background/40 to-background/20 p-5" aria-labelledby="global-title">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#635bff]/30 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#635bff] text-white shadow-lg"><Globe2 className="h-5 w-5" /></span>
            <div>
              <h3 id="global-title" className="font-display font-semibold text-foreground">Conta global</h3>
              <p className="text-sm text-muted-foreground">
                {acct ? `${c?.flag ?? ''} ${c?.name ?? acct.country} · moeda base ${acct.defaultCurrency ?? '—'}` : 'Receba em dólar, euro e +14 moedas com Stripe'}
              </p>
            </div>
          </div>
          {acct && (
            <div className="flex gap-1.5">
              <Badge variant={acct.chargesEnabled ? 'default' : 'secondary'}>{acct.chargesEnabled ? 'Recebimentos ativos' : 'Em verificação'}</Badge>
              <Badge variant={acct.payoutsEnabled ? 'default' : 'secondary'}>{acct.payoutsEnabled ? 'Saques ativos' : 'Saques pendentes'}</Badge>
            </div>
          )}
        </div>

        {!acct ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">País do titular (não muda depois)</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CONNECT_COUNTRIES.map((x) => <SelectItem key={x.code} value={x.code}>{x.flag} {x.name} · {x.currency}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={busy !== null || !overview?.stripe.configured} onClick={() => go('onboard')}>
              {busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Abrir conta global
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(overview?.stripe.balances ?? []).length === 0 && <span className="text-sm text-muted-foreground">Sem saldo ainda.</span>}
              {(overview?.stripe.balances ?? []).map((b) => (
                <div key={b.currency} className="rounded-xl bg-background/60 px-3 py-2">
                  <p className="font-mono text-sm font-semibold text-foreground">{formatMinor(b.availableMinor, b.currency)}</p>
                  <p className="text-[10px] text-muted-foreground">{b.pendingMinor ? `+ ${formatMinor(b.pendingMinor, b.currency)} a liberar` : b.currency}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Contas bancárias para saque</p>
              {(overview?.stripe.externalAccounts ?? []).length === 0
                ? <p className="text-xs text-muted-foreground">Nenhuma ainda. Adicione no painel da conta.</p>
                : overview!.stripe.externalAccounts.map((e) => (
                  <p key={e.id} className="flex items-center gap-2 text-sm text-foreground">
                    <Landmark className="h-4 w-4 text-muted-foreground" />{e.bankName ?? 'Banco'} ···· {e.last4}
                    <span className="text-xs text-muted-foreground">{e.currency}{e.country ? ` · ${e.country}` : ''}{e.isDefault ? ' · padrão' : ''}</span>
                  </p>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={overview?.stripe.payoutSchedule === 'manual'} disabled={busy !== null} onCheckedChange={toggleManual} />
                Guardar saldo (saques manuais)
              </label>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => go(acct.chargesEnabled ? 'dashboard' : 'onboard')}>
                {busy === 'dashboard' || busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {acct.chargesEnabled ? 'Painel da conta' : 'Continuar verificação'}
              </Button>
            </div>
          </>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <FeatureFlag
            on={Boolean(flags?.stripeTreasury)}
            title="Stripe Treasury (Financial Accounts)"
            text={Array.isArray(fa) && fa.length ? `${fa.length} conta(s) financeira(s)` : fa && !Array.isArray(fa) ? 'Indisponível para esta conta' : 'Depende do Stripe liberar para a plataforma e do país (EUA/UK)'}
          />
          <FeatureFlag
            on={Boolean(flags?.stripeGlobalPayouts)}
            title="Global Payouts"
            text="Envio para 160+ mercados. Disponível só para plataformas nos EUA/UK (preview na UE)"
          />
        </div>
      </div>
    </section>
  )
}

function FeatureFlag({ on, title, text }: { on: boolean; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-background/50 p-3">
      <Lock className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${on ? 'text-emerald-400' : 'text-muted-foreground'}`} />
      <div>
        <p className="text-xs font-medium text-foreground">{title} <span className="text-muted-foreground">· {on ? 'ligado' : 'desligado'}</span></p>
        <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

// ── Conta ASAAS (Pix, boleto, subconta white-label) ────────────────────────
const EMPTY: AsaasOpenInput = {
  name: '', email: '', cpfCnpj: '', birthDate: '', companyType: undefined, mobilePhone: '', incomeValue: 0,
  address: '', addressNumber: '', complement: '', province: '', postalCode: '',
}

export function AsaasAccountCard({ overview, onChange }: { overview: BankOverview | null; onChange: () => void }) {
  const [form, setForm] = useState<AsaasOpenInput>(EMPTY)
  const [income, setIncome] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const acct = overview?.asaas.account ?? null
  const configured = Boolean(overview?.flags.asaasConfigured)
  const isPj = form.cpfCnpj.replace(/\D/g, '').length > 11
  const set = (k: keyof AsaasOpenInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setBusy(true)
    try {
      await bankApi.asaasOpen({
        ...form,
        incomeValue: Number(income.replace(/\./g, '').replace(',', '.')),
        birthDate: isPj ? undefined : form.birthDate,
        companyType: isPj ? form.companyType : undefined,
        complement: form.complement || undefined,
      })
      toast.success('Conta criada. O ASAAS enviou um e-mail para concluir a ativação.')
      setOpen(false)
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-[#0030b9]/25 via-background/40 to-background/20 p-5" aria-labelledby="asaas-title">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#32BCAD]/20 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0030b9] text-white shadow-lg"><Building2 className="h-5 w-5" /></span>
            <div>
              <h3 id="asaas-title" className="font-display font-semibold text-foreground">Conta Brasil · ASAAS</h3>
              <p className="text-sm text-muted-foreground">
                {acct ? `${acct.holderName ?? ''} · ${acct.document ?? ''}` : 'Pix, boleto e cartão em reais, com saldo e extrato'}
              </p>
            </div>
          </div>
          {acct && <Badge variant={acct.status === 'approved' ? 'default' : 'secondary'}>{ASAAS_STATUS_LABEL[acct.status]}</Badge>}
        </div>

        {!configured ? (
          <p className="rounded-xl bg-background/50 p-3 text-sm text-muted-foreground">A integração com o ASAAS ainda não foi ativada na plataforma. Em breve.</p>
        ) : acct ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-semibold text-foreground">{overview?.asaas.balance ? formatMinor(overview.asaas.balance.availableMinor, 'BRL') : '—'}</p>
              <p className="text-[11px] text-muted-foreground">Saldo disponível{overview?.flags.asaasEnv === 'sandbox' ? ' · sandbox' : ''}</p>
            </div>
            {acct.status !== 'approved' && (
              <p className="max-w-xs text-xs text-muted-foreground">Conclua o cadastro pelo e-mail de ativação do ASAAS (documentos e conta bancária). Saques e Pix de saída só liberam após a aprovação.</p>
            )}
          </div>
        ) : !open ? (
          <Button className="gap-1.5 bg-[#0030b9] text-white hover:bg-[#0028a0]" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" />Abrir conta Brasil
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Nome completo ou razão social"><Input value={form.name} onChange={set('name')} /></Field>
              <Field label="CPF ou CNPJ"><Input inputMode="numeric" value={form.cpfCnpj} onChange={set('cpfCnpj')} /></Field>
              <Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Celular"><Input inputMode="tel" placeholder="11 99999-9999" value={form.mobilePhone} onChange={set('mobilePhone')} /></Field>
              {isPj ? (
                <Field label="Tipo de empresa">
                  <Select value={form.companyType} onValueChange={(v) => setForm({ ...form, companyType: v as AsaasOpenInput['companyType'] })}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEI">MEI</SelectItem>
                      <SelectItem value="LIMITED">Limitada (LTDA)</SelectItem>
                      <SelectItem value="INDIVIDUAL">Individual (EI/SLU)</SelectItem>
                      <SelectItem value="ASSOCIATION">Associação</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Data de nascimento"><Input type="date" value={form.birthDate} onChange={set('birthDate')} /></Field>
              )}
              <Field label="Renda / faturamento mensal (R$)"><Input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} /></Field>
              <Field label="CEP"><Input inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} /></Field>
              <Field label="Endereço"><Input value={form.address} onChange={set('address')} /></Field>
              <Field label="Número"><Input value={form.addressNumber} onChange={set('addressNumber')} /></Field>
              <Field label="Complemento"><Input value={form.complement} onChange={set('complement')} /></Field>
              <Field label="Bairro"><Input value={form.province} onChange={set('province')} /></Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sua conta é aberta no ASAAS (instituição de pagamento autorizada pelo Banco Central) como subconta da VERTAL. Você recebe um e-mail do ASAAS para criar senha e enviar documentos.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
              <Button className="flex-1 bg-[#0030b9] text-white hover:bg-[#0028a0]" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Criar conta
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
