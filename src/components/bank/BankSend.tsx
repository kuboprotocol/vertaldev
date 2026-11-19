import { useEffect, useMemo, useState } from 'react'
import { Landmark, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { walletApi, type WalletPix } from '@/lib/wallet/api'
import { formatMinor, findCurrency } from '@/lib/wallet/currency'
import { PIX_KEY_TYPES, validatePixKey, type PixKeyType } from '@/lib/wallet/pix'
import { bankApi, type BankOverview } from '@/lib/bank/api'

export function BankSend({ overview, onSent }: { overview: BankOverview | null; onSent: () => void }) {
  const [savedPix, setSavedPix] = useState<WalletPix[]>([])
  const [pixSource, setPixSource] = useState<string>('new')
  const [keyType, setKeyType] = useState<PixKeyType>('cpf')
  const [key, setKey] = useState('')
  const [pixAmount, setPixAmount] = useState('')
  const [pixDesc, setPixDesc] = useState('')
  const [poCurrency, setPoCurrency] = useState('')
  const [poAmount, setPoAmount] = useState('')
  const [confirm, setConfirm] = useState<null | 'pix' | 'payout'>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { walletApi.list().then((d) => setSavedPix(d.pix)).catch(() => undefined) }, [])

  const asaasBalance = overview?.asaas.balance?.availableMinor ?? null
  const asaasApproved = overview?.asaas.account?.status === 'approved'
  const stripeBalances = useMemo(() => (overview?.stripe.balances ?? []).filter((b) => b.availableMinor > 0), [overview])
  const payoutsEnabled = Boolean(overview?.stripe.account?.payoutsEnabled)
  useEffect(() => { if (!poCurrency && stripeBalances[0]) setPoCurrency(stripeBalances[0].currency) }, [stripeBalances, poCurrency])

  const pixAmountNum = Number(pixAmount.replace(',', '.'))
  const poAmountNum = Number(poAmount.replace(',', '.'))
  const keyError = pixSource === 'new' && key ? validatePixKey(keyType, key) : null

  const doSend = async () => {
    setBusy(true)
    try {
      if (confirm === 'pix') {
        const base = { amount: pixAmountNum, description: pixDesc || undefined }
        const r = pixSource === 'new'
          ? await bankApi.sendPix({ ...base, pixKeyType: keyType, pixKey: key })
          : await bankApi.sendPix({ ...base, pixId: pixSource })
        toast.success(r.authorized ? 'Pix enviado' : 'Pix criado, aguardando autorização no ASAAS')
        setPixAmount(''); setKey(''); setPixDesc('')
      } else if (confirm === 'payout') {
        await bankApi.payout({ amount: poAmountNum, currency: poCurrency, idempotencyKey: crypto.randomUUID() })
        toast.success('Saque solicitado')
        setPoAmount('')
      }
      onSent()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const poBalance = stripeBalances.find((b) => b.currency === poCurrency)

  return (
    <Tabs defaultValue="pix">
      <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
        <TabsTrigger value="pix" className="gap-2 rounded-lg"><Send className="h-4 w-4" />Pix (BRL)</TabsTrigger>
        <TabsTrigger value="payout" className="gap-2 rounded-lg"><Landmark className="h-4 w-4" />Saque global</TabsTrigger>
      </TabsList>

      <TabsContent value="pix" className="space-y-3 pt-4">
        <p className="text-xs text-muted-foreground">
          Sai do saldo da sua conta ASAAS{asaasBalance !== null ? ` · disponível ${formatMinor(asaasBalance, 'BRL')}` : ''}
          {overview ? ` · até ${formatMinor(overview.flags.pixOutMaxBrl * 100, 'BRL')} por Pix` : ''}
        </p>
        <Select value={pixSource} onValueChange={setPixSource}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Digitar chave Pix</SelectItem>
            {savedPix.map((p) => <SelectItem key={p.id} value={p.id}>{p.label || p.keyType.toUpperCase()} · {p.maskedKey}</SelectItem>)}
          </SelectContent>
        </Select>
        {pixSource === 'new' && (
          <div className="grid grid-cols-[130px_1fr] gap-2">
            <Select value={keyType} onValueChange={(v) => setKeyType(v as PixKeyType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PIX_KEY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder={PIX_KEY_TYPES.find((t) => t.value === keyType)?.placeholder} value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={!!keyError} />
          </div>
        )}
        {keyError && <p className="text-xs text-destructive">{keyError}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
            <Input inputMode="decimal" placeholder="0,00" value={pixAmount} onChange={(e) => setPixAmount(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensagem (opcional)</Label>
            <Input maxLength={140} value={pixDesc} onChange={(e) => setPixDesc(e.target.value)} />
          </div>
        </div>
        <Button
          className="h-11 w-full gradient-primary text-primary-foreground"
          disabled={!asaasApproved || !(pixAmountNum > 0) || (pixSource === 'new' && (!key || !!keyError))}
          onClick={() => setConfirm('pix')}
        >
          Revisar Pix
        </Button>
        {!asaasApproved && <p className="text-xs text-muted-foreground">Disponível quando sua conta ASAAS estiver aprovada (aba Contas).</p>}
      </TabsContent>

      <TabsContent value="payout" className="space-y-3 pt-4">
        <p className="text-xs text-muted-foreground">
          Transfere o saldo da conta global (Stripe) para a conta bancária cadastrada nela, na moeda do saldo.
        </p>
        {stripeBalances.length === 0 ? (
          <p className="rounded-xl bg-secondary/40 p-3 text-sm text-muted-foreground">Sem saldo disponível na conta global.</p>
        ) : (
          <>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <Select value={poCurrency} onValueChange={setPoCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stripeBalances.map((b) => <SelectItem key={b.currency} value={b.currency}>{findCurrency(b.currency)?.flag ?? ''} {b.currency}</SelectItem>)}</SelectContent>
              </Select>
              <Input inputMode="decimal" placeholder="0,00" value={poAmount} onChange={(e) => setPoAmount(e.target.value)} className="font-mono" />
            </div>
            {poBalance && <p className="text-xs text-muted-foreground">Disponível: {formatMinor(poBalance.availableMinor, poBalance.currency)}</p>}
            <Button className="h-11 w-full" variant="outline" disabled={!payoutsEnabled || !(poAmountNum > 0)} onClick={() => setConfirm('payout')}>
              Revisar saque
            </Button>
            {!payoutsEnabled && <p className="text-xs text-muted-foreground">O Stripe ainda não liberou saques nesta conta.</p>}
          </>
        )}
      </TabsContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'pix' ? 'Confirmar Pix' : 'Confirmar saque'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'pix'
                ? `Enviar ${pixAmountNum > 0 ? formatMinor(Math.round(pixAmountNum * 100), 'BRL') : ''} para ${pixSource === 'new' ? key : savedPix.find((p) => p.id === pixSource)?.maskedKey}. Pix não pode ser desfeito.`
                : `Sacar ${poAmountNum > 0 && poCurrency ? formatMinor(Math.round(poAmountNum * 10 ** (findCurrency(poCurrency)?.decimals ?? 2)), poCurrency) : ''} para a conta bancária da conta global.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doSend() }} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  )
}
