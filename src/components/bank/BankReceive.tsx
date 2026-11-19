import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Barcode, CreditCard, Link2, Loader2, QrCode, Copy, ExternalLink, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { walletApi } from '@/lib/wallet/api'
import { CHARGE_CURRENCIES, formatMinor, toMinorUnits } from '@/lib/wallet/currency'
import { routeReceive, type ReceiveMethod } from '@/lib/bank/routing'
import { bankApi, type BankOverview } from '@/lib/bank/api'
import { ProviderDot } from './BankStatement'

const METHODS: { value: ReceiveMethod; label: string; icon: typeof QrCode; hint: string }[] = [
  { value: 'pix', label: 'Pix', icon: QrCode, hint: 'QR Code e copia e cola, cai na hora' },
  { value: 'boleto', label: 'Boleto', icon: Barcode, hint: 'Compensa em até 3 dias úteis' },
  { value: 'card', label: 'Cartão', icon: CreditCard, hint: 'Crédito, nacional ou internacional' },
  { value: 'link', label: 'Link', icon: Link2, hint: 'Um link para o cliente escolher como pagar' },
]

type Result =
  | { kind: 'pix'; payload: string; image: string | null; amount: string }
  | { kind: 'boleto'; line: string | null; url: string | null; amount: string }
  | { kind: 'url'; url: string; amount: string; provider: 'stripe' | 'asaas' }

export function BankReceive({ overview, onCreated }: { overview: BankOverview | null; onCreated: () => void }) {
  const [method, setMethod] = useState<ReceiveMethod>('pix')
  const [currency, setCurrency] = useState('BRL')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payer, setPayer] = useState({ name: '', cpfCnpj: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const asaasReady = Boolean(overview?.flags.asaasConfigured && overview.asaas.account && overview.asaas.account.status !== 'rejected')
  const stripeReady = Boolean(overview?.stripe.account?.chargesEnabled)
  const brlOnly = method === 'pix' || method === 'boleto'
  const cur = brlOnly ? 'BRL' : currency
  const route = useMemo(() => routeReceive({ method, currency: cur, asaasReady, stripeReady }), [method, cur, asaasReady, stripeReady])
  const needsPayer = route.provider === 'asaas' && method !== 'link'
  const minor = toMinorUnits(Number(amount.replace(',', '.')), cur)

  const submit = async () => {
    if (minor === null) { toast.error('Valor inválido'); return }
    setBusy(true)
    try {
      const amountNum = Number(amount.replace(',', '.'))
      const label = formatMinor(minor, cur)
      if (route.provider === 'stripe') {
        const { charge } = await walletApi.connectCharge({ amount: amountNum, currency: cur, description: description || undefined })
        if (charge.url) setResult({ kind: 'url', url: charge.url, amount: label, provider: 'stripe' })
      } else if (route.provider === 'asaas') {
        const { transaction, pixImage } = await bankApi.receive({
          method,
          amount: amountNum,
          description: description || undefined,
          payer: needsPayer ? { name: payer.name, cpfCnpj: payer.cpfCnpj, email: payer.email || undefined } : undefined,
        })
        if (method === 'pix' && transaction.pixPayload) setResult({ kind: 'pix', payload: transaction.pixPayload, image: pixImage ?? null, amount: label })
        else if (method === 'boleto') setResult({ kind: 'boleto', line: transaction.boletoLine, url: transaction.url, amount: label })
        else if (transaction.url) setResult({ kind: 'url', url: transaction.url, amount: label, provider: 'asaas' })
      }
      toast.success('Cobrança criada')
      onCreated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (v: string, what: string) => { await navigator.clipboard.writeText(v); toast.success(`${what} copiado`) }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Como receber">
          {METHODS.map((m) => {
            const Icon = m.icon
            const active = method === m.value
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setMethod(m.value); setResult(null) }}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary/60 bg-primary/10' : 'border-border/60 bg-background/40 hover:border-primary/30'}`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium text-foreground">{m.label}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{m.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="rcv-amount" className="text-xs text-muted-foreground">Valor</Label>
            <Input id="rcv-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono text-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Moeda</Label>
            <Select value={cur} onValueChange={setCurrency} disabled={brlOnly}>
              <SelectTrigger className="h-11 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHARGE_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rcv-desc" className="text-xs text-muted-foreground">Descrição (opcional)</Label>
          <Input id="rcv-desc" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Projeto site institucional" />
        </div>

        {needsPayer && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs font-medium text-foreground">Quem vai pagar</p>
            <Input placeholder="Nome completo ou razão social" value={payer.name} onChange={(e) => setPayer({ ...payer, name: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="CPF ou CNPJ" inputMode="numeric" value={payer.cpfCnpj} onChange={(e) => setPayer({ ...payer, cpfCnpj: e.target.value })} />
              <Input placeholder="E-mail (opcional)" type="email" value={payer.email} onChange={(e) => setPayer({ ...payer, email: e.target.value })} />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex flex-wrap items-center gap-1">
            {route.provider ? <>Sai por <ProviderDot provider={route.provider} /> · </> : null}{route.reason}
            {overview && ` · taxa VERTAL ${(overview.flags.platformFeeRate * 100).toLocaleString('pt-BR')}%`}
          </span>
        </div>

        <Button onClick={submit} disabled={busy || !route.provider || minor === null} className="h-11 w-full gradient-primary text-primary-foreground">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Gerar cobrança
        </Button>
      </div>

      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background/40 to-background/10 p-5">
        {!result ? (
          <p className="max-w-[220px] text-center text-sm text-muted-foreground">O QR Code, o boleto ou o link aparecem aqui para você enviar ao cliente.</p>
        ) : result.kind === 'pix' ? (
          <div className="w-full space-y-3 text-center">
            <div className="mx-auto w-fit rounded-2xl bg-white p-3">
              {result.image
                ? <img src={`data:image/png;base64,${result.image}`} alt="QR Code Pix" className="h-48 w-48" />
                : <QRCodeSVG value={result.payload} size={192} />}
            </div>
            <p className="font-display text-xl font-bold text-foreground">{result.amount}</p>
            <Button variant="outline" className="w-full gap-2" onClick={() => copy(result.payload, 'Pix copia e cola')}><Copy className="h-4 w-4" />Copiar Pix copia e cola</Button>
          </div>
        ) : result.kind === 'boleto' ? (
          <div className="w-full space-y-3 text-center">
            <Barcode className="mx-auto h-10 w-10 text-primary" />
            <p className="font-display text-xl font-bold text-foreground">{result.amount}</p>
            {result.line && <Button variant="outline" className="w-full gap-2" onClick={() => copy(result.line!, 'Linha digitável')}><Copy className="h-4 w-4" />Copiar linha digitável</Button>}
            {result.url && <Button asChild className="w-full gap-2"><a href={result.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir boleto</a></Button>}
          </div>
        ) : (
          <div className="w-full space-y-3 text-center">
            <div className="mx-auto w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={result.url} size={160} /></div>
            <p className="flex items-center justify-center gap-2 font-display text-xl font-bold text-foreground">{result.amount} <ProviderDot provider={result.provider} /></p>
            <Button variant="outline" className="w-full gap-2" onClick={() => copy(result.url, 'Link')}><Copy className="h-4 w-4" />Copiar link</Button>
          </div>
        )}
      </div>
    </div>
  )
}
