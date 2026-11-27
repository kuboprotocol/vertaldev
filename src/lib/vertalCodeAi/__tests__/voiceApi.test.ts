import { describe, expect, it } from 'vitest';
import {
  checkConsentAttestation, cleanEndUser, gpuUsdPerHour, matchVoiceRoute, safeFetchUrl, voiceApiEnabledFor, voiceJobCostUsd,
} from '../../../../supabase/functions/_shared/vertalCodeAi/voiceApi';
import { DEFAULT_BILLING, priceRequest } from '../../../../supabase/functions/_shared/vertalCodeAi/billing';

const OWNER = '5441b397-7be8-44fc-87e8-8057fdb79a0e';

describe('API de voz (marca branca)', () => {
  it('desligada por padrão; lista opcional de clientes', () => {
    expect(voiceApiEnabledFor({}, OWNER)).toBe(false);
    expect(voiceApiEnabledFor({ VERTAL_OWN_VOICE_API_ENABLED: 'true' }, OWNER)).toBe(true);
    expect(voiceApiEnabledFor({ VERTAL_OWN_VOICE_API_ENABLED: 'true', VERTAL_OWN_VOICE_API_USER_IDS: '00000000-0000-0000-0000-000000000001' }, OWNER)).toBe(false);
  });

  it('consentimento é obrigatório e completo', () => {
    const bad = checkConsentAttestation({ accepted: true });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.missing.length).toBeGreaterThanOrEqual(3);
    const ok = checkConsentAttestation({ version: 'voice-consent-v1', accepted: true, owner_confirmed: true, speaker_name: 'Ana', accepted_at: new Date().toISOString(), end_user_ip: '1.2.3.4' });
    expect(ok.ok).toBe(true);
  });

  it('end_user e URLs seguras (SSRF)', () => {
    expect(cleanEndUser('user_123')).toBe('user_123');
    expect(cleanEndUser('a b')).toBeNull();
    expect(safeFetchUrl('https://cdn.example.com/a.mp3')).not.toBeNull();
    for (const u of ['http://cdn.example.com/a.mp3', 'https://127.0.0.1/a.mp3', 'https://localhost/a', 'https://x.internal/a', 'https://u:p@cdn.example.com/a', 'https://cdn.example.com:8443/a', 'https://[::1]/a']) {
      expect(safeFetchUrl(u)).toBeNull();
    }
  });

  it('rotas', () => {
    expect(matchVoiceRoute('POST', '/vertal-ai-api/v1/voices')).toEqual({ r: 'voices_create' });
    expect(matchVoiceRoute('GET', '/vertal-ai-api/v1/voices/consent')).toEqual({ r: 'consent' });
    expect(matchVoiceRoute('POST', '/vertal-ai-api/v1/audio/sing')).toEqual({ r: 'sing' });
    expect(matchVoiceRoute('GET', '/vertal-ai-api/v1/voice-jobs/5441b397-7be8-44fc-87e8-8057fdb79a0e')).toMatchObject({ r: 'job' });
    expect(matchVoiceRoute('POST', '/vertal-ai-api/v1/chat/completions')).toBe('not_voice');
  });

  it('preço = custo real de GPU (piso) × 1,20, em créditos de US$0,03', () => {
    expect(gpuUsdPerHour({}, 'NVIDIA L4')).toBe(0.8);
    expect(gpuUsdPerHour({}, 'NVIDIA A10G')).toBe(1.1);
    expect(gpuUsdPerHour({}, '')).toBe(1.1);
    // Fala: 20 s de L4 = US$0,004444 → ×1,2 = US$0,005333 → 0,177778 crédito.
    const speak = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'voice', costUsd: voiceJobCostUsd({}, 20, 'NVIDIA L4') });
    expect(speak.ok && speak.credits).toBeCloseTo(0.1778, 3);
    // Criar voz (sem GPU): piso US$0,004 × 1,2 = 0,16 crédito.
    const create = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'voice', costUsd: 0 });
    expect(create.ok && create.credits).toBeCloseTo(0.16, 6);
    // Canto: 3 min de L4 = US$0,04 → ×1,2 = 1,6 crédito; curto cai no piso US$0,03 → 1,2 crédito.
    const sing = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'singing', costUsd: voiceJobCostUsd({}, 180, 'L4') });
    expect(sing.ok && sing.credits).toBeCloseTo(1.6, 3);
    const singMin = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'singing', costUsd: 0 });
    expect(singMin.ok && singMin.credits).toBeCloseTo(1.2, 6);
  });
});
