import { describe, expect, it } from 'vitest';
import {
  MUSIC_COST_CREDITS, autoTitle, buildMusicTags, buildSuperPrompt, cleanLyrics, fallbackLyrics, mapSunoStatus,
  musicRequestError, normalizeMusicRequest, ownPayload, pickMusicProvider, sunoPayload,
} from '../../../supabase/functions/_shared/music/vertalMusicCore';
import { musicErrorMessage, musicStage, MUSIC_STUDIO_COST } from '@/components/creative/vertalMusicStudio';

const studio = {
  style: 'Pop', mood: 'Esperançoso', energy: 70, tempo: 110, music_key: 'C major', language: 'Português',
  vocal_type: 'Feminino', vocal_tone: 'Suave', instruments_primary: 'violão, bateria', instruments_secondary: 'pads',
  lyrics_mode: 'assist' as const, lyrics_input: 'recomeçar', reference: '', vibe_dna: { depth: 80, punch: 70, space: 40, texture: 30 },
};

describe('vertalMusicCore', () => {
  it('mantém o preço atual de 1 crédito no painel e no servidor', () => {
    expect(MUSIC_COST_CREDITS).toBe(1);
    expect(MUSIC_STUDIO_COST).toBe(MUSIC_COST_CREDITS);
  });

  it('normaliza o pedido do Studio e monta as tags como a MusKAI', () => {
    const r = normalizeMusicRequest(studio);
    expect(r.languageCode).toBe('pt');
    expect(r.instrumental).toBe(false);
    const tags = buildMusicTags(r);
    expect(tags).toContain('Pop');
    expect(tags).toContain('Feminino vocals (Suave)');
    expect(tags).toContain('110bpm');
    expect(tags).toContain('deep reverb');
    expect(tags).toContain('punchy drums');
    expect(tags).toContain('analog warmth');
    expect(buildSuperPrompt(r)).toContain('LYRICS_MODE: assist');
  });

  it('aceita o pedido antigo {prompt, instrumental}', () => {
    const r = normalizeMusicRequest({ prompt: 'lo-fi para estudar', instrumental: true });
    expect(musicRequestError(r)).toBeNull();
    expect(r.instrumental).toBe(true);
    expect(buildMusicTags(r)).toContain('lo-fi para estudar');
    expect(ownPayload(r, '', 1).lyrics).toBe('[Instrumental]');
  });

  it('"Sem vocal" vira instrumental e letra pronta exige texto', () => {
    expect(normalizeMusicRequest({ ...studio, vocal_type: 'Sem vocal' }).instrumental).toBe(true);
    expect(musicRequestError(normalizeMusicRequest({ ...studio, lyrics_mode: 'paste', lyrics_input: '' }))).toBe('lyrics_required');
    expect(musicRequestError(normalizeMusicRequest({}))).toBe('prompt_required');
  });

  it('escolhe o provedor: chave da MusKAI (sunoapi.org) primeiro, depois o motor próprio', () => {
    expect(pickMusicProvider({})).toBeNull();
    const own = { VERTAL_OWN_MUSIC_URL: 'https://x.modal.run', VERTAL_OWN_MUSIC_TOKEN: 't' };
    expect(pickMusicProvider(own)).toBe('vertal');
    expect(pickMusicProvider({ ...own, SUNOAPI_KEY: 'k' })).toBe('muskai');
    expect(pickMusicProvider({ ...own, SUNOAPI_KEY: 'k', VERTAL_MUSIC_PROVIDER: 'vertal' })).toBe('vertal');
    expect(pickMusicProvider({ ...own, VERTAL_MUSIC_PROVIDER: 'off' })).toBeNull();
    expect(pickMusicProvider({ VERTAL_OWN_MUSIC_URL: 'http://inseguro', VERTAL_OWN_MUSIC_TOKEN: 't' })).toBeNull();
  });

  it('payload do sunoapi.org igual ao da MusKAI', () => {
    const r = normalizeMusicRequest(studio);
    const p = sunoPayload(r, '[verse]\nla', 'Título', '', 'https://cb');
    expect(p).toMatchObject({ customMode: true, instrumental: false, title: 'Título', model: 'V4_5', callBackUrl: 'https://cb' });
    expect(p.style.length).toBeLessThanOrEqual(200);
  });

  it('status do provedor e letras', () => {
    expect(mapSunoStatus('SUCCESS', 2)).toBe('completed');
    expect(mapSunoStatus('TEXT_SUCCESS', 0)).toBe('processing');
    expect(mapSunoStatus('GENERATE_AUDIO_FAILED', 0)).toBe('failed');
    expect(cleanLyrics('<think>x</think>**Verso 1**\nRefrão:\nla la')).toContain('[chorus]');
    expect(fallbackLyrics(normalizeMusicRequest(studio))).toContain('[chorus]');
    expect(autoTitle(normalizeMusicRequest(studio), 'AB12')).toBe('Recomeçar');
  });

  it('mensagens de erro em pt-BR e etapas', () => {
    expect(musicErrorMessage('insufficient_credits')).toMatch(/Créditos insuficientes/);
    expect(musicErrorMessage('', 'music_unavailable')).toMatch(/indisponível/);
    expect(musicStage(null, true)).toBe('sending');
    expect(musicStage({ asset_id: 'a', status: 'processing', title: '', items: [] }, false)).toBe('processing');
  });
});
