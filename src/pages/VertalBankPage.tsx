// Vertal Vibe Pay (formerly VERTAL Bank): the Vertal Dev digital account on Stripe (global account) + ASAAS (Brazil account).
// Route: /pay. /bank, /wallet, /carteira and /vertal-bank redirect here.
// Public landing: /vibe-pay (static HTML per language, vite-plugins/vibePay.ts).
// English copy and the shared design system; payment logic unchanged.
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Landmark, Loader2, RefreshCw, ScrollText, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { VIBE_PAY } from '@/config/vibePay'
import { AppShell, AppTopBar, PanelHeader, Brand, surface } from '@/components/site'
import { cn } from '@/lib/utils'
import { formatDate } from '@/components/bank/payCopyEn'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import WalletSection from '@/components/profile/WalletSection'
import { BankStatement, ProviderDot } from '@/components/bank/BankStatement'
import { BankReceive } from '@/components/bank/BankReceive'
import { BankSend } from '@/components/bank/BankSend'
import { AsaasAccountCard, GlobalAccountCard } from '@/components/bank/BankAccounts'
import { PayOnboarding } from '@/components/bank/PayOnboarding'
import { bankApi, type BankOverview, type BankTransaction, type ProviderStatementItem } from '@/lib/bank/api'
import { formatMinor, findCurrency } from '@/lib/wallet/currency'
import type { BankProvider } from '@/lib/bank/routing'

const TABS = ['inicio', 'receber', 'pagar', 'extrato', 'cartoes', 'contas'] as const
type Tab = (typeof TABS)[number]

export default function VertalBankPage() {
  const [params, setParams] = useSearchParams()
  const initialTab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'inicio'
  const [tab, setTab] = useState<Tab>(params.get('wallet')?.startsWith('connect') ? 'contas' : (params.get('setup_intent') || params.get('setup_session')) ? 'cartoes' : initialTab)
  const [overview, setOverview] = useState<BankOverview | null>(null)
  const [items, setItems] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [o, s] = await Promise.all([bankApi.overview(), bankApi.statement(100)])
      setOverview(o)
      setItems(s.items)
    } catch (e) {
      toast.error((e as Error).message || 'Could not load Vertal Vibe Pay')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Back from Stripe onboarding: clear the parameter and refresh.
  useEffect(() => {
    const w = params.get('wallet')
    if (w === 'connect-return') toast.success('Details sent to Stripe. Updating your global account…')
    if (w?.startsWith('connect')) {
      params.delete('wallet')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const changeTab = (t: string) => {
    setTab(t as Tab)
    const next = new URLSearchParams(params)
    if (t === 'inicio') next.delete('tab'); else next.set('tab', t)
    setParams(next, { replace: true })
  }

  // One of the available accounts is missing (or the global account still needs details).
  const needsOnboarding = Boolean(overview) && (
    (overview!.flags.asaasConfigured && !overview!.asaas.account) ||
    (overview!.stripe.configured && (!overview!.stripe.account || !overview!.stripe.account.detailsSubmitted))
  )
  const totals = overview?.totals ?? []
  const brl = totals.find((t) => t.currency === 'BRL')
  const others = totals.filter((t) => t.currency !== 'BRL')

  return (
    <AppShell
      topBar={
        <AppTopBar
          back={{ to: '/dashboard', label: 'Dashboard' }}
          title={<Brand>Vertal Vibe Pay</Brand>}
          actions={
            <Button variant="ghost" size="icon" onClick={load} disabled={refreshing} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          }
        />
      }
    >
      <PanelHeader
        icon={
          <picture>
            <source srcSet={VIBE_PAY.iconSmall} type="image/webp" />
            <img src={VIBE_PAY.icon} alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
          </picture>
        }
        title={<Brand>Vertal Vibe Pay</Brand>}
        description="Receive and send payments, see your balance and statement, and manage your cards and Pix keys."
      />

      <div className="space-y-6">
        {/* Combined balance */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(surface.panel, 'p-6 sm:p-8')}
          data-testid="bank-balance"
          aria-label="Balance"
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">Available balance</p>
              {loading ? (
                <div className="mt-2 h-12 w-56 animate-pulse rounded-xl bg-muted/50" />
              ) : (
                <p className="mt-1 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
                  {formatMinor(brl?.availableMinor ?? 0, 'BRL')}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {others.map((t) => (
                  <span key={t.currency} className="rounded-full bg-white/[0.06] px-3 py-1 font-mono text-xs text-foreground">
                    {findCurrency(t.currency)?.flag ?? ''} {formatMinor(t.availableMinor, t.currency)}
                  </span>
                ))}
                {totals.some((t) => t.pendingMinor > 0) && (
                  <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300">
                    Pending: {totals.filter((t) => t.pendingMinor > 0).map((t) => formatMinor(t.pendingMinor, t.currency)).join(' · ')}
                  </span>
                )}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <ProviderDot provider="asaas" /> {overview?.asaas.account ? 'Brazil account' : 'Brazil account not open'}
                <span className="mx-1">·</span>
                <ProviderDot provider="stripe" /> {overview?.stripe.account ? 'Global account' : 'Global account not open'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="gap-2 rounded-full" onClick={() => changeTab('receber')}>
                <ArrowDownLeft className="h-4 w-4" />Receive
              </Button>
              <Button variant="outline" className="gap-2 rounded-full" onClick={() => changeTab('pagar')}>
                <ArrowUpRight className="h-4 w-4" />Send
              </Button>
            </div>
          </div>
        </motion.section>

        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="flex h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl">
            <TabsTrigger value="inicio" className="gap-1.5 rounded-lg"><Wallet className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="receber" className="gap-1.5 rounded-lg"><ArrowDownLeft className="h-4 w-4" />Receive</TabsTrigger>
            <TabsTrigger value="pagar" className="gap-1.5 rounded-lg"><ArrowUpRight className="h-4 w-4" />Send</TabsTrigger>
            <TabsTrigger value="extrato" className="gap-1.5 rounded-lg"><ScrollText className="h-4 w-4" />Statement</TabsTrigger>
            <TabsTrigger value="cartoes" className="gap-1.5 rounded-lg"><CreditCard className="h-4 w-4" />Cards and Pix</TabsTrigger>
            <TabsTrigger value="contas" className="gap-1.5 rounded-lg"><Landmark className="h-4 w-4" />Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="inicio" className="space-y-4 pt-5">
            {loading ? <Spinner /> : (
              <>
                {/* Single sign-up: opens ASAAS and Stripe together (pay-open). */}
                {needsOnboarding && <PayOnboarding overview={overview} onChange={load} />}
                <h2 className="text-[15px] font-semibold text-foreground">Recent activity</h2>
                <BankStatement items={items.slice(0, 8)} />
              </>
            )}
          </TabsContent>

          <TabsContent value="receber" className="pt-5">
            <div className={cn(surface.panel, 'p-5 sm:p-6')}><BankReceive overview={overview} onCreated={load} /></div>
          </TabsContent>

          <TabsContent value="pagar" className="pt-5">
            <div className={cn(surface.panel, 'mx-auto max-w-xl p-5 sm:p-6')}><BankSend overview={overview} onSent={load} /></div>
          </TabsContent>

          <TabsContent value="extrato" className="space-y-4 pt-5">
            <BankStatement items={items} />
            <ProviderStatements overview={overview} />
          </TabsContent>

          <TabsContent value="cartoes" className="pt-5">
            <WalletSection variant="bank" />
          </TabsContent>

          <TabsContent value="contas" className="space-y-4 pt-5">
            {needsOnboarding && <PayOnboarding overview={overview} onChange={load} />}
            <div className="grid gap-4 md:grid-cols-2">
              <AsaasAccountCard overview={overview} onChange={load} hideOpen />
              <GlobalAccountCard overview={overview} onChange={load} hideOpen />
            </div>
          </TabsContent>
        </Tabs>

        <p className="flex items-start gap-2 rounded-xl border border-white/[0.06] p-4 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Vertal Vibe Pay is a digital account on the Vertal Dev platform, not a bank. The accounts are provided by Stripe (Stripe Payments) and by ASAAS (a payment institution authorized by the Central Bank of Brazil), in the name of each account holder. VERTAL is not a bank or a financial institution.
        </p>
      </div>
    </AppShell>
  )
}

function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
}

/** Raw statement of each provider (last 30 days), on request. */
function ProviderStatements({ overview }: { overview: BankOverview | null }) {
  const [rows, setRows] = useState<{ provider: BankProvider; items: ProviderStatementItem[] } | null>(null)
  const [busy, setBusy] = useState<BankProvider | null>(null)
  const load = async (provider: BankProvider) => {
    setBusy(provider)
    try {
      const { items } = await bankApi.providerStatement(provider, 30)
      setRows({ provider, items })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className={cn(surface.panel, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Provider statement (last 30 days)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!overview?.asaas.account || busy !== null} onClick={() => load('asaas')}>
            {busy === 'asaas' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'ASAAS'}
          </Button>
          <Button size="sm" variant="outline" disabled={!overview?.stripe.account || busy !== null} onClick={() => load('stripe')}>
            {busy === 'stripe' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Stripe'}
          </Button>
        </div>
      </div>
      {rows && (
        rows.items.length === 0 ? <p className="text-xs text-muted-foreground">No entries.</p> : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 font-medium">Date</th><th className="font-medium">Type</th><th className="font-medium">Description</th><th className="text-right font-medium">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(i.date.length === 10 ? `${i.date}T12:00:00` : i.date)}</td>
                    <td className="pr-2 font-mono text-[10px] text-muted-foreground">{i.type}</td>
                    <td className="max-w-[220px] truncate pr-2 text-foreground">{i.description ?? '—'}</td>
                    <td className={`text-right font-mono ${i.amountMinor < 0 ? 'text-rose-300' : 'text-foreground'}`}>{formatMinor(i.amountMinor, i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
