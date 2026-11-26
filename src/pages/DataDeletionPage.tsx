// Página pública de status da exclusão de dados pedida pela Meta (Facebook, Instagram,
// WhatsApp, Meta Ads). A Meta mostra ao usuário o link https://vertal.dev/data-deletion?code=…
// devolvido pela Edge Function meta-data-deletion.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { Button } from '@/components/ui/button'
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
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export function statusText(data: DeletionStatus): { title: string; body: string } {
  if (data.status === 'completed') {
    const n = data.removed_connections
    return {
      title: 'Exclusão concluída',
      body: n > 0
        ? `Removemos ${n === 1 ? '1 conexão' : `${n} conexões`} da sua conta da Meta (Facebook, Instagram, WhatsApp ou Meta Ads) e os tokens de acesso que estavam guardados.`
        : `Não havia dados da sua conta da Meta guardados no ${APP_NAME}. Nada mais precisa ser feito.`,
    }
  }
  return {
    title: 'Exclusão em andamento',
    body: 'Recebemos o seu pedido e vamos concluir a exclusão em até 30 dias. Volte a esta página com o mesmo código para acompanhar.',
  }
}

export default function DataDeletionPage() {
  const navigate = useNavigate()
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

  useEffect(() => { document.title = `Exclusão de dados · ${APP_NAME}` }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass glass-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <AnimatedLogo size={17} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-8">
        <h1 className="text-3xl font-display font-bold text-foreground">Exclusão de dados</h1>

        {state.kind !== 'none' && (
          <section className="rounded-2xl border border-border bg-card p-6 space-y-3" aria-live="polite">
            <p className="text-sm text-muted-foreground">Código de confirmação: <span className="font-mono text-foreground">{code || '—'}</span></p>
            {state.kind === 'loading' && <p className="text-muted-foreground">Consultando o pedido…</p>}
            {state.kind === 'invalid' && <p className="text-foreground">Este código não é válido. Confira o link que a Meta mostrou para você.</p>}
            {state.kind === 'not_found' && <p className="text-foreground">Não encontramos um pedido com este código. Confira o link que a Meta mostrou para você.</p>}
            {state.kind === 'error' && <p className="text-foreground">Não foi possível consultar o pedido agora. Tente de novo em alguns minutos.</p>}
            {state.kind === 'ok' && (() => {
              const t = statusText(state.data)
              return (
                <>
                  <h2 className="text-xl font-display font-semibold text-foreground">{t.title}</h2>
                  <p className="text-muted-foreground">{t.body}</p>
                  <dl className="grid grid-cols-2 gap-2 text-sm pt-2">
                    <dt className="text-muted-foreground">Pedido recebido</dt><dd className="text-foreground">{fmt(state.data.requested_at)}</dd>
                    <dt className="text-muted-foreground">Concluído</dt><dd className="text-foreground">{fmt(state.data.completed_at)}</dd>
                  </dl>
                </>
              )
            })()}
          </section>
        )}

        <section className="space-y-3 text-muted-foreground leading-relaxed">
          <h2 className="text-xl font-display font-semibold text-foreground">O que é apagado</h2>
          <p>
            Quando você conecta o Facebook, o Instagram, o WhatsApp ou o Meta Ads ao {APP_NAME}, guardamos só o necessário para a
            conexão funcionar: o token de acesso (criptografado), o ID e o nome da conta. Ao remover o app nas configurações da Meta
            ou pedir a exclusão dos dados, apagamos essas conexões e os tokens. Seus projetos e sua conta do {APP_NAME} continuam.
          </p>
          <h2 className="text-xl font-display font-semibold text-foreground pt-2">Como pedir a exclusão</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>No Facebook: Configurações e privacidade → Configurações → Apps e sites → Vertal Dev → Remover, e marque a opção de excluir as atividades.</li>
            <li>No {APP_NAME}: Conectores → o app da Meta → Desconectar.</li>
            <li>Para apagar a sua conta inteira do {APP_NAME}, escreva para o suporte em <a className="underline text-foreground" href="/support">vertal.dev/support</a>.</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
