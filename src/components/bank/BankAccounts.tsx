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
import { COMPANY_TYPE_LABEL_EN, regionName } from './payCopyEn'
import { bankApi, ASAAS_STATUS_LABEL, type AsaasOpenInput, type BankOverview } from '@/lib/bank/api'

// ── Global account (Stripe Connect) ────────────────────────────────────────
/** `hideOpen`: with no account, hides the open button (/pay uses the single sign-up, PayOnboarding). */
export function GlobalAccountCard({ overview, onChange, hideOpen = false }: { overview: BankOverview | null; onChange: () => void; hideOpen?: boolean }) {
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
      toast.success(manual ? 'Manual payouts: the balance stays in the account until you pay it out' : 'Daily automatic payouts')
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
    <section className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-card/50 p-5" aria-labelledby="global-title">
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#635bff] text-white"><Globe2 className="h-5 w-5" /></span>
            <div>
              <h3 id="global-title" className="font-semibold text-foreground">Global account</h3>
              <p className="text-sm text-muted-foreground">
                {acct ? `${c?.flag ?? ''} ${regionName(acct.country, c?.name ?? acct.country ?? '')} · base currency ${acct.defaultCurrency ?? '-'}` : 'Receive in US dollars, euros and 14 more currencies with Stripe'}
              </p>
            </div>
          </div>
          {acct && (
            <div className="flex gap-1.5">
              <Badge variant={acct.chargesEnabled ? 'default' : 'secondary'}>{acct.chargesEnabled ? 'Payments on' : 'Being verified'}</Badge>
              <Badge variant={acct.payoutsEnabled ? 'default' : 'secondary'}>{acct.payoutsEnabled ? 'Payouts on' : 'Payouts pending'}</Badge>
            </div>
          )}
        </div>

        {!acct && hideOpen ? (
          <p className="rounded-xl border border-white/[0.06] p-3 text-sm text-muted-foreground">Not open yet. Use the single sign-up above: it opens the Brazil account and the global account together.</p>
        ) : !acct ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account holder country (cannot be changed later)</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CONNECT_COUNTRIES.map((x) => <SelectItem key={x.code} value={x.code}>{x.flag} {regionName(x.code, x.name)} · {x.currency}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={busy !== null || !overview?.stripe.configured} onClick={() => go('onboard')}>
              {busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Open global account
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(overview?.stripe.balances ?? []).length === 0 && <span className="text-sm text-muted-foreground">No balance yet.</span>}
              {(overview?.stripe.balances ?? []).map((b) => (
                <div key={b.currency} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="font-mono text-sm font-semibold text-foreground">{formatMinor(b.availableMinor, b.currency)}</p>
                  <p className="text-[10px] text-muted-foreground">{b.pendingMinor ? `+ ${formatMinor(b.pendingMinor, b.currency)} pending` : b.currency}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Bank accounts for payouts</p>
              {(overview?.stripe.externalAccounts ?? []).length === 0
                ? <p className="text-xs text-muted-foreground">None yet. Add one in the account dashboard.</p>
                : overview!.stripe.externalAccounts.map((e) => (
                  <p key={e.id} className="flex items-center gap-2 text-sm text-foreground">
                    <Landmark className="h-4 w-4 text-muted-foreground" />{e.bankName ?? 'Bank account'} ···· {e.last4}
                    <span className="text-xs text-muted-foreground">{e.currency}{e.country ? ` · ${e.country}` : ''}{e.isDefault ? ' · default' : ''}</span>
                  </p>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={overview?.stripe.payoutSchedule === 'manual'} disabled={busy !== null} onCheckedChange={toggleManual} />
                Keep the balance (manual payouts)
              </label>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={busy !== null} onClick={() => go(acct.chargesEnabled ? 'dashboard' : 'onboard')}>
                {busy === 'dashboard' || busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                {acct.chargesEnabled ? 'Account dashboard' : 'Continue verification'}
              </Button>
            </div>
          </>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <FeatureFlag
            on={Boolean(flags?.stripeTreasury)}
            title="Stripe Treasury (Financial Accounts)"
            text={Array.isArray(fa) && fa.length ? `${fa.length} financial ${fa.length === 1 ? 'account' : 'accounts'}` : fa && !Array.isArray(fa) ? 'Not available for this account' : 'Depends on Stripe turning it on for the platform and on the country (US/UK)'}
          />
          <FeatureFlag
            on={Boolean(flags?.stripeGlobalPayouts)}
            title="Global Payouts"
            text="Stripe feature for sending money to many markets. Available only to platforms in the US/UK (preview in the EU)"
          />
        </div>
      </div>
    </section>
  )
}

function FeatureFlag({ on, title, text }: { on: boolean; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] p-3">
      <Lock className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${on ? 'text-emerald-400' : 'text-muted-foreground'}`} />
      <div>
        <p className="text-xs font-medium text-foreground">{title} <span className="text-muted-foreground">· {on ? 'on' : 'off'}</span></p>
        <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

// ── ASAAS account (Pix, boleto, white-label subaccount) ────────────────────
const EMPTY: AsaasOpenInput = {
  name: '', email: '', cpfCnpj: '', birthDate: '', companyType: undefined, mobilePhone: '', incomeValue: 0,
  address: '', addressNumber: '', complement: '', province: '', postalCode: '',
}

export function AsaasAccountCard({ overview, onChange, hideOpen = false }: { overview: BankOverview | null; onChange: () => void; hideOpen?: boolean }) {
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
      toast.success('Account created. ASAAS sent you an email to finish the activation.')
      setOpen(false)
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-card/50 p-5" aria-labelledby="asaas-title">
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0030b9] text-white"><Building2 className="h-5 w-5" /></span>
            <div>
              <h3 id="asaas-title" className="font-semibold text-foreground">Brazil account · ASAAS</h3>
              <p className="text-sm text-muted-foreground">
                {acct ? `${acct.holderName ?? ''} · ${acct.document ?? ''}` : 'Pix, boleto and card in BRL, with balance and statement'}
              </p>
            </div>
          </div>
          {acct && <Badge variant={acct.status === 'approved' ? 'default' : 'secondary'}>{ASAAS_STATUS_LABEL[acct.status]}</Badge>}
        </div>

        {!configured ? (
          <p className="rounded-xl border border-white/[0.06] p-3 text-sm text-muted-foreground">The ASAAS integration is not turned on for the platform yet.</p>
        ) : acct ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-semibold text-foreground">{overview?.asaas.balance ? formatMinor(overview.asaas.balance.availableMinor, 'BRL') : '—'}</p>
              <p className="text-[11px] text-muted-foreground">Available balance{overview?.flags.asaasEnv === 'sandbox' ? ' · sandbox' : ''}</p>
            </div>
            {acct.status !== 'approved' && (
              <p className="max-w-xs text-xs text-muted-foreground">Finish the sign-up from the ASAAS activation email (documents and bank account). Payouts and outgoing Pix are available only after approval.</p>
            )}
          </div>
        ) : hideOpen ? (
          <p className="rounded-xl border border-white/[0.06] p-3 text-sm text-muted-foreground">Not open yet. Use the single sign-up above: it opens the Brazil account and the global account together.</p>
        ) : !open ? (
          <Button className="gap-1.5 bg-[#0030b9] text-white hover:bg-[#0028a0]" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" />Open Brazil account
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Full name or company name"><Input value={form.name} onChange={set('name')} /></Field>
              <Field label="CPF or CNPJ"><Input inputMode="numeric" value={form.cpfCnpj} onChange={set('cpfCnpj')} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Mobile number"><Input inputMode="tel" placeholder="11 99999-9999" value={form.mobilePhone} onChange={set('mobilePhone')} /></Field>
              {isPj ? (
                <Field label="Company type">
                  <Select value={form.companyType} onValueChange={(v) => setForm({ ...form, companyType: v as AsaasOpenInput['companyType'] })}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEI">{COMPANY_TYPE_LABEL_EN.MEI}</SelectItem>
                      <SelectItem value="LIMITED">{COMPANY_TYPE_LABEL_EN.LIMITED}</SelectItem>
                      <SelectItem value="INDIVIDUAL">{COMPANY_TYPE_LABEL_EN.INDIVIDUAL}</SelectItem>
                      <SelectItem value="ASSOCIATION">{COMPANY_TYPE_LABEL_EN.ASSOCIATION}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Date of birth"><Input type="date" value={form.birthDate} onChange={set('birthDate')} /></Field>
              )}
              <Field label="Monthly income or revenue (R$)"><Input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} /></Field>
              <Field label="CEP (postal code)"><Input inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} /></Field>
              <Field label="Street address"><Input value={form.address} onChange={set('address')} /></Field>
              <Field label="Number"><Input value={form.addressNumber} onChange={set('addressNumber')} /></Field>
              <Field label="Address line 2"><Input value={form.complement} onChange={set('complement')} /></Field>
              <Field label="Neighborhood"><Input value={form.province} onChange={set('province')} /></Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Your account is opened at ASAAS (a payment institution authorized by the Central Bank of Brazil) as a VERTAL subaccount. ASAAS sends you an email to create a password and send your documents.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button className="flex-1 bg-[#0030b9] text-white hover:bg-[#0028a0]" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create account
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
