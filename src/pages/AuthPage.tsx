import { APP_NAME } from '@/config/brand'
import { useState, useEffect, forwardRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Mail, Lock, User, ArrowRight, KeyRound, ShieldAlert, Github } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { motion, AnimatePresence } from 'framer-motion'
import { clearStoredReferralCode, getStoredReferralCode, storeReferralCode } from '@/lib/referral'
import { crmBuildFlagOn, isCrmRedirect } from '@/lib/vertalCrm/redirect'
import { authLang, authUi } from '@/lib/authI18n'

// Google sign-in (Supabase Auth, provedor Google ligado; callback
// https://sccizjlpwezsgaxkclot.supabase.co/auth/v1/callback no cliente OAuth).
// Só openid/email/profile: o acesso ao Gmail é pedido à parte, no conector.
const SHOW_GOOGLE_LOGIN = true
const GOOGLE_LOGIN_SCOPES = 'openid email profile'

const AuthPage = forwardRef<HTMLDivElement, any>((props, ref) => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlRefCode = searchParams.get('ref') || ''
  const refCode = urlRefCode || getStoredReferralCode()
  const redirectParam = searchParams.get('redirect') || ''
  // Textos no idioma do usuário (só textos; a lógica de login é a mesma).
  const T = authUi(authLang(searchParams.get('lang')))

  useEffect(() => {
    if (urlRefCode) storeReferralCode(urlRefCode)
  }, [urlRefCode])
  // Allowlist of safe internal route prefixes (mirrors the edge function callback).
  // Prevents open redirects AND ensures "Try again" after an OAuth failure always
  // lands on an authorized in-app route.
  const ALLOWED_REDIRECT_PREFIXES = [
    '/dashboard', '/connectors', '/builder', '/canvas', '/profile',
    '/agents', '/docs', '/game', '/oauth/consent', '/',
  ]
  const isAllowedRedirect = (p: string): boolean => {
    if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) return false
    // Vertal CRM (landing "CRM grátis" → cadastro → /crm): só com VITE_VERTAL_CRM ligado.
    if (crmBuildFlagOn() && isCrmRedirect(p)) return true
    return ALLOWED_REDIRECT_PREFIXES.some(
      (pre) => p === pre || p.startsWith(pre + '/') || p.startsWith(pre + '?'),
    )
  }
  const safeRedirect = isAllowedRedirect(redirectParam) ? redirectParam : '/dashboard'
  const { user, loading, signOut } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [githubLoading, setGithubLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [forgotPassword, setForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')

  // Auto-redirect logged-in users unless ?signout=1 was explicitly requested
  const wantsSignout = searchParams.get('signout') === '1'
  useEffect(() => {
    if (!loading && user && !wantsSignout) navigate(safeRedirect, { replace: true })
  }, [user, loading, navigate, safeRedirect, wantsSignout])

  const handleSignOut = async () => {
    setSigningOut(true)
    const tId = toast.loading(T.signingYouOut)
    try {
      await signOut()
      toast.success(T.signedOut, { id: tId })
      const url = new URL(window.location.href)
      url.searchParams.delete('signout')
      window.history.replaceState({}, '', url.toString())
    } catch (err: any) {
      toast.error(err?.message || T.couldNotSignOut, { id: tId })
    } finally {
      setSigningOut(false)
    }
  }

  const copyReferenceId = async (reqId: string) => {
    try {
      await navigator.clipboard.writeText(reqId)
      toast.success(T.refCopied)
    } catch {
      toast.error(T.refCopyFailed)
    }
  }

  const handleGithubLogin = async () => {
    setGithubLoading(true)
    const startingId = toast.loading(T.startingGithub)
    try {
      const { data, error } = await supabase.functions.invoke('github-signin-initiate', {
        body: { returnUrl: safeRedirect, ...(refCode ? { referralCode: refCode } : {}) },
      })
      if (error) throw error
      if (data?.error === 'github_not_configured') {
        toast.error(T.githubNotConfigured, {
          id: startingId,
          action: { label: T.tryAgain, onClick: () => handleGithubLogin() },
        })
        setGithubLoading(false)
        return
      }
      if (!data?.url) throw new Error('No authorization URL returned')
      toast.success(T.redirectingGithub, { id: startingId })
      // Small delay so user sees the toast before navigation
      setTimeout(() => { window.location.href = data.url }, 250)
    } catch (err: any) {
      toast.error(err?.message || T.couldNotStartGithub, {
        id: startingId,
        action: { label: T.tryAgain, onClick: () => handleGithubLogin() },
      })
      setGithubLoading(false)
    }
  }

  // Surface OAuth errors coming back from the GitHub callback
  useEffect(() => {
    const err = searchParams.get('auth_error')
    if (!err) return
    const reqId = searchParams.get('auth_req_id') || ''
    const messages: Record<string, string> = T.oauthErrors
    const baseMsg = messages[err] || T.githubFailed(err)
    // Include the Reference ID in the main toast message so screen readers
    // announce it via sonner's aria-live region (description is not always read).
    const announced = reqId ? `${baseMsg} ${T.referenceId}: ${reqId}.` : baseMsg
    toast.error(announced, {
      description: reqId ? `${T.referenceId}: ${reqId}` : undefined,
      duration: 10000,
      action: { label: T.tryAgain, onClick: () => handleGithubLogin() },
      cancel: reqId ? { label: T.copyId, onClick: () => copyReferenceId(reqId) } : undefined,
    })

    // Try to auto-copy the Reference ID to the clipboard for quick log correlation.
    // Browser clipboard APIs typically require a user gesture, so we fall back to
    // an explicit confirmation toast with a "Copy Reference ID" button on failure.
    if (reqId) {
      const auto = navigator.clipboard?.writeText?.(reqId)
      if (auto && typeof (auto as Promise<void>).then === 'function') {
        ;(auto as Promise<void>)
          .then(() => {
            toast.success(T.refCopied, {
              description: reqId,
              duration: 6000,
            })
          })
          .catch(() => {
            toast(T.copyRefQuestion, {
              description: reqId,
              duration: 12000,
              action: { label: T.copyRef, onClick: () => copyReferenceId(reqId) },
            })
          })
      } else {
        toast(T.copyRefQuestion, {
          description: reqId,
          duration: 12000,
          action: { label: T.copyRef, onClick: () => copyReferenceId(reqId) },
        })
      }
    }

    // Clean URL
    const url = new URL(window.location.href)
    url.searchParams.delete('auth_error')
    url.searchParams.delete('auth_req_id')
    window.history.replaceState({}, '', url.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleGoogleLogin = async () => {
    // Google direto pelo Supabase Auth. Conta de e-mail já existente com o mesmo
    // e-mail verificado é vinculada (identity linking automático), não duplicada.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${safeRedirect}`,
        scopes: GOOGLE_LOGIN_SCOPES,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) toast.error(T.googleError)
  }


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success(T.recoverySent)
      setForgotPassword(false)
    } catch (err: any) {
      toast.error(err.message || T.recoveryError)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate(safeRedirect, { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, ...(refCode ? { referral_code: refCode } : {}) },
            emailRedirectTo: `${window.location.origin}${safeRedirect}`,
          },
        })
        if (error) throw error
        clearStoredReferralCode()
        toast.success(T.accountCreated)

        // Send welcome email (fire-and-forget; recipient resolved server-side)
        supabase.functions.invoke('send-welcome-email', {
          body: { userId: data.user?.id },
        }).catch(() => {})


        navigate(safeRedirect, { replace: true })
      }
    } catch (err: any) {
      const msg = err.message || T.authError
      if (msg.includes('Invalid login credentials')) {
        toast.error(T.wrongCredentials)
      } else if (msg.includes('User already registered')) {
        toast.error(T.alreadyRegistered)
      } else if (msg.includes('security purposes')) {
        toast.error(T.waitSeconds)
      } else {
        toast.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  // Corrige o crash "Failed to execute 'insertBefore' on 'Node'": assim que o
  // login funciona (e-mail ou GitHub), o useEffect acima dispara navigate()
  // no mesmo instante em que a árvore <AnimatePresence>/<motion.div> abaixo
  // ainda pode estar no meio de uma transição. O framer-motion manipula o DOM
  // diretamente para animar; se o React Router desmonta a página nesse exato
  // momento, as duas operações de DOM colidem. Solução: parar de renderizar a
  // árvore animada assim que soubermos que vamos navegar, mostrando um estado
  // simples e estático até a navegação de fato acontecer.
  if (user && !wantsSignout) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const inputClasses = "h-12 pl-11 rounded-xl bg-secondary/50 border-border/50 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all duration-200"

  return (
    <div ref={ref} className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh pointer-events-none" />
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.03] blur-3xl pointer-events-none" />

      <AnimatePresence mode="wait">
        {forgotPassword ? (
          <motion.div
            key="forgot"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="glass glass-border rounded-3xl p-8 shadow-gold">
              <div className="text-center mb-8">
                <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-5 shadow-glow">
                  <KeyRound className="h-7 w-7 text-primary-foreground" />
                </div>
                <h1 className="text-2xl font-display font-bold text-foreground">{T.recoverTitle}</h1>
                <p className="text-sm text-muted-foreground mt-2">{T.recoverSubtitle}</p>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder={T.yourEmail}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className={inputClasses}
                  />
                </div>
                <Button type="submit" data-testid="auth-recover-submit" variant="hero" className="w-full h-12 rounded-xl text-sm font-semibold gap-2" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {T.sendRecovery}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-6">
                <button onClick={() => setForgotPassword(false)} className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  {T.backToLogin}
                </button>
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="glass glass-border rounded-3xl p-8 shadow-gold">
              <div className="text-center mb-8">
                <div className="flex justify-center mb-5">
                  {/* Logo do Vertal Dev em destaque acima do "Entrar com Google" (o botão mantém o "G" do Google, regra de marca do Google). */}
                  <img
                    src="/vertal-dev-logo-square.webp"
                    alt="Vertal Dev"
                    width={112}
                    height={112}
                    data-testid="auth-brand-logo"
                    className="h-28 w-28 rounded-2xl object-contain"
                  />
                </div>
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {isLogin ? T.welcomeBack : T.createYourAccount}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  {isLogin ? T.accessProjects(APP_NAME) : T.startBuilding}
                </p>
              </div>

              {user && (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-secondary/40 p-3.5">
                  <div className="text-xs text-foreground/80 leading-relaxed">
                    Signed in as <span className="font-semibold text-foreground">{user.email}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    aria-busy={signingOut}
                    aria-label={signingOut ? T.signingOut : T.signOut}
                    data-testid="auth-signout"
                    className="h-8 rounded-lg text-xs"
                  >
                    {signingOut ? (
                      <Loader2 className="h-3 w-3 animate-spin" role="status" aria-label={T.signingOut} data-testid="auth-signout-spinner" />
                    ) : (
                      T.signOut
                    )}
                  </Button>
                </div>
              )}

              {redirectParam && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5"
                  role="status"
                  aria-live="polite"
                >
                  <ShieldAlert className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-foreground/90 leading-relaxed">
                    {safeRedirect.startsWith('/connectors') ? (
                      <>
                        {T.connectorsProtectedA} <span className="font-semibold text-primary">{T.connectorsWord}</span> {T.connectorsProtectedB}
                        {' '}{T.loginToContinue}{' '}
                        <code className="px-1 py-0.5 rounded bg-secondary/70 text-[11px] font-mono text-foreground">
                          {safeRedirect}
                        </code>.
                      </>
                    ) : (
                      <>
                        {T.pageProtected}{' '}
                        <code className="px-1 py-0.5 rounded bg-secondary/70 text-[11px] font-mono text-foreground">
                          {safeRedirect}
                        </code>.
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {SHOW_GOOGLE_LOGIN && (
                <Button
                  data-testid="auth-google"
                  variant="outline"
                  className="w-full h-12 rounded-xl mb-3 gap-3 text-sm font-medium border-border/50 hover:bg-secondary/80"
                  onClick={handleGoogleLogin}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {T.google}
                </Button>
              )}

              <Button
                variant="outline"
                className="w-full h-12 rounded-xl mb-4 gap-3 text-sm font-medium border-border/50 hover:bg-secondary/80"
                onClick={handleGithubLogin}
                disabled={githubLoading}
                data-testid="auth-github"
              >
                {githubLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Github className="h-5 w-5" />
                )}
                {T.github}
              </Button>


              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{T.orEmail}</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              {/* Tab switcher */}
              <div className="flex items-center bg-secondary/50 rounded-xl p-1 mb-6">
                <button
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isLogin ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {T.tabSignIn}
                </button>
                <button
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    !isLogin ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {T.tabSignUp}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence mode="wait">
                  {!isLogin && (
                    <motion.div
                      key="name"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative overflow-hidden"
                    >
                      <div className="relative pb-1">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={T.yourName}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          required
                          className={inputClasses}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder={T.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClasses}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder={T.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className={inputClasses}
                  />
                </div>

                {isLogin && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setForgotPassword(true)}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      {T.forgot}
                    </button>
                  </div>
                )}

                <Button type="submit" data-testid="auth-submit" variant="hero" className="w-full h-12 rounded-xl text-sm font-semibold gap-2" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {isLogin ? T.submitSignIn : T.submitSignUp}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {isLogin ? T.newHere : T.haveAccount}{' '}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:text-primary/80 font-semibold transition-colors"
                >
                  {isLogin ? T.createFree : T.signIn}
                </button>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

export default AuthPage
