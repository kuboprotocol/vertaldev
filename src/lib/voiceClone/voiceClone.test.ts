import { describe, expect, it } from 'vitest';
import {
  VOICE_CLONE_DEFAULT_USER_IDS, VOICE_CONSENT_VERSION, consentValid, ownUploadPathFromUrl, ownVoiceSamplePath,
  parseVoiceCloneAction, voiceCloneAllowed, voiceCloneCosts, voiceCloneToolPrompt, voiceEnvFrom, voiceMessage, wantsVoiceClone,
} from '../../../supabase/functions/_shared/voiceClone';
import { buildAgentSystemPrompt, parseAgentAction, PANELS } from '../../../supabase/functions/_shared/chatAgent';
import { PANEL_BY_KEY, PANEL_LIST } from '@/components/vertal-chat/panelList';

const LAERCIO = VOICE_CLONE_DEFAULT_USER_IDS[0];
const OTHER = '11111111-2222-3333-4444-555555555555';
const SUPA = 'https://sccizjlpwezsgaxkclot.supabase.co';

describe('flag do Clonador de voz', () => {
  it('desligado por padrão para todo mundo', () => {
    expect(voiceCloneAllowed({}, LAERCIO)).toBe(false);
    expect(voiceCloneAllowed({}, OTHER)).toBe(false);
  });
  it('ligado sem lista = só o Laércio', () => {
    const env = { VERTAL_OWN_VOICE_ENABLED: 'true' };
    expect(voiceCloneAllowed(env, LAERCIO)).toBe(true);
    expect(voiceCloneAllowed(env, OTHER)).toBe(false);
  });
  it('lista explícita manda', () => {
    const env = { VERTAL_OWN_VOICE_ENABLED: 'true', VERTAL_OWN_VOICE_USER_IDS: OTHER };
    expect(voiceCloneAllowed(env, OTHER)).toBe(true);
    expect(voiceCloneAllowed(env, LAERCIO)).toBe(false);
  });
  it('lê as chaves do VERTAL_GPU_CONFIG (avulso vence)', () => {
    const env = voiceEnvFrom({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OWN_VOICE_ENABLED: true, VERTAL_OWN_VOICE_URL: 'https://x', OUTRA: 'y' }), VERTAL_OWN_VOICE_URL: 'https://avulso' });
    expect(env.VERTAL_OWN_VOICE_ENABLED).toBe('true');
    expect(env.VERTAL_OWN_VOICE_URL).toBe('https://avulso');
    expect(env.OUTRA).toBeUndefined();
    expect(voiceCloneAllowed(env, LAERCIO)).toBe(true);
  });
  it('custos configuráveis com padrão', () => {
    expect(voiceCloneCosts({})).toEqual({ create: 0, speak: 1, sing: 3 });
    expect(voiceCloneCosts({ VERTAL_OWN_VOICE_SING_CREDITS: '5', VERTAL_OWN_VOICE_TTS_CREDITS: 'x' })).toEqual({ create: 0, speak: 1, sing: 5 });
  });
});

describe('consentimento e caminhos', () => {
  it('exige aceite, titularidade e versão vigente', () => {
    expect(consentValid({ accepted: true, owner_confirmed: true, version: VOICE_CONSENT_VERSION })).toBe(true);
    expect(consentValid({ accepted: true, owner_confirmed: false, version: VOICE_CONSENT_VERSION })).toBe(false);
    expect(consentValid({ accepted: true, owner_confirmed: true, version: 'v0' })).toBe(false);
    expect(consentValid(null)).toBe(false);
  });
  it('amostra só na pasta voices do próprio usuário', () => {
    expect(ownVoiceSamplePath(OTHER, `${OTHER}/voices/a.webm`)).toBe(`${OTHER}/voices/a.webm`);
    expect(ownVoiceSamplePath(OTHER, `${LAERCIO}/voices/a.webm`)).toBeNull();
    expect(ownVoiceSamplePath(OTHER, `${OTHER}/voices/../x.webm`)).toBeNull();
  });
  it('música de origem: só arquivo do próprio usuário no Supabase', () => {
    const signed = `${SUPA}/storage/v1/object/sign/uploads/${OTHER}/music/abc-A.mp3?token=x`;
    expect(ownUploadPathFromUrl(OTHER, signed, SUPA)).toBe(`${OTHER}/music/abc-A.mp3`);
    expect(ownUploadPathFromUrl(LAERCIO, signed, SUPA)).toBeNull();
    expect(ownUploadPathFromUrl(OTHER, 'https://evil.example/storage/v1/object/sign/uploads/x.mp3', SUPA)).toBeNull();
    expect(ownUploadPathFromUrl(OTHER, `${OTHER}/music/a.txt`, SUPA)).toBeNull();
  });
});

describe('Vertal Chat', () => {
  it('entende pedidos de clonar/cantar com a minha voz (pt/en/es)', () => {
    expect(wantsVoiceClone(['a minha voz Clone a minha voz'])).toBe(true);
    expect(wantsVoiceClone(['faz uma versão da música com a minha voz'])).toBe(true);
    expect(wantsVoiceClone(['sing it with my voice'])).toBe(true);
    expect(wantsVoiceClone(['canta con mi voz'])).toBe(true);
    expect(wantsVoiceClone(['cria uma música sobre o mar'])).toBe(false);
  });
  it('lê a ação voice_clone', () => {
    expect(parseAgentAction({ tool: 'voice_clone', op: 'setup' })).toEqual({ tool: 'voice_clone', op: 'setup' });
    expect(parseAgentAction({ tool: 'voice_clone', op: 'sing', source_artifact: 'a1' })).toEqual({ tool: 'voice_clone', op: 'sing', source_artifact: 'a1' });
    expect(parseAgentAction({ tool: 'voice_clone', op: 'speak', text: 'oi, tudo bem?' })).toMatchObject({ op: 'speak', text: 'oi, tudo bem?' });
    expect(parseVoiceCloneAction({ op: 'speak', text: '' })).toBeNull();
    expect(parseVoiceCloneAction({ op: 'hack' })).toBeNull();
  });
  it('a ferramenta só entra no prompt com a flag (prompt dos outros não muda)', () => {
    const base = { secretNames: [] };
    const off = buildAgentSystemPrompt(base);
    const on = buildAgentSystemPrompt({ ...base, voiceClone: { create: 0, speak: 1, sing: 3 } });
    expect(off).not.toContain('voice_clone');
    expect(on).toContain('"tool":"voice_clone"');
    expect(on).toContain(voiceCloneToolPrompt({ create: 0, speak: 1, sing: 3 }).slice(0, 40));
  });
  it('todo painel que o agente pode abrir existe (antes "voice" derrubava o chat)', () => {
    for (const key of [...PANELS, 'voice_clone' as const]) expect(PANEL_BY_KEY[key], key).toBeDefined();
    expect(PANEL_LIST.some((p) => p.key === 'voice' || p.key === 'voice_clone')).toBe(false);
  });
  it('mensagens nos 3 idiomas', () => {
    expect(voiceMessage('no_voice', 'pt')).toMatch(/Clonador de voz/);
    expect(voiceMessage('no_voice', 'en')).toMatch(/voice cloner/);
    expect(voiceMessage('no_voice', 'es')).toMatch(/clonador/);
  });
});
