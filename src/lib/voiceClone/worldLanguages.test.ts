import { describe, expect, it } from 'vitest';
import {
  TTS_LANG_CODES, detectSpeechLanguage, isUnsupportedSpeech, resolveSpeechLanguage, ttsLangCode, voiceMessage,
} from '../../../supabase/functions/_shared/voiceClone';
import { voiceServerLang, voiceUiDict, voiceUiLangCode } from './i18n';
import { genreHint, musicStyleOptions, searchMusicStyles, LEGACY_STUDIO_STYLES } from '../../../supabase/functions/_shared/music/worldGenres';
import { buildMusicTags, languageCode, normalizeMusicRequest } from '../../../supabase/functions/_shared/music/vertalMusicCore';

describe('fala em qualquer idioma (Chatterbox Multilingual)', () => {
  it('tem os 23 idiomas do pacote', () => {
    expect(TTS_LANG_CODES).toHaveLength(23);
    expect(TTS_LANG_CODES).toEqual(expect.arrayContaining(['pt', 'en', 'es', 'ar', 'hi', 'ja', 'ko', 'zh', 'sw', 'he', 'el', 'ms']));
  });

  it('detecta o idioma do texto', () => {
    expect(detectSpeechLanguage('Olá, tudo bem com você? Eu não sei se vou hoje.')).toBe('pt');
    expect(detectSpeechLanguage('Hola, ¿cómo estás? Yo no sé si voy con ella.')).toBe('es');
    expect(detectSpeechLanguage('Hello, how are you? I think that the show is great.')).toBe('en');
    expect(detectSpeechLanguage('Bonjour, je suis très content de vous voir avec mes amis.')).toBe('fr');
    expect(detectSpeechLanguage('Ich bin sehr froh, dass du mit mir in die Stadt kommst.')).toBe('de');
    expect(detectSpeechLanguage('こんにちは、元気ですか')).toBe('ja');
    expect(detectSpeechLanguage('你好，我们今天去哪里')).toBe('zh');
    expect(detectSpeechLanguage('안녕하세요 반갑습니다')).toBe('ko');
    expect(detectSpeechLanguage('مرحبا كيف حالك')).toBe('ar');
    expect(detectSpeechLanguage('नमस्ते आप कैसे हैं')).toBe('hi');
    expect(detectSpeechLanguage('Привет, как дела?')).toBe('ru');
    expect(detectSpeechLanguage('สวัสดีครับ')).toBe('th');
  });

  it('pedido explícito vence a detecção', () => {
    const r = resolveSpeechLanguage({ requested: 'it', text: 'Hello there, how are you today?' });
    expect(isUnsupportedSpeech(r)).toBe(false);
    if (!isUnsupportedSpeech(r)) expect(r).toMatchObject({ language: 'it', source: 'requested' });
  });

  it('escrita sem suporte é recusada antes de cobrar (não quebra)', () => {
    const r = resolveSpeechLanguage({ text: 'สวัสดีครับ ยินดีที่ได้รู้จัก', voiceLanguage: 'pt' });
    expect(isUnsupportedSpeech(r)).toBe(true);
    expect(voiceMessage('language_unsupported', 'pt')).toContain('Português');
  });

  it('latino desconhecido cai no idioma da voz com aviso', () => {
    const r = resolveSpeechLanguage({ text: 'Xyz qwrt plk', voiceLanguage: 'pt' });
    expect(r).toMatchObject({ language: 'pt', source: 'voice' });
  });

  it('ucraniano fala com o russo como reserva', () => {
    const r = resolveSpeechLanguage({ text: 'Привіт, як справи? Я їду додому' });
    expect(r).toMatchObject({ language: 'ru', fallback: true, detected: 'uk' });
  });

  it('normaliza códigos e nomes', () => {
    expect(ttsLangCode('pt-BR')).toBe('pt');
    expect(ttsLangCode('nb')).toBe('no');
    expect(ttsLangCode('auto')).toBeNull();
    expect(ttsLangCode('한국어')).toBe('ko');
  });
});

describe('idioma da tela do Clonador', () => {
  it('Ajustes → pedido no chat → navegador → perfil → pt-BR', () => {
    expect(voiceUiLangCode({ setting: 'auto', request: 'pt-BR', browser: 'en-US', profile: null })).toBe('pt-BR');
    expect(voiceUiLangCode({ setting: 'de', request: 'pt-BR', browser: 'en-US', profile: null })).toBe('de');
    expect(voiceUiLangCode({ setting: null, request: null, browser: 'fr-FR', profile: 'es' })).toBe('fr');
    expect(voiceUiLangCode({ setting: null, request: null, browser: null, profile: null })).toBe('pt-BR');
  });
  it('escolhe o dicionário e o idioma do servidor', () => {
    expect(voiceUiDict('pt-PT')).toBe('pt');
    expect(voiceUiDict('fr-CH')).toBe('fr');
    expect(voiceUiDict('ja')).toBe('en');
    expect(voiceServerLang('pt-BR')).toBe('pt');
    expect(voiceServerLang('de')).toBe('en');
  });
});

describe('música: ritmos e idiomas do mundo', () => {
  it('mantém os 18 estilos antigos primeiro e soma o catálogo', () => {
    const opts = musicStyleOptions();
    expect(opts.slice(0, 18).map((o) => o.name)).toEqual([...LEGACY_STUDIO_STYLES]);
    expect(opts.length).toBeGreaterThan(130);
    for (const g of ['Funk carioca', 'Axé', 'Bossa nova', 'Cumbia', 'Bachata', 'Salsa', 'Tango', 'K-pop', 'J-pop', 'Afrobeats',
      'Amapiano', 'Highlife', 'Bhangra', 'Bollywood', 'Fado', 'Flamenco', 'Chanson', 'Schlager', 'Raï', 'Dabke', 'Arabic pop', 'Qawwali', 'Gamelan']) {
      expect(opts.some((o) => o.name === g)).toBe(true);
    }
  });
  it('busca sem acento e por região', () => {
    expect(searchMusicStyles('forro').map((o) => o.name)).toContain('Forró');
    expect(searchMusicStyles('angola').map((o) => o.name)).toEqual(expect.arrayContaining(['Kizomba', 'Semba', 'Kuduro']));
  });
  it('estilos antigos não mudam o pedido; ritmos novos ganham descrição', () => {
    expect(genreHint('Samba')).toBe('');
    expect(genreHint('Pop')).toBe('');
    expect(genreHint('amapiano')).toContain('log drum');
    const before = buildMusicTags(normalizeMusicRequest({ style: 'Pop', mood: 'Esperançoso' }));
    expect(before.startsWith('Pop, Esperançoso')).toBe(true);
    expect(buildMusicTags(normalizeMusicRequest({ style: 'Qawwali' }))).toContain('harmonium');
  });
  it('idioma da letra: 50 idiomas do ACE-Step, padrão português', () => {
    expect(languageCode('Português')).toBe('pt');
    expect(languageCode('日本語')).toBe('ja');
    expect(languageCode('한국어')).toBe('ko');
    expect(languageCode('Kiswahili')).toBe('sw');
    expect(languageCode('yue')).toBe('yue');
    expect(languageCode('pt-BR')).toBe('pt');
    expect(languageCode('Klingon')).toBe('unknown');
  });
});
