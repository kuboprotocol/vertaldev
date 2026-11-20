// Vertal Vibe Pay: cadastro único. Um formulário abre a conta Brasil (ASAAS)
// e a conta global (Stripe) de uma vez; o Stripe só abre o próprio link se
// ainda faltar algo lá (aceite dos termos, conta bancária, verificação).
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
    } catch { /* o resumo do /pay continua valendo */ }
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus, overview])

  // E-mail da conta Vertal como sugestão.
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
      setErrors((e) => ({ ...e, postalCode: 'CEP não encontrado: preencha o endereço à mão' }))
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
      setErrors(Object.fromEntries(v.errors.map((e) => [e.field, PAY_FIELD_MESSAGES[e.code] ?? e.code])))
      toast.error('Confira os campos destacados')
      return
    }
    setBusy(true)
    try {
      const r = await bankApi.payOpen(form)
      setResult(r)
      setStatus(r.status)
      setEditing(false)
      const okAll = r.asaas.ok && r.stripe.ok
      if (okAll && r.nextUrl) toast.success('Contas abertas. Falta só confirmar seus dados no Stripe.')
      else if (okAll) toast.success('Contas abertas.')
      else if (r.asaas.ok || r.stripe.ok) toast.warning('Uma das contas abriu; a outra precisa de atenção.')
      else toast.error('Não conseguimos abrir as contas. Veja os detalhes abaixo.')
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
    return <Shell><p className="text-sm text-muted-foreground">{status.message}</p></Shell>
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
            title="Conta Brasil · ASAAS"
            ok={result.asaas.ok}
            text={result.asaas.ok
              ? (result.asaas.created || ('recovered' in result.asaas && result.asaas.recovered) ? 'Aberta. O ASAAS enviou um e-mail para criar a senha e enviar documentos.' : 'Já estava aberta.')
              : result.asaas.message}
          />
          <ProviderLine
            icon={<Globe2 className="h-4 w-4" />}
            title="Conta global · Stripe"
            ok={result.stripe.ok}
            text={result.stripe.ok
              ? (result.stripe.onboardingUrl ? 'Aberta e pré-preenchida. Falta aceitar os termos e confirmar os dados no Stripe.' : 'Aberta.')
              : result.stripe.message}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {result.nextUrl && (
              <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" onClick={continueStripe}>
                <ArrowUpRight className="h-4 w-4" />Continuar no Stripe
              </Button>
            )}
            {(!result.asaas.ok || !result.stripe.ok) && (
              <Button variant="outline" className="gap-1.5" disabled={busy} onClick={submit}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Tentar de novo
              </Button>
            )}
            {(!result.asaas.ok || !result.stripe.ok) && (
              <Button variant="ghost" onClick={() => setEditing(true)}>Corrigir dados</Button>
            )}
          </div>
        </div>
      )}

      {!result && !showForm && status?.nextStep === 'stripe_onboarding' && (
        <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={linkBusy} onClick={continueStripe}>
          {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Continuar no Stripe
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
            <Field id="pay-doc" label="CPF ou CNPJ" error={errors.cpfCnpj}>
              <Input id="pay-doc" inputMode="numeric" autoComplete="off" value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', maskCpfCnpj(e.target.value))} />
            </Field>
            <Field id="pay-name" label={isPj ? 'Razão social' : 'Nome completo'} error={errors.name}>
              <Input id="pay-name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            {isPj ? (
              <Field id="pay-company" label="Tipo de empresa" error={errors.companyType}>
                <Select value={form.companyType || ''} onValueChange={(v) => set('companyType', v)}>
                  <SelectTrigger id="pay-company"><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    {COMPANY_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field id="pay-birth" label="Data de nascimento" error={errors.birthDate}>
                <Input id="pay-birth" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </Field>
            )}
            <Field id="pay-income" label={isPj ? 'Faturamento mensal (R$)' : 'Renda mensal (R$)'} error={errors.incomeValue}>
              <Input id="pay-income" inputMode="decimal" placeholder="5.000,00" value={String(form.incomeValue)} onChange={(e) => set('incomeValue', e.target.value)} />
            </Field>
            <Field id="pay-email" label="E-mail" error={errors.email}>
              <Input id="pay-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field id="pay-phone" label="Celular" error={errors.mobilePhone}>
              <Input id="pay-phone" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" value={form.mobilePhone} onChange={(e) => set('mobilePhone', maskPhone(e.target.value))} />
            </Field>
            <Field id="pay-cep" label="CEP" error={errors.postalCode}>
              <div className="relative">
                <Input id="pay-cep" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={(e) => onCep(e.target.value)} />
                {cepBusy && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </Field>
            <Field id="pay-address" label="Endereço" error={errors.address}>
              <Input id="pay-address" autoComplete="address-line1" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field id="pay-number" label="Número" error={errors.addressNumber}>
              <Input id="pay-number" value={form.addressNumber} onChange={(e) => set('addressNumber', e.target.value)} />
            </Field>
            <Field id="pay-complement" label="Complemento (opcional)">
              <Input id="pay-complement" autoComplete="address-line2" value={form.complement} onChange={(e) => set('complement', e.target.value)} />
            </Field>
            <Field id="pay-province" label="Bairro" error={errors.province}>
              <Input id="pay-province" value={form.province} onChange={(e) => set('province', e.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <Field id="pay-city" label="Cidade" error={errors.city}>
                <Input id="pay-city" autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field id="pay-state" label="UF" error={errors.state}>
                <Select value={form.state} onValueChange={(v) => set('state', v)}>
                  <SelectTrigger id="pay-state"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {BR_UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Com estes dados abrimos sua conta Brasil no ASAAS (instituição de pagamento autorizada pelo Banco Central) e sua conta global no Stripe, em seu nome. O ASAAS envia um e-mail para criar a senha e enviar documentos; o Stripe pede o aceite dos termos e confirma o que faltar.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {editing && <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Voltar</Button>}
            <Button type="submit" className="flex-1 gap-1.5 gradient-primary text-primary-foreground shadow-glow" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Abrir minha conta
            </Button>
          </div>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbroad((x) => !x)}>
            Não tem CPF/CNPJ ou mora fora do Brasil? Abra só a conta global
          </button>
          {abroad && <GlobalAccountCard overview={overview} onChange={onChange} />}
        </form>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="glass glass-border relative overflow-hidden rounded-2xl p-5 sm:p-6" aria-labelledby="pay-open-title" data-testid="pay-onboarding">
      <div className="relative space-y-4">
        <div>
          <h3 id="pay-open-title" className="font-display font-semibold text-foreground">Abra sua conta Vertal Vibe Pay</h3>
          <p className="text-sm text-muted-foreground">Um cadastro só: conta Brasil (Pix, boleto, reais) e conta global (dólar, euro e +14 moedas).</p>
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
      {status.message}
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
