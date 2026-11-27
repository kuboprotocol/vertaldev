// Página do conector MetaMask (/connectors/metamask/setup). Abas: Conexão · Trader (testnet) · Starter Web3.
// Aditivo: só aparece no catálogo com VITE_VERTAL_METAMASK; o servidor responde só para quem está liberado.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Copy, Download, ExternalLink, Loader2, LogOut, RefreshCw, ShieldCheck, Smartphone, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectorIcon } from '@/components/connectors/ConnectorIcon'
import { useSchedulerUiLang } from '@/lib/chatScheduler/client'
import { metamaskConnector } from '@/lib/vertalWallet/config'
import { MM_UI, mmError, mmLang, type MmTexts } from '@/lib/vertalWallet/i18n'
import { findMetaMask, isMobileUA, metamaskDeepLink, type Eip1193Provider } from '@/lib/vertalWallet/eip6963'
import {
  callWallet, connectWithSiwe, openWalletConnect, resetWalletAccessCache, signAndSend,
  type TradeOrder, type WalletRead, type WalletStatus,
} from '@/lib/vertalWallet/client'
import { WEB3_TEMPLATE_FILES } from '../../../supabase/functions/_shared/vertalWallet/web3Template'

const SEPOLIA = 11155111

function errCode(e: unknown): string {
  const c = (e as { code?: number })?.code
  if (c === 4001) return 'user_rejected'
  const m = e instanceof Error ? e.message : ''
  return /^[a-z_]+$/.test(m) ? m : 'network_error'
}

function CopyBtn({ text, t }: { text: string; t: MmTexts }) {
  const [done, setDone] = useState(false)
  return (
    <Button type="button" variant="ghost" size="sm" className="gap-1 shrink-0"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }) }}>
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {done ? t.copied : t.copy}
    </Button>
  )
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function MetaMaskSetupPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const uiLang = useSchedulerUiLang()
  const t = MM_UI[mmLang(params.get('lang') || uiLang)]
  const tab = params.get('tab') === 'trader' ? 'trader' : params.get('tab') === 'template' ? 'template' : 'connect'

  const [status, setStatus] = useState<WalletStatus | null>(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number>(SEPOLIA)
  const [read, setRead] = useState<WalletRead | null>(null)
  const providerRef = useRef<Eip1193Provider | null>(null)
  const [hasExtension, setHasExtension] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await callWallet<WalletStatus>('status')
    if (r.ok) { setStatus(r.data); setDenied(false) } else { setDenied(r.status === 404); if (r.status !== 404) setError(r.error) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let alive = true
    findMetaMask().then((p) => { if (!alive) return; providerRef.current = p; setHasExtension(!!p) }).catch(() => alive && setHasExtension(false))
    return () => { alive = false }
  }, [])

  const refreshRead = useCallback(async () => {
    const r = await callWallet<WalletRead>('read')
    if (r.ok) setRead(r.data)
    else if (r.error !== 'not_connected' && r.error !== 'migration_pending') setError(r.error)
  }, [])
  useEffect(() => { if (status?.connection) void refreshRead() }, [status?.connection, refreshRead])

  const connect = async (via: 'extension' | 'walletconnect') => {
    setError(null); setInfo(null); setBusy(true)
    try {
      let p = providerRef.current
      if (via === 'walletconnect' && status?.walletConnectProjectId) p = await openWalletConnect(status.walletConnectProjectId, chainId)
      if (!p) { setHasExtension(false); return }
      providerRef.current = p
      const r = await connectWithSiwe(p, chainId)
      if (!r.ok) { setError(r.error); return }
      resetWalletAccessCache()
      await load()
    } catch (e) {
      setError(errCode(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true); setError(null)
    const r = await callWallet<{ ok: boolean }>('disconnect')
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setRead(null); setInfo(t.disconnected); resetWalletAccessCache(); await load()
  }

  const setTab = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === 'connect') next.delete('tab'); else next.set('tab', v)
    setParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="metamask-setup">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <button type="button" onClick={() => navigate('/connectors')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>
        <div className="flex items-center gap-3">
          <ConnectorIcon connector={metamaskConnector} className="w-12 h-12" />
          <div>
            <p className="text-xs text-muted-foreground">{t.via}</p>
            <h1 className="text-2xl font-semibold">{t.title}</h1>
          </div>
        </div>

        <Card className="p-4 border-amber-500/40 bg-amber-500/5 space-y-1.5" data-testid="metamask-security">
          <div className="flex items-center gap-2 font-medium text-sm"><ShieldCheck className="w-4 h-4 text-amber-500" /> {t.security[0]}</div>
          {t.security.slice(1).map((s, i) => <p key={i} className="text-sm text-muted-foreground pl-6">{s}</p>)}
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /></p>
        ) : denied ? (
          <Card className="p-6 text-sm text-muted-foreground" data-testid="metamask-disabled">{t.disabled}</Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="connect">{t.tabConnect}</TabsTrigger>
              {status?.trader && <TabsTrigger value="trader">{t.tabTrader}</TabsTrigger>}
              <TabsTrigger value="template">{t.tabTemplate}</TabsTrigger>
            </TabsList>

            <TabsContent value="connect" className="space-y-4 pt-4">
              {status?.migrationPending && <p className="text-xs text-amber-500 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t.migrationPending}</p>}
              {status?.connection ? (
                <Card className="p-6 space-y-4" data-testid="metamask-connected">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t.connectedAs} · {t.connectedAt} {new Date(status.connection.connected_at).toLocaleString()}</p>
                      <p className="font-mono text-sm">{short(status.connection.address)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void refreshRead()}><RefreshCw className="w-3.5 h-3.5" /> {t.refresh}</Button>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => void disconnect()} data-testid="metamask-disconnect"><LogOut className="w-3.5 h-3.5" /> {t.disconnect}</Button>
                    </div>
                  </div>
                  {read && (
                    <div className="grid sm:grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">{t.network}</p><p>{read.network.name}</p></div>
                      <div><p className="text-xs text-muted-foreground">{t.balance}</p><p className="font-mono">{read.balance.eth} ETH</p></div>
                      <div><p className="text-xs text-muted-foreground">{t.txCount}</p><p>{read.txCount}</p></div>
                    </div>
                  )}
                  {read && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium">{t.recentTx}</p>
                      {read.recentTx === null ? <p className="text-xs text-muted-foreground">{t.recentTxNeedsKey}</p>
                        : read.recentTx.length === 0 ? <p className="text-xs text-muted-foreground">{t.noTx}</p>
                          : read.recentTx.map((x) => (
                            <a key={x.hash} href={`${read.network.explorer}/tx/${x.hash}`} target="_blank" rel="noreferrer" className="flex justify-between text-xs font-mono hover:underline">
                              <span>{short(x.hash)}</span><span>{x.valueEth} ETH · {x.status}</span>
                            </a>
                          ))}
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="p-6 space-y-4">
                  <p className="text-sm text-muted-foreground">{t.intro}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{t.network}:</span>
                    {(status?.chains ?? []).map((c) => (
                      <Button key={c.chainId} type="button" size="sm" variant={chainId === c.chainId ? 'default' : 'outline'} onClick={() => setChainId(c.chainId)}>
                        {c.name}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasExtension !== false && (
                      <Button type="button" className="gap-2" disabled={busy || hasExtension === null} onClick={() => void connect('extension')} data-testid="metamask-connect">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />} {busy ? t.connecting : t.connectExtension}
                      </Button>
                    )}
                    {hasExtension === false && isMobileUA() && (
                      <Button type="button" variant="outline" className="gap-2" onClick={() => { window.location.href = metamaskDeepLink(window.location.href) }} data-testid="metamask-deeplink">
                        <Smartphone className="w-4 h-4" /> {t.connectMobile}
                      </Button>
                    )}
                    {status?.walletConnectProjectId && (
                      <Button type="button" variant="outline" className="gap-2" disabled={busy} onClick={() => void connect('walletconnect')} data-testid="metamask-walletconnect">
                        {t.connectWalletConnect}
                      </Button>
                    )}
                  </div>
                  {hasExtension === false && !isMobileUA() && (
                    <p className="text-sm text-muted-foreground">
                      {t.noMetaMask}{' '}
                      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">{t.installMetaMask} <ExternalLink className="w-3 h-3" /></a>
                    </p>
                  )}
                </Card>
              )}
              {error && <p className="text-sm text-destructive" role="alert">{mmError(t, error)}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
            </TabsContent>

            {status?.trader && (
              <TabsContent value="trader" className="pt-4">
                <TraderPanel t={t} status={status} providerRef={providerRef} initialPrompt={params.get('prompt') ?? ''} />
              </TabsContent>
            )}

            <TabsContent value="template" className="pt-4">
              <TemplatePanel t={t} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

function TemplatePanel({ t }: { t: MmTexts }) {
  const all = useMemo(() => WEB3_TEMPLATE_FILES.map((f) => `// ${f.path}\n${f.content}`).join('\n\n'), [])
  const download = () => {
    const blob = new Blob([all], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'vertal-web3-starter.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <Card className="p-6 space-y-4" data-testid="metamask-template">
      <h2 className="font-semibold">{t.templateTitle}</h2>
      <p className="text-sm text-muted-foreground">{t.templateIntro}</p>
      <p className="text-xs text-muted-foreground">{t.templateHint}</p>
      <div className="flex gap-2">
        <CopyBtn text={all} t={t} />
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={download}><Download className="w-3.5 h-3.5" /> {t.templateDownload}</Button>
      </div>
      {WEB3_TEMPLATE_FILES.map((f) => (
        <details key={f.path} className="rounded-md border border-border/60">
          <summary className="cursor-pointer px-3 py-2 text-sm font-mono flex items-center justify-between">{f.path}</summary>
          <div className="flex justify-end px-2"><CopyBtn text={f.content} t={t} /></div>
          <pre className="text-xs overflow-x-auto px-3 pb-3 whitespace-pre">{f.content}</pre>
        </details>
      ))}
    </Card>
  )
}

function TraderPanel({ t, status, providerRef, initialPrompt }: {
  t: MmTexts
  status: WalletStatus
  providerRef: MutableRefObject<Eip1193Provider | null>
  initialPrompt: string
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [order, setOrder] = useState<TradeOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [sent, setSent] = useState<string[]>([])
  const [watching, setWatching] = useState(false)
  const conn = status.connection

  const build = useCallback(async (basePrice?: number) => {
    if (!conn) return
    setBusy(true); setError(null)
    const r = await callWallet<TradeOrder>('trade', { prompt, address: conn.address, chainId: SEPOLIA, basePrice })
    setBusy(false)
    if (!r.ok) { setError(r.error); setOrder(null); return }
    setOrder(r.data); setStep(0); setSent([])
  }, [conn, prompt])

  // Acompanha só com a página aberta; quando o preço chega, mostra o botão de assinar (nunca envia sozinho).
  useEffect(() => {
    if (!watching || !order || order.trigger.met) return
    const base = order.trigger.basePrice
    const id = setInterval(() => { void build(base) }, 60_000)
    return () => clearInterval(id)
  }, [watching, order, build])
  useEffect(() => { if (order?.trigger.met) setWatching(false) }, [order?.trigger.met])

  const signNext = async () => {
    if (!order || !conn) return
    const p = providerRef.current ?? (await (await import('@/lib/vertalWallet/eip6963')).findMetaMask())
    if (!p) { setError('no_account'); return }
    providerRef.current = p
    setBusy(true); setError(null)
    try {
      const hash = await signAndSend(p, conn.address, order.txs[step], order.chainId)
      setSent((s) => [...s, hash]); setStep((s) => s + 1)
    } catch (e) {
      setError(errCode(e))
    } finally {
      setBusy(false)
    }
  }

  const what = (d: string) => (d.startsWith('approve') ? t.txApprove : t.txSwap)
  const fmt = (n: number | null) => (n === null ? '—' : n.toPrecision(6))

  return (
    <Card className="p-6 space-y-4" data-testid="vertal-trader">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t.traderTitle}</h2>
        <span className="text-[10px] uppercase tracking-wide rounded-full border border-amber-500/50 text-amber-500 px-2 py-0.5">Sepolia · {t.testnetTag}</span>
      </div>
      <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex gap-2" data-testid="vertal-trader-disclaimer">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {t.traderDisclaimer}
      </p>
      <p className="text-sm text-muted-foreground">{t.traderIntro}</p>
      {!conn ? (
        <p className="text-sm text-muted-foreground">{t.traderNeedsConnection}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.traderPlaceholder} maxLength={300} />
            <Button type="button" disabled={busy || !prompt.trim()} onClick={() => void build()} data-testid="vertal-trader-build">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t.traderBuild}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {t.traderExamples.map((ex) => (
              <button key={ex} type="button" className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:border-primary/50" onClick={() => setPrompt(ex)}>{ex}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{mmError(t, error)}</p>}
      {order && (
        <div className="space-y-3 rounded-md border border-border/60 p-4 text-sm" data-testid="vertal-trader-order">
          <p className="font-medium">{t.quote}</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <div><p className="text-xs text-muted-foreground">{t.pay}</p><p className="font-mono">{order.quote.amountInText}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.receive}</p><p className="font-mono">{order.quote.amountOutText}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.price}</p><p className="font-mono">{fmt(order.quote.priceEthPerToken)} ETH/{order.token.symbol}</p></div>
          </div>
          <p>
            {order.trigger.kind === 'now' ? t.triggerNow
              : order.trigger.kind === 'drop' ? t.triggerDrop(order.trigger.pct, fmt(order.trigger.targetPrice))
                : t.triggerRise(order.trigger.pct, fmt(order.trigger.targetPrice))}
          </p>
          {!order.trigger.met ? (
            <div className="space-y-2">
              <p className="text-muted-foreground">{t.triggerWaiting}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setWatching((w) => !w)}>{watching ? t.stopWatch : t.watch}</Button>
              {watching && <p className="text-xs text-muted-foreground">{t.watchingNote}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {order.trigger.kind !== 'now' && <p className="text-primary">{t.triggerMet}</p>}
              {step < order.txs.length && (
                <Button type="button" className="gap-2" disabled={busy} onClick={() => void signNext()} data-testid="vertal-trader-sign">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />} {t.sign(step + 1, order.txs.length, what(order.txs[step].description))}
                </Button>
              )}
              {sent.map((h) => (
                <p key={h} className="text-xs">
                  {t.txSent}: <a className="text-primary underline" href={`https://sepolia.etherscan.io/tx/${h}`} target="_blank" rel="noreferrer">{short(h)} · {t.viewTx}</a>
                </p>
              ))}
              <p className="text-xs text-muted-foreground">{t.signedByYou}</p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t.futureNote}</p>
    </Card>
  )
}

export default MetaMaskSetupPage
