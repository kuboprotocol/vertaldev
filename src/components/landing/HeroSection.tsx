'use client'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Brand, MoreLink, focusRing } from './landingUi'

// Example ideas in plain language, with no technical terms (Web2 or Web3).
// The orchestrator picks the stack. The visitor only describes the idea.
const suggestions = [
  'A banking app with login and a digital wallet',
  'An NFT marketplace that accepts crypto payments',
  'An online store with a points program',
  'A dashboard that shows sales in real time',
]

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as const, delay },
})

export default function HeroSection() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const { user } = useAuth()

  // Restore a pending prompt after sign-in (coming back from /auth).
  useEffect(() => {
    const saved = sessionStorage.getItem('kubo:pending_prompt')
    if (saved) {
      setPrompt(saved)
      if (user) {
        sessionStorage.removeItem('kubo:pending_prompt')
        setTimeout(() => handleGenerate(saved), 0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Sends the idea to the orchestrator (layer 2). Signed out: keep the prompt in
  // sessionStorage and go to /auth; on return it resumes by itself.
  const handleGenerate = async (override?: string) => {
    const text = (typeof override === 'string' ? override : prompt).trim()
    if (!text) return
    if (!user) {
      sessionStorage.setItem('kubo:pending_prompt', text)
      navigate('/auth', { state: { redirectTo: '/' } })
      return
    }
    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: { prompt: text },
      })
      if (error) throw error
      if (!data?.plan_id) throw new Error('The plan has no ID.')
      toast.success('Your plan is ready.')
      navigate(`/plan/${data.plan_id}`)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'We could not create the plan. Please try again.'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden px-6 pb-24 pt-20 md:pb-32 md:pt-32">
      {/* One soft light behind the headline. No patterns, no glow on text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] max-w-full -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.p {...fadeUp(0)} className="text-[17px] font-medium text-primary md:text-xl">
          <Brand>Vertal Dev</Brand>
        </motion.p>

        <motion.h1
          id="hero-title"
          {...fadeUp(0.05)}
          className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-6xl sm:leading-[1.05] md:text-7xl"
        >
          <span className="block">Describe your app.</span>
          <span className="block">We build it with AI.</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.12)}
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-[21px] md:leading-[1.45]"
        >
          Write your idea in plain words. Vertal Dev creates the app, including the backend, and helps you
          publish it. You do not need to know how to code.
        </motion.p>

        {/* Prompt: the primary action of the page */}
        <motion.form
          {...fadeUp(0.2)}
          className="mx-auto mt-12 max-w-2xl text-left"
          onSubmit={(e) => {
            e.preventDefault()
            if (!prompt.trim()) {
              inputRef.current?.focus()
              return
            }
            handleGenerate()
          }}
        >
          <label htmlFor="hero-prompt" className="sr-only">
            Describe the app you want to build
          </label>
          <div className="relative rounded-[28px] border border-white/10 bg-card/80 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] transition-colors focus-within:border-primary/60">
            <textarea
              id="hero-prompt"
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="For example: a booking app for a hair salon, with online payment"
              rows={3}
              className="block min-h-[120px] w-full resize-none rounded-[28px] bg-transparent px-6 pb-16 pt-5 text-[17px] leading-relaxed text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
            />
            <div className="absolute bottom-3 right-3">
              <button
                type="submit"
                disabled={generating}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50',
                  focusRing,
                )}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowUp className="h-4 w-4" aria-hidden />
                )}
                {generating ? 'Creating…' : 'Start building'}
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">Or start with an example:</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setPrompt(s)}
                  className={cn(
                    'rounded-full border border-white/10 px-4 py-2 text-[13px] text-foreground/80 transition-colors hover:border-white/25 hover:text-foreground',
                    focusRing,
                  )}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </motion.form>

        <motion.div {...fadeUp(0.3)} className="mt-10">
          <MoreLink to="/pricing">See plans and pricing</MoreLink>
        </motion.div>
      </div>
    </section>
  )
}
