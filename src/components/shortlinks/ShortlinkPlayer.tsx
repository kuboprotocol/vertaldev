import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Shortlink {
  id: string
  title: string
  description?: string
  video_url: string
  video_duration_seconds: number
  view_count: number
}

interface ShortlinkPlayerProps {
  shortlink: Shortlink
  onClose: () => void
}

export default function ShortlinkPlayer({ shortlink, onClose }: ShortlinkPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Record view when player opens
    const recordView = async () => {
      try {
        await supabase.functions.invoke('shortlinks', {
          method: 'POST',
          headers: { 'X-Action': 'record-view' },
          body: { shortlink_id: shortlink.id },
        })
      } catch (e) {
        console.error('Erro ao registrar view:', e)
      }
    }

    recordView()
  }, [shortlink.id])

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
      } else {
        videoRef.current.pause()
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-black rounded-2xl overflow-hidden shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Video container - 9:16 aspect ratio */}
        <div className="relative aspect-[9/16] bg-black overflow-hidden">
          <video
            ref={videoRef}
            src={shortlink.video_url}
            autoPlay
            loop
            className="w-full h-full object-cover"
            onClick={handlePlayPause}
          />

          {/* Info overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <h3 className="text-white font-semibold text-sm">{shortlink.title}</h3>
            {shortlink.description && (
              <p className="text-white/80 text-xs mt-1 line-clamp-2">{shortlink.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs text-white/60">
              <span>👁️ {shortlink.view_count + 1}</span>
              <span>⏱️ {shortlink.video_duration_seconds}s</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          <Button
            onClick={handlePlayPause}
            variant="outline"
            className="w-full"
          >
            Reproduzir/Pausar
          </Button>
          <Button
            onClick={onClose}
            variant="secondary"
            className="w-full"
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
