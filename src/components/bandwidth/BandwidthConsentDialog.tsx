import { Wifi } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BandwidthConsentDetails } from './BandwidthConsentDetails'
import { useBandwidthTexts } from './useBandwidthTexts'

/** Abre a tela de consentimento. Abrir NÃO liga nada: a chave continua como o usuário deixou. */
export function BandwidthConsentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useBandwidthTexts()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-violet-400/30 bg-[#0b0814]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <span className="rounded-lg bg-violet-500/20 p-1.5">
              <Wifi className="h-4 w-4 text-violet-300" aria-hidden />
            </span>
            {t.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{t.promoSubtitle}</DialogDescription>
        </DialogHeader>
        <BandwidthConsentDetails />
      </DialogContent>
    </Dialog>
  )
}

export default BandwidthConsentDialog
