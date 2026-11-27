import { useState } from 'react'
import { Loader2, CheckCircle2, Crown, LifeBuoy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'

type Reason = 'enterprise' | 'support' | 'other'

const REASON_META: Record<Reason, { label: string; icon: typeof Crown; placeholder: string }> = {
  enterprise: {
    label: 'Upgrade my plan (Enterprise)',
    icon: Crown,
    placeholder: 'Example: a team of 15 developers, about 5,000 credits a month',
  },
  support: {
    label: 'Technical support',
    icon: LifeBuoy,
    placeholder: 'Describe the problem you have',
  },
  other: {
    label: 'Something else',
    icon: MessageCircle,
    placeholder: 'How can we help?',
  },
}

const VOLUME_OPTIONS = [
  'Up to 1,000 credits a month',
  '1,000 to 5,000 credits a month',
  '5,000 to 20,000 credits a month',
  'More than 20,000 credits a month',
  'I do not know yet',
]

const TEAM_SIZE_OPTIONS = ['1 to 5 people', '6 to 20 people', '21 to 50 people', 'More than 50 people']

const CONTACT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-request`

interface ContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultReason?: Reason
}

export function ContactDialog({ open, onOpenChange, defaultReason = 'enterprise' }: ContactDialogProps) {
  const [reason, setReason] = useState<Reason>(defaultReason)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [estimatedVolume, setEstimatedVolume] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [website, setWebsite] = useState('') // honeypot: always empty for people
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = REASON_META[reason]
  const Icon = meta.icon

  const reset = () => {
    setFullName('')
    setEmail('')
    setCompany('')
    setMessage('')
    setEstimatedVolume('')
    setTeamSize('')
    setSent(false)
    setError(null)
  }

  const handleClose = (next: boolean) => {
    onOpenChange(next)
    if (!next) setTimeout(reset, 200)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(CONTACT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          fullName,
          email,
          company,
          reason,
          message,
          estimatedVolume: reason === 'enterprise' ? estimatedVolume : undefined,
          teamSize: reason === 'enterprise' ? teamSize : undefined,
          website,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data?.ok === false) {
        setError('We could not send your message. Please try again in a moment.')
        return
      }
      setSent(true)
    } catch {
      setError('We could not send your message. Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <DialogTitle>Message sent</DialogTitle>
            <p className="text-sm text-muted-foreground">
              We got your message. We will reply by email.
            </p>
            <Button onClick={() => handleClose(false)} className="mt-2">Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <Badge className="mb-2 w-fit bg-primary/15 text-primary border-primary/30">
                <Icon className="mr-1.5 h-3 w-3" /> Contact us
              </Badge>
              <DialogTitle>How can we help?</DialogTitle>
              <DialogDescription>
                Fill in the form and we will reply by email.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot — invisível para humanos, bots costumam preencher */}
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              <div className="space-y-1.5">
                <Label htmlFor="contact-reason">Reason</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                  <SelectTrigger id="contact-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REASON_META) as Reason[]).map((r) => (
                      <SelectItem key={r} value={r}>{REASON_META[r].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Full name</Label>
                  <Input id="contact-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input id="contact-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-company">Company (optional)</Label>
                <Input id="contact-company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>

              {reason === 'enterprise' && (
                <div className="grid gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-volume">Expected usage</Label>
                    <Select value={estimatedVolume} onValueChange={setEstimatedVolume}>
                      <SelectTrigger id="contact-volume">
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        {VOLUME_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-team-size">Team size</Label>
                    <Select value={teamSize} onValueChange={setTeamSize}>
                      <SelectTrigger id="contact-team-size">
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_SIZE_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  required
                  rows={4}
                  placeholder={meta.placeholder}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {reason === 'enterprise' ? (
                <p className="text-xs text-muted-foreground">
                  Enterprise plans include custom pricing, priority support and help with setup.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">We reply by email.</p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send message
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ContactDialog
