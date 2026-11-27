import { syncFluxosConnection } from '@/lib/automatisch/fluxosSync'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Music, Search, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SPOTIFY_ERROR_MESSAGES, spotifyEmbedUrl, type SpotifyTrack } from '@/lib/spotify/spotifyCore'
import { callSpotify, startSpotifyConnect } from '@/lib/spotify/client'

type Status = { connected: boolean; display_name?: string | null }

export default function ConnectorSpotifyPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<Status | null>(null)
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [busy, setBusy] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)

  // Resultado do callback OAuth (?spotify=connected ou ?error=...).
  useEffect(() => {
    const err = params.get('error')
    if (err) toast.error(`We could not connect Spotify: ${err}`)
    if (params.get('spotify') === 'connected') { toast.success('Spotify is connected'); void syncFluxosConnection('spotify') }
    if (err || params.get('spotify')) {
      const next = new URLSearchParams(params)
      next.delete('error'); next.delete('spotify')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const refresh = async () => {
    const res = await callSpotify({ op: 'status' })
    setStatus({ connected: !!res.connected, display_name: res.display_name })
  }
  useEffect(() => { refresh() }, [])

  const connect = async () => {
    setBusy(true)
    const url = await startSpotifyConnect('/connectors/spotify', window.location.origin)
    setBusy(false)
    if (!url) {
      toast.error('We could not start the Spotify connection. Please try again in a moment.')
      return
    }
    window.location.href = url
  }

  const disconnect = async () => {
    setBusy(true)
    await callSpotify({ op: 'disconnect' })
    setBusy(false)
    setTracks([])
    await refresh()
    toast.success('Spotify is disconnected')
  }

  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    const res = await callSpotify({ op: 'search', query, max: 10 })
    setBusy(false)
    if (!res.ok) {
      if (res.code === 'reauth_required' || res.code === 'not_connected') await refresh()
      toast.error(res.message ?? SPOTIFY_ERROR_MESSAGES.spotify_unavailable)
      return
    }
    setTracks(res.tracks ?? [])
  }

  const play = async (t: SpotifyTrack) => {
    setPlayingId(t.id)
    const res = await callSpotify({ op: 'play', track: t.id })
    setPlayingId(null)
    if (res.ok) toast.success(`Tocando ${t.title}`)
    else toast.error(res.message ?? SPOTIFY_ERROR_MESSAGES.spotify_unavailable)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <button type="button" onClick={() => navigate('/connectors')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Connectors
      </button>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Music className="h-6 w-6 text-emerald-500" />
          <CardTitle>Spotify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === null ? (
            <p className="text-sm text-muted-foreground">Checking the connection…</p>
          ) : status.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Connected{status.display_name ? ` as ${status.display_name}` : ''}. Ask for a song in the chat and it plays right here.</p>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
                <Unplug className="mr-2 h-4 w-4" /> Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your account to ask for songs in the chat. Search and the player work without Premium. Playing on your own device needs Premium.
              </p>
              <Button onClick={connect} disabled={busy}>Connect Spotify</Button>
            </div>
          )}

          {status?.connected && (
            <form onSubmit={search} className="flex gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Song, artist or album" aria-label="Search Spotify" />
              <Button type="submit" disabled={busy || !query.trim()}><Search className="h-4 w-4" /></Button>
            </form>
          )}
        </CardContent>
      </Card>

      {tracks.length > 0 && (
        <ul className="space-y-4">
          {tracks.map((t) => (
            <li key={t.id} className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{t.title} <span className="font-normal text-muted-foreground">— {t.artist}</span></p>
                <Button size="sm" variant="ghost" onClick={() => play(t)} disabled={playingId === t.id}>Play on my device</Button>
              </div>
              <iframe
                title={`Spotify: ${t.title}`}
                src={spotifyEmbedUrl(t.id)}
                width="100%"
                height={152}
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="rounded-xl border-0"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
