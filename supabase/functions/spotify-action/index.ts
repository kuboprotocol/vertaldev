// Ações do Spotify para o usuário logado: status, busca, tocar, fila, controles e aparelhos.
// O chat e a tela /connectors/spotify chamam esta função. Tokens nunca saem do servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  clampSearchLimit, describeTracks, extractTrackId, mapSpotifyTrack, parseSearchTracks,
  SPOTIFY_ERROR_MESSAGES, SPOTIFY_OPS, type SpotifyErrorCode, type SpotifyOp, type SpotifyTrack,
} from '../_shared/spotifyCore.ts'
import { type AdminClient, type SpotifyAccountRow, SpotifyApiError, spotifyCall } from '../_shared/spotifyApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
// Erros de negócio voltam com HTTP 200 e ok:false, para o cliente tratar sempre o mesmo formato.
const fail = (code: SpotifyErrorCode) =>
  json({ ok: false, code, message: SPOTIFY_ERROR_MESSAGES[code] })

type Input = { op?: string; query?: string; track?: string; max?: number }

/** Resolve a faixa de um pedido: id/URL direto ou a primeira do resultado da busca. */
async function resolveTrack(admin: AdminClient, account: SpotifyAccountRow, input: Input): Promise<SpotifyTrack | null> {
  const direct = extractTrackId(input.track)
  if (direct) {
    const { data } = await spotifyCall(admin, account, 'play', 'GET', `/tracks/${direct}`)
    return mapSpotifyTrack(data)
  }
  const query = (input.query ?? input.track ?? '').trim()
  if (!query) throw new SpotifyApiError('bad_request', 400)
  const { data } = await spotifyCall(admin, account, 'search', 'GET', '/search', {
    query: { q: query, type: 'track', limit: 1 },
  })
  return parseSearchTracks(data)[0] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request', message: SPOTIFY_ERROR_MESSAGES.bad_request }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, code: 'reauth_required', message: 'Sessão ausente.' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ ok: false, code: 'reauth_required', message: 'Sessão inválida.' }, 401)

    const input = await req.json().catch(() => ({})) as Input
    const op = String(input.op ?? '') as SpotifyOp
    if (!(SPOTIFY_OPS as readonly string[]).includes(op)) return fail('bad_request')

    const admin: AdminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: row } = await admin.from('spotify_accounts').select('*').eq('user_id', user.id).maybeSingle()

    if (op === 'disconnect') {
      await admin.from('spotify_accounts').delete().eq('user_id', user.id)
      return json({ ok: true, op, connected: false })
    }
    if (op === 'status') {
      if (!row) return json({ ok: true, op, connected: false })
      return json({ ok: true, op, connected: true, display_name: (row as { display_name: string | null }).display_name })
    }
    if (!row) return fail('not_connected')
    const account = row as SpotifyAccountRow

    if (op === 'search') {
      const query = (input.query ?? '').trim()
      if (!query) return fail('bad_request')
      const limit = clampSearchLimit(input.max)
      const { data } = await spotifyCall(admin, account, op, 'GET', '/search', {
        query: { q: query, type: 'track', limit },
      })
      const tracks = parseSearchTracks(data)
      return json({ ok: true, op, tracks, summary: describeTracks(tracks) })
    }

    if (op === 'play' || op === 'queue') {
      const track = await resolveTrack(admin, account, input)
      if (!track) return fail('not_found')
      if (op === 'play') {
        await spotifyCall(admin, account, op, 'PUT', '/me/player/play', { body: { uris: [track.uri] } })
        return json({ ok: true, op, tracks: [track], summary: `Tocando ${track.title} — ${track.artist} no aparelho ativo.` })
      }
      await spotifyCall(admin, account, op, 'POST', '/me/player/queue', { query: { uri: track.uri } })
      return json({ ok: true, op, tracks: [track], summary: `Adicionado à fila: ${track.title} — ${track.artist}.` })
    }

    if (op === 'pause' || op === 'next' || op === 'previous') {
      const map = { pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] } as const
      const [method, path] = map[op]
      await spotifyCall(admin, account, op, method, path)
      const label = { pause: 'Pausado.', next: 'Próxima faixa.', previous: 'Faixa anterior.' }[op]
      return json({ ok: true, op, summary: label })
    }

    if (op === 'now_playing') {
      const { status, data } = await spotifyCall(admin, account, op, 'GET', '/me/player/currently-playing')
      if (status === 204 || !data) return json({ ok: true, op, playing: false, summary: 'Nada tocando agora.' })
      const d = data as { is_playing?: boolean; item?: unknown }
      const track = mapSpotifyTrack(d.item)
      return json({
        ok: true, op, playing: Boolean(d.is_playing), tracks: track ? [track] : [],
        summary: track ? `${d.is_playing ? 'Tocando' : 'Pausado'}: ${track.title} — ${track.artist}.` : 'Nada tocando agora.',
      })
    }

    if (op === 'devices') {
      const { data } = await spotifyCall(admin, account, op, 'GET', '/me/player/devices')
      const devices = (((data as { devices?: unknown[] })?.devices) ?? []).map((d) => {
        const x = d as { id?: string; name?: string; type?: string; is_active?: boolean }
        return { id: x.id ?? '', name: x.name ?? 'Aparelho', type: x.type ?? '', active: Boolean(x.is_active) }
      })
      return json({ ok: true, op, devices, summary: devices.length ? devices.map((d) => `${d.name}${d.active ? ' (ativo)' : ''}`).join(', ') : 'Nenhum aparelho disponível.' })
    }

    return fail('bad_request')
  } catch (e) {
    if (e instanceof SpotifyApiError) {
      const code = (e.code in SPOTIFY_ERROR_MESSAGES ? e.code : 'spotify_unavailable') as SpotifyErrorCode
      return json({ ok: false, code, message: SPOTIFY_ERROR_MESSAGES[code] })
    }
    console.error('spotify-action: erro', e instanceof Error ? e.message : e)
    return fail('spotify_unavailable')
  }
})
