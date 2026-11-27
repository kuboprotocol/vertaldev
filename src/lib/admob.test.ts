import { afterEach, describe, expect, it } from 'vitest'
import {
  ADMOB_PRODUCTION_IDS,
  ADMOB_TEST_IDS,
  admobConfig,
  isNativeAdsPlatform,
  nativeBannerConfigured,
  nativeRewardedConfigured,
  readAdMobConfig,
  shouldShowNativeBanner,
} from '@/lib/admob'
import { ADMOB_PUBLISHER_ID } from '@/config/admob'

const PROD = { PROD: true, MODE: 'production' }
const DEV = { PROD: false, MODE: 'development' }

describe('readAdMobConfig (IDs do AdMob no app nativo)', () => {
  it('desenvolvimento usa sempre os blocos oficiais de TESTE do Google', () => {
    for (const p of ['android', 'ios'] as const) {
      const c = readAdMobConfig(p, { ...DEV, [`VITE_ADMOB_${p.toUpperCase()}_BANNER_ID`]: 'ca-app-pub-6320473908706491/1111111111' })
      expect(c.testing).toBe(true)
      expect(c.bannerUnit).toBe(ADMOB_TEST_IDS[p].banner)
      expect(c.rewardedUnit).toBe(ADMOB_TEST_IDS[p].rewarded)
    }
  })

  it('build de debug (VITE_ADMOB_TESTING=true) usa teste mesmo em modo production', () => {
    const c = readAdMobConfig('android', { ...PROD, VITE_ADMOB_TESTING: 'true' })
    expect(c.testing).toBe(true)
    expect(c.bannerUnit).toBe(ADMOB_TEST_IDS.android.banner)
  })

  it('produção usa os IDs reais do Vertal Dev (nunca bloco de teste para usuário real)', () => {
    expect(ADMOB_PRODUCTION_IDS.android.banner).toBe('ca-app-pub-6320473908706491/2119909527')
    expect(ADMOB_PRODUCTION_IDS.ios.banner).toBe('ca-app-pub-6320473908706491/3451117154')
    const c = readAdMobConfig('android', PROD)
    expect(c.testing).toBe(false)
    expect(c.bannerUnit).toBe('ca-app-pub-6320473908706491/2119909527')
    expect(c.rewardedUnit).toBe('ca-app-pub-6320473908706491/2573149758')
    const t = readAdMobConfig('ios', { ...PROD, VITE_ADMOB_IOS_BANNER_ID: ADMOB_TEST_IDS.ios.banner })
    expect(t.bannerUnit).toBeNull()
  })

  it('produção com ID real vindo da variável de build', () => {
    const c = readAdMobConfig('ios', {
      ...PROD,
      VITE_ADMOB_IOS_BANNER_ID: ' ca-app-pub-6320473908706491/2222222222 ',
      VITE_ADMOB_IOS_REWARDED_ID: 'ca-app-pub-6320473908706491/3333333333',
    })
    expect(c.bannerUnit).toBe('ca-app-pub-6320473908706491/2222222222')
    expect(c.rewardedUnit).toBe('ca-app-pub-6320473908706491/3333333333')
  })

  it('flags desligam formatos', () => {
    const c = readAdMobConfig('android', { ...DEV, VITE_ADMOB_BANNER_ENABLED: 'false', VITE_ADMOB_REWARDED_ENABLED: '0', VITE_ADMOB_ENABLED: 'false' })
    expect(c.enabled).toBe(false)
    expect(c.bannerUnit).toBeNull()
    expect(c.rewardedUnit).toBeNull()
  })

  it('publisher é o do Laércio e os IDs de teste são os oficiais do Google', () => {
    expect(ADMOB_PUBLISHER_ID).toBe('pub-6320473908706491')
    expect(ADMOB_TEST_IDS.android.appId).toBe('ca-app-pub-3940256099942544~3347511713')
    expect(ADMOB_TEST_IDS.ios.appId).toBe('ca-app-pub-3940256099942544~1458002511')
    expect(ADMOB_TEST_IDS.android.banner).toBe('ca-app-pub-3940256099942544/9214589741')
    expect(ADMOB_TEST_IDS.ios.banner).toBe('ca-app-pub-3940256099942544/2435281174')
    expect(ADMOB_TEST_IDS.android.rewarded).toBe('ca-app-pub-3940256099942544/5224354917')
    expect(ADMOB_TEST_IDS.ios.rewarded).toBe('ca-app-pub-3940256099942544/1712485313')
  })
})

describe('banner só com lugar de anúncio na tela e sem o vídeo premiado', () => {
  it('regra', () => {
    expect(shouldShowNativeBanner(0, 0)).toBe(false)
    expect(shouldShowNativeBanner(1, 0)).toBe(true)
    expect(shouldShowNativeBanner(2, 1)).toBe(false)
  })
})

describe('plataforma', () => {
  const g = globalThis as unknown as { Capacitor?: unknown }
  afterEach(() => {
    delete g.Capacitor
  })

  it('no site não há AdMob', () => {
    expect(isNativeAdsPlatform()).toBe(false)
    expect(admobConfig()).toBeNull()
    expect(nativeBannerConfigured()).toBe(false)
    expect(nativeRewardedConfigured()).toBe(false)
  })

  it('no app (vitest = modo de teste) usa blocos de teste', () => {
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
    expect(isNativeAdsPlatform()).toBe(true)
    expect(admobConfig()?.bannerUnit).toBe(ADMOB_TEST_IDS.android.banner)
    expect(nativeBannerConfigured()).toBe(true)
  })
})
