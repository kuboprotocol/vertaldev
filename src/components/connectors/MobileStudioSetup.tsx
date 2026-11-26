import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Copy, Download, ExternalLink, FolderGit2, Github, Info, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/integrations/supabase/client'
import { ConnectorIcon } from '@/components/connectors/ConnectorIcon'
import { FluxosConnectPanel } from '@/components/connectors/FluxosConnectPanel'
import { useSchedulerUiLang } from '@/lib/chatScheduler/client'
import { ASC_APP, MOBILE_STUDIO_SLUGS, PLAY_APP, getMobileStudioConnector, parseGitHubRepo, studioRecipe } from '@/lib/mobileStudio/connectors'
import { MS_UI, msLang, type MsTexts } from '@/lib/mobileStudio/i18n'

interface Repo { full_name: string; private: boolean; updated_at?: string }

function CopyButton({ text, t }: { text: string; t: MsTexts }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button" variant="ghost" size="sm" className="gap-1 shrink-0"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }) }}
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {done ? t.copied : t.copy}
    </Button>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  )
}

/** Escolher o repositório do GitHub e mostrar como abrir no Android Studio ou no Xcode (Capacitor). */
function OpenProjectCard({ platform, t }: { platform: 'android' | 'ios'; t: MsTexts }) {
  const navigate = useNavigate()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('github-repos', { body: null })
        if (!cancelled) setRepos(error ? null : ((data as { repos?: Repo[] })?.repos ?? []))
      } catch {
        if (!cancelled) setRepos(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const parsed = parseGitHubRepo(value)
  const recipe = parsed ? studioRecipe(platform, parsed.owner, parsed.repo) : null
  const ideSteps = platform === 'android' ? t.androidIdeSteps : t.iosIdeSteps

  return (
    <Card className="p-6 space-y-4" data-testid={`mobile-studio-open-${platform}`}>
      <div className="flex items-center gap-2">
        <FolderGit2 className="w-4 h-4 text-primary" />
        <h2 className="font-semibold">{t.projectTitle}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{t.projectIntro}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t.loadingRepos}</p>
      ) : repos === null ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t.noGithub}</span>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/connectors/github/setup')}>
            <Github className="w-4 h-4" /> {t.connectGithub}
          </Button>
        </div>
      ) : repos.length > 0 ? (
        <div className="space-y-1.5">
          <Label className="text-xs">{t.pickRepo}</Label>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
            {repos.slice(0, 60).map((r) => (
              <Button
                key={r.full_name} type="button" size="sm"
                variant={value === r.full_name ? 'default' : 'outline'}
                className="h-7 text-xs" onClick={() => setValue(r.full_name)}
              >
                {r.full_name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`repo-${platform}`}>{t.repoLabel}</Label>
        <Input id={`repo-${platform}`} value={value} placeholder={t.repoPlaceholder} onChange={(e) => setValue(e.target.value)} />
        {value.trim() && !parsed && <p className="text-xs text-destructive">{t.repoInvalid}</p>}
      </div>

      <Steps items={ideSteps} />

      {recipe && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <code className="text-xs flex-1 break-all">{recipe.cloneUrl}</code>
            <CopyButton text={recipe.cloneUrl} t={t} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={recipe.zipUrl} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /> {t.downloadZip}</a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={recipe.webUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /> {t.openGithub}</a>
            </Button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t.commandsTitle}</Label>
              <CopyButton text={recipe.commands.join('\n')} t={t} />
            </div>
            <pre className="text-xs rounded-lg border border-border bg-muted/40 p-3 overflow-x-auto whitespace-pre">{recipe.commands.join('\n')}</pre>
            <p className="text-xs text-muted-foreground">{t.commandsNote}</p>
            {platform === 'ios' && <p className="text-xs text-muted-foreground">{t.iosMacNote}</p>}
          </div>
        </div>
      )}
    </Card>
  )
}

function PlayAccessCard({ t }: { t: MsTexts }) {
  return (
    <Card className="p-6 space-y-3 border-amber-500/40" data-testid="play-console-access-help">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h2 className="font-semibold">{t.playAccessTitle}</h2>
      </div>
      <Steps items={t.playAccessSteps} />
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <a href="https://play.google.com/console/u/0/developers/users-and-permissions" target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-4 h-4" /> Play Console
        </a>
      </Button>
    </Card>
  )
}

/**
 * Páginas /connectors/fluxos-google-play-console/setup, /connectors/android-studio/setup e
 * /connectors/ios-xcode/setup. Sem OAuth falso: Google é OAuth real; Android Studio usa o login do
 * Play Console; iOS / Xcode usa a chave de API do App Store Connect (a Apple não tem OAuth de terceiros).
 */
export function MobileStudioSetupPage({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const uiLang = useSchedulerUiLang()
  const t = MS_UI[msLang(params.get('lang') || uiLang)]
  const connector = useMemo(() => getMobileStudioConnector(slug), [slug])
  if (!connector) return null
  const returnPath = `/connectors/${slug}/setup`

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label={t.back} onClick={() => navigate('/connectors')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${connector.color}20` }}>
              <ConnectorIcon connector={connector} className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display">{connector.name}</h1>
              <p className="text-xs text-muted-foreground">{t.via}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {slug === MOBILE_STUDIO_SLUGS.play && (
          <>
            <FluxosConnectPanel app={PLAY_APP} name="Google" returnPath={returnPath} intro={t.playIntro} />
            <PlayAccessCard t={t} />
            <Card className="p-6 space-y-2">
              <h2 className="font-semibold text-sm">{t.playChatTitle}</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {t.playChatExamples.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Card>
          </>
        )}

        {slug === MOBILE_STUDIO_SLUGS.android && (
          <>
            <Card className="p-4 flex gap-3 text-sm text-muted-foreground" data-testid="android-studio-honest">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <p>{t.androidHonest}</p>
            </Card>
            <FluxosConnectPanel app={PLAY_APP} name="Google" returnPath={returnPath} intro={t.androidLoginIntro} />
            <PlayAccessCard t={t} />
            <OpenProjectCard platform="android" t={t} />
          </>
        )}

        {slug === MOBILE_STUDIO_SLUGS.ios && (
          <>
            <Card className="p-4 flex gap-3 text-sm text-muted-foreground" data-testid="ios-xcode-honest">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <p>{t.iosHonest}</p>
            </Card>
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">{t.iosKeyTitle}</h2>
              </div>
              <Steps items={t.iosKeySteps} />
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> App Store Connect
                </a>
              </Button>
            </Card>
            <FluxosConnectPanel app={ASC_APP} name="App Store Connect" returnPath={returnPath} intro={t.iosKeyIntro} />
            <p className="text-sm text-muted-foreground">{t.iosAppleIdNote}</p>
            <OpenProjectCard platform="ios" t={t} />
          </>
        )}
      </div>
    </div>
  )
}
