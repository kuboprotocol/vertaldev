import { Wifi } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BANDWIDTH_SETTINGS_ANCHOR } from '@/lib/bandwidthSharing'
import { BANDWIDTH_SHARING_FLAGS } from '@/config/features'
import { BandwidthConsentDetails } from './BandwidthConsentDetails'
import { useBandwidthTexts } from './useBandwidthTexts'

/** Cartão com a chave de consentimento, em Recompensas e no Perfil (configurações). */
export function BandwidthConsentCard({ className }: { className?: string }) {
  const { t } = useBandwidthTexts()
  if (!BANDWIDTH_SHARING_FLAGS.ui) return null
  return (
    <Card id={BANDWIDTH_SETTINGS_ANCHOR} className={`glass glass-border scroll-mt-24 ${className ?? ''}`} data-testid="bandwidth-consent-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-5 w-5 text-primary" aria-hidden />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BandwidthConsentDetails compact />
      </CardContent>
    </Card>
  )
}

export default BandwidthConsentCard
