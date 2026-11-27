import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { streamChat, type Msg } from '@/lib/streamChat'
import { splitProseAndCode } from '@/lib/builderTurn'
import { wrapPreviewHtml } from '@/lib/iframePreview'
import {
  EMBED_AUTH_MESSAGE,
  EMBED_HANDOFF_KEY,
  EMBED_POPUP_NAME,
  buildAuthUrl,
  buildEmbedSignInUrl,
  isValidNonce,
  newNonce,
  readEmbedAuthMessage,
  readFirstPartyAccessToken,
  requestEmbedTokenHash,
  safeRef,
  safeTheme,
  type EmbedAuthMessage,
} from '@/lib/embedAuth'

/**
 * vertal.dev/embed — the only vertal.dev page any website may frame
 * (worker/embedPolicy.ts). Rendered by src/main.tsx instead of the full app, so
 * it has minimal chrome (no ads, no PWA prompts, no vertal.js).
 *
 *   /embed        build with AI, see the live preview, publish, open the result
 *   /embed/login  sign-in popup (first-party window) that hands the sign-in back
 *
 * Query params: ref=<referral code>, theme=dark|light.
 */
export default function EmbedRoot() {
  const isLogin = window.location.pathname.startsWith('/embed/login')
  return <AuthProvider>{isLogin ? <EmbedLogin /> : <EmbedPage />}</AuthProvider>
}

const PALETTES = {
  dark: { bg: '#080B14', card: '#0F1424', text: '#EEF2FF', muted: '#94A3B8', border: '#1E293B', accent: '#D4AF37', accentText: '#0B0B0B', danger: '#F87171' },
  light: { bg: '#FFFFFF', card: '#F8FAFC', text: '#0F172A', muted: '#475569', border: '#E2E8F0', accent: '#B8860B', accentText: '#FFFFFF', danger: '#DC2626' },
}
type Palette = (typeof PALETTES)['dark']

/* ------------------------------- sign-in popup ------------------------------- */

type LoginStatus = 'checking' | 'sending' | 'done' | 'no-opener' | 'error'

function EmbedLogin() {
  const params = new URLSearchParams(window.location.search)
  const nonce = params.get('nonce')
  const ref = safeRef(params.get('ref'))
  const [status, setStatus] = useState<LoginStatus>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!isValidNonce(nonce)) {
        setStatus('error')
        setError('This sign-in link is not valid. Close this window and try again.')
        return
      }
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (!data.session) {
        // Remember the sign-in in this tab, in case the provider sends the user
        // back to another page (src/main.tsx brings them back here).
        try { sessionStorage.setItem(EMBED_HANDOFF_KEY, nonce) } catch { /* ignore */ }
        window.location.replace(buildAuthUrl(nonce, ref))
        return
      }
      try { sessionStorage.removeItem(EMBED_HANDOFF_KEY) } catch { /* ignore */ }
      const opener = window.opener as Window | null
      if (!opener || opener.closed) {
        setStatus('no-opener')
        return
      }
      setStatus('sending')
      try {
        const tokenHash = await requestEmbedTokenHash(data.session.access_token)
        if (cancelled) return
        const message: EmbedAuthMessage = { type: EMBED_AUTH_MESSAGE, nonce, tokenHash }
        // Only a window on our own origin (the embed frame) can receive this.
        opener.postMessage(message, window.location.origin)
        setStatus('done')
        setTimeout(() => window.close(), 400)
      } catch (e) {
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    }
    void run()
    return () => { cancelled = true }
  }, [nonce, ref])

  const text: Record<LoginStatus, string> = {
    checking: 'Checking your sign-in...',
    sending: 'Signing you in to the embed...',
    done: 'You are signed in. You can close this window.',
    'no-opener': 'You are signed in. Close this window, go back to the page and press Continue in the Vertal Dev frame.',
    error: error ?? 'Something went wrong.',
  }
  const p = PALETTES.dark
  return (
    <div style={{ ...shell(p, 'dark'), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 360 }}>
        <p data-testid="embed-login-status">{text[status]}</p>
        {(status === 'done' || status === 'no-opener' || status === 'error') && (
          <button type="button" onClick={() => window.close()} style={{ ...ghost(p), marginTop: 16 }}>
            Close window
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------- embed ---------------------------------- */

type Project = { id: string; title: string; generated_code: string | null; messages: unknown; published_url: string | null }

function EmbedPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const theme = safeTheme(params.get('theme'))
  const ref = safeRef(params.get('ref'))
  const p = PALETTES[theme]
  const { user, loading } = useAuth()
  const [waiting, setWaiting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const nonceRef = useRef<string | null>(null)

  const openInVertal = `${window.location.origin}${ref ? `/auth?ref=${encodeURIComponent(ref)}&redirect=%2Fbuilder` : '/builder'}`

  const finishWithTokenHash = useCallback(async (tokenHash: string) => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (error) {
      setNotice('Sign-in did not finish. Try again, or open Vertal Dev in a new tab.')
      setWaiting(false)
      return
    }
    setNotice(null)
    setWaiting(false)
    popupRef.current?.close()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const nonce = nonceRef.current
      if (!nonce) return
      const tokenHash = readEmbedAuthMessage(event, { origin: window.location.origin, nonce, source: popupRef.current ?? undefined })
      if (!tokenHash) return
      nonceRef.current = null
      void finishWithTokenHash(tokenHash)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [finishWithTokenHash])

  const signIn = () => {
    const nonce = newNonce()
    nonceRef.current = nonce
    const popup = window.open(buildEmbedSignInUrl(window.location.origin, nonce, ref), EMBED_POPUP_NAME, 'popup,width=480,height=720')
    if (!popup) {
      setNotice('Your browser blocked the sign-in window. Allow pop-ups, or open Vertal Dev in a new tab.')
      return
    }
    popupRef.current = popup
    setNotice(null)
    setWaiting(true)
  }

  const continueAfterPopup = async () => {
    const accessToken = await readFirstPartyAccessToken()
    if (!accessToken) {
      setNotice('This browser does not let the frame use your sign-in. Open Vertal Dev in a new tab instead.')
      return
    }
    try {
      await finishWithTokenHash(await requestEmbedTokenHash(accessToken))
    } catch (e) {
      setNotice(e instanceof Error ? `${e.message} Press Sign in again.` : 'Press Sign in again.')
      setWaiting(false)
    }
  }

  return (
    <div style={shell(p, theme)} data-testid="vertal-dev-embed" data-theme={theme}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${p.border}` }}>
        <strong>Vertal Dev</strong>
        <span style={{ flex: 1 }} />
        {user?.email && <span style={{ color: p.muted, fontSize: 12 }}>{user.email}</span>}
        <a href={openInVertal} target="_blank" rel="noopener noreferrer" style={link(p)}>Open in Vertal Dev ↗</a>
        {user && (
          // Local sign-out only: never end the user's other sessions (vertal.dev tabs).
          <button type="button" onClick={() => { void supabase.auth.signOut({ scope: 'local' }) }} style={ghost(p)}>
            Sign out
          </button>
        )}
      </header>
      <main style={{ padding: 16 }}>
        {notice && <p role="status" style={{ color: p.danger, marginBottom: 12 }}>{notice}</p>}
        {loading ? (
          <p style={{ color: p.muted }}>Loading...</p>
        ) : !user ? (
          <Centered p={p}>
            <h1 style={h1}>Build an app with AI</h1>
            <p style={{ color: p.muted }}>Sign in to describe an app, see it live and publish it, right here.</p>
            <button type="button" onClick={signIn} style={primary(p)} data-testid="embed-sign-in">Sign in</button>
            {waiting && (
              <>
                <p style={{ color: p.muted, marginTop: 8 }}>Finish signing in in the new window. Did it close without signing you in here?</p>
                <button type="button" onClick={continueAfterPopup} style={ghost(p)}>Continue</button>
              </>
            )}
            <p style={{ color: p.muted, fontSize: 12 }}>Sign-in opens in a new window, never inside this page.</p>
          </Centered>
        ) : (
          <Studio p={p} openInVertal={openInVertal} />
        )}
      </main>
    </div>
  )
}

function Studio({ p, openInVertal }: { p: Palette; openInVertal: string }) {
  const { user } = useAuth()
  const { subscription, canEdit, incrementEdit, loading: subLoading } = useSubscription()
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [prompt, setPrompt] = useState('')
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [busy, setBusy] = useState<null | 'building' | 'publishing'>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [view, setView] = useState<'preview' | 'live'>('preview')

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, title, generated_code, messages, published_url')
      .order('updated_at', { ascending: false })
      .limit(20)
    setProjects((data as unknown as Project[]) ?? [])
  }, [])
  useEffect(() => { void loadProjects() }, [loadProjects])

  const open = (id: string) => {
    const found = projects.find((x) => x.id === id) ?? null
    setProject(found)
    setCode(found?.generated_code ?? '')
    setMessages(Array.isArray(found?.messages) ? (found!.messages as Msg[]) : [])
    setView(found?.published_url ? 'live' : 'preview')
    setMsg(null)
  }

  const newProject = () => {
    setProject(null)
    setCode('')
    setMessages([])
    setView('preview')
  }

  const save = async (html: string, msgs: Msg[]): Promise<string | null> => {
    if (!user) return null
    const title = (msgs.find((m) => m.role === 'user')?.content ?? 'Untitled Project').slice(0, 60)
    if (project) {
      const { error } = await supabase.from('projects').update({ title, generated_code: html, messages: msgs as never, updated_at: new Date().toISOString() }).eq('id', project.id)
      if (error) throw error
      return project.id
    }
    const { data, error } = await supabase.from('projects').insert({ user_id: user.id, title, generated_code: html, messages: msgs as never }).select('id, title, generated_code, messages, published_url').single()
    if (error) throw error
    setProject(data as unknown as Project)
    return (data as { id: string }).id
  }

  const build = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!subscription?.is_active) { setMsg('You need an active plan to build. Open Vertal Dev to choose one.'); return }
    if (!canEdit) { setMsg('Your edits are used up. Open Vertal Dev to reload.'); return }
    await incrementEdit()
    setBusy('building')
    setMsg(null)
    setView('preview')
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    let answer = ''
    await streamChat({
      messages: next,
      onDelta: (chunk) => {
        answer += chunk
        const html = splitProseAndCode(answer).code
        if (html) setCode(html)
      },
      onDone: async () => {
        const html = splitProseAndCode(answer).code
        const finalMsgs: Msg[] = [...next, { role: 'assistant', content: answer }]
        setMessages(finalMsgs)
        setPrompt('')
        if (html.includes('<')) {
          setCode(html)
          try { await save(html, finalMsgs); await loadProjects() } catch (e) { setMsg(`Could not save: ${(e as Error).message}`) }
        } else {
          setMsg(splitProseAndCode(answer).prose.slice(0, 400) || 'No page was made. Try a clearer prompt.')
        }
        setBusy(null)
      },
      onError: (error) => { setMsg(error); setBusy(null) },
    }).catch((e) => { setMsg((e as Error).message || 'Failed to generate'); setBusy(null) })
  }

  const publish = async () => {
    if (!code || busy) return
    setBusy('publishing')
    setMsg(null)
    try {
      const id = await save(code, messages)
      if (!id) throw new Error('Save the project first')
      const { data, error } = await supabase.functions.invoke('cloudflare-publish', { body: { project_id: id } })
      if (error || !data?.url) throw new Error(data?.error === 'cloudflare_not_configured' ? 'Publishing is not active yet. Try later.' : 'Could not publish.')
      setProject((cur) => (cur ? { ...cur, published_url: data.url } : cur))
      setView('live')
      setMsg(`Published at ${data.url}`)
      await loadProjects()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const liveUrl = project?.published_url ?? null
  const srcDoc = useMemo(() => (code ? wrapPreviewHtml(code, { instrument: false }) : ''), [code])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={project?.id ?? ''} onChange={(e) => (e.target.value ? open(e.target.value) : newProject())} style={input(p)} aria-label="Project">
          <option value="">New project</option>
          {projects.map((x) => <option key={x.id} value={x.id}>{x.title || 'Untitled'}</option>)}
        </select>
        {project && (
          <a href={`${window.location.origin}/builder/${project.id}`} target="_blank" rel="noopener noreferrer" style={link(p)}>Edit in Vertal Dev ↗</a>
        )}
        {!project && <a href={openInVertal} target="_blank" rel="noopener noreferrer" style={link(p)}>Full editor ↗</a>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={code ? 'Describe a change...' : 'Describe the app or page you want...'}
          rows={2}
          style={{ ...input(p), flex: 1, resize: 'vertical' }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void build() }}
        />
        <button type="button" onClick={() => void build()} disabled={!!busy || subLoading || !prompt.trim()} style={primary(p)}>
          {busy === 'building' ? 'Building...' : 'Build'}
        </button>
      </div>

      {msg && <p role="status" style={{ color: p.muted }}>{msg}</p>}

      {(code || liveUrl) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setView('preview')} style={view === 'preview' ? primary(p) : ghost(p)} disabled={!code}>Preview</button>
          <button type="button" onClick={() => setView('live')} style={view === 'live' ? primary(p) : ghost(p)} disabled={!liveUrl}>Live site</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => void publish()} disabled={!!busy || !code} style={primary(p)}>
            {busy === 'publishing' ? 'Publishing...' : liveUrl ? 'Publish again' : 'Publish'}
          </button>
          {liveUrl && <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={link(p)}>Open live site ↗</a>}
        </div>
      )}

      {view === 'live' && liveUrl ? (
        <iframe key={liveUrl} src={liveUrl} title="Live site" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style={frame(p)} />
      ) : code ? (
        // srcdoc without allow-same-origin: the generated code runs in an opaque origin
        // and can't read vertal.dev storage (the embed session).
        <iframe srcDoc={srcDoc} title="Preview" sandbox="allow-scripts allow-forms allow-popups allow-modals" style={frame(p)} />
      ) : (
        <p style={{ color: p.muted }}>Your preview shows up here.</p>
      )}
    </div>
  )
}

function Centered({ p, children }: { p: Palette; children: ReactNode }) {
  return (
    <div style={{ ...card(p), maxWidth: 420, margin: '48px auto', textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
      {children}
    </div>
  )
}

const shell = (p: Palette, theme: string): CSSProperties => ({ minHeight: '100vh', background: p.bg, color: p.text, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, colorScheme: theme })
const h1: CSSProperties = { fontSize: 20, fontWeight: 600 }
const card = (p: Palette): CSSProperties => ({ background: p.card, border: `1px solid ${p.border}`, borderRadius: 12, padding: 16 })
const frame = (p: Palette): CSSProperties => ({ width: '100%', height: 520, border: `1px solid ${p.border}`, borderRadius: 12, background: '#fff' })
const primary = (p: Palette): CSSProperties => ({ background: p.accent, color: p.accentText, border: 0, borderRadius: 999, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' })
const ghost = (p: Palette): CSSProperties => ({ background: 'transparent', color: p.text, border: `1px solid ${p.border}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' })
const link = (p: Palette): CSSProperties => ({ color: p.accent, textDecoration: 'none', fontSize: 13 })
const input = (p: Palette): CSSProperties => ({ background: p.bg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 8, padding: '8px 10px' })
