import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Construction, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { VIBE_PAY } from '@/config/vibePay'
import { canAccessVibePay } from '@/config/vibePayGate'

export function VibePayDevNotice() {
  const navigate = useNavigate()
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-5 rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur">
        <img src={VIBE_PAY.logo} alt={VIBE_PAY.name} width={160} height={107} className="mx-auto h-auto w-40" />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Construction className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Estamos em desenvolvimento</h1>
        <p className="text-muted-foreground">
          O {VIBE_PAY.name} está em desenvolvimento e ainda não está aberto. Em breve você poderá usar sua conta aqui.
        </p>
        <Button onClick={() => navigate('/dashboard')}>Voltar</Button>
      </div>
    </div>
  )
}

export function VibePayDevGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!canAccessVibePay(user?.email)) return <VibePayDevNotice />
  return <>{children}</>
}
