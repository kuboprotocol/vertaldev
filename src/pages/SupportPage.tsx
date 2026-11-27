import { APP_NAME } from '@/config/brand'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import SitePage from '@/components/site/SitePage'
import { PageHeader, SectionHeading, focusRing, surface } from '@/components/site/siteUi'
import { cn } from '@/lib/utils'

/* ───────── FAQ ───────── */
const faqCategories = [
  {
    category: 'General',
    items: [
      {
        q: `What is ${APP_NAME}?`,
        a: `${APP_NAME} builds apps with AI. You describe what you want in plain words, and it creates apps, websites, games and tools. You do not need to write code.`,
      },
      {
        q: 'Does it work for my type of business?',
        a: `${APP_NAME} is not made for one type of business. Restaurants, consultants, online stores and others can describe what they need and get an app made for them.`,
      },
      {
        q: 'What if I do not know exactly what I want?',
        a: 'Describe your idea in a few words. The AI suggests designs, layouts and features to help you start.',
      },
    ],
  },
  {
    category: 'Account and billing',
    items: [
      {
        q: 'How do I create an account?',
        a: 'Click "Get started" on the home page. Enter your email and a password, or sign in with Google or GitHub. Then confirm your email address.',
      },
      {
        q: 'What does the free plan include?',
        a: 'The free plan gives you credits to create and change your projects. You can earn more credits in Rewards. Upgrade at any time for more credits.',
      },
      {
        q: 'How do I upgrade my plan?',
        a: 'Open the Pricing page and choose a plan. Stripe handles the payment, and your credits are added to your balance.',
      },
      {
        q: 'Can I cancel my subscription?',
        a: 'Yes, at any time. You keep access until the end of the period you already paid for.',
      },
    ],
  },
  {
    category: 'Building and editing',
    items: [
      {
        q: 'Do I need technical knowledge?',
        a: `No. You can use ${APP_NAME} by describing what you want in plain words. The AI writes the code.`,
      },
      {
        q: 'Can I change what the AI created?',
        a: 'Yes. You can change text, images, colors, layout and pages by asking the AI in the builder chat.',
      },
      {
        q: 'Can I export my code?',
        a: 'Yes. The code of your project belongs to you. You can download it and use it anywhere.',
      },
      {
        q: 'What types of apps can I build?',
        a: 'Landing pages, online stores, dashboards, 2D games, portfolios and many other kinds of apps.',
      },
    ],
  },
  {
    category: 'Technical support',
    items: [
      {
        q: 'The AI made a mistake. What should I do?',
        a: 'Describe the problem in the builder chat and ask the AI to fix it. You can also start again from a template. If the problem does not go away, send us a ticket below.',
      },
      {
        q: 'My project does not load. What can I do?',
        a: 'Reload the page or clear your browser cache. Check your internet connection and try again. If it still does not load, send us a ticket.',
      },
      {
        q: 'Is my data safe?',
        a: 'Your data is sent over secure connections (HTTPS), and each account can see only its own projects. Our Privacy Policy explains how we handle your data.',
      },
    ],
  },
]

/* ───────── Status helpers ───────── */
function statusBadge(status: string) {
  switch (status) {
    case 'open':
      return (
        <Badge variant="outline" className="border-primary/40 text-primary gap-1 text-xs">
          <Clock className="h-3 w-3" /> Open
        </Badge>
      )
    case 'resolved':
      return (
        <Badge variant="outline" className="border-green-500/40 text-green-400 gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3" /> Resolved
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {status}
        </Badge>
      )
  }
}

/* ───────── Page ───────── */
export default function SupportPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  // Form state
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // Tickets state
  const [tickets, setTickets] = useState<any[]>([])
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [loadingTickets, setLoadingTickets] = useState(false)

  async function loadTickets() {
    if (!user) return
    setLoadingTickets(true)
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) {
      setTickets(data)
    }
    setTicketsLoaded(true)
    setLoadingTickets(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) {
      toast.error('Please log in to submit a support ticket.')
      return
    }
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill in all fields.')
      return
    }
    if (subject.length > 200) {
      toast.error('Subject must be under 200 characters.')
      return
    }
    if (message.length > 2000) {
      toast.error('Message must be under 2000 characters.')
      return
    }

    setSending(true)
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      subject: subject.trim(),
      message: message.trim(),
    })
    setSending(false)

    if (error) {
      toast.error('We could not send your ticket. Please try again.')
      return
    }

    toast.success('Your ticket was sent.')
    setSubject('')
    setMessage('')
    // Refresh ticket list if already loaded
    if (ticketsLoaded) loadTickets()
  }

  return (
    <SitePage>
      <PageHeader eyebrow="Support" title="How can we help?">
        Find answers to common questions, or send a ticket to our team.
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-24 px-6 pb-24">
        {/* FAQ */}
        <section aria-labelledby="support-faq-title">
          <h2 id="support-faq-title" className="mb-10 text-center text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-4xl">
            Common questions
          </h2>

          <div className="space-y-12">
            {faqCategories.map((cat) => (
              <div key={cat.category}>
                <h3 className="mb-3 text-sm font-medium text-primary">{cat.category}</h3>
                <div className={cn(surface.card, 'divide-y divide-white/[0.06] overflow-hidden p-0')}>
                  {cat.items.map((faq, i) => {
                    const key = `${cat.category}-${i}`
                    const open = openFaq === key
                    return (
                      <div key={key}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenFaq(open ? null : key)}
                          className={cn(
                            'flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]',
                            focusRing,
                          )}
                        >
                          <span className="text-[17px] font-medium text-foreground">{faq.q}</span>
                          <ChevronDown
                            aria-hidden
                            className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                              open ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <AnimatePresence>
                          {open && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <p className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{faq.a}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ticket form */}
        <section aria-labelledby="ticket-title">
          <SectionHeading id="ticket-title" title="Send a ticket">
            {user ? 'Did not find your answer? Send us a message and we will reply.' : 'Log in to send a support ticket.'}
          </SectionHeading>

          <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-xl space-y-4">
            <div>
              <label htmlFor="ticket-subject" className="sr-only">
                Subject
              </label>
              <Input
                id="ticket-subject"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                disabled={!user || sending}
                className="h-12 rounded-xl border-white/[0.08] bg-card/50 text-[15px]"
              />
            </div>
            <div>
              <label htmlFor="ticket-message" className="sr-only">
                Message
              </label>
              <Textarea
                id="ticket-message"
                placeholder="Describe your problem or question"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={5}
                disabled={!user || sending}
                className="resize-none rounded-xl border-white/[0.08] bg-card/50 text-[15px]"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/2000</p>
            </div>
            <Button
              type="submit"
              disabled={!user || sending || !subject.trim() || !message.trim()}
              className="h-11 w-full gap-2 rounded-full"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {sending ? 'Sending…' : 'Send ticket'}
            </Button>
            {!user && (
              <p className="text-center text-[15px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => navigate('/auth')}
                  className={cn('rounded-sm text-primary underline-offset-4 hover:underline', focusRing)}
                >
                  Log in
                </button>{' '}
                to send a support ticket.
              </p>
            )}
          </form>
        </section>

        {/* Ticket history */}
        {user && (
          <section aria-labelledby="tickets-title" className="mx-auto max-w-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 id="tickets-title" className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.015em] text-foreground">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden />
                Your tickets
              </h2>
              {!ticketsLoaded && (
                <Button variant="outline" size="sm" onClick={loadTickets} disabled={loadingTickets} className="rounded-full">
                  {loadingTickets ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Show history'}
                </Button>
              )}
              {ticketsLoaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadTickets}
                  disabled={loadingTickets}
                  className="rounded-full text-xs text-muted-foreground"
                >
                  Refresh
                </Button>
              )}
            </div>

            {ticketsLoaded && tickets.length === 0 && (
              <p className="py-8 text-center text-[15px] text-muted-foreground">You have no tickets yet.</p>
            )}

            {ticketsLoaded && tickets.length > 0 && (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className={cn(surface.card, 'space-y-2 p-4')}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-medium text-foreground">{t.subject}</h3>
                      {statusBadge(t.status)}
                    </div>
                    <p className="line-clamp-2 text-[13px] text-muted-foreground">{t.message}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {new Date(t.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </SitePage>
  )
}
