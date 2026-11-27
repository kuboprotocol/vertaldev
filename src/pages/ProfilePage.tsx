import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ArrowLeft, Camera, Loader2, Mail, User, Shield, Gift, Users, Copy, Check, Video } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useAvatarUrl } from '@/hooks/useAvatarUrl'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { AFFILIATE_RATE, formatCents, referralLink } from '@/lib/referral'
import WalletSection from '@/components/profile/WalletSection'
import { VibePayPromo } from '@/components/vibepay/VibePayPromo'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState('')
  const { url: avatarUrl, refresh: refreshAvatar } = useAvatarUrl(user?.id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  const [referralCount, setReferralCount] = useState(0)
  const [referralCredits, setReferralCredits] = useState(0)
  const [copied, setCopied] = useState(false)
  const [commissionPending, setCommissionPending] = useState(0)
  const [commissionPaid, setCommissionPaid] = useState(0)

  useEffect(() => {
    if (!user) return
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    const [profileRes, referralsRes, refCodeRes, commissionsRes] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user!.id).single(),
      supabase.from('referrals').select('id, credits_awarded').eq('referrer_id', user!.id),
      supabase.rpc('get_my_referral_code'),
      supabase
        .from('affiliate_commissions' as never)
        .select('commission_cents, status')
        .eq('affiliate_id', user!.id),
    ])

    if (!profileRes.error && profileRes.data) {
      setDisplayName(profileRes.data.display_name || '')
      // avatarUrl is provided by useAvatarUrl hook
    }
    if (refCodeRes.data) setReferralCode(refCodeRes.data as string)
    if (!referralsRes.error && referralsRes.data) {
      setReferralCount(referralsRes.data.length)
      setReferralCredits(referralsRes.data.reduce((sum, r) => sum + Number(r.credits_awarded), 0))
    }
    const commissions = ((commissionsRes.data ?? []) as unknown) as Array<{ commission_cents: number; status: string }>
    setCommissionPaid(commissions.filter((c) => c.status === 'paid').reduce((sum, c) => sum + c.commission_cents, 0))
    setCommissionPending(
      commissions.filter((c) => c.status === 'pending' || c.status === 'approved').reduce((sum, c) => sum + c.commission_cents, 0),
    )
    setLoading(false)
  }

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink(referralCode))
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('We could not copy the link')
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('The image must be 2 MB or smaller')
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const filePath = `${user.id}/avatar.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      toast.error('We could not upload the image')
      setUploading(false)
      return
    }

    // Use signed URL since avatars bucket is now private
    const { data, error: signError } = await supabase.storage
      .from('avatars')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year expiry

    if (signError || !data?.signedUrl) {
      toast.error('We could not create the image link')
      setUploading(false)
      return
    }

    const url = data.signedUrl

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (updateError) {
      toast.error('We could not update your profile')
    } else {
      await refreshAvatar()
      toast.success('Profile photo updated')
    }
    setUploading(false)
  }

  const handleSave = async () => {
    if (!user || !displayName.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      toast.error('We could not save your profile')
    } else {
      toast.success('Profile saved')
    }
    setSaving(false)
  }

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <AppShell width="narrow" topBar={<AppTopBar back={{ to: '/dashboard', label: 'Dashboard' }} />}>
      <PanelHeader title="Your profile" description="Your account details, wallet and referral link." />
      <div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          {/* Vertal Vibe Pay shortcut at the top of the profile */}
          <VibePayPromo variant="compact" />

          {/* Avatar Section */}
          <div className="rounded-2xl border border-white/[0.06] bg-card/50 p-8 flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group shrink-0">
                            <Avatar className="h-28 w-28 text-lg ring-2 ring-border relative">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="Avatar" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                aria-label="Change profile photo"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/60 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-background" />
                ) : (
                  <Camera className="h-6 w-6 text-background" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-semibold tracking-[-0.015em] text-foreground">
                {displayName || 'No name'}
              </h2>
              <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                Click the photo to change it
              </p>
            </div>
          </div>

          {/* Form Section */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-2xl border border-white/[0.06] bg-card/50 p-8 space-y-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Account details</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="pl-10 opacity-60 bg-muted/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-muted-foreground text-sm">Display name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
              className="w-full rounded-full"
              size="lg"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </motion.div>

          {/* Wallet Section */}
          <WalletSection />

          {/* Referral Section */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="rounded-2xl border border-white/[0.06] bg-card/50 p-8 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Referrals and affiliate program</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/recompensas')}
                  className="gap-2"
                >
                  <Video className="h-3.5 w-3.5" />
                  Rewards
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/affiliate-program')}
                >
                  See the full program
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">People invited</span>
                </div>
                <p className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{referralCount}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Credits earned</span>
                </div>
                <p className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{referralCredits}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-secondary/50 p-4 text-center" data-testid="affiliate-commissions">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Affiliate commissions ({AFFILIATE_RATE * 100}%)</span>
                </div>
                <p className="text-2xl font-semibold tracking-[-0.015em] text-foreground">{formatCents(commissionPending)}</p>
                <p className="text-[11px] text-muted-foreground">pending · {formatCents(commissionPaid)} paid</p>
              </div>
            </div>

            {referralCode && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm">Your referral link</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={referralLink(referralCode)}
                    readOnly
                    className="text-xs bg-muted/30"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyReferral}
                    aria-label="Copy referral link"
                    className="shrink-0 border-primary/20 text-primary hover:bg-primary/10"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">For each person who signs up with your link, you get 50 credits plus 5% of everything they pay (plans, renewals and credits). The person you invite gets 5 credits per day, every 24 hours.</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </AppShell>
  )
}
