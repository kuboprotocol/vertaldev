import { syncFluxosConnection } from '@/lib/automatisch/fluxosSync'
import { APP_NAME } from '@/config/brand'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Loader2, ShieldCheck, KeyRound, CheckCircle2, AlertTriangle, Plug, XCircle, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { getConnectorBySlug } from '@/lib/connectorsConfig'
import { ConnectorIcon } from '@/components/connectors/ConnectorIcon'
import { supabase } from '@/integrations/supabase/client'
import { FluxosConnectPanel } from '@/components/connectors/FluxosConnectPanel'
import { WhatsAppConnectPanel } from '@/components/connectors/WhatsAppConnectPanel'
import { MobileStudioSetupPage } from '@/components/connectors/MobileStudioSetup'
import { isMobileStudioSlug } from '@/lib/mobileStudio/connectors'
import { MetaMaskSetupPage } from '@/components/connectors/MetaMaskSetup'
import { isMetaMaskSlug } from '@/lib/vertalWallet/config'
import { cn } from '@/lib/utils'
import { getGitHubOAuthUrl } from '@/lib/github/oauth'
import { localizeConnector } from '@/lib/connectorsCopyEn'
import { SITE_FONT, siteRoot, surface } from '@/components/site/siteUi'

// English copy of GITHUB_TOKEN_STEPS (src/lib/github/oauth.ts), same three steps.
const GITHUB_TOKEN_STEPS_EN = [
  { title: 'Open your GitHub settings', description: 'Go to Settings → Developer settings → Personal access tokens (classic).' },
  { title: 'Create a new token', description: 'Select the repo and read:user scopes.' },
  { title: 'Paste the token here', description: 'The token is encrypted and stored by Vertal.' },
] as const

type GithubProfile = { login: string; avatar_url: string | null; profile_url: string }

export default function ConnectorSetupPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const connector = localizeConnector(getConnectorBySlug(slug))

  const [accepted, setAccepted] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<{ masked_hint: string | null; updated_at: string } | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; account?: string | null; detail?: string | null } | null>(null)

  const [githubProfile, setGithubProfile] = useState<GithubProfile | null>(null)
  // GitHub: "Entrar com GitHub" (OAuth) é o caminho principal; o token (PAT) fica em "Avançado".
  const [showToken, setShowToken] = useState(false)
  const [oauthStarting, setOauthStarting] = useState(false)
  const startGithubOAuth = async () => {
    setOauthStarting(true)
    try {
      window.location.href = await getGitHubOAuthUrl()
    } catch {
      setOauthStarting(false)
      toast.error('We could not open the GitHub sign-in. Try again, or use a token below.')
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('api_credentials_safe')
        .select('masked_hint, updated_at')
        .eq('connector_slug', slug)
        .maybeSingle()
      if (!cancelled) {
        setExisting(data ?? null)
        setLoadingExisting(false)
      }

      if (slug === 'github') {
        const { data: gh } = await supabase
          .from('github_connections_safe')
          .select('github_username, github_avatar_url')
          .maybeSingle()
        if (!cancelled && gh?.github_username) {
          setGithubProfile({
            login: gh.github_username,
            avatar_url: gh.github_avatar_url,
            profile_url: `https://github.com/${gh.github_username}`,
          })
        }
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  // Android Studio, iOS / Xcode e Google Play Console: página própria (abre mesmo com o flag do catálogo desligado).
  if (isMobileStudioSlug(slug)) return <MobileStudioSetupPage slug={slug} />
  // MetaMask: página própria (o servidor só responde para quem está liberado em VERTAL_METAMASK_USER_IDS).
  if (isMetaMaskSlug(slug)) return <MetaMaskSetupPage />

  if (!connector) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", siteRoot)} style={SITE_FONT}>
        <div className="text-center space-y-3">
          <p className="text-lg">Connector not found</p>
          <Button onClick={() => navigate('/connectors')}>Back to connectors</Button>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    if (!accepted) {
      toast.error('You must accept the terms before continuing.')
      return
    }
    if (apiKey.trim().length < 8) {
      toast.error('This key looks too short (8 characters or more).')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('connector-credentials-save', {
        body: { connector_slug: slug, api_key: apiKey.trim() },
      })
      if (error) throw error
      if ((data as any)?.error) throw new Error(JSON.stringify((data as any).error))
      const gh = (data as any)?.github as GithubProfile | null
      void syncFluxosConnection(slug ?? '')
      if (slug === 'github' && gh?.login) {
        setGithubProfile(gh)
        setApiKey('')
        // refresh existing badge
        const { data: cred } = await supabase
          .from('api_credentials_safe')
          .select('masked_hint, updated_at')
          .eq('connector_slug', slug)
          .maybeSingle()
        setExisting(cred ?? null)
        toast.success(`GitHub linked: @${gh.login}`)
      } else {
        toast.success(`${connector.name} is connected`)
        navigate(`/connectors/${slug}`)
      }
    } catch (e: any) {
      toast.error(`We could not save the key: ${e.message ?? 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('connector-credentials-test', {
        body: { connector_slug: slug },
      })
      if (error) throw error
      const r = data as any
      setTestResult({ ok: !!r?.ok, status: r?.status ?? 0, account: r?.account, detail: r?.detail })
      if (r?.ok) toast.success(`Connection works${r.account ? ` · ${r.account}` : ''}`)
      else toast.error(`Test failed: ${r?.detail ?? `HTTP ${r?.status}`}`)
    } catch (e: any) {
      const msg = e?.message ?? 'unknown error'
      setTestResult({ ok: false, status: 0, detail: msg })
      toast.error(`We could not test the connection: ${msg}`)
    } finally {
      setTesting(false)
    }
  }


  // Apps do Vertal Fluxos: conexão direta por usuário (login OAuth do app ou formulário de chave).
  if (connector.fluxosApp && slug.startsWith('fluxos-')) {
    return (
      <div className={cn("min-h-screen", siteRoot)} style={SITE_FONT}>
        <div className={cn("border-b sticky top-0 z-10", surface.bar)}>
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/connectors')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3 flex-1">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${connector.color}20` }}>
                <ConnectorIcon connector={connector} className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.01em]">{connector.name}</h1>
                <p className="text-xs text-muted-foreground">Through Vertal Fluxos · {APP_NAME}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {connector.fluxosApp === 'whatsapp'
            ? <WhatsAppConnectPanel />
            : <FluxosConnectPanel app={connector.fluxosApp} name={connector.name} />}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("min-h-screen", siteRoot)} style={SITE_FONT}>
      {/* Header */}
      <div className={cn("border-b sticky top-0 z-10", surface.bar)}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/connectors')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${connector.color}20` }}
            >
              <ConnectorIcon connector={connector} className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.01em]">Connect {connector.name}</h1>
              <p className="text-xs text-muted-foreground">Setup · {APP_NAME}</p>
            </div>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-3xl mx-auto px-4 py-8 space-y-6"
      >
        {/* Responsibility notice */}
        <Card className={cn("p-5", surface.card)}>
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">Third-party service</p>
              <p className="text-muted-foreground">
                <strong>{connector.name}</strong> is an outside service, not run by Vertal. Its prices, usage
                limits, API rules and account security are set by the provider. Vertal only makes calls
                to it with your key.
              </p>
            </div>
          </div>
        </Card>

        {slug === 'github' && (
          <Card className="p-5 border-primary/40 bg-primary/5 space-y-3" data-testid="github-oauth-card">
            <div className="flex gap-3 items-start">
              <Github className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-foreground">Sign in with GitHub</p>
                <p className="text-muted-foreground text-xs">
                  You sign in to GitHub and authorize Vertal (repositories, profile and email). The access is
                  encrypted on the server, and you can revoke it at any time on GitHub or here with Disconnect.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startGithubOAuth} disabled={oauthStarting} data-testid="github-oauth-start">
                {oauthStarting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Github className="h-4 w-4 mr-2" />}
                Sign in with GitHub
              </Button>
              {!existing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToken((v) => !v)}
                  aria-expanded={showToken}
                  data-testid="github-token-toggle"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  {showToken ? 'Hide token' : 'Advanced: use a token'}
                </Button>
              )}
            </div>
          </Card>
        )}

        {slug === 'cloudflare' && (
          <div className="space-y-3" data-testid="cloudflare-oauth-panel">
            {/* Conexão do próprio cliente: "Entrar com Cloudflare" (OAuth da Cloudflare, app Vertal Dev). */}
            <FluxosConnectPanel
              app="cloudflare"
              name="Cloudflare"
              returnPath="/connectors/cloudflare/setup"
              intro="You sign in to Cloudflare, choose the account and confirm the permissions (domains, DNS, Workers and, if you want, Pages, KV and cache purge). Then ask Vertal Chat to list domains, create DNS records, see Workers or purge the cache (always after you confirm). You can revoke access at any time on Cloudflare or here."
            />
            {!existing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowToken((v) => !v)}
                aria-expanded={showToken}
                data-testid="cloudflare-token-toggle"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                {showToken ? 'Hide advanced' : 'Advanced: use an API token'}
              </Button>
            )}
          </div>
        )}

        {slug === 'github' && githubProfile && (
          <Card className="p-5 border-emerald-500/40 bg-emerald-500/5">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 ring-2 ring-emerald-500/40">
                <AvatarImage src={githubProfile.avatar_url ?? undefined} alt={githubProfile.login} />
                <AvatarFallback>
                  <Github className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">@{githubProfile.login}</p>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Linked via PAT
                  </Badge>
                </div>
                <a
                  href={githubProfile.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5"
                >
                  {githubProfile.profile_url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Button size="sm" onClick={() => navigate('/connectors/github')}>
                Open panel
              </Button>
            </div>
          </Card>
        )}

        {/* Current status and connection test */}
        {!loadingExisting && existing && (
          <Card className="p-4 border-emerald-500/30 bg-emerald-500/5 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium">Key configured</p>
                <p className="text-muted-foreground text-xs">
                  {existing.masked_hint ?? '••••'} · updated {new Date(existing.updated_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                Test connection
              </Button>
            </div>

            {testResult && (
              <div
                className={cn(
                  'rounded-lg border p-3 text-sm flex items-start gap-2',
                  testResult.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-200'
                )}
              >
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 space-y-0.5">
                  <p className="font-medium">
                    {testResult.ok ? 'Connection OK' : 'Connection failed'}
                    {testResult.status ? ` · HTTP ${testResult.status}` : ''}
                  </p>
                  {testResult.account && <p className="text-xs opacity-90">Account: {testResult.account}</p>}
                  {testResult.detail && <p className="text-xs opacity-80 break-words">{testResult.detail}</p>}
                </div>
              </div>
            )}
          </Card>
        )}

        {((slug !== 'github' && slug !== 'cloudflare') || showToken || Boolean(existing)) && (<>
        {/* Steps */}
        <div className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            How to get your {connector.apiKeyLabel}
          </h2>
          {(slug === 'github' ? GITHUB_TOKEN_STEPS_EN : connector.setupSteps).map((step, i) => (
            <Card key={i} className={cn("p-4 flex gap-4", surface.card)}>
              <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{step.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
              </div>
            </Card>
          ))}
          {connector.apiKeyDocsUrl && (
            <a
              href={connector.apiKeyDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Open the official {connector.name} page
              <ExternalLink className="h-3 w-3" />
              <span className="text-muted-foreground">(external site)</span>
            </a>
          )}
        </div>

        {/* Form */}
        <Card className={cn("p-6 space-y-5", surface.card)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Connect to Vertal</h2>
            </div>
            {(connector.slug === 'github' || connector.slug === 'cloudflare') && (
              <Badge variant="outline" className="text-[11px] font-medium text-primary border-primary/40">
                {connector.slug === 'cloudflare' ? 'Advanced · API token' : 'Advanced · personal token'}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">{connector.apiKeyLabel}</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              placeholder={connector.apiKeyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">{connector.apiKeyHelp}</p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-3 bg-muted/30">
            <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Your key is encrypted with <strong>AES-256-GCM</strong> before it is stored, and it is never
              sent back to the browser. Only Vertal's server functions can decrypt it to act for you.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={accepted}
              onCheckedChange={(v) => setAccepted(Boolean(v))}
              disabled={saving}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              I understand that <strong>{connector.name}</strong> is a third-party service and that Vertal only
              makes calls to it with my key.
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => navigate('/connectors')}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !accepted || apiKey.length < 8}
              className={cn('flex-1')}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {existing ? 'Update key' : 'Save and activate'}
            </Button>
          </div>
        </Card>
        </>)}
      </motion.div>
    </div>
  )
}
