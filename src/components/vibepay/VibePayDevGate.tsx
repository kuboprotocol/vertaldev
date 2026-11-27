import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Construction, Loader2 } from 'lucide-react'
import { SITE_FONT, smallButton } from '@/components/site/siteUi'
import { useAuth } from '@/hooks/useAuth'
import { VIBE_PAY } from '@/config/vibePay'
import { canAccessVibePay } from '@/config/vibePayGate'

export function VibePayDevNotice() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6" style={SITE_FONT}>
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/[0.06] bg-card/50 p-8 text-center">
        <img src={VIBE_PAY.logo} alt={VIBE_PAY.name} width={160} height={107} className="mx-auto h-auto w-40" />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Construction className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Not open yet</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          <span translate="no">{VIBE_PAY.name}</span> is still being built and is not open yet. You will be able to use your account here later.
        </p>
        <Link to="/dashboard" className={smallButton}>Back to dashboard</Link>
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
