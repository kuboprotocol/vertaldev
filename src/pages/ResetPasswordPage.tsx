import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Loader2 } from 'lucide-react'
import { SITE_FONT } from '@/components/site/siteUi'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check hash for recovery token
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setReady(true)
    }

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Your password was updated.')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.message || 'We could not update your password')
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <div style={SITE_FONT} className="min-h-screen bg-background antialiased flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground mb-2">Password recovery</h1>
          <p className="text-sm text-muted-foreground">Checking your recovery link…</p>
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-4" />
        </div>
      </div>
    )
  }

  return (
    <div style={SITE_FONT} className="min-h-screen bg-background antialiased flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/[0.06] bg-card/50 p-8">
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground">New password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-12 rounded-xl border-white/[0.08] bg-white/[0.04] text-[15px]"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="h-12 rounded-xl border-white/[0.08] bg-white/[0.04] text-[15px]"
          />
          <Button type="submit" className="h-12 w-full rounded-full text-[15px]" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Update password
          </Button>
        </form>
      </div>
    </div>
  )
}
