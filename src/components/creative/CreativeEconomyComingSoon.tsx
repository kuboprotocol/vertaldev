import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Palette, Sparkles, ArrowLeft, Crown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { canAccessCreativeEconomy, CREATIVE_ECONOMY_COPY } from '@/config/features'

const FOUNDERS_TABLE = 'creative_economy_founders' as never

/** Número de Fundador do usuário (null = ainda não entrou) e ação para entrar. */
function useFounder() {
  const { user } = useAuth()
  const [number, setNumber] = useState<number | null>(null)
  const [joining, setJoining] = useState(false)

  const load = useCallback(async () => {
    if (!user) return null
    const { data } = await supabase
      .from(FOUNDERS_TABLE)
      .select('founder_number')
      .eq('user_id', user.id)
      .maybeSingle()
    const n = (data as { founder_number?: number } | null)?.founder_number ?? null
    setNumber(n)
    return n
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const join = useCallback(async () => {
    if (!user || joining) return
    setJoining(true)
    try {
      const { error } = await supabase.from(FOUNDERS_TABLE).insert({ user_id: user.id } as never)
      // 23505 = já é Fundador: só recarrega o número.
      if (error && error.code !== '23505') throw error
      const n = await load()
      if (n) toast.success(CREATIVE_ECONOMY_COPY.founderWelcome(n))
    } catch {
      toast.error('Não foi possível entrar na lista agora. Tente de novo em instantes.')
    } finally {
      setJoining(false)
    }
  }, [user, joining, load])

  return { number, joining, join }
}

function ComingSoonBody() {
  const { number, joining, join } = useFounder()
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl" aria-hidden />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/25 to-accent/10">
          <Palette className="h-8 w-8 text-primary" />
        </div>
        <Sparkles className="absolute -right-3 -top-3 h-5 w-5 animate-pulse text-primary" aria-hidden />
      </div>
      <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-primary/80">Em breve</span>
      <h2 className="font-display text-2xl font-bold sm:text-3xl">{CREATIVE_ECONOMY_COPY.title}</h2>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground sm:text-base">{CREATIVE_ECONOMY_COPY.message}</p>

      <div className="mt-6 w-full rounded-2xl border border-primary/25 bg-primary/5 p-4" data-testid="creative-founders">
        {number ? (
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
            <Crown className="h-4 w-4" />
            <span>Fundador(a) nº {number} da Economia Criativa</span>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{CREATIVE_ECONOMY_COPY.founderPitch}</p>
            <Button onClick={() => void join()} disabled={joining} className="w-full gap-2">
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              {CREATIVE_ECONOMY_COPY.founderCta}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Aviso mostrado toda vez que o cliente clica em "Economia Criativa".
 * Uso: `const { open, dialog } = useCreativeEconomyEntry()` e `onClick={open}`.
 */
export function useCreativeEconomyEntry() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [visible, setVisible] = useState(false)

  const open = useCallback(() => {
    if (canAccessCreativeEconomy(isAdmin)) navigate('/creative')
    else setVisible(true)
  }, [isAdmin, navigate])

  const dialog = (
    <Dialog open={visible} onOpenChange={setVisible}>
      <DialogContent className="max-w-md border-primary/30 bg-card/95 backdrop-blur-xl" data-testid="creative-economy-coming-soon">
        <DialogHeader className="sr-only">
          <DialogTitle>{CREATIVE_ECONOMY_COPY.title}</DialogTitle>
          <DialogDescription>{CREATIVE_ECONOMY_COPY.message}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ComingSoonBody />
        </div>
        <Button variant="ghost" onClick={() => setVisible(false)} className="w-full">Entendi</Button>
      </DialogContent>
    </Dialog>
  )

  return { open, dialog }
}

/** Protege as rotas /creative/*: quem não pode acessar vê a tela "em construção". */
export function CreativeEconomyGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { isAdmin, rolesLoading } = useAuth()
  if (rolesLoading) return null
  if (canAccessCreativeEconomy(isAdmin)) return <>{children}</>
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" data-testid="creative-economy-coming-soon-page">
      <div className="w-full max-w-lg rounded-3xl border border-primary/30 bg-card/40 p-10 backdrop-blur-xl">
        <ComingSoonBody />
        <Button variant="outline" onClick={() => navigate('/dashboard')} className="mt-8 w-full">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao painel
        </Button>
      </div>
    </div>
  )
}
