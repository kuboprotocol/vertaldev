import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, Wallet, QrCode, Plus, Star, Trash2, Loader2, ShieldCheck, Globe2, Copy, Check, HandCoins,
  Lock, BadgeCheck, Fingerprint, MoreHorizontal, ArrowUpRight, Link2, Clock, CircleCheck, CircleX, Sparkles,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
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
import { walletApi, connectPendingText, brandLabel, isExpired, FUNDING_LABEL, type WalletCard, type WalletPix, type ConnectAccount, type WalletCharge } from '@/lib/wallet/api'
import { CHARGE_CURRENCIES, platformFeeFor, formatMinor, toMinorUnits, findCurrency } from '@/lib/wallet/currency'
import { loadStripe, type StripeJs } from '@/lib/wallet/stripe'
import { PIX_KEY_TYPES, PIX_COUNTRIES, validatePixKey, type PixKeyType } from '@/lib/wallet/pix'
import { PIX_KEY_LABEL_EN, PIX_KEY_PLACEHOLDER_EN, formatDate, pixKeyErrorEn, regionName } from '@/components/bank/payCopyEn'

const countryFlag = (code: string) => PIX_COUNTRIES.find((c) => c.code === code)?.flag ?? code
const pixKeyLabel = (t: PixKeyType) => PIX_KEY_LABEL_EN[t] ?? PIX_KEY_TYPES.find((x) => x.value === t)?.label
const PIX_TEAL = '#32BCAD' // official Pix brand color (Central Bank of Brazil)

// Gradients per card brand: the card on screen looks like the real one.
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
              <Star className="h-3 w-3 fill-current" />Default
            </span>
          )}
        </div>
        <p className="font-mono text-lg tracking-[0.18em] sm:text-xl">•••• •••• •••• {card.last4}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">{card.label ? 'Nickname' : 'Cardholder'}</p>
            <p className="truncate text-sm font-medium uppercase">{card.label || card.holderName || 'Your card'}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">{expired ? 'Expired' : 'Expires'}</p>
            <p className="font-mono text-sm">{String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}</p>
          </div>
          <BrandMark brand={card.brand} />
        </div>
      </div>
    </div>
  )
}

function PixLogo({ className = 'h-5 w-5' }: { className?: string }) {
  // Stylized diamond in the official Pix color.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill={PIX_TEAL} d="M12 2.2 21.8 12 12 21.8 2.2 12Z" opacity=".18" />
      <path fill="none" stroke={PIX_TEAL} strokeWidth="2.2" strokeLinejoin="round" d="M7 9.5 9.5 7a3.5 3.5 0 0 1 5 0L17 9.5M7 14.5 9.5 17a3.5 3.5 0 0 0 5 0l2.5-2.5" />
    </svg>
  )
}

function TrustStrip() {
  const items = [
    { icon: Lock, title: 'PCI DSS Level 1', text: 'Card details go straight to Stripe' },
    { icon: Fingerprint, title: 'AES-256-GCM', text: 'Pix keys are encrypted at rest' },
    { icon: BadgeCheck, title: 'LGPD', text: 'Only you can see and remove your data' },
  ]
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] p-3">
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
      className="group flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.1] px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 transition-transform group-hover:scale-105">{icon}</span>
      <span className="font-semibold text-foreground">{title}</span>
      <span className="max-w-xs text-sm text-muted-foreground">{text}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary"><Plus className="h-4 w-4" />{action}</span>
    </button>
  )
}

function Skeleton() {
  return <div className="aspect-[1.586] w-full animate-pulse rounded-2xl bg-muted/50" />
}

/**
 * Vertal Vibe Pay: cards and Pix (formerly "Carteira").
 * variant="profile": block in the profile, with a shortcut to /pay.
 * variant="bank": "Cards and Pix" tab inside /pay.
 */
export default function WalletSection({ variant = 'profile' }: { variant?: 'profile' | 'bank' } = {}) {
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
      toast.error((e as Error).message || 'Could not load Vertal Vibe Pay')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Back from a Stripe redirect (3D Secure / card issuer authentication) while
  // adding a card: finishes the card-attach the browser did not get to do.
  useEffect(() => {
    const url = new URL(window.location.href)
    const seti = url.searchParams.get('setup_intent')
    const status = url.searchParams.get('redirect_status')
    const setupSession = url.searchParams.get('setup_session')
    if (!seti && !setupSession) return
    ;['setup_intent', 'setup_intent_client_secret', 'redirect_status', 'wallet', 'setup_session'].forEach((k) => url.searchParams.delete(k))
    window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
    // Back from the Stripe hosted page (no publishable key set up).
    if (setupSession) {
      if (!setupSession.startsWith('cs_')) { toast.message('Adding the card was canceled.'); return }
      walletApi.cardAttachSession(setupSession)
        .then(() => { toast.success('Card added'); refresh() })
        .catch((e) => { if (!/já está|already in your/.test((e as Error).message)) toast.error((e as Error).message); refresh() })
      return
    }
    if (!seti) return
    if (status !== 'succeeded') {
      toast.error('The card issuer did not authorize the card. Try another card.')
      return
    }
    walletApi.cardAttach(seti)
      .then(() => { toast.success('Card added'); refresh() })
      .catch((e) => { if (!/já está|already in your/.test((e as Error).message)) toast.error((e as Error).message); refresh() })
  }, [refresh])

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
      className="relative space-y-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-card/50 p-6 sm:p-8"
      data-testid="wallet-section"
      aria-labelledby="wallet-title"
    >

      {/* Header */}
      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </span>
          <div>
            <h3 id="wallet-title" className="text-lg font-semibold text-foreground">
              {variant === 'bank' ? 'Cards and Pix' : <span translate="no">Vertal Vibe Pay</span>}
            </h3>
            <p className="text-sm text-muted-foreground">
              {variant === 'bank' ? 'Your saved cards and Pix keys' : 'Brazil account, global account, cards and Pix in Vertal Dev'}
            </p>
          </div>
        </div>
        {variant === 'profile' && (
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link to="/pay"><ArrowUpRight className="h-4 w-4" />Open Vertal Vibe Pay</Link>
          </Button>
        )}
        <div className="flex gap-2 text-center">
          <div className="rounded-xl bg-white/[0.04] px-3 py-1.5">
            <p className="text-base font-semibold text-foreground">{loading ? '–' : cards.length}</p>
            <p className="text-[11px] text-muted-foreground">Cards</p>
          </div>
          <div className="rounded-xl bg-white/[0.04] px-3 py-1.5">
            <p className="text-base font-semibold text-foreground">{loading ? '–' : pix.length}</p>
            <p className="text-[11px] text-muted-foreground">Pix keys</p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="cards" className="relative">
        <TabsList className={`grid h-11 w-full rounded-xl ${variant === 'bank' ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="cards" className="gap-2 rounded-lg"><CreditCard className="h-4 w-4" />Cards</TabsTrigger>
          <TabsTrigger value="pix" className="gap-2 rounded-lg"><PixLogo className="h-4 w-4" />Pix</TabsTrigger>
          {variant === 'profile' && <TabsTrigger value="receive" className="gap-2 rounded-lg"><HandCoins className="h-4 w-4" />Receive</TabsTrigger>}
        </TabsList>

        {/* ── Cards ─────────────────────────────────────────────── */}
        <TabsContent value="cards" className="pt-5">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2"><Skeleton /><Skeleton /></div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-6 w-6 text-primary" />}
              title="No cards yet"
              text="Add a credit or debit card from any country. The card number never goes through our servers."
              action="Add card"
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
                          onDefault={() => run(c.id, () => walletApi.setDefault(c.id), 'Card set as default')}
                          onRemove={() => setConfirmRemove({ id: c.id, what: `the card ending in ${c.last4}` })}
                          light
                        />
                      </div>
                      {c.country && (
                        <p className="mt-2 px-1 text-[11px] text-muted-foreground">Issued in {regionName(c.country, c.country)}</p>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <button
                  onClick={() => setCardOpen(true)}
                  className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.1] text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="h-6 w-6" />Add card
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
              title="No Pix keys yet"
              text="Add a CPF, CNPJ, email, mobile number or random key to receive payments with a QR code."
              action="Add Pix key"
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
                    className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-card/50 p-4 transition-colors hover:border-[#32BCAD]/40"
                    data-testid="wallet-pix"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${PIX_TEAL}1f` }}>
                      <PixLogo className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">{p.label || pixKeyLabel(p.keyType)}</span>
                        <Badge variant="secondary" className="text-[10px]">{pixKeyLabel(p.keyType)}</Badge>
                        {p.isDefault && <Badge className="gap-1 text-[10px]"><Star className="h-2.5 w-2.5 fill-current" />Default</Badge>}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-sm text-muted-foreground">{p.maskedKey}</p>
                      <p className="mt-1 text-sm leading-none" title="Countries where you use this Pix key">
                        {p.countries.map((c) => <span key={c} className="mr-1">{countryFlag(c)}</span>)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setReceiveFrom(p)}
                      className="hidden gap-1.5 text-white sm:inline-flex"
                      style={{ backgroundColor: PIX_TEAL }}
                    >
                      <QrCode className="h-4 w-4" />Receive
                    </Button>
                    <ItemMenu
                      busy={busyId === p.id}
                      isDefault={p.isDefault}
                      onReceive={() => setReceiveFrom(p)}
                      onDefault={() => run(p.id, () => walletApi.setDefault(p.id), 'Pix key set as default')}
                      onRemove={() => setConfirmRemove({ id: p.id, what: `the Pix key ${p.maskedKey}` })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button variant="outline" className="h-11 w-full gap-2 rounded-xl" onClick={() => setPixOpen(true)}>
                <Plus className="h-4 w-4" />Add Pix key
              </Button>
            </div>
          )}
          <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] p-3">
            <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A Pix key always belongs to an account in Brazil. Outside Brazil, Pix is accepted at partner stores in{' '}
              {PIX_COUNTRIES.filter((c) => !c.domestic).map((c) => `${c.flag} ${regionName(c.code, c.name)}`).join(', ')}, with currency conversion in your banking app.
            </p>
          </div>
        </TabsContent>
        {/* ── Receive with Stripe ──────────────────────────────── */}
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
            <AlertDialogTitle>Remove from Vertal Vibe Pay?</AlertDialogTitle>
            <AlertDialogDescription>
              We will remove {confirmRemove?.what}. You can add it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = confirmRemove
                setConfirmRemove(null)
                if (target) run(target.id, () => walletApi.remove(target.id), 'Removed')
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  )
}

// ── Receive with Stripe Connect (any currency) ─────────────────────────────
const CHARGE_STATUS: Record<WalletCharge['status'], { label: string; icon: typeof Clock; cls: string }> = {
  open: { label: 'Waiting', icon: Clock, cls: 'text-amber-400 bg-amber-400/10' },
  paid: { label: 'Paid', icon: CircleCheck, cls: 'text-emerald-400 bg-emerald-400/10' },
  expired: { label: 'Expired', icon: CircleX, cls: 'text-muted-foreground bg-muted/40' },
  failed: { label: 'Failed', icon: CircleX, cls: 'text-destructive bg-destructive/10' },
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
      // New account: choose the country in the Vertal Vibe Pay global account.
      if (kind === 'onboard' && !account) { window.location.assign('/pay?tab=contas'); return }
      const { url } = kind === 'onboard'
        ? await walletApi.connectOnboard({ returnPath: '/profile' })
        : await walletApi.connectDashboard('/profile')
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
      {/* Account status */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-card/50 p-5">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#635bff] text-lg font-bold text-white">S</span>
            <div>
              <p className="font-semibold text-foreground">
                {ready ? 'Payments on' : account ? (account.pastDue ? 'Verification needed' : 'Verification in progress') : 'Receive in other currencies'}
              </p>
              <p className="text-sm text-muted-foreground">
                {ready
                  ? `Account ${account?.country ?? ''} · paid out in ${account?.defaultCurrency ?? 'BRL'}${account?.payoutsEnabled ? '' : ' · payouts pending'}`
                  : account
                    ? connectPendingText(account)
                    : 'Global account: BRL, US dollars, euros and 13 more currencies'}
              </p>
            </div>
          </div>
          {ready ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => go('dashboard')}>
                {busy === 'dashboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Dashboard
              </Button>
              <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />New payment request
              </Button>
            </div>
          ) : (
            <Button className="gap-1.5 bg-[#635bff] text-white hover:bg-[#5249e0]" disabled={busy !== null} onClick={() => go('onboard')}>
              {busy === 'onboard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {account ? (account.pastDue ? 'Finish verification' : 'Continue verification') : 'Open global account'}
            </Button>
          )}
        </div>
        {Object.keys(paidTotals).length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {Object.entries(paidTotals).map(([cur, minor]) => (
              <span key={cur} className="rounded-xl bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-foreground">
                {findCurrency(cur)?.flag} {formatMinor(minor, cur)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Payment requests */}
      {charges.length > 0 && (
        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-card/50">
          {charges.map((c) => {
            const st = CHARGE_STATUS[c.status]
            const Icon = st.icon
            return (
              <button
                key={c.id}
                disabled={!c.url}
                onClick={() => setShown(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-white/[0.03]"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${st.cls}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.description || 'Payment'}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(c.createdAt, true)} · {st.label}</p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{formatMinor(c.amountMinor, c.currency)}</span>
              </button>
            )
          })}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] p-3 text-[12px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Platform fee: 1% of each payment, in the currency of the payment (on {formatMinor(10000, 'BRL')}, the fee is {formatMinor(platformFeeFor(10000), 'BRL')}). Stripe fees show in your Stripe dashboard. The money goes to your Stripe account and is then paid out to your bank account.
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
    if (minor === null) return toast.error('Enter a valid amount')
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
          <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-primary" />New payment request</DialogTitle>
          <DialogDescription>Create a secure Stripe payment link. Your customer pays by card, Apple Pay or Google Pay.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="charge-amount">Amount</Label>
              <Input id="charge-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 font-mono text-lg" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge-currency">Currency</Label>
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
            <Label htmlFor="charge-desc">Description (optional)</Label>
            <Input id="charge-desc" maxLength={120} placeholder="For example: November consulting" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {minor !== null && (
            <div className="space-y-1 rounded-xl border border-white/[0.06] p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer pays</span><span className="font-mono">{formatMinor(minor, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform fee (1%)</span><span className="font-mono">− {formatMinor(platformFeeFor(minor), currency)}</span></div>
              <p className="pt-1 text-[11px] text-muted-foreground">Plus Stripe fees, taken from your account.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || minor === null} className="rounded-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Create link
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
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Dialog open={!!charge} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment request for {charge ? formatMinor(charge.amountMinor, charge.currency) : ''}</DialogTitle>
          <DialogDescription>{charge?.description || 'Send the link or show the QR code to your customer.'}</DialogDescription>
        </DialogHeader>
        {charge?.url && (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5">
              <QRCodeSVG value={charge.url} size={200} level="M" fgColor="#1a1446" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button asChild className="flex-1 gap-2 bg-[#635bff] text-white hover:bg-[#5249e0]">
                <a href={charge.url} target="_blank" rel="noopener noreferrer"><ArrowUpRight className="h-4 w-4" />Open</a>
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">The link expires in 24 hours.</p>
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
          variant="ghost" size="icon" aria-label="Options"
          className={light ? 'h-8 w-8 rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 hover:text-white' : 'shrink-0'}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onReceive && (
          <DropdownMenuItem onClick={onReceive} className="gap-2"><HandCoins className="h-4 w-4" />Receive with QR code</DropdownMenuItem>
        )}
        {!isDefault && (
          <DropdownMenuItem onClick={onDefault} className="gap-2"><Star className="h-4 w-4" />Set as default</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRemove} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />Remove</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Add card (Stripe Payment Element, cards only) ──────────────────────────
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
        const setup = await walletApi.cardSetup(['/pay', '/bank'].includes(window.location.pathname) ? '/pay' : '/profile')
        if (setup.checkoutUrl) {
          // No publishable key: add the card on the secure Stripe page.
          if (!cancelled) window.location.assign(setup.checkoutUrl)
          return
        }
        const { clientSecret, publishableKey } = setup as { clientSecret: string; publishableKey: string }
        const stripe = await loadStripe(publishableKey)
        if (cancelled) return
        const isDark = document.documentElement.classList.contains('dark')
        const elements = stripe.elements({
          clientSecret,
          locale: 'pt-BR',
          appearance: { theme: isDark ? 'night' : 'stripe', variables: { borderRadius: '10px' } },
        })
        element = elements.create('payment', { layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } })
        // The Dialog mounts its content in a portal; wait for the node.
        await new Promise((r) => requestAnimationFrame(r))
        if (cancelled || !mountRef.current) return
        element.mount(mountRef.current)
        element.on('ready', () => setReady(true))
        stripeRef.current = stripe
        elementsRef.current = elements
      } catch (e) {
        toast.error((e as Error).message || 'Could not start adding the card')
        onOpenChange(false)
      }
    })()
    return () => {
      cancelled = true
      try { element?.destroy() } catch { /* already destroyed */ }
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
        confirmParams: { return_url: `${window.location.origin}${window.location.pathname}${['/pay', '/bank'].includes(window.location.pathname) ? '?tab=cartoes' : ''}` },
      })
      if (error) throw new Error(error.message)
      await walletApi.cardAttach(setupIntent.id, label.trim() || undefined, makeDefault)
      toast.success('Card added')
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
          <DialogTitle>Add card</DialogTitle>
          <DialogDescription>
            Credit or debit, from any country. The card details go straight to Stripe. We keep only the card brand and the last 4 digits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div ref={mountRef} className="min-h-[180px]">
            {!ready && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-label" className="text-sm text-muted-foreground">Nickname (optional)</Label>
            <Input id="card-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Business card" />
          </div>
          <label className="flex items-center justify-between text-sm">
            Use as default card
            <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!ready || saving} className="w-full rounded-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}Save card
          </Button>
        </DialogFooter>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />Processed by Stripe · PCI DSS Level 1 certified
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Pix key ────────────────────────────────────────────────────────────
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

  const error = touched ? pixKeyErrorEn(validatePixKey(keyType, key)) : null
  const placeholder = PIX_KEY_PLACEHOLDER_EN[keyType]

  const reset = () => {
    setKeyType('cpf'); setKey(''); setLabel(''); setCountries(['BR']); setMakeDefault(false); setTouched(false)
  }

  const toggleCountry = (code: string) => {
    if (code === 'BR') return // the key always belongs to a Brazilian account
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const submit = async () => {
    setTouched(true)
    if (validatePixKey(keyType, key)) return
    setSaving(true)
    try {
      await walletApi.pixAdd({ keyType, key, label: label.trim() || undefined, countries, makeDefault })
      toast.success('Pix key added')
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
          <DialogTitle>Add Pix key</DialogTitle>
          <DialogDescription>The key is stored encrypted. Vertal Vibe Pay shows only a masked version.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Key type</Label>
            <div className="flex flex-wrap gap-1.5">
              {PIX_KEY_TYPES.map((t) => (
                <Button
                  key={t.value} type="button" size="sm"
                  variant={keyType === t.value ? 'default' : 'outline'}
                  onClick={() => { setKeyType(t.value); setTouched(false) }}
                >
                  {pixKeyLabel(t.value)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pix-key" className="text-sm text-muted-foreground">Key</Label>
            <Input
              id="pix-key" value={key} placeholder={placeholder} autoComplete="off"
              inputMode={keyType === 'cpf' || keyType === 'cnpj' || keyType === 'phone' ? 'numeric' : 'text'}
              onChange={(e) => setKey(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pix-label" className="text-sm text-muted-foreground">Nickname (optional)</Label>
            <Input id="pix-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Main account" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Globe2 className="h-3.5 w-3.5" />Where you use this Pix key
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
                  <span>{c.flag}</span>{regionName(c.code, c.name)}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Outside Brazil, Pix works only at partner stores, through currency exchange companies.
            </p>
          </div>
          <label className="flex items-center justify-between text-sm">
            Use as default Pix key
            <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="w-full rounded-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}Save Pix key
          </Button>
        </DialogFooter>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5 text-primary" />Encrypted with AES-256-GCM · only you can see the key
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ── Receive with Pix: creates a BR Code (copy and paste) + QR code ─────────
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
    if (Number.isNaN(value) || value < 0) return toast.error('Invalid amount')
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
    toast.success('Pix code copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={!!pix} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PixLogo />Receive with Pix</DialogTitle>
          <DialogDescription>
            {pix ? `Key ${pix.maskedKey}. ` : ''}Creates a static QR code in the BR Code standard of the Central Bank of Brazil.
          </DialogDescription>
        </DialogHeader>
        {brCode ? (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5">
              <QRCodeSVG value={brCode} size={220} level="M" fgColor="#0b1f1d" />
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[#0b1f1d]"><PixLogo className="h-4 w-4" />Pay with Pix</p>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={brCode} className="text-xs font-mono bg-muted/30" />
              <Button variant="outline" size="icon" onClick={copy} className="shrink-0" aria-label="Copy Pix code">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setBrCode(null)}>Create another</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rx-amount" className="text-sm text-muted-foreground">Amount in R$ (leave empty to let the payer enter it)</Label>
              <Input id="rx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rx-name" className="text-sm text-muted-foreground">Receiver name</Label>
                <Input id="rx-name" maxLength={25} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rx-city" className="text-sm text-muted-foreground">City</Label>
                <Input id="rx-city" maxLength={15} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rx-desc" className="text-sm text-muted-foreground">Description (optional)</Label>
              <Input id="rx-desc" maxLength={40} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button onClick={generate} disabled={loading || !name.trim() || !city.trim()} className="w-full rounded-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create QR code
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
