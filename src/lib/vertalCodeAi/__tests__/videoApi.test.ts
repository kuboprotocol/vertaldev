import { describe, expect, it } from 'vitest';
import {
  cappedCostUsd, loadVideoApiConfig, matchVideoRoute, planVideo, priceCapUsd, signVideoJob, verifyVideoJob, videoApiEnabledFor,
  videoCostUsd, videoEnvFrom,
} from '../../../../supabase/functions/_shared/vertalCodeAi/videoApi';
import { DEFAULT_BILLING, priceRequest } from '../../../../supabase/functions/_shared/vertalCodeAi/billing';

const KEY = '0b7a4c1e-1111-4222-8333-944455556666';
const OTHER = '00000000-0000-0000-0000-000000000001';

describe('API de vídeo (marca branca)', () => {
  it('desligada por padrão; liga por chave (features.video) ou pela lista; interruptor geral desliga', () => {
    expect(videoApiEnabledFor({}, { id: KEY })).toBe(false);
    expect(videoApiEnabledFor({}, { id: KEY, features: {} })).toBe(false);
    expect(videoApiEnabledFor({}, { id: KEY, features: { video: 'yes' } })).toBe(false);
    expect(videoApiEnabledFor({}, { id: KEY, features: { video: true } })).toBe(true);
    expect(videoApiEnabledFor({ VERTAL_VIDEO_API_ENABLED: 'true' }, { id: KEY })).toBe(false); // lista vazia = nenhuma
    expect(videoApiEnabledFor({ VERTAL_VIDEO_API_ENABLED: 'true', VERTAL_VIDEO_API_KEY_IDS: KEY }, { id: KEY })).toBe(true);
    expect(videoApiEnabledFor({ VERTAL_VIDEO_API_ENABLED: 'true', VERTAL_VIDEO_API_KEY_IDS: OTHER }, { id: KEY })).toBe(false);
    expect(videoApiEnabledFor({ VERTAL_VIDEO_API_ENABLED: 'false' }, { id: KEY, features: { video: true } })).toBe(false);
  });

  it('rotas', () => {
    expect(matchVideoRoute('POST', '/functions/v1/vertal-ai-api/v1/videos/generations')).toEqual({ r: 'create' });
    expect(matchVideoRoute('GET', '/functions/v1/vertal-ai-api/v1/videos/generations')).toBeNull();
    expect(matchVideoRoute('GET', '/vertal-ai-api/v1/videos/vid_abcdefghijk.sig')).toEqual({ r: 'job', id: 'vid_abcdefghijk.sig' });
    expect(matchVideoRoute('GET', '/vertal-ai-api/v1/voices')).toBe('not_video');
    expect(matchVideoRoute('POST', '/vertal-ai-api/v1/chat/completions')).toBe('not_video');
  });

  it('trava: duração máxima de 5 min e preço ≤ US$ 0,30/min (mínimo 1 min de teto)', () => {
    const cfg = loadVideoApiConfig({});
    expect(planVideo(cfg, 'ai', 301)).toMatchObject({ ok: false, code: 'video_too_long' });
    expect(planVideo(cfg, 'ai', 0)).toMatchObject({ ok: false, code: 'invalid_duration' });
    expect(planVideo(cfg, 'ai', 2.5)).toMatchObject({ ok: false, code: 'invalid_duration' });
    expect(priceCapUsd(cfg, 10)).toBeCloseTo(0.3, 6);
    expect(priceCapUsd(cfg, 300)).toBeCloseTo(1.5, 6);
    for (const s of [10, 30, 60, 120, 300]) {
      const r = planVideo(cfg, 'ai', s);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.plan.clips).toBeGreaterThanOrEqual(1);
      expect(r.plan.clips).toBeLessThanOrEqual(Math.ceil(s / 5));
      // estimativa e orçamento cabem no teto, já com o markup de atacado
      expect(r.plan.estimatedCostUsd * cfg.wholesaleMarkup).toBeLessThanOrEqual(r.plan.priceCapUsd + 1e-9);
      const worstCost = r.plan.budgetGpuS * (cfg.gpuUsdPerHour / 3600 + cfg.cpuUsdPerSecond) + (30 + s * 0.5) * cfg.cpuUsdPerSecond;
      expect(worstCost * cfg.wholesaleMarkup).toBeLessThanOrEqual(r.plan.priceCapUsd + 1e-6);
    }
    const ten = planVideo(cfg, 'ai', 10);
    expect(ten.ok && ten.plan.clips).toBe(2);
    const five = planVideo(cfg, 'ai', 300);
    expect(five.ok && five.plan.clips).toBe(16);
  });

  it('trava fecha quando nem uma cena cabe no teto', () => {
    const cfg = loadVideoApiConfig({ VERTAL_VIDEO_API_MAX_USD_PER_MIN: '0.02' });
    expect(planVideo(cfg, 'ai', 30)).toMatchObject({ ok: false, status: 503, code: 'video_cost_guard' });
    expect(planVideo(cfg, 'cover', 30).ok).toBe(true);
  });

  it('custo real medido, cortado no teto, e preço de atacado ×1,20', () => {
    const cfg = loadVideoApiConfig({});
    const c = videoCostUsd(cfg, 200, 260);
    expect(c).toBeCloseTo(200 * (1.95 / 3600) + 260 * 0.000016, 6);
    expect(cappedCostUsd(cfg, { priceCapUsd: 0.3 }, 5)).toBeCloseTo(0.25, 6);
    const p = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'video', costUsd: c });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.priceUsd).toBeGreaterThan(c);
  });

  it('id do job assinado e amarrado à chave', async () => {
    const claims = { p: 'fc-01ABCDEF', k: KEY, m: 'ai' as const, s: 10, c: 0.3, t: 1764000000 };
    const id = await signVideoJob('segredo', claims);
    expect(id.startsWith('vid_')).toBe(true);
    expect(await verifyVideoJob('segredo', id, KEY)).toEqual(claims);
    expect(await verifyVideoJob('segredo', id, OTHER)).toBeNull();
    expect(await verifyVideoJob('outro', id, KEY)).toBeNull();
    expect(await verifyVideoJob('segredo', id.slice(0, -2) + 'xx', KEY)).toBeNull();
  });

  it('lê só as chaves de vídeo do VERTAL_GPU_CONFIG; segredo avulso vence', () => {
    const env = videoEnvFrom({
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OWN_VIDEO_URL: 'https://x', VERTAL_VIDEO_API_MAX_CLIPS: 10, VERTAL_OWN_VOICE_URL: 'https://v' }),
      VERTAL_VIDEO_API_MAX_CLIPS: '8',
    });
    expect(env.VERTAL_OWN_VIDEO_URL).toBe('https://x');
    expect(env.VERTAL_VIDEO_API_MAX_CLIPS).toBe('8');
    expect(env.VERTAL_OWN_VOICE_URL).toBeUndefined();
  });
});
