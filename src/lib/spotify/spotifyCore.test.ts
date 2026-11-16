import { describe, expect, it } from 'vitest'
import {
  buildSpotifyAuthorizeUrl, clampSearchLimit, describeTracks, extractTrackId, mapSpotifyTrack,
  parseSearchTracks, spotifyEmbedUrl, spotifyErrorCode, SPOTIFY_SCOPE_STRING,
} from './spotifyCore'
import { parseAgentAction } from '../../../supabase/functions/_shared/chatAgent'

const ID = '4T0fiAFOJU8d7fGC0DcMH0'

describe('Spotify core', () => {
  it('monta a URL de consentimento com escopos mínimos e state', () => {
    const url = new URL(buildSpotifyAuthorizeUrl({
      clientId: 'cid', redirectUri: 'https://x.test/cb', state: 'abc.def',
    }))
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(SPOTIFY_SCOPE_STRING)
    expect(url.searchParams.get('state')).toBe('abc.def')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/cb')
    expect(SPOTIFY_SCOPE_STRING).not.toContain('playlist')
  })

  it('extrai o id de faixa de id puro, URI, URL e URL localizada', () => {
    expect(extractTrackId(ID)).toBe(ID)
    expect(extractTrackId(`spotify:track:${ID}`)).toBe(ID)
    expect(extractTrackId(`https://open.spotify.com/track/${ID}?si=abc`)).toBe(ID)
    expect(extractTrackId(`https://open.spotify.com/intl-pt/track/${ID}`)).toBe(ID)
  })

  it('rejeita o que não é faixa', () => {
    expect(extractTrackId('')).toBeNull()
    expect(extractTrackId(null)).toBeNull()
    expect(extractTrackId('Evidências')).toBeNull()
    expect(extractTrackId('https://open.spotify.com/album/' + ID)).toBeNull()
    expect(extractTrackId('https://evil.test/track/' + ID)).toBeNull()
    expect(extractTrackId('spotify:album:' + ID)).toBeNull()
  })

  it('gera a URL do player embutido', () => {
    expect(spotifyEmbedUrl(ID)).toBe(`https://open.spotify.com/embed/track/${ID}?utm_source=vertal`)
  })

  it('limita o número de resultados', () => {
    expect(clampSearchLimit(undefined)).toBe(5)
    expect(clampSearchLimit('abc')).toBe(5)
    expect(clampSearchLimit(0)).toBe(1)
    expect(clampSearchLimit(99)).toBe(10)
    expect(clampSearchLimit('3')).toBe(3)
  })

  it('mapeia faixas da Web API e ignora lixo', () => {
    const raw = {
      id: ID, uri: `spotify:track:${ID}`, name: 'Evidências', duration_ms: 200000,
      artists: [{ name: 'Chitãozinho & Xororó' }, { name: 'Outro' }],
      album: { name: 'Álbum', images: [{ url: 'https://i.test/a.jpg' }] },
    }
    expect(mapSpotifyTrack(raw)).toEqual({
      id: ID, uri: `spotify:track:${ID}`, title: 'Evidências', artist: 'Chitãozinho & Xororó, Outro',
      album: 'Álbum', imageUrl: 'https://i.test/a.jpg', durationMs: 200000,
    })
    expect(mapSpotifyTrack({ name: 'sem id' })).toBeNull()
    expect(mapSpotifyTrack(null)).toBeNull()
    expect(parseSearchTracks({ tracks: { items: [raw, { id: '' }, 7] } })).toHaveLength(1)
    expect(parseSearchTracks({})).toEqual([])
  })

  it('traduz status HTTP em código de erro, distinguindo Premium e aparelho', () => {
    expect(spotifyErrorCode(401, 'search')).toBe('reauth_required')
    expect(spotifyErrorCode(403, 'play')).toBe('premium_required')
    expect(spotifyErrorCode(404, 'pause')).toBe('no_active_device')
    expect(spotifyErrorCode(404, 'search')).toBe('not_found')
    expect(spotifyErrorCode(429, 'search')).toBe('rate_limited')
    expect(spotifyErrorCode(500, 'search')).toBe('spotify_unavailable')
  })

  it('descreve as faixas com id para o modelo', () => {
    expect(describeTracks([])).toBe('Nenhuma faixa encontrada.')
    const t = mapSpotifyTrack({ id: ID, name: 'A', artists: [{ name: 'B' }], album: { name: 'C' } })!
    expect(describeTracks([t])).toBe(`1. A — B (C) [id:${ID}]`)
  })
})

describe('ação spotify no chat', () => {
  it('aceita busca, tocar e controle, e corta o limite', () => {
    expect(parseAgentAction({ tool: 'spotify', op: 'search', query: 'Djavan', max: 50 }))
      .toEqual({ tool: 'spotify', op: 'search', query: 'Djavan', max: 10 })
    expect(parseAgentAction({ tool: 'spotify', op: 'play', query: 'Evidências' }))
      .toEqual({ tool: 'spotify', op: 'play', query: 'Evidências', max: 5 })
    expect(parseAgentAction({ tool: 'spotify', op: 'pause' })).toEqual({ tool: 'spotify', op: 'pause', max: 5 })
  })

  it('recusa operação desconhecida', () => {
    expect(parseAgentAction({ tool: 'spotify', op: 'delete_all' })).toBeNull()
    expect(parseAgentAction({ tool: 'spotify' })).toBeNull()
  })
})
