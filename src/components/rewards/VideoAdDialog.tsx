import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { REWARD_PER_VIDEO, VIDEO_AD_FALLBACK_SECONDS, VIDEO_AD_SRC } from '@/config/rewardsConfig'
import { formatCredits } from '@/lib/rewards'

interface VideoAdDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado só quando o anúncio terminou. Fechar antes do fim não credita nada. */
  onComplete: () => Promise<void> | void
  submitting?: boolean
}

export default function VideoAdDialog({ open, onOpenChange, onComplete, submitting = false }: VideoAdDialogProps) {
  const [finished, setFinished] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(VIDEO_AD_FALLBACK_SECONDS)
  const [videoError, setVideoError] = useState(false)
  const usesVideo = Boolean(VIDEO_AD_SRC) && !videoError

  // Reinicia o anúncio a cada abertura.
  useEffect(() => {
    if (open) {
      setFinished(false)
      setSecondsLeft(VIDEO_AD_FALLBACK_SECONDS)
      setVideoError(false)
    }
  }, [open])

  // Anúncio cronometrado quando não há vídeo configurado.
  useEffect(() => {
    if (!open || usesVideo || finished) return
    if (secondsLeft <= 0) {
      setFinished(true)
      return
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [open, usesVideo, finished, secondsLeft])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vídeo patrocinado</DialogTitle>
          <DialogDescription>
            Assista até o fim para ganhar {formatCredits(REWARD_PER_VIDEO)} créditos.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {usesVideo ? (
            <video
              key={VIDEO_AD_SRC}
              src={VIDEO_AD_SRC}
              className="h-full w-full"
              autoPlay
              playsInline
              controls={false}
              onEnded={() => setFinished(true)}
              onError={() => setVideoError(true)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
              <span className="text-xs uppercase tracking-wide text-white/60">Anúncio</span>
              <span className="text-3xl font-display font-bold">
                {finished ? '✓' : secondsLeft}
              </span>
              <span className="text-xs text-white/60">
                {finished ? 'Anúncio concluído' : 'Aguarde para receber a recompensa'}
              </span>
            </div>
          )}
        </div>

        {videoError && (
          <p className="text-xs text-destructive">
            Não foi possível carregar o vídeo. Tente novamente mais tarde.
          </p>
        )}

        <Button
          className="w-full"
          disabled={!finished || submitting}
          onClick={() => onComplete()}
        >
          {submitting
            ? 'Creditando...'
            : `Receber ${formatCredits(REWARD_PER_VIDEO)} créditos`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
