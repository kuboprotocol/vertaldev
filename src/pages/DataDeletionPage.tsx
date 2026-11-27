// Public status page of a data deletion requested through Meta (Facebook, Instagram,
// WhatsApp, Meta Ads). Meta shows the user the link https://vertal.dev/data-deletion?code=…
// returned by the meta-data-deletion Edge Function.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SitePage from '@/components/site/SitePage'
import { PageHeader, Prose, surface } from '@/components/site/siteUi'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@/config/brand'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://sccizjlpwezsgaxkclot.supabase.co'}/functions/v1/meta-data-deletion`
export const CODE_RE = /^[A-Z2-7]{16}$/

export interface DeletionStatus {
  code: string
  status: 'received' | 'completed' | 'pending_review'
  requested_at: string | null
  completed_at: string | null
  removed_connections: number
}

type State =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'ok'; data: DeletionStatus }

function fmt(iso: string | null): string {
  if (!iso) return 'Not yet'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Not yet' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function statusText(data: DeletionStatus): { title: string; body: string } {
  if (data.status === 'completed') {
    const n = data.removed_connections
    return {
      title: 'Deletion complete',
      body: n > 0
        ? `We removed ${n === 1 ? '1 connection' : `${n} connections`} to your Meta account (Facebook, Instagram, WhatsApp or Meta Ads) and the access tokens we had stored.`
        : `${APP_NAME} had no data from your Meta account. You do not need to do anything else.`,
    }
  }
  return {
    title: 'Deletion in progress',
    body: 'We received your request and will finish the deletion within 30 days. Come back to this page with the same code to check the status.',
  }
}

export default function DataDeletionPage() {
  const [params] = useSearchParams()
  const code = (params.get('code') ?? '').trim().toUpperCase()
  const [state, setState] = useState<State>({ kind: code ? 'loading' : 'none' })

  useEffect(() => {
    if (!code) { setState({ kind: 'none' }); return }
    if (!CODE_RE.test(code)) { setState({ kind: 'invalid' }); return }
    let alive = true
    setState({ kind: 'loading' })
    fetch(`${FUNCTION_URL}?code=${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (!alive) return
        if (r.status === 404) return setState({ kind: 'not_found' })
        if (r.status === 400) return setState({ kind: 'invalid' })
        if (!r.ok) return setState({ kind: 'error' })
        setState({ kind: 'ok', data: (await r.json()) as DeletionStatus })
      })
      .catch(() => alive && setState({ kind: 'error' }))
    return () => { alive = false }
  }, [code])

  useEffect(() => { document.title = `Data deletion · ${APP_NAME}` }, [])

  return (
    <SitePage>
      <PageHeader title="Data deletion">
        Check the status of a data deletion request, and learn what we delete.
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-10 px-6 pb-24">
        {state.kind !== 'none' && (
          <section className={cn(surface.card, 'space-y-3 p-6')} aria-live="polite">
            <p className="text-[13px] text-muted-foreground">
              Confirmation code: <span className="font-mono text-foreground">{code || 'none'}</span>
            </p>
            {state.kind === 'loading' && <p className="text-muted-foreground">Checking your request…</p>}
            {state.kind === 'invalid' && <p className="text-foreground">This code is not valid. Check the link that Meta showed you.</p>}
            {state.kind === 'not_found' && <p className="text-foreground">We did not find a request with this code. Check the link that Meta showed you.</p>}
            {state.kind === 'error' && <p className="text-foreground">We could not check your request right now. Please try again in a few minutes.</p>}
            {state.kind === 'ok' && (() => {
              const t = statusText(state.data)
              return (
                <>
                  <h2 className="text-xl font-semibold text-foreground">{t.title}</h2>
                  <p className="text-muted-foreground">{t.body}</p>
                  <dl className="grid grid-cols-2 gap-2 pt-2 text-[15px]">
                    <dt className="text-muted-foreground">Request received</dt><dd className="text-foreground">{fmt(state.data.requested_at)}</dd>
                    <dt className="text-muted-foreground">Completed</dt><dd className="text-foreground">{fmt(state.data.completed_at)}</dd>
                  </dl>
                </>
              )
            })()}
          </section>
        )}

        <Prose>
          <h2>What we delete</h2>
          <p>
            When you connect Facebook, Instagram, WhatsApp or Meta Ads to {APP_NAME}, we store only what the connection needs:
            the access token (encrypted), the account ID and the account name. When you remove the app in your Meta settings,
            or ask us to delete your data, we delete these connections and tokens. Your projects and your {APP_NAME} account stay.
          </p>
          <h2>How to ask for deletion</h2>
          <ul>
            <li>On Facebook: Settings &amp; privacy → Settings → Apps and websites → Vertal Dev → Remove. Then choose the option to delete your activity.</li>
            <li>In {APP_NAME}: Connectors → the Meta app → Disconnect.</li>
            <li>To delete your whole {APP_NAME} account, contact support at <a href="/support">vertal.dev/support</a>.</li>
          </ul>
        </Prose>
      </div>
    </SitePage>
  )
}
