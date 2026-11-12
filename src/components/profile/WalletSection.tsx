import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, Wallet, QrCode, Plus, Star, Trash2, Loader2, ShieldCheck, Globe2, Copy, Check, HandCoins,
  Lock, BadgeCheck, Fingerprint, MoreHorizontal, ArrowUpRight, Link2, Clock, CircleCheck, CircleX, Sparkles,
} from 'lucide-react'
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { walletApi, brandLabel, isExpired, FUNDING_LABEL, type WalletCard, type WalletPix, type ConnectAccount, type WalletCharge } from '@/lib/wallet/api'
import { CHARGE_CURRENCIES, PLATFORM_FEE_MINOR, formatMinor, toMinorUnits, findCurrency } from '@/lib/wallet/currency'
import { loadStripe, type StripeJs } from '@/lib/wallet/stripe'
import { PIX_KEY_TYPES, PIX_COUNTRIES, validatePixKey, type PixKeyType } from '@/lib/wallet/pix'

const countryFlag = (code: string) => PIX_COUNTRIES.find((c) => c.code === code)?.flag ?? code
const PIX_TEAL = '#32BCAD' // cor oficial da marca Pix (Banco Central)

// Gradientes por bandeira: o cartão na tela lembra o plástico de verdade.
const BRAND_SKIN: Record<string, string> = {
  visa: 'from-[#1a1f71] via-[#2a3a9f] to-[#0e1240]',
  mastercard: 'from-[#2b2b2b] via-[#3d2a1f] to-[#120c08]',
  amex: 'from-[#1f6fb5] via-[#2e8bd6] to-[#0d3f6e]',
  elo: 'from-[#111111] via-[#2a2a2a] to-[#000000]',
  hipercard: 'from-[#8c1515] via-[#b11d1d] to-[#4f0b0b]',
  discover: 'from-[#3a3a3a] via-[#5a4632] to-[#1c1c1c]',
  default: 'from-[#2d1b69] via-[#4c2a9a] to-[#120a2e]',
}

function BrandMark({ brand }: { brand: string }) {
  const b = brand?.toLowerCase()
  if (b === 'mastercard') {
    return (
      <span className="relative flex h-6 w-10" aria-label="Mastercard">
        <span className="absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]" />
        <span className="absolute right-0 h-6 w-6 rounded-full bg-[#f79e1b] mix-blend-screen opacity-90" />
      </span>
    )
  }
  return (
    <span className={`text-white font-bold tracking-wide ${b === 'visa' ? 'italic text-xl' : 'text-sm uppercase'}`}>
      {brandLabel(brand)}
    </span>
  )
}

function CardVisual({ card }: { card: WalletCard }) {
  const skin = BRAND_SKIN[card.brand?.toLowerCase()] ?? BRAND_SKIN.default
  const expired = isExpired(card)
  return (
    <div
      className={`relative aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${skin} p-5 text-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 ${expired ? 'grayscale opacity-70' : ''}`}
    >
      {/* brilho e textura */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.08),transparent_60%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-10 rounded-md bg-gradient-to-br from-[#f5d77a] via-[#d4af37] to-[#9c7c1c] shadow-inner">
              <div className="m-1 h-5 rounded-sm border border-black/20" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/70">{FUNDING_LABEL[card.funding]}</span>
          </div>
          {card.isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
              <Star className="h-3 w-3 fill-current" />Padrão
            </span>
          )}
        </div>
        <p className="font-mono text-lg tracking-[0.18em] sm:text-xl">•••• •••• •••• {card.last4}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">{card.label ? 'Apelido' : 'Titular'}</p>
            <p className="truncate text-sm font-medium uppercase">{card.label || card.holderName || 'Seu cartão'}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">{expired ? 'Vencido' : 'Validade'}</p>
            <p className="font-mono text-sm">{String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}</p>
          </div>
          <BrandMark brand={card.brand} />
        </div>
      </div>
    </div>
  )
}

function PixLogo({ className = 'h-5 w-5' }: { className?: string }) {
  // Losango estilizado na cor oficial do Pix.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill={PIX_TEAL} d="M12 2.2 21.8 12 12 21.8 2.2 12Z" opacity=".18" />
      <path fill="none" stroke={PIX_TEAL} strokeWidth="2.2" strokeLinejoin="round" d="M7 9.5 9.5 7a3.5 3.5 0 0 1 5 0L17 9.5M7 14.5 9.5 17a3.5 3.5 0 0 0 5 0l2.5-2.5" />
    </svg>
  )
}

function TrustStrip() {
  const items = [
    { icon: Lock, title: 'PCI DSS nível 1', text: 'Cartão digitado direto no Stripe' },
    { icon: Fingerprint, title: 'AES-256-GCM', text: 'Chaves Pix cifradas em repouso' },
    { icon: BadgeCheck, title: 'LGPD', text: 'Só você vê e remove seus dados' },
  ]
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, text, action, onAction }: {
  icon: ReactNode; title: string; text: string; action: string; onAction: () => void
}) {
  return (
    <button
      onClick={onAction}
      className="group flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background/30 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 transition-transform group-hover:scale-105">{icon}</span>
      <span className="font-display font-semibold text-foreground">{title}</span>
      <span className="max-w-xs text-sm text-muted-foreground">{text}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary"><Plus className="h-4 w-4" />{action}</span>
    </button>
  )
}

function Skeleton() {
  return <div className="aspect-[1.586] w-full animate-pulse rounded-2xl bg-muted/50" />
}

export default function WalletSection() {
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<WalletCard[]>([])
  const [pix, setPix] = useState<WalletPix[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [receiveFrom, setReceiveFrom] = useState<WalletPix | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; what: string } | null>(null)

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
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass glass-border relative overflow-hidden rounded-2xl p-6 sm:p-8 space-y-6"
      data-testid="wallet-section"
      aria-labelledby="wallet-title"
    >
      <div className="pointer-events-none absolute -top-24 right-0 h-48 w-72 rounded-full bg-primary/15 blur-3xl" />

      {/* Cabeçalho */}
      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary shadow-glow">
            <Wallet className="h-5 w-5 text-primary-foreground" />
          </span>
          <div>
            <h3 id="wallet-title" className="font-display text-lg font-semibold text-foreground">Carteira</h3>
            <p className="text-sm text-muted-foreground">Cartões e Pix para pagar e receber no Vertal Dev</p>
          </div>
        </div>
        <div className="flex gap-2 text-center">
          <div className="rounded-xl bg-secondary/50 px-3 py-1.5">
            <p className="font-display text-base font-bold text-foreground">{loading ? '–' : cards.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cartões</p>
          </div>
          <div className="rounded-xl bg-secondary/50 px-3 py-1.5">
            <p className="font-display text-base font-bold text-foreground">{loading ? '–' : pix.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Chaves Pix</p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="cards" className="relative">
        <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="cards" className="gap-2 rounded-lg"><CreditCard className="h-4 w-4" />Cartões</TabsTrigger>
          <TabsTrigger value="pix" className="gap-2 rounded-lg"><PixLogo className="h-4 w-4" />Pix</TabsTrigger>
          <TabsTrigger value="receive" className="gap-2 rounded-lg"><HandCoins className="h-4 w-4" />Receber</TabsTrigger>
        </TabsList>

        {/* ── Cartões ───────────────────────────────────────────── */}
        <TabsContent value="cards" className="pt-5">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2"><Skeleton /><Skeleton /></div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-6 w-6 text-primary" />}
              title="Nenhum cartão ainda"
              text="Adicione um cartão de crédito ou débito, de qualquer país. O número nunca passa pelos nossos servidores."
              action="Adicionar cartão"
              onAction={() => setCardOpen(true)}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {cards.map((c) => (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="group relative"
                      data-testid="wallet-card"
                    >
                      <CardVisual card={c} />
                      <div className="absolute right-3 top-12 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <ItemMenu
                          busy={busyId === c.id}
                          isDefault={c.isDefault}
                          onDefault={() => run(c.id, () => walletApi.setDefault(c.id), 'Cartão definido como padrão')}
                          onRemove={() => setConfirmRemove({ id: c.id, what: `o cartão final ${c.last4}` })}
                          light
                        />
                      </div>
                      {c.country && (
                        <p className="mt-2 px-1 text-[11px] text-muted-foreground">Emitido em {c.country}</p>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <button
                  onClick={() => setCardOpen(true)}
                  className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/30 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="h-6 w-6" />Adicionar cartão
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Pix ──────────────────────────────────────────────── */}
        <TabsContent value="pix" className="pt-5 space-y-4">
          {loading ? (
            <div className="space-y-3"><div className="h-20 animate-pulse rounded-2xl bg-muted/50" /><div className="h-20 animate-pulse rounded-2xl bg-muted/50" /></div>
          ) : pix.length === 0 ? (
            <EmptyState
              icon={<PixLogo className="h-7 w-7" />}
              title="Nenhuma chave Pix ainda"
              text="Cadastre CPF, CNPJ, e-mail, celular ou chave aleatória para receber com QR Code."
              action="Adicionar chave Pix"
              onAction={() => setPixOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {pix.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 transition-colors hover:border-[#32BCAD]/40"
                    data-testid="wallet-pix"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${PIX_TEAL}1f` }}>
                      <PixLogo className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">{p.label || PIX_KEY_TYPES.find((t) => t.value === p.keyType)?.label}</span>
                        <Badge variant="secondary" className="text-[10px]">{PIX_KEY_TYPES.find((t) => t.value === p.keyType)?.label}</Badge>
                        {p.isDefault && <Badge className="gap-1 text-[10px]"><Star className="h-2.5 w-2.5 fill-current" />Padrão</Badge>}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-sm text-muted-foreground">{p.maskedKey}</p>
                      <p className="mt-1 text-sm leading-none" title="Países onde você usa este Pix">
                        {p.countries.map((c) => <span key={c} className="mr-1">{countryFlag(c)}</span>)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setReceiveFrom(p)}
                      className="hidden gap-1.5 text-white sm:inline-flex"
                      style={{ backgroundColor: PIX_TEAL }}
                    >
                      <QrCode className="h-4 w-4" />Receber
                    </Button>
                    <ItemMenu
                      busy={busyId === p.id}
                      isDefault={p.isDefault}
                      onReceive={() => setReceiveFrom(p)}
                      onDefault={() => run(p.id, () => walletApi.setDefault(p.id), 'Chave Pix definida como padrão')}
                      onRemove={() => setConfirmRemove({ id: p.id, what: `a chave Pix ${p.maskedKey}` })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button variant="outline" className="h-11 w-full gap-2 rounded-xl" onClick={() => setPixOpen(true)}>
                <Plus className="h-4 w-4" />Adicionar chave Pix
              </Button>
            </div>
          )}
          <div className="flex items-start gap-2.5 rounded-xl bg-secondary/40 p-3">
            <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A chave Pix é sempre de uma conta no Brasil. Fora do país, o Pix é aceito em comércios parceiros de{' '}
              {PIX_COUNTRIES.filter((c) => !c.domestic).map((c) => `${c.flag} ${c.name}`).join(', ')}, com conversão de moeda no app do seu banco.
            </p>
          </div>
        </TabsContent>
        {/* ── Receber com Stripe ───────────────────────────────── */}
        <TabsContent value="receive" className="pt-5">
          <ReceiveTab />
        </TabsContent>
      </Tabs>

      <TrustStrip />

      <AddCardDialog open={cardOpen} onOpenChange={setCardOpen} onAdded={refresh} />
      <AddPixDialog open={pixOpen} onOpenChange={setPixOpen} onAdded={refresh} />
      <ReceivePixDialog pix={receiveFrom} onClose={() => setReceiveFrom(null)} />

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da carteira?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos remover {confirmRemove?.what}. Você pode adicionar de novo quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = confirmRemove
                setConfirmRemove(null)
                if (target) run(target.id, () => walletApi.remove(target.id), 'Removido da carteira')
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  )
}

// ── Receber com Stripe Connect (qualquer moeda) ────────────────────────────
const CHARGE_STATUS: Record<WalletCharge['status'], { label: string; icon: typeof Clock; cls: string }> = {
  open: { label: 'Aguardando', icon: Clock, cls: 'text-amber-400 bg-amber-400/10' },
  paid: { label: 'Pago', icon: CircleCheck, cls: 'text-emerald-400 bg-emerald-400/10' },
  expired: { label: 'Expirado', icon: CircleX, cls: 'text-muted-foreground bg-muted/40' },
  failed: { label: 'Falhou', icon: CircleX, cls: 'text-destructive bg-destructive/10' },
}

function ReceiveTab() {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<ConnectAccount | null>(null)
  const [charges, setCharges] = useState<WalletCharge[]>([])
  const [busy, setBusy] = useState<'onboard' | 'dashboard' | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [shown, setShown] = useState<WalletCharge | null>(null)

  const refresh = useCallback(async () => {
    try {
      const d = await walletApi.connectStatus()
      setAccount(d.account)
      setCharges(d.charges)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const go = async (kind: 'onboard' | 'dashboard') => {
    setBusy(kind)
    try {
      const { url } = kind === 'onboard' ? await walletApi.connectOnboard() : await walletApi.connectDashboard()
      window.location.assign(url)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(null)
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />

  const ready = !!account?.chargesEnabled
  const paidTotals = charges.filter((c) => c.status === 'paid').reduce<Record<string, number>>((acc, c) => {
    acc[c.currency] = (acc[c.currency] ?? 0) + c.amountMinor
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Estado da conta */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-[#635bff]/20 via-background/40 to-background/20 p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#635bff]/30 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#635bff] text-lg font-bold text-white shadow-lg">S</span>
            <div>
              <p className="font-display font-semibold text-foreground">
                {ready ? 'Recebimentos ativos' : account ? 'Verificação em andamento' : 'Receba em qualquer moeda'}
              </p>
              <p className="text-sm text-muted-foreground">
                {ready
                  ? `Conta ${account?.country ?? ''} · repasse em ${account?.defaultCurrency ?? 'BRL'}${account?.payoutsEnabled ? '' : ' · saque pendente'}`
                  : account
                    ? `Faltam ${account.pendingRequirements || 'alguns'} dados no Stripe para liberar as cobranças`
                    : 'Real, dólar, euro e mais 13 moedas, com cartão e carteiras digitais'}
              </p>
            </div>
          </div>
          {ready ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => go('dashboard')}>
                {busy === 'dashboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Painel
              </Button>
              <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />Nova cobrança
              </Button>
            </div>
          ) : (
            <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={busy !== null} onClick={() => go('onboard')}>
              {busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {account ? 'Continuar verificação' : 'Ativar com Stripe'}
            </Button>
          )}
        </div>
        {Object.keys(paidTotals).length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {Object.entries(paidTotals).map(([cur, minor]) => (
              <span key={cur} className="rounded-xl bg-background/60 px-3 py-1.5 text-sm font-semibold text-foreground">
                {findCurrency(cur)?.flag} {formatMinor(minor, cur)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Cobranças */}
      {charges.length > 0 && (
        <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-background/40">
          {charges.map((c) => {
            const st = CHARGE_STATUS[c.status]
            const Icon = st.icon
            return (
              <button
                key={c.id}
                disabled={!c.url}
                onClick={() => setShown(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-primary/5"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${st.cls}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.description || 'Pagamento'}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {st.label}</p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{formatMinor(c.amountMinor, c.currency)}</span>
              </button>
            )
          })}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Taxa da plataforma: 1 centavo por cobrança, na moeda cobrada ({formatMinor(PLATFORM_FEE_MINOR, 'BRL')}, {formatMinor(PLATFORM_FEE_MINOR, 'USD')}, {formatMinor(PLATFORM_FEE_MINOR, 'EUR')}). As tarifas do Stripe aparecem no seu painel. O valor cai na sua conta Stripe e é repassado ao seu banco.
      </p>

      <NewChargeDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => { setShown(c); refresh() }} />
      <ChargeLinkDialog charge={shown} onClose={() => setShown(null)} />
    </div>
  )
}

function NewChargeDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: (c: WalletCharge) => void
}) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setAmount(''); setDescription('') } }, [open])

  const value = Number(amount.replace(/\./g, '').replace(',', '.'))
  const minor = toMinorUnits(value, currency)

  const submit = async () => {
    if (minor === null) return toast.error('Informe um valor válido')
    setSaving(true)
    try {
      const { charge } = await walletApi.connectCharge({ amount: value, currency, description: description.trim() || undefined })
      onOpenChange(false)
      onCreated(charge)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-primary" />Nova cobrança</DialogTitle>
          <DialogDescription>Gere um link de pagamento seguro do Stripe. Seu cliente paga com cartão, Apple Pay ou Google Pay.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="charge-amount">Valor</Label>
              <Input id="charge-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 font-mono text-lg" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge-currency">Moeda</Label>
              <select
                id="charge-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-12 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CHARGE_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="charge-desc">Descrição (opcional)</Label>
            <Input id="charge-desc" maxLength={120} placeholder="Ex.: Consultoria de novembro" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {minor !== null && (
            <div className="space-y-1 rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Cliente paga</span><span className="font-mono">{formatMinor(minor, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxa da plataforma</span><span className="font-mono">− {formatMinor(PLATFORM_FEE_MINOR, currency)}</span></div>
              <p className="pt-1 text-[11px] text-muted-foreground">Mais as tarifas do Stripe, descontadas na sua conta.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || minor === null} className="gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Gerar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChargeLinkDialog({ charge, onClose }: { charge: WalletCharge | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => { setCopied(false) }, [charge])
  const copy = async () => {
    if (!charge?.url) return
    await navigator.clipboard.writeText(charge.url)
    setCopied(true)
    toast.success('Link copiado')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Dialog open={!!charge} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrança de {charge ? formatMinor(charge.amountMinor, charge.currency) : ''}</DialogTitle>
          <DialogDescription>{charge?.description || 'Envie o link ou mostre o QR Code para o cliente.'}</DialogDescription>
        </DialogHeader>
        {charge?.url && (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5">
              <QRCodeSVG value={charge.url} size={200} level="M" fgColor="#1a1446" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado' : 'Copiar link'}
              </Button>
              <Button asChild className="flex-1 gap-2 bg-[#635bff] text-white hover:bg-[#5249e0]">
                <a href={charge.url} target="_blank" rel="noopener noreferrer"><ArrowUpRight className="h-4 w-4" />Abrir</a>
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">O link expira em 24 horas.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ItemMenu({ busy, isDefault, onDefault, onRemove, onReceive, light }: {
  busy: boolean; isDefault: boolean; onDefault: () => void; onRemove: () => void; onReceive?: () => void; light?: boolean
}) {
  if (busy) return <Loader2 className={`h-5 w-5 animate-spin ${light ? 'text-white' : 'text-primary'}`} />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon" aria-label="Opções"
          className={light ? 'h-8 w-8 rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 hover:text-white' : 'shrink-0'}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onReceive && (
          <DropdownMenuItem onClick={onReceive} className="gap-2"><HandCoins className="h-4 w-4" />Receber com QR Code</DropdownMenuItem>
        )}
        {!isDefault && (
          <DropdownMenuItem onClick={onDefault} className="gap-2"><Star className="h-4 w-4" />Definir como padrão</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRemove} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />Remover</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            Crédito ou débito, de qualquer país. Os dados vão direto para o Stripe; guardamos só a bandeira e os 4 últimos dígitos.
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}Salvar cartão com segurança
          </Button>
        </DialogFooter>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />Processado pelo Stripe · certificado PCI DSS nível 1
        </p>
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}Salvar chave Pix
          </Button>
        </DialogFooter>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5 text-primary" />Cifrada com AES-256-GCM · só você vê a chave
        </p>
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
          <DialogTitle className="flex items-center gap-2"><PixLogo />Receber via Pix</DialogTitle>
          <DialogDescription>
            {pix ? `Chave ${pix.maskedKey}. ` : ''}Gera um QR Code estático no padrão BR Code do Banco Central.
          </DialogDescription>
        </DialogHeader>
        {brCode ? (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5">
              <QRCodeSVG value={brCode} size={220} level="M" fgColor="#0b1f1d" />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[#0b1f1d]"><PixLogo className="h-4 w-4" />Pague com Pix</p>
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
