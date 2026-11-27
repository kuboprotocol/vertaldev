import { APP_NAME } from '@/config/brand'
import { useEffect, useState } from 'react'
import { Monitor, Apple, Smartphone, Terminal, Download as DownloadIcon, ExternalLink, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import SitePage from '@/components/site/SitePage'
import { PageHeader, Reveal, surface } from '@/components/site/siteUi'
import { cn } from '@/lib/utils'
import LocalAgentTokens from '@/components/download/LocalAgentTokens'
import {
  FALLBACK_DOWNLOADS,
  RELEASES_PAGE_URL,
  fetchAgentDownloads,
  type AgentPlatform,
  type ResolvedDownloads,
} from '@/lib/agentReleases'

type Platform = AgentPlatform | 'ios' | 'android'

interface PlatformCard {
  id: Platform
  name: string
  icon: typeof Monitor
  detail: string
  /** First-run command, shown when the download exists. */
  install?: string
}

const PLATFORMS: PlatformCard[] = [
  {
    id: 'windows',
    name: 'Windows',
    icon: Monitor,
    detail: 'Vertal Local Agent. It finds VS Code, Cursor, Trae and Antigravity and connects to them for you.',
  },
  {
    id: 'mac',
    name: 'macOS',
    icon: Apple,
    detail: 'Universal binary for Apple silicon and Intel. Works with VS Code, Cursor, Trae and Antigravity.',
    install: 'tar -xzf kubo-vibe-macos.tar.gz && xattr -d com.apple.quarantine kubo-agent; ./kubo-agent',
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: Terminal,
    detail: 'x86_64 binary for Ubuntu, Debian, Fedora and similar systems.',
    install: 'tar -xzf kubo-vibe-linux-x64.tar.gz && ./kubo-agent',
  },
  {
    id: 'ios',
    name: 'iOS / iPadOS',
    icon: Smartphone,
    detail: 'Use your remote workspace in the Vertal cloud.',
  },
  {
    id: 'android',
    name: 'Android',
    icon: Smartphone,
    detail: 'The same features as the web app, made for touch.',
  },
]

function detectPlatform(): Platform | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios'
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('linux') || ua.includes('x11')) return 'linux'
  return null
}

export default function DownloadPage() {
  const [detected, setDetected] = useState<Platform | null>(null)
  const [downloads, setDownloads] = useState<ResolvedDownloads>({ urls: FALLBACK_DOWNLOADS, version: null })

  useEffect(() => {
    setDetected(detectPlatform())
    const controller = new AbortController()
    fetchAgentDownloads(controller.signal).then(setDownloads).catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <SitePage>
      <PageHeader eyebrow="Vertal Local Agent" title={`Run ${APP_NAME} on your computer.`}>
        Run code on your own machine, inside the editor you already use, while you keep working in {APP_NAME}.
      </PageHeader>

      <div className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2">
          {PLATFORMS.map((platform, i) => {
            const Icon = platform.icon
            const isDetected = detected === platform.id
            const downloadUrl = downloads.urls[platform.id as AgentPlatform]
            return (
              <Reveal
                key={platform.id}
                delay={i * 0.05}
                className={cn(surface.card, 'relative p-6', isDetected && 'border-primary/40')}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06]">
                    <Icon className="h-6 w-6 text-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">{platform.name}</h2>
                      {isDetected && (
                        <Badge className="rounded-full bg-primary/15 font-medium text-primary hover:bg-primary/15">
                          Your system
                        </Badge>
                      )}
                      {!downloadUrl && (
                        <Badge variant="outline" className="gap-1 rounded-full text-[11px] font-normal text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden /> Coming soon
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{platform.detail}</p>

                    <div className="mt-5">
                      {downloadUrl ? (
                        <Button asChild className="rounded-full">
                          <a href={downloadUrl} target="_blank" rel="noreferrer noopener">
                            <DownloadIcon className="mr-2 h-4 w-4" aria-hidden />
                            Download for {platform.name}
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" disabled className="rounded-full">
                          Coming soon
                        </Button>
                      )}
                      {downloadUrl && platform.install && (
                        <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-muted-foreground">
                          {platform.install}
                        </code>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>

        <LocalAgentTokens />

        <Reveal className={cn(surface.card, 'mt-10 p-6 text-[15px] leading-relaxed text-muted-foreground')}>
          <h2 className="mb-2 text-[17px] font-semibold text-foreground">About these builds</h2>
          <p>
            The builds are not digitally signed yet. On Windows, SmartScreen may show "Windows protected your PC".
            Click <strong className="text-foreground">More info</strong>, then{' '}
            <strong className="text-foreground">Run anyway</strong>. On macOS, Gatekeeper blocks downloaded binaries
            that are not notarized. The <code className="text-foreground">xattr -d com.apple.quarantine</code> command
            above lets the agent run. This is normal for a new build without a certificate. It is not malware.
          </p>
        </Reveal>

        <div className="mt-8 text-center">
          <a
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
          >
            {downloads.version ? `Version ${downloads.version} · ` : ''}See all versions on GitHub{' '}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </SitePage>
  )
}
