import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Wallet, QrCode, Plus, Star, Trash2, Loader2, ShieldCheck, Globe2, Copy, Check, HandCoins } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { walletApi, brandLabel, isExpired, FUNDING_LABEL, type WalletCard, type WalletPix } from '@/lib/wallet/api'
import { loadStripe, type StripeJs } from '@/lib/wallet/stripe'
import { PIX_KEY_TYPES, PIX_COUNTRIES, validatePixKey, type PixKeyType } from '@/lib/wallet/pix'

const countryFlag = (code: string) => PIX_COUNTRIES.find((c) => c.code === code)?.flag ?? code

export default function WalletSection() {
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<WalletCard[]>([])
  const [pix, setPix] = useState<WalletPix[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [receiveFrom, setReceiveFrom] = useState<WalletPix | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await walletApi.list()
      setCards(data.cards)
      setPix(data.pix)
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao carregar a carteira')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass glass-border rounded-2xl p-8 space-y-5"
      data-testid="wallet-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground font-display">Carteira</h3>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Cartões protegidos pelo Stripe · chaves Pix cifradas
        </span>
      </div>

      <Tabs defaultValue="cards">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="cards" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Cartões</TabsTrigger>
          <TabsTrigger value="pix" className="gap-1.5"><QrCode className="h-3.5 w-3.5" />Pix</TabsTrigger>
        </TabsList>

        {/* ── Cartões ───────────────────────────────────────────── */}
        <TabsContent value="cards" className="space-y-3 pt-3">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : cards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum cartão salvo.</p>
          ) : (
            cards.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 p-4" data-testid="wallet-card">
                <div className="h-10 w-14 shrink-0 rounded-md bg-gradient-to-br from-primary/70 to-primary/20 flex items-end justify-end p-1.5">
                  <span className="text-[9px] font-bold text-primary-foreground uppercase">{brandLabel(c.brand)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{c.label || brandLabel(c.brand)} •••• {c.last4}</span>
                    <Badge variant="secondary" className="text-[10px]">{FUNDING_LABEL[c.funding]}</Badge>
                    {c.isDefault && <Badge className="text-[10px]">Padrão</Badge>}
                    {isExpired(c) && <Badge variant="destructive" className="text-[10px]">Vencido</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Validade {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
                    {c.country ? ` · emitido em ${c.country}` : ''}
                  </p>
                </div>
                <ItemActions
                  busy={busyId === c.id}
                  isDefault={c.isDefault}
                  onDefault={() => run(c.id, () => walletApi.setDefault(c.id), 'Cartão definido como padrão')}
                  onRemove={() => run(c.id, () => walletApi.remove(c.id), 'Cartão removido')}
                />
              </div>
            ))
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => setCardOpen(true)}>
            <Plus className="h-4 w-4" />Adicionar cartão de crédito ou débito
          </Button>
        </TabsContent>

        {/* ── Pix ──────────────────────────────────────────────── */}
        <TabsContent value="pix" className="space-y-3 pt-3">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : pix.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma chave Pix salva.</p>
          ) : (
            pix.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 p-4" data-testid="wallet-pix">
                <div className="h-10 w-10 shrink-0 rounded-md bg-primary/15 flex items-center justify-center">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{p.label || PIX_KEY_TYPES.find((t) => t.value === p.keyType)?.label}</span>
                    {p.isDefault && <Badge className="text-[10px]">Padrão</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{p.maskedKey}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" title="Países onde você usa este Pix">
                    {p.countries.map(countryFlag).join(' ')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setReceiveFrom(p)} title="Receber com QR Code" aria-label="Receber com QR Code">
                  <HandCoins className="h-4 w-4" />
                </Button>
                <ItemActions
                  busy={busyId === p.id}
                  isDefault={p.isDefault}
                  onDefault={() => run(p.id, () => walletApi.setDefault(p.id), 'Chave Pix definida como padrão')}
                  onRemove={() => run(p.id, () => walletApi.remove(p.id), 'Chave Pix removida')}
                />
              </div>
            ))
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => setPixOpen(true)}>
            <Plus className="h-4 w-4" />Adicionar chave Pix
          </Button>
          <p className="text-[11px] text-muted-foreground">
            A chave Pix é sempre de uma conta no Brasil. Fora do Brasil, o Pix é aceito em comércios parceiros de{' '}
            {PIX_COUNTRIES.filter((c) => !c.domestic).map((c) => c.name).join(', ')}, com conversão de moeda no app do seu banco.
          </p>
        </TabsContent>
      </Tabs>

      <AddCardDialog open={cardOpen} onOpenChange={setCardOpen} onAdded={refresh} />
      <AddPixDialog open={pixOpen} onOpenChange={setPixOpen} onAdded={refresh} />
      <ReceivePixDialog pix={receiveFrom} onClose={() => setReceiveFrom(null)} />
    </motion.div>
  )
}

function ItemActions({ busy, isDefault, onDefault, onRemove }: {
  busy: boolean; isDefault: boolean; onDefault: () => void; onRemove: () => void
}) {
  if (busy) return <Loader2 className="h-4 w-4 animate-spin text-primary" />
  return (
    <div className="flex shrink-0 gap-1">
      {!isDefault && (
        <Button variant="ghost" size="icon" onClick={onDefault} title="Definir como padrão" aria-label="Definir como padrão">
          <Star className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost" size="icon" title="Remover" aria-label="Remover"
        onClick={() => { if (window.confirm('Remover da carteira?')) onRemove() }}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ── Adicionar cartão (Stripe Payment Element, só cartão) ───────────────────
function AddCardDialog({ open, onOpenChange, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stripeRef = useRef<StripeJs>(null)
  const elementsRef = useRef<StripeJs>(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [label, setLabel] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let element: StripeJs = null
    setReady(false)
    ;(async () => {
      try {
        const { clientSecret, publishableKey } = await walletApi.cardSetup()
        const stripe = await loadStripe(publishableKey)
        if (cancelled) return
        const isDark = document.documentElement.classList.contains('dark')
        const elements = stripe.elements({
          clientSecret,
          locale: 'pt-BR',
          appearance: { theme: isDark ? 'night' : 'stripe', variables: { borderRadius: '10px' } },
        })
        element = elements.create('payment', { layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } })
        // O Dialog monta o conteúdo num portal; espera o nó existir.
        await new Promise((r) => requestAnimationFrame(r))
        if (cancelled || !mountRef.current) return
        element.mount(mountRef.current)
        element.on('ready', () => setReady(true))
        stripeRef.current = stripe
        elementsRef.current = elements
      } catch (e) {
        toast.error((e as Error).message || 'Não foi possível iniciar o cadastro do cartão')
        onOpenChange(false)
      }
    })()
    return () => {
      cancelled = true
      try { element?.destroy() } catch { /* já destruído */ }
      stripeRef.current = null
      elementsRef.current = null
    }
  }, [open, onOpenChange])

  const submit = async () => {
    if (!stripeRef.current || !elementsRef.current) return
    setSaving(true)
    try {
      const { error, setupIntent } = await stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/profile?wallet=card` },
      })
      if (error) throw new Error(error.message)
      await walletApi.cardAttach(setupIntent.id, label.trim() || undefined, makeDefault)
      toast.success('Cartão adicionado!')
      setLabel('')
      setMakeDefault(false)
      onOpenChange(false)
      onAdded()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar cartão</DialogTitle>
          <DialogDescription>
            Crédito ou débito, de qualquer país. Os dados do cartão vão direto para o Stripe; guardamos só a bandeira e o final.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div ref={mountRef} className="min-h-[180px]">
            {!ready && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-label" className="text-sm text-muted-foreground">Apelido (opcional)</Label>
            <Input id="card-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Nubank PJ" />
          </div>
          <label className="flex items-center justify-between text-sm">
            Usar como cartão padrão
            <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!ready || saving} className="w-full gradient-primary text-primary-foreground">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar cartão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Adicionar chave Pix ────────────────────────────────────────────────────
function AddPixDialog({ open, onOpenChange, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void
}) {
  const [keyType, setKeyType] = useState<PixKeyType>('cpf')
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [countries, setCountries] = useState<string[]>(['BR'])
  const [makeDefault, setMakeDefault] = useState(false)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const error = touched ? validatePixKey(keyType, key) : null
  const placeholder = PIX_KEY_TYPES.find((t) => t.value === keyType)?.placeholder

  const reset = () => {
    setKeyType('cpf'); setKey(''); setLabel(''); setCountries(['BR']); setMakeDefault(false); setTouched(false)
  }

  const toggleCountry = (code: string) => {
    if (code === 'BR') return // a chave é sempre de conta brasileira
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const submit = async () => {
    setTouched(true)
    if (validatePixKey(keyType, key)) return
    setSaving(true)
    try {
      await walletApi.pixAdd({ keyType, key, label: label.trim() || undefined, countries, makeDefault })
      toast.success('Chave Pix adicionada!')
      reset()
      onOpenChange(false)
      onAdded()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar chave Pix</DialogTitle>
          <DialogDescription>A chave fica cifrada; na carteira aparece só a versão mascarada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Tipo de chave</Label>
            <div className="flex flex-wrap gap-1.5">
              {PIX_KEY_TYPES.map((t) => (
                <Button
                  key={t.value} type="button" size="sm"
                  variant={keyType === t.value ? 'default' : 'outline'}
                  onClick={() => { setKeyType(t.value); setTouched(false) }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pix-key" className="text-sm text-muted-foreground">Chave</Label>
            <Input
              id="pix-key" value={key} placeholder={placeholder} autoComplete="off"
              inputMode={keyType === 'cpf' || keyType === 'cnpj' || keyType === 'phone' ? 'numeric' : 'text'}
              onChange={(e) => setKey(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pix-label" className="text-sm text-muted-foreground">Apelido (opcional)</Label>
            <Input id="pix-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Conta Itaú" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Globe2 className="h-3.5 w-3.5" />Onde você usa este Pix
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PIX_COUNTRIES.map((c) => (
                <Button
                  key={c.code} type="button" size="sm"
                  variant={countries.includes(c.code) ? 'default' : 'outline'}
                  disabled={c.domestic}
                  onClick={() => toggleCountry(c.code)}
                  className="gap-1"
                >
                  <span>{c.flag}</span>{c.name}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fora do Brasil o Pix funciona só em comércios parceiros, via empresas de câmbio.
            </p>
          </div>
          <label className="flex items-center justify-between text-sm">
            Usar como Pix padrão
            <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="w-full gradient-primary text-primary-foreground">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar chave Pix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Receber via Pix: gera BR Code (copia e cola) + QR Code ─────────────────
function ReceivePixDialog({ pix, onClose }: { pix: WalletPix | null; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('Sao Paulo')
  const [description, setDescription] = useState('')
  const [brCode, setBrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (!pix) { setBrCode(null); setAmount(''); setDescription(''); setCopied(false) } }, [pix])

  const generate = async () => {
    if (!pix) return
    const value = amount.trim() ? Number(amount.replace(/\./g, '').replace(',', '.')) : 0
    if (Number.isNaN(value) || value < 0) return toast.error('Valor inválido')
    setLoading(true)
    try {
      const res = await walletApi.pixBrCode({
        id: pix.id, amount: value, merchantName: name, merchantCity: city, description: description || undefined,
      })
      setBrCode(res.brCode)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!brCode) return
    await navigator.clipboard.writeText(brCode)
    setCopied(true)
    toast.success('Pix copia e cola copiado!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={!!pix} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receber via Pix</DialogTitle>
          <DialogDescription>
            {pix ? `Chave ${pix.maskedKey}. ` : ''}Gera um QR Code estático no padrão BR Code do Banco Central.
          </DialogDescription>
        </DialogHeader>
        {brCode ? (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-xl bg-white p-4">
              <QRCodeSVG value={brCode} size={220} level="M" />
            </div>
            <div className="flex gap-2">
              <Input readOnly value={brCode} className="text-xs font-mono bg-muted/30" />
              <Button variant="outline" size="icon" onClick={copy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setBrCode(null)}>Gerar outro</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rx-amount" className="text-sm text-muted-foreground">Valor em R$ (vazio = quem paga digita)</Label>
              <Input id="rx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rx-name" className="text-sm text-muted-foreground">Nome do recebedor</Label>
                <Input id="rx-name" maxLength={25} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rx-city" className="text-sm text-muted-foreground">Cidade</Label>
                <Input id="rx-city" maxLength={15} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rx-desc" className="text-sm text-muted-foreground">Descrição (opcional)</Label>
              <Input id="rx-desc" maxLength={40} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button onClick={generate} disabled={loading || !name.trim() || !city.trim()} className="w-full gradient-primary text-primary-foreground">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Gerar QR Code
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
