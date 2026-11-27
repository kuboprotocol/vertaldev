// Página /plan/:id: preview por camadas, gerenciamento de status,
// geração de ERC-20 customizado, deploy automático na Sepolia,
// persistência de contratos/deploys e tratamento de erros.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Download, Wallet, Cpu, Layers, FileCode, CheckCircle2, Circle, Loader2, Rocket, ExternalLink, Copy } from 'lucide-react'
import { useDemoWallet } from '@/hooks/useDemoWallet'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import { siteRoot } from '@/components/site/siteUi'

type TaskStatus = 'todo' | 'in_progress' | 'done'
type Task = { id: string; layer: 1 | 2 | 3; title: string; depends_on: string[] }
type Plan = {
  id: string
  prompt: string
  intent: 'web2_app' | 'web3_app' | 'hybrid'
  capabilities: string[]
  stack: Record<string, string>
  tasks: Task[]
  task_states: Record<string, TaskStatus>
}
type GeneratedContract = {
  id: string
  name: string
  symbol: string
  source_code: string
  decimals: number
  initial_supply: string
}
type Deployment = {
  id: string
  contract_address: string
  tx_hash: string
  block_number: number | null
  gas_used: string | null
  explorer_url: string | null
  created_at?: string
  events: Array<{ name?: string; args?: unknown[]; topics?: string[]; data?: string }>
}

const LAYER_META = {
  1: { label: 'Layer 1: Interface', icon: Layers, color: 'text-blue-400' },
  2: { label: 'Layer 2: Orchestrator', icon: Cpu, color: 'text-amber-400' },
  3: { label: 'Layer 3: Engines', icon: FileCode, color: 'text-emerald-400' },
} as const

function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function copy(text: string, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => toast.success(label))
}

export default function PlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useDemoWallet()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [contract, setContract] = useState<GeneratedContract | null>(null)
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [history, setHistory] = useState<Deployment[]>([])
  const [generatingContract, setGeneratingContract] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  // Form ERC-20 customizado (persistido no localStorage por plano)
  const [form, setForm] = useState({ name: 'VertalCredit', symbol: 'VRTL', decimals: '18', initial_supply: '1000000' })

  useEffect(() => {
    if (!id) return
    const saved = localStorage.getItem(`kubo:plan-form:${id}`)
    if (saved) {
      try { setForm({ ...form, ...JSON.parse(saved) }) } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => {
    if (id) localStorage.setItem(`kubo:plan-form:${id}`, JSON.stringify(form))
  }, [form, id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('orchestration_plans')
        .select('id, prompt, intent, capabilities, stack, tasks, task_states')
        .eq('id', id).maybeSingle()
      if (cancelled) return
      if (error || !data) {
        toast.error('Plan not found')
        navigate('/dashboard', { replace: true })
        return
      }
      setPlan({
        id: data.id, prompt: data.prompt,
        intent: data.intent as Plan['intent'],
        capabilities: data.capabilities ?? [],
        stack: (data.stack ?? {}) as Record<string, string>,
        tasks: (data.tasks ?? []) as unknown as Task[],
        task_states: (data.task_states ?? {}) as Record<string, TaskStatus>,
      })

      const { data: contracts } = await supabase
        .from('generated_contracts')
        .select('id, name, symbol, source_code, decimals, initial_supply')
        .eq('plan_id', id).order('created_at', { ascending: false }).limit(1)
      if (!cancelled && contracts && contracts[0]) {
        const c = contracts[0]
        setContract({
          id: c.id, name: c.name, symbol: c.symbol,
          source_code: c.source_code, decimals: c.decimals,
          initial_supply: String(c.initial_supply),
        })
        const { data: deps } = await supabase
          .from('contract_deployments')
          .select('id, contract_address, tx_hash, block_number, gas_used, explorer_url, events, created_at')
          .eq('contract_id', c.id).order('created_at', { ascending: false }).limit(20)
        if (!cancelled && deps && deps.length) {
          const mapped: Deployment[] = deps.map((d) => ({
            id: d.id,
            contract_address: d.contract_address,
            tx_hash: d.tx_hash,
            block_number: d.block_number,
            gas_used: d.gas_used,
            explorer_url: d.explorer_url,
            created_at: d.created_at,
            events: (d.events ?? []) as Deployment['events'],
          }))
          setHistory(mapped)
          setDeployment(mapped[0])
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, navigate])

  const tasksByLayer = useMemo(() => {
    const groups: Record<1 | 2 | 3, Task[]> = { 1: [], 2: [], 3: [] }
    for (const t of plan?.tasks ?? []) groups[t.layer]?.push(t)
    return groups
  }, [plan])

  const progress = useMemo(() => {
    if (!plan?.tasks?.length) return 0
    const done = plan.tasks.filter((t) => plan.task_states[t.id] === 'done').length
    return Math.round((done / plan.tasks.length) * 100)
  }, [plan])

  async function setStatus(taskId: string, status: TaskStatus) {
    if (!plan) return
    const next = { ...plan.task_states, [taskId]: status }
    const prev = plan
    setPlan({ ...plan, task_states: next })
    const { error } = await supabase.from('orchestration_plans').update({ task_states: next }).eq('id', plan.id)
    if (error) {
      toast.error('Could not save the status')
      setPlan(prev)
    }
  }

  function validateForm(): string | null {
    if (!/^[A-Z][A-Za-z0-9_]{1,40}$/.test(form.name)) return 'Name must start with a capital letter (PascalCase, no spaces)'
    if (!/^[A-Z0-9]{2,11}$/.test(form.symbol)) return 'Symbol: 2 to 11 characters (A-Z, 0-9)'
    const d = Number(form.decimals)
    if (!Number.isInteger(d) || d < 0 || d > 36) return 'Decimals: a whole number from 0 to 36'
    if (!/^\d{1,30}$/.test(form.initial_supply)) return 'Supply: a positive whole number'
    return null
  }

  async function generateContract() {
    if (!plan) return
    const err = validateForm()
    if (err) { toast.error(err); return }
    setGeneratingContract(true)
    try {
      const { data, error } = await supabase.functions.invoke('web3-contract-gen', {
        body: {
          plan_id: plan.id,
          standard: 'erc20',
          name: form.name,
          symbol: form.symbol.toUpperCase(),
          decimals: Number(form.decimals),
          initial_supply: form.initial_supply,
        },
      })
      if (error) throw new Error(error.message || 'Generation failed')
      if (data?.error) throw new Error(data.error)
      setContract({
        id: data.contract_id,
        name: data.name, symbol: data.symbol,
        source_code: data.source_code,
        decimals: data.decimals,
        initial_supply: String(data.initial_supply),
      })
      setDeployment(null)
      toast.success(`Contract ${data.name} created`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the contract')
    } finally {
      setGeneratingContract(false)
    }
  }

  async function refreshHistory() {
    if (!contract) return
    const { data: deps } = await supabase
      .from('contract_deployments')
      .select('id, contract_address, tx_hash, block_number, gas_used, explorer_url, events, created_at')
      .eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(20)
    if (deps?.length) {
      const mapped: Deployment[] = deps.map((d) => ({
        id: d.id,
        contract_address: d.contract_address,
        tx_hash: d.tx_hash,
        block_number: d.block_number,
        gas_used: d.gas_used,
        explorer_url: d.explorer_url,
        created_at: d.created_at,
        events: (d.events ?? []) as Deployment['events'],
      }))
      setHistory(mapped)
      setDeployment(mapped[0])
    }
  }

  // Polling: enquanto deploying, atualiza histórico a cada 3s para refletir novas linhas
  useEffect(() => {
    if (!deploying || !contract) return
    const t = setInterval(() => { void refreshHistory() }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploying, contract?.id])

  async function deployContract() {
    if (!contract) return
    setDeploying(true)
    setDeployError(null)
    const toastId = toast.loading(deployment ? 'Deploying the contract to Sepolia again...' : 'Deploying the contract to Sepolia...')
    try {
      const { data, error } = await supabase.functions.invoke('web3-contract-deploy', {
        body: { contract_id: contract.id },
      })
      if (error) throw new Error(error.message || 'Deploy failed')
      if (data?.error) {
        if (data.error === 'deployer_not_configured') throw new Error('The deployer is not available right now. Try again in a moment.')
        throw new Error(data.error)
      }
      const newDep: Deployment = {
        id: data.deployment_id,
        contract_address: data.contract_address,
        tx_hash: data.tx_hash,
        block_number: data.block_number,
        gas_used: data.gas_used,
        explorer_url: data.explorer_url,
        created_at: new Date().toISOString(),
        events: data.events ?? [],
      }
      setDeployment(newDep)
      setHistory((h) => [newDep, ...h.filter((x) => x.id !== newDep.id)].slice(0, 20))
      toast.success('Deployed to Sepolia', { id: toastId, description: `Tx ${String(data.tx_hash).slice(0, 10)}…` })
      void refreshHistory()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deploy failed'
      setDeployError(msg)
      toast.error(msg, { id: toastId })
    } finally {
      setDeploying(false)
    }
  }

  function exportEventsCSV() {
    if (!deployment?.events?.length) return
    const rows = [['index', 'name', 'args', 'topic0', 'data']]
    deployment.events.forEach((ev, i) => {
      rows.push([
        String(i),
        ev.name ?? '',
        Array.isArray(ev.args) ? JSON.stringify(ev.args) : '',
        ev.topics?.[0] ?? '',
        ev.data ?? '',
      ])
    })
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadFile(`events-${deployment.tx_hash.slice(0, 10)}.csv`, csv, 'text/csv')
  }

  function exportPlan() {
    if (!plan) return
    const payload = {
      exported_at: new Date().toISOString(),
      plan,
      contract,
      deployment,
      deployments_history: history,
      explorer_links: deployment ? {
        contract: `https://sepolia.etherscan.io/address/${deployment.contract_address}`,
        tx: `https://sepolia.etherscan.io/tx/${deployment.tx_hash}`,
        block: deployment.block_number ? `https://sepolia.etherscan.io/block/${deployment.block_number}` : null,
      } : null,
    }
    downloadFile(`kubo-plan-${plan.id.slice(0, 8)}.json`, JSON.stringify(payload, null, 2), 'application/json')
  }

  if (loading) {
    return <div className={`min-h-screen flex items-center justify-center ${siteRoot}`}><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }
  if (!plan) return null

  const showWeb3 = plan.intent !== 'web2_app' || plan.capabilities.some((c) =>
    ['wallet', 'smart_contract', 'token_mint', 'nft', 'on_chain_tx'].includes(c))

  return (
    <AppShell width="narrow" topBar={<AppTopBar back={{ to: '/dashboard', label: 'Dashboard' }} title="Plan" />}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <PanelHeader
          title="Build plan"
          description={<span className="italic">"{plan.prompt}"</span>}
          actions={
            <>
              <Badge variant="outline" className="rounded-full capitalize">{plan.intent.replace('_', ' ')}</Badge>
              <Badge className="rounded-full">{progress}% done</Badge>
            </>
          }
        />
      </motion.div>

      {showWeb3 && (
        <Card className="mb-6 rounded-xl border-primary/30 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" /> Your Vertal wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              Demo wallet (test version). On-chain deploys use the platform's own deployer wallet.
            </p>
            <code className="text-sm font-mono bg-muted px-3 py-2 rounded-md inline-block">{wallet.short ?? '-'}</code>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 rounded-xl border-white/[0.06] bg-card/50">
        <CardHeader className="pb-3"><CardTitle className="text-base">Detected capabilities</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {plan.capabilities.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries(plan.stack).map(([k, v]) => (
              <div key={k} className="p-3 rounded-md bg-muted">
                <div className="text-xs text-muted-foreground capitalize">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6 mb-8">
        {([1, 2, 3] as const).map((layer) => {
          const meta = LAYER_META[layer]
          const Icon = meta.icon
          const tasks = tasksByLayer[layer]
          if (!tasks.length) return null
          return (
            <Card key={layer} className="rounded-xl border-white/[0.06] bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className={`flex items-center gap-2 text-base ${meta.color}`}>
                  <Icon className="h-4 w-4" /> {meta.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tasks.map((t) => {
                    const status = plan.task_states[t.id] ?? 'todo'
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50">
                        <div className="flex items-center gap-3 min-w-0">
                          {status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                          {status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />}
                          {status === 'todo' && <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <span className={`text-sm truncate ${status === 'done' ? 'line-through opacity-60' : ''}`}>{t.title}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => (
                            <Button key={s} variant={status === s ? 'default' : 'ghost'} size="sm"
                              className="h-7 text-xs px-2" onClick={() => setStatus(t.id, s)}>
                              {s === 'todo' ? 'To do' : s === 'in_progress' ? 'In progress' : 'Done'}
                            </Button>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {showWeb3 && (
        <Card className="mb-6 rounded-xl border-emerald-500/30 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCode className="h-4 w-4 text-emerald-400" /> Smart contract (custom ERC-20)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="c-name" className="text-xs">Name</Label>
                <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="c-sym" className="text-xs">Symbol</Label>
                <Input id="c-sym" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <Label htmlFor="c-dec" className="text-xs">Decimals</Label>
                <Input id="c-dec" type="number" min={0} max={36} value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="c-sup" className="text-xs">Initial supply</Label>
                <Input id="c-sup" value={form.initial_supply} onChange={(e) => setForm({ ...form, initial_supply: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Based on OpenZeppelin v5. After you create it, deploy it to the Sepolia testnet.
              </p>
              <div className="flex gap-2">
                <Button onClick={generateContract} disabled={generatingContract || deploying} className="gap-2">
                  {generatingContract ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : 'Create contract'}
                </Button>
                {contract && (
                  <Button onClick={deployContract} disabled={deploying || generatingContract} variant="default" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    {deploying ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying...</> : <><Rocket className="h-4 w-4" /> Deploy Sepolia</>}
                  </Button>
                )}
              </div>
            </div>

            {contract && (
              <>
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <div className="text-sm">
                    <span className="font-medium">{contract.name}</span>{' '}
                    <span className="text-muted-foreground">({contract.symbol}, {contract.decimals} decimals, supply {contract.initial_supply})</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => downloadFile(`${contract.name}.sol`, contract.source_code, 'text/plain')} className="gap-2">
                    <Download className="h-4 w-4" /> Download .sol
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto max-h-80 font-mono">{contract.source_code}</pre>
              </>
            )}

            {deployment ? (
              <div className="border border-emerald-500/30 rounded-md p-4 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 font-medium text-emerald-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Deployed
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Sepolia · success</Badge>
                    <Button size="sm" variant="ghost" onClick={deployContract} disabled={deploying} className="h-7 text-xs gap-1">
                      {deploying
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</>
                        : <><Rocket className="h-3 w-3" /> Re-deploy</>}
                    </Button>
                  </div>
                </div>
                {deployError && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                    {deployError}
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  <Field label="Contract" value={deployment.contract_address} href={`https://sepolia.etherscan.io/address/${deployment.contract_address}`} />
                  <Field label="Tx hash" value={deployment.tx_hash} href={`https://sepolia.etherscan.io/tx/${deployment.tx_hash}`} />
                  <Field label="Block" value={String(deployment.block_number ?? '-')} href={deployment.block_number ? `https://sepolia.etherscan.io/block/${deployment.block_number}` : undefined} />
                  <Field label="Gas used" value={deployment.gas_used ?? '-'} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a href={`https://sepolia.etherscan.io/address/${deployment.contract_address}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"><ExternalLink className="h-3 w-3" /> Contract on Etherscan</Button>
                  </a>
                  <a href={`https://sepolia.etherscan.io/tx/${deployment.tx_hash}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"><ExternalLink className="h-3 w-3" /> Transaction on Etherscan</Button>
                  </a>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => copy(deployment.contract_address, 'Address copied')}>
                    <Copy className="h-3 w-3" /> Copy address
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => copy(deployment.tx_hash, 'Hash copied')}>
                    <Copy className="h-3 w-3" /> Copy tx hash
                  </Button>
                  {deployment.events.length > 0 && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                        onClick={() => downloadFile(`events-${deployment.tx_hash.slice(0, 10)}.json`, JSON.stringify(deployment.events, null, 2), 'application/json')}>
                        <Download className="h-3 w-3" /> Events (JSON)
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={exportEventsCSV}>
                        <Download className="h-3 w-3" /> Events (CSV)
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                    onClick={() => copy(
                      `Contract: https://sepolia.etherscan.io/address/${deployment.contract_address}\nTx: https://sepolia.etherscan.io/tx/${deployment.tx_hash}${deployment.block_number ? `\nBlock: https://sepolia.etherscan.io/block/${deployment.block_number}` : ''}`,
                      'Etherscan links copied',
                    )}>
                    <Copy className="h-3 w-3" /> Copy Etherscan links
                  </Button>
                </div>
                {deployment.events.length > 0 && (
                  <div className="pt-1">
                    <div className="text-xs text-muted-foreground mb-2">Emitted events ({deployment.events.length})</div>
                    <ul className="space-y-1.5">
                      {deployment.events.map((ev, i) => (
                        <li key={i} className="text-[11px] bg-muted/60 p-2 rounded font-mono">
                          {ev.name ? (
                            <>
                              <span className="text-emerald-400 font-semibold">{ev.name}</span>
                              {Array.isArray(ev.args) && ev.args.length > 0 && (
                                <span className="text-muted-foreground">({ev.args.map((a) => typeof a === 'string' && a.startsWith('0x') ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a)).join(', ')})</span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">topic: {ev.topics?.[0]?.slice(0, 18)}…</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : contract ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">Status: <span className="ml-1 text-amber-400">waiting for deploy</span></Badge>
                  <Button size="sm" variant="ghost" onClick={deployContract} disabled={deploying} className="h-7 text-xs gap-1">
                    {deploying ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</> : <><Rocket className="h-3 w-3" /> Try again</>}
                  </Button>
                </div>
                {deployError && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                    {deployError}
                  </div>
                )}
              </div>
            ) : null}

            {history.length > 1 && (
              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-muted-foreground">Deploy history ({history.length})</div>
                  <Button size="sm" variant="ghost" onClick={refreshHistory} className="h-7 text-xs">Refresh</Button>
                </div>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {history.map((d) => {
                    const isCurrent = deployment?.id === d.id
                    return (
                      <li key={d.id} className={`text-[11px] p-2 rounded font-mono flex items-center justify-between gap-2 ${isCurrent ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-muted/60'}`}>
                        <button onClick={() => setDeployment(d)} className="text-left truncate hover:text-foreground">
                          <span className="text-emerald-400">{d.tx_hash.slice(0, 10)}…{d.tx_hash.slice(-6)}</span>
                          <span className="text-muted-foreground ml-2">{d.created_at ? new Date(d.created_at).toLocaleString() : ''}</span>
                        </button>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => copy(d.tx_hash, 'Hash copied')} className="text-muted-foreground hover:text-foreground" title="Copy tx"><Copy className="h-3 w-3" /></button>
                          <a href={`https://sepolia.etherscan.io/tx/${d.tx_hash}`} target="_blank" rel="noreferrer" className="text-primary" title="Open tx"><ExternalLink className="h-3 w-3" /></a>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={exportPlan} className="gap-2">
          <Download className="h-4 w-4" /> Export all (JSON)
        </Button>
      </div>
    </AppShell>
  )
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <code className="font-mono truncate">{value}</code>
      <button onClick={() => copy(value)} className="text-muted-foreground hover:text-foreground shrink-0" title="Copy">
        <Copy className="h-3 w-3" />
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-primary shrink-0" title="Open on Etherscan">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
