import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { callFluxosApps, connectorPathFor, oauthReturnParams, PENDING_APP_KEY, RETURN_PATH_KEY, safeReturnPath } from '@/lib/fluxos/apps'
import { SITE_FONT, siteRoot } from '@/components/site/siteUi'

/** Janela de login aberta pelo próprio painel do Vertal Fluxos (não pelo Vertal Dev): devolve o retorno para ela. */
const FLUXOS_UI_ORIGIN = (import.meta.env.VITE_FLUXOS_UI_ORIGIN as string | undefined) ?? 'https://automatisch-main-production.up.railway.app'

/** Retorno do login OAuth dos apps do Vertal Fluxos (https://vertal.dev/fluxos/oauth/:app). */
export default function FluxosOAuthCallbackPage() {
  const { app = '' } = useParams<{ app: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const pending = sessionStorage.getItem(PENDING_APP_KEY)
    if (window.opener && pending !== app) {
      try {
        window.opener.postMessage({ source: 'automatisch', payload: { search: window.location.search, hash: window.location.hash } }, FLUXOS_UI_ORIGIN)
      } finally {
        window.close()
      }
      return
    }
    const params = oauthReturnParams(window.location.search, window.location.hash)
    // Tira o código da barra de endereços antes de qualquer outra coisa.
    window.history.replaceState(null, '', window.location.pathname)
    ;(async () => {
      const res = await callFluxosApps({ op: 'complete', app, params })
      sessionStorage.removeItem(PENDING_APP_KEY)
      const back = safeReturnPath(sessionStorage.getItem(RETURN_PATH_KEY)) ?? connectorPathFor(app)
      sessionStorage.removeItem(RETURN_PATH_KEY)
      if (res.ok) {
        toast.success('Connected')
        navigate(back, { replace: true })
      } else {
        setError(res.message)
      }
    })()
  }, [app, navigate])

  return (
    <div className={`min-h-screen flex items-center justify-center ${siteRoot} p-6`} style={SITE_FONT}>
      {error ? (
        <div className="max-w-md text-center space-y-4">
          <XCircle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm">{error}</p>
          <Button onClick={() => navigate(connectorPathFor(app), { replace: true })}>Back to the connector</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Finishing the connection…
        </div>
      )}
    </div>
  )
}
