// Vertal Vibe Bank (antigo VERTAL Bank): conta digital do Vertal Dev sobre Stripe (conta global) + ASAAS (conta Brasil).
// Rotas: /bank (app, principal) · /wallet, /carteira, /vertal-bank redirecionam para cá.
// Landing pública: /vibe-bank (HTML estático por idioma, vite-plugins/vibeBank.ts).
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CreditCard, Landmark, Loader2, RefreshCw, ScrollText, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { VIBE_BANK } from '@/config/vibeBank'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import WalletSection from '@/components/profile/WalletSection'
import { BankStatement, ProviderDot } from '@/components/bank/BankStatement'
import { BankReceive } from '@/components/bank/BankReceive'
import { BankSend } from '@/components/bank/BankSend'
import { AsaasAccountCard, GlobalAccountCard } from '@/components/bank/BankAccounts'
import { bankApi, type BankOverview, type BankTransaction, type ProviderStatementItem } from '@/lib/bank/api'
import { formatMinor, findCurrency } from '@/lib/wallet/currency'
import type { BankProvider } from '@/lib/bank/routing'

const TABS = ['inicio', 'receber', 'pagar', 'extrato', 'cartoes', 'contas'] as const
type Tab = (typeof TABS)[number]

export default function VertalBankPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initialTab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'inicio'
  const [tab, setTab] = useState<Tab>(params.get('wallet')?.startsWith('connect') ? 'contas' : params.get('setup_intent') ? 'cartoes' : initialTab)
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
      toast.error((e as Error).message || 'Erro ao carregar o Vertal Vibe Bank')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Volta do onboarding do Stripe: limpa o parâmetro e atualiza.
  useEffect(() => {
    const w = params.get('wallet')
    if (w === 'connect-return') toast.success('Dados enviados ao Stripe. Atualizando sua conta global…')
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

  const totals = overview?.totals ?? []
  const brl = totals.find((t) => t.currency === 'BRL')
  const others = totals.filter((t) => t.currency !== 'BRL')

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="glass glass-border sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <picture>
              <source srcSet={VIBE_BANK.iconSmall} type="image/webp" />
              <img src={VIBE_BANK.icon} alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
            </picture>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              Vertal Vibe <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">Bank</span>
            </h1>
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={refreshing} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Saldo unificado */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="glass glass-border relative overflow-hidden rounded-3xl p-6 sm:p-8"
          data-testid="bank-balance"
        >
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 h-56 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saldo disponível</p>
              {loading ? (
                <div className="mt-2 h-12 w-56 animate-pulse rounded-xl bg-muted/50" />
              ) : (
                <p className="mt-1 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                  {formatMinor(brl?.availableMinor ?? 0, 'BRL')}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {others.map((t) => (
                  <span key={t.currency} className="rounded-full bg-background/60 px-3 py-1 font-mono text-xs text-foreground">
                    {findCurrency(t.currency)?.flag ?? ''} {formatMinor(t.availableMinor, t.currency)}
                  </span>
                ))}
                {totals.some((t) => t.pendingMinor > 0) && (
                  <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300">
                    A liberar: {totals.filter((t) => t.pendingMinor > 0).map((t) => formatMinor(t.pendingMinor, t.currency)).join(' · ')}
                  </span>
                )}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <ProviderDot provider="asaas" /> {overview?.asaas.account ? 'Conta Brasil' : 'Conta Brasil não aberta'}
                <span className="mx-1">·</span>
                <ProviderDot provider="stripe" /> {overview?.stripe.account ? 'Conta global' : 'Conta global não aberta'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="gap-2 gradient-primary text-primary-foreground shadow-glow" onClick={() => changeTab('receber')}>
                <ArrowDownLeft className="h-4 w-4" />Receber
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => changeTab('pagar')}>
                <ArrowUpRight className="h-4 w-4" />Pagar
              </Button>
            </div>
          </div>
        </motion.section>

        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="flex h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl">
            <TabsTrigger value="inicio" className="gap-1.5 rounded-lg"><Wallet className="h-4 w-4" />Início</TabsTrigger>
            <TabsTrigger value="receber" className="gap-1.5 rounded-lg"><ArrowDownLeft className="h-4 w-4" />Receber</TabsTrigger>
            <TabsTrigger value="pagar" className="gap-1.5 rounded-lg"><ArrowUpRight className="h-4 w-4" />Pagar</TabsTrigger>
            <TabsTrigger value="extrato" className="gap-1.5 rounded-lg"><ScrollText className="h-4 w-4" />Extrato</TabsTrigger>
            <TabsTrigger value="cartoes" className="gap-1.5 rounded-lg"><CreditCard className="h-4 w-4" />Cartões e Pix</TabsTrigger>
            <TabsTrigger value="contas" className="gap-1.5 rounded-lg"><Landmark className="h-4 w-4" />Contas</TabsTrigger>
          </TabsList>

          <TabsContent value="inicio" className="space-y-4 pt-5">
            {loading ? <Spinner /> : (
              <>
                {(!overview?.asaas.account || !overview?.stripe.account) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {!overview?.asaas.account && <AsaasAccountCard overview={overview} onChange={load} />}
                    {!overview?.stripe.account && <GlobalAccountCard overview={overview} onChange={load} />}
                  </div>
                )}
                <h2 className="font-display text-sm font-semibold text-foreground">Últimas movimentações</h2>
                <BankStatement items={items.slice(0, 8)} />
              </>
            )}
          </TabsContent>

          <TabsContent value="receber" className="pt-5">
            <div className="glass glass-border rounded-2xl p-5 sm:p-6"><BankReceive overview={overview} onCreated={load} /></div>
          </TabsContent>

          <TabsContent value="pagar" className="pt-5">
            <div className="glass glass-border mx-auto max-w-xl rounded-2xl p-5 sm:p-6"><BankSend overview={overview} onSent={load} /></div>
          </TabsContent>

          <TabsContent value="extrato" className="space-y-4 pt-5">
            <BankStatement items={items} />
            <ProviderStatements overview={overview} />
          </TabsContent>

          <TabsContent value="cartoes" className="pt-5">
            <WalletSection variant="bank" />
          </TabsContent>

          <TabsContent value="contas" className="grid gap-4 pt-5 md:grid-cols-2">
            <AsaasAccountCard overview={overview} onChange={load} />
            <GlobalAccountCard overview={overview} onChange={load} />
          </TabsContent>
        </Tabs>

        <p className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          O Vertal Vibe Bank é uma conta digital da plataforma Vertal Dev, não um banco: as contas são fornecidas pelo Stripe (Stripe Payments) e pelo ASAAS (instituição de pagamento autorizada pelo Banco Central), em nome de cada titular. A VERTAL não é banco nem instituição financeira.
        </p>
      </main>
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
}

/** Extrato bruto de cada provedor (últimos 30 dias), sob demanda. */
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
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Extrato do provedor (30 dias)</p>
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
        rows.items.length === 0 ? <p className="text-xs text-muted-foreground">Sem lançamentos.</p> : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 font-medium">Data</th><th className="font-medium">Tipo</th><th className="font-medium">Descrição</th><th className="text-right font-medium">Valor</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1.5 pr-2 text-muted-foreground">{new Date(i.date.length === 10 ? `${i.date}T12:00:00` : i.date).toLocaleDateString('pt-BR')}</td>
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
