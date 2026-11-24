import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { callFluxosApps, connectorPathFor, oauthReturnParams, PENDING_APP_KEY } from '@/lib/fluxos/apps'

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
      if (res.ok) {
        toast.success('Conectado.')
        navigate(connectorPathFor(app), { replace: true })
      } else {
        setError(res.message)
      }
    })()
  }, [app, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      {error ? (
        <div className="max-w-md text-center space-y-4">
          <XCircle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm">{error}</p>
          <Button onClick={() => navigate(connectorPathFor(app), { replace: true })}>Voltar ao conector</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Concluindo a conexão…
        </div>
      )}
    </div>
  )
}
