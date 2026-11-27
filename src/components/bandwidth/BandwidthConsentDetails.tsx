import { useState } from 'react'
import { Check, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useBandwidthConsent } from '@/hooks/useBandwidthConsent'
import { useBandwidthTexts } from './useBandwidthTexts'
import {
  BANDWIDTH_PRIVACY_PATH,
  formatConsentDate,
} from '@/lib/bandwidthSharing'
import { BANDWIDTH_SHARING_FLAGS } from '@/config/features'
import { cn } from '@/lib/utils'

/**
 * Tela de consentimento (opt-in) do compartilhamento de banda: explica o que é, o que é e o que não é
 * compartilhado, e traz a chave. A chave começa DESLIGADA e só liga com o clique do próprio usuário.
 */
export function BandwidthConsentDetails({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t, lang } = useBandwidthTexts()
  const { consent, localOnly, signedIn, setOptIn } = useBandwidthConsent()
  const [saving, setSaving] = useState(false)

  const onToggle = async (value: boolean) => {
    if (saving) return
    setSaving(true)
    try {
      const outcome = await setOptIn(value)
      if (outcome === 'saved' || outcome === 'local') toast.success(value ? t.saved : t.revoked)
      else if (outcome === 'error') toast.error(t.saveError)
    } finally {
      setSaving(false)
    }
  }

  const redirect = typeof window !== 'undefined' ? window.location.pathname : '/recompensas'
  const status = consent.optedIn
    ? consent.optedInAt && t.acceptedAt(formatConsentDate(consent.optedInAt, lang))
    : consent.optedOutAt && t.revokedAt(formatConsentDate(consent.optedOutAt, lang))

  return (
    <div className={cn('space-y-4 text-sm', className)} data-testid="bandwidth-consent">
      <p className="text-muted-foreground" data-testid="bandwidth-consent-intro">{t.intro}</p>

      <div className={cn('grid gap-3', !compact && 'sm:grid-cols-2')}>
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">{t.sharedTitle}</p>
          <ul className="space-y-1.5">
            {t.shared.map((item) => (
              <li key={item} className="flex gap-2 text-foreground/90">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-300">{t.notSharedTitle}</p>
          <ul className="space-y-1.5">
            {t.notShared.map((item) => (
              <li key={item} className="flex gap-2 text-foreground/90">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="flex gap-2 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
        {t.control}
      </p>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
        <div className="min-w-0">
          <label htmlFor="bandwidth-consent-switch" className="block font-medium text-foreground">
            {t.toggleLabel}
          </label>
          <p className="text-xs text-muted-foreground" data-testid="bandwidth-consent-state">
            {consent.optedIn ? t.toggleOn : t.toggleOff}
            {status ? ` · ${status}` : ''}
          </p>
        </div>
        {signedIn ? (
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
            <Switch
              id="bandwidth-consent-switch"
              data-testid="bandwidth-consent-switch"
              checked={consent.optedIn}
              disabled={saving}
              onCheckedChange={onToggle}
            />
          </div>
        ) : (
          <Button asChild size="sm" className="shrink-0 bg-violet-600 text-white hover:bg-violet-500">
            <a href={`/auth?redirect=${encodeURIComponent(redirect)}`} data-testid="bandwidth-consent-signin">
              {t.signInToEnable}
            </a>
          </Button>
        )}
      </div>

      {consent.optedIn && !BANDWIDTH_SHARING_FLAGS.sdk && (
        <p className="text-xs text-muted-foreground" data-testid="bandwidth-consent-no-sdk">{t.noSdkYet}</p>
      )}
      {signedIn && localOnly && (
        <p className="text-xs text-amber-300/90" data-testid="bandwidth-consent-local">{t.localOnly}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <a
          href={BANDWIDTH_PRIVACY_PATH}
          className="inline-flex items-center gap-1 text-violet-300 underline-offset-2 hover:underline"
          data-testid="bandwidth-consent-privacy"
        >
          {t.privacy}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <span>{t.partner}</span>
      </div>
    </div>
  )
}

export default BandwidthConsentDetails
