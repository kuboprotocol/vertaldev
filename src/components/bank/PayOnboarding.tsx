// Vertal Vibe Pay: single sign-up. One form opens the Brazil account (ASAAS)
// and the global account (Stripe) at once; Stripe opens its own link only if
// something is still missing there (terms, bank account, verification).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Building2, CheckCircle2, Globe2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { walletApi, WalletError } from '@/lib/wallet/api'
import { bankApi, type BankOverview } from '@/lib/bank/api'
import {
  BR_UFS, COMPANY_TYPES, PAY_FIELD_MESSAGES, lookupCep, maskCep, maskCpfCnpj, maskPhone, onlyDigits, validatePayOpen,
  type PayField, type PayOpenInput, type PayOpenResult, type PayStatus,
} from '@/lib/bank/payOnboarding'
import { GlobalAccountCard } from './BankAccounts'
import { COMPANY_TYPE_LABEL_EN, PAY_FIELD_MESSAGES_EN, payStatusTextEn } from './payCopyEn'

const EMPTY: PayOpenInput = {
  name: '', cpfCnpj: '', birthDate: '', email: '', mobilePhone: '', postalCode: '', address: '', addressNumber: '',
  complement: '', province: '', city: '', state: '', incomeValue: '', companyType: '',
}

type Errors = Partial<Record<PayField, string>>

export function PayOnboarding({ overview, onChange }: { overview: BankOverview | null; onChange: () => void }) {
  const [form, setForm] = useState<PayOpenInput>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [cepBusy, setCepBusy] = useState(false)
  const [status, setStatus] = useState<PayStatus | null>(null)
  const [result, setResult] = useState<PayOpenResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [abroad, setAbroad] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)

  const doc = onlyDigits(form.cpfCnpj)
  const isPj = doc.length > 11

  const refreshStatus = useCallback(async () => {
    try {
      const s = await bankApi.payStatus()
      setStatus(s.status)
    } catch { /* the /pay summary still applies */ }
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus, overview])

  // Suggest the Vertal account email.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email
      if (email) setForm((f) => (f.email ? f : { ...f, email }))
    }).catch(() => {})
  }, [])

  const set = (k: PayField, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const onCep = async (v: string) => {
    const masked = maskCep(v)
    set('postalCode', masked)
    if (onlyDigits(masked).length !== 8) return
    setCepBusy(true)
    const addr = await lookupCep(masked)
    setCepBusy(false)
    if (!addr) {
      setErrors((e) => ({ ...e, postalCode: 'CEP not found. Please enter the address by hand' }))
      return
    }
    setForm((f) => ({
      ...f,
      address: addr.address || f.address,
      province: addr.province || f.province,
      city: addr.city || f.city,
      state: addr.state || f.state,
    }))
  }

  const submit = async () => {
    const v = validatePayOpen(form)
    if (!v.ok) {
      setErrors(Object.fromEntries(v.errors.map((e) => [e.field, PAY_FIELD_MESSAGES_EN[e.code] ?? PAY_FIELD_MESSAGES[e.code] ?? e.code])))
      toast.error('Check the highlighted fields')
      return
    }
    setBusy(true)
    try {
      const r = await bankApi.payOpen(form)
      setResult(r)
      setStatus(r.status)
      setEditing(false)
      const okAll = r.asaas.ok && r.stripe.ok
      if (okAll && r.nextUrl) toast.success('Accounts opened. Now confirm your details on Stripe.')
      else if (okAll) toast.success('Accounts opened.')
      else if (r.asaas.ok || r.stripe.ok) toast.warning('One account opened. The other one needs your attention.')
      else toast.error('We could not open the accounts. See the details below.')
      onChange()
    } catch (e) {
      if (e instanceof WalletError && e.code === 'invalid_fields' && Array.isArray(e.details?.fields)) {
        const fields = e.details!.fields as { field: PayField; message: string }[]
        setErrors(Object.fromEntries(fields.map((f) => [f.field, f.message])))
      }
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const continueStripe = async () => {
    if (result?.nextUrl) { window.location.assign(result.nextUrl); return }
    setLinkBusy(true)
    try {
      const { url } = await walletApi.connectOnboard({ returnPath: '/pay' })
      window.location.assign(url)
    } catch (e) {
      toast.error((e as Error).message)
      setLinkBusy(false)
    }
  }

  const showForm = useMemo(() => {
    if (editing) return true
    if (result) return false
    return !status || status.overall === 'not_started' || status.overall === 'partial'
  }, [editing, result, status])

  if (status && status.overall === 'not_started' && status.nextStep === 'wait') {
    return <Shell><p className="text-sm text-muted-foreground">{payStatusTextEn(status)}</p></Shell>
  }

  return (
    <Shell>
      {status && status.overall !== 'not_started' && !editing && !result && (
        <StatusLine status={status} />
      )}

      {result && !editing && (
        <div className="space-y-2" data-testid="pay-open-result">
          <ProviderLine
            icon={<Building2 className="h-4 w-4" />}
            title="Brazil account · ASAAS"
            ok={result.asaas.ok}
            text={result.asaas.ok
              ? (result.asaas.created || ('recovered' in result.asaas && result.asaas.recovered) ? 'Open. ASAAS sent you an email to create a password and send your documents.' : 'Already open.')
              : result.asaas.message}
          />
          <ProviderLine
            icon={<Globe2 className="h-4 w-4" />}
            title="Global account · Stripe"
            ok={result.stripe.ok}
            text={result.stripe.ok
              ? (result.stripe.onboardingUrl ? 'Open and pre-filled. Accept the terms and confirm your details on Stripe.' : 'Open.')
              : result.stripe.message}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {result.nextUrl && (
              <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" onClick={continueStripe}>
                <ArrowUpRight className="h-4 w-4" />Continue on Stripe
              </Button>
            )}
            {(!result.asaas.ok || !result.stripe.ok) && (
              <Button variant="outline" className="gap-1.5" disabled={busy} onClick={submit}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Try again
              </Button>
            )}
            {(!result.asaas.ok || !result.stripe.ok) && (
              <Button variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
            )}
          </div>
        </div>
      )}

      {!result && !showForm && status?.nextStep === 'stripe_onboarding' && (
        <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={linkBusy} onClick={continueStripe}>
          {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Continue on Stripe
        </Button>
      )}

      {showForm && (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); submit() }}
          noValidate
          data-testid="pay-open-form"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field id="pay-doc" label="CPF or CNPJ" error={errors.cpfCnpj}>
              <Input id="pay-doc" inputMode="numeric" autoComplete="off" value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', maskCpfCnpj(e.target.value))} />
            </Field>
            <Field id="pay-name" label={isPj ? 'Company name' : 'Full name'} error={errors.name}>
              <Input id="pay-name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            {isPj ? (
              <Field id="pay-company" label="Company type" error={errors.companyType}>
                <Select value={form.companyType || ''} onValueChange={(v) => set('companyType', v)}>
                  <SelectTrigger id="pay-company"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {COMPANY_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{COMPANY_TYPE_LABEL_EN[c.value] ?? c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field id="pay-birth" label="Date of birth" error={errors.birthDate}>
                <Input id="pay-birth" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </Field>
            )}
            <Field id="pay-income" label={isPj ? 'Monthly revenue (R$)' : 'Monthly income (R$)'} error={errors.incomeValue}>
              <Input id="pay-income" inputMode="decimal" placeholder="5.000,00" value={String(form.incomeValue)} onChange={(e) => set('incomeValue', e.target.value)} />
            </Field>
            <Field id="pay-email" label="Email" error={errors.email}>
              <Input id="pay-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field id="pay-phone" label="Mobile number" error={errors.mobilePhone}>
              <Input id="pay-phone" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" value={form.mobilePhone} onChange={(e) => set('mobilePhone', maskPhone(e.target.value))} />
            </Field>
            <Field id="pay-cep" label="CEP (postal code)" error={errors.postalCode}>
              <div className="relative">
                <Input id="pay-cep" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={(e) => onCep(e.target.value)} />
                {cepBusy && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </Field>
            <Field id="pay-address" label="Street address" error={errors.address}>
              <Input id="pay-address" autoComplete="address-line1" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field id="pay-number" label="Number" error={errors.addressNumber}>
              <Input id="pay-number" value={form.addressNumber} onChange={(e) => set('addressNumber', e.target.value)} />
            </Field>
            <Field id="pay-complement" label="Address line 2 (optional)">
              <Input id="pay-complement" autoComplete="address-line2" value={form.complement} onChange={(e) => set('complement', e.target.value)} />
            </Field>
            <Field id="pay-province" label="Neighborhood" error={errors.province}>
              <Input id="pay-province" value={form.province} onChange={(e) => set('province', e.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <Field id="pay-city" label="City" error={errors.city}>
                <Input id="pay-city" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field id="pay-state" label="State" error={errors.state}>
                <Select value={form.state} onValueChange={(v) => set('state', v)}>
                  <SelectTrigger id="pay-state"><SelectValue placeholder="State" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {BR_UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            With these details we open your Brazil account at ASAAS (a payment institution authorized by the Central Bank of Brazil) and your global account at Stripe, in your name. ASAAS sends you an email to create a password and send your documents. Stripe asks you to accept its terms and confirms anything that is missing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {editing && <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Back</Button>}
            <Button type="submit" className="flex-1 gap-1.5 rounded-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Open my account
            </Button>
          </div>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbroad((x) => !x)}>
            No CPF or CNPJ, or you live outside Brazil? Open only the global account
          </button>
          {abroad && <GlobalAccountCard overview={overview} onChange={onChange} />}
        </form>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-card/50 p-5 sm:p-6" aria-labelledby="pay-open-title" data-testid="pay-onboarding">
      <div className="relative space-y-4">
        <div>
          <h3 id="pay-open-title" className="font-semibold text-foreground">Open your Vertal Vibe Pay account</h3>
          <p className="text-sm text-muted-foreground">One sign-up for both: a Brazil account (Pix, boleto, BRL) and a global account (US dollars, euros and 14 more currencies).</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function StatusLine({ status }: { status: PayStatus }) {
  const ok = status.overall === 'active'
  return (
    <p className={`flex items-start gap-2 rounded-xl p-3 text-sm ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`} data-testid="pay-status">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      {payStatusTextEn(status)}
    </p>
  )
}

function ProviderLine({ icon, title, ok, text }: { icon: React.ReactNode; title: string; ok: boolean; text: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl p-3 ${ok ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
      <span className={`mt-0.5 ${ok ? 'text-emerald-400' : 'text-destructive'}`}>{ok ? <CheckCircle2 className="h-4 w-4" /> : icon}</span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
    </div>
  )
}
