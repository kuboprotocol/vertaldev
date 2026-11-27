/**
 * Google AdMob no app nativo do Vertal Dev (Capacitor + @capacitor-community/admob 8.4.x).
 *
 * Regras (docs/PLANOS_E_ANUNCIOS.md):
 * - Só roda dentro do app (Capacitor.isNativePlatform()). No site continua o AdSense
 *   (src/lib/adsense.ts); dentro do app o AdSense nunca carrega — nunca os dois.
 * - Banner AdMob só enquanto um dos lugares de anúncio (AdSlot) está na tela, e nunca com o
 *   painel do vídeo premiado na tela (zona de exclusão). Sem intersticial, sem anúncio na
 *   abertura do app, sem pop-up.
 * - Só para Free e Starter (quem chama confere com useAdEligibility).
 * - IDs: build de produção (`vite build`, MODE=production) usa os IDs reais de
 *   VITE_ADMOB_*_ID / src/config/admob.ts; sem ID real, aquele formato fica desligado.
 *   Desenvolvimento (`vite`, `--mode development`) ou VITE_ADMOB_TESTING=true (builds de debug,
 *   `npm run cap:sync:debug`) usam os IDs OFICIAIS DE TESTE do Google + isTesting=true.
 * - Consentimento: formulário UMP do Google (GDPR/EEA, Reino Unido, estados dos EUA) → só pede
 *   anúncio quando `canRequestAds`; depois o pedido ATT no iOS 14+. Sem ATT autorizado (ou com
 *   VITE_ADMOB_NPA=true) os anúncios são não personalizados (npa).
 */
import { ADMOB_PRODUCTION_IDS } from '@/config/admob'

export { ADMOB_PRODUCTION_IDS }

export type AdMobPlatform = 'ios' | 'android'

/** IDs de teste publicados pelo Google (developers.google.com/admob/android/test-ads e /ios/test-ads). */
export const ADMOB_TEST_IDS = {
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    banner: 'ca-app-pub-3940256099942544/9214589741', // banner adaptativo
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    banner: 'ca-app-pub-3940256099942544/2435281174', // banner adaptativo
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
} as const

const TEST_PREFIX = 'ca-app-pub-3940256099942544'

export interface AdMobConfig {
  enabled: boolean
  /** true fora do build de produção ou com VITE_ADMOB_TESTING=true. */
  testing: boolean
  /** null = formato desligado (produção sem ID real ou desligado por flag). */
  bannerUnit: string | null
  rewardedUnit: string | null
  testDeviceIds: string[]
  /** Força a região do formulário UMP em testes: "EEA" | "NOT_EEA" | "US" | "". */
  debugGeography: string
  tagForUnderAgeOfConsent: boolean
  /** Sempre não personalizado. */
  forceNpa: boolean
}

type Env = Record<string, string | boolean | undefined>

function str(env: Env, key: string): string {
  const v = env[key]
  return typeof v === 'string' ? v.trim() : ''
}

function flag(env: Env, key: string, fallback: boolean): boolean {
  const v = str(env, key).toLowerCase()
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return fallback
}

/** Lê a configuração (puro; testável). */
export function readAdMobConfig(platform: AdMobPlatform, env: Env): AdMobConfig {
  const P = platform === 'ios' ? 'IOS' : 'ANDROID'
  const productionBuild = env.PROD === true || str(env, 'MODE') === 'production'
  const live = productionBuild && !flag(env, 'VITE_ADMOB_TESTING', false)
  const test = ADMOB_TEST_IDS[platform]
  const prod = ADMOB_PRODUCTION_IDS[platform]

  const pick = (kind: 'banner' | 'rewarded', envKey: string): string | null => {
    if (!live) return test[kind]
    const id = str(env, envKey) || prod[kind]
    // Produção nunca usa bloco de teste nem ID vazio: sem ID real, sem anúncio.
    if (!id || id.startsWith(TEST_PREFIX)) return null
    return id
  }

  return {
    enabled: flag(env, 'VITE_ADMOB_ENABLED', true),
    testing: !live,
    bannerUnit: flag(env, 'VITE_ADMOB_BANNER_ENABLED', true) ? pick('banner', `VITE_ADMOB_${P}_BANNER_ID`) : null,
    rewardedUnit: flag(env, 'VITE_ADMOB_REWARDED_ENABLED', true) ? pick('rewarded', `VITE_ADMOB_${P}_REWARDED_ID`) : null,
    testDeviceIds: str(env, 'VITE_ADMOB_TEST_DEVICE_IDS').split(',').map((s) => s.trim()).filter(Boolean),
    debugGeography: str(env, 'VITE_ADMOB_DEBUG_GEOGRAPHY').toUpperCase(),
    tagForUnderAgeOfConsent: flag(env, 'VITE_ADMOB_TAG_UNDER_AGE_OF_CONSENT', false),
    forceNpa: flag(env, 'VITE_ADMOB_NPA', false),
  }
}

// ---------------------------------------------------------------------------
// Plataforma (Capacitor global; no site não existe)

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** Dentro do app nativo (Capacitor iOS/Android). */
export function isNativeAdsPlatform(): boolean {
  return capacitor()?.isNativePlatform?.() === true
}

export function nativeAdsPlatform(): AdMobPlatform | null {
  if (!isNativeAdsPlatform()) return null
  const p = capacitor()?.getPlatform?.()
  return p === 'ios' || p === 'android' ? p : null
}

export function admobConfig(): AdMobConfig | null {
  const platform = nativeAdsPlatform()
  if (!platform) return null
  return readAdMobConfig(platform, import.meta.env as unknown as Env)
}

/** O app pode mostrar banner AdMob (nativo + habilitado + bloco configurado). Ignora plano. */
export function nativeBannerConfigured(): boolean {
  const cfg = admobConfig()
  return !!cfg?.enabled && !!cfg.bannerUnit
}

/** O app pode usar o vídeo premiado do AdMob (nativo + habilitado + bloco configurado). */
export function nativeRewardedConfigured(): boolean {
  const cfg = admobConfig()
  return !!cfg?.enabled && !!cfg.rewardedUnit
}

// ---------------------------------------------------------------------------
// Estado do consentimento

export interface NativeAdsState {
  ready: boolean
  canRequestAds: boolean
  personalized: boolean
  privacyOptionsRequired: boolean
  error?: string
}

let state: NativeAdsState = { ready: false, canRequestAds: false, personalized: false, privacyOptionsRequired: false }

export function getNativeAdsState(): NativeAdsState {
  return state
}

// ---------------------------------------------------------------------------
// Plugin (import dinâmico: o pacote só entra no bundle quando usado no app)

type AdMobModule = typeof import('@capacitor-community/admob')
let modPromise: Promise<AdMobModule> | null = null
function plugin(): Promise<AdMobModule> {
  modPromise ??= import('@capacitor-community/admob')
  return modPromise
}

let initPromise: Promise<NativeAdsState> | null = null

/**
 * Inicializa o SDK e resolve o consentimento (UMP + ATT). Idempotente.
 * Chamado só quando um lugar de anúncio aparece para Free/Starter ou no clique do vídeo
 * premiado — nunca na abertura do app.
 */
export function initNativeAds(): Promise<NativeAdsState> {
  const cfg = admobConfig()
  if (!cfg) return Promise.resolve(state)
  if (!cfg.enabled) {
    state = { ...state, ready: true, canRequestAds: false }
    return Promise.resolve(state)
  }
  initPromise ??= (async () => {
    try {
      const { AdMob, AdmobConsentStatus, AdmobConsentDebugGeography } = await plugin()
      await AdMob.initialize({
        initializeForTesting: cfg.testing,
        testingDevices: cfg.testDeviceIds,
        tagForUnderAgeOfConsent: cfg.tagForUnderAgeOfConsent,
      })

      const debugGeography =
        cfg.debugGeography === 'EEA' ? AdmobConsentDebugGeography.EEA
          : cfg.debugGeography === 'NOT_EEA' ? AdmobConsentDebugGeography.NOT_EEA
            : cfg.debugGeography === 'US' ? AdmobConsentDebugGeography.US
              : undefined
      let info = await AdMob.requestConsentInfo({
        debugGeography,
        testDeviceIdentifiers: cfg.testDeviceIds,
        tagForUnderAgeOfConsent: cfg.tagForUnderAgeOfConsent,
      })
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        info = await AdMob.showConsentForm()
      }
      const canRequestAds = info.canRequestAds

      let attAuthorized = true
      if (nativeAdsPlatform() === 'ios' && canRequestAds) {
        let att = await AdMob.trackingAuthorizationStatus()
        if (att.status === 'notDetermined') {
          await AdMob.requestTrackingAuthorization()
          att = await AdMob.trackingAuthorizationStatus()
        }
        attAuthorized = att.status === 'authorized'
      }

      state = {
        ready: true,
        canRequestAds,
        personalized: canRequestAds && attAuthorized && !cfg.forceNpa,
        privacyOptionsRequired: String(info.privacyOptionsRequirementStatus) === 'REQUIRED',
        error: undefined,
      }
    } catch (err) {
      console.warn('[admob] init failed', err)
      state = { ...state, ready: true, canRequestAds: false, error: String((err as Error)?.message ?? err) }
    }
    return state
  })()
  return initPromise
}

/** Abre o formulário "Opções de privacidade" do UMP (quando privacyOptionsRequired). */
export async function showNativePrivacyOptions(): Promise<void> {
  if (!isNativeAdsPlatform()) return
  const { AdMob } = await plugin()
  await AdMob.showPrivacyOptionsForm()
}

// ---------------------------------------------------------------------------
// Banner (fixo embaixo, sobreposto; a altura vira padding do body para não cobrir conteúdo)

let bannerVisible = false
let bannerShown = false
let bannerListenersAttached = false

function setBannerHeight(px: number) {
  if (typeof document === 'undefined') return
  const h = Math.max(0, Math.round(px))
  document.documentElement.style.setProperty('--native-ad-h', `${h}px`)
  document.body.style.paddingBottom = h > 0 ? `${h}px` : ''
}

export async function showNativeBanner(): Promise<boolean> {
  const cfg = admobConfig()
  if (!cfg?.enabled || !cfg.bannerUnit) return false
  const st = await initNativeAds()
  if (!st.canRequestAds) return false
  const { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } = await plugin()
  if (!bannerListenersAttached) {
    bannerListenersAttached = true
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => setBannerHeight(bannerVisible ? size.height : 0))
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => setBannerHeight(0))
  }
  if (bannerShown) {
    if (!bannerVisible) {
      bannerVisible = true
      await AdMob.resumeBanner().catch(() => undefined)
    }
    return true
  }
  try {
    bannerVisible = true
    await AdMob.showBanner({
      adId: cfg.bannerUnit,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: cfg.testing,
      npa: !st.personalized,
    })
    bannerShown = true
    return true
  } catch (err) {
    console.warn('[admob] banner failed', err)
    bannerVisible = false
    setBannerHeight(0)
    return false
  }
}

export async function hideNativeBanner(): Promise<void> {
  if (!isNativeAdsPlatform() || !bannerShown || !bannerVisible) return
  bannerVisible = false
  setBannerHeight(0)
  const { AdMob } = await plugin()
  await AdMob.hideBanner().catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Vídeo premiado (só no clique do usuário; o crédito continua decidido no servidor)

export type NativeRewardedOutcome =
  | { kind: 'granted' }
  | { kind: 'closed_without_reward' }
  | { kind: 'no_fill' }
  | { kind: 'error'; message: string }

export async function showNativeRewarded(opts: { nonce?: string } = {}): Promise<NativeRewardedOutcome> {
  const cfg = admobConfig()
  if (!cfg?.enabled || !cfg.rewardedUnit) return { kind: 'no_fill' }
  const st = await initNativeAds()
  if (!st.canRequestAds) return { kind: 'no_fill' }
  const { AdMob } = await plugin()
  // O banner nunca fica junto do vídeo premiado.
  await hideNativeBanner()
  try {
    await AdMob.prepareRewardVideoAd({
      adId: cfg.rewardedUnit,
      isTesting: cfg.testing,
      npa: !st.personalized,
      ...(opts.nonce ? { ssv: { customData: opts.nonce } } : {}),
    })
  } catch (err) {
    console.warn('[admob] rewarded load failed', err)
    return { kind: 'no_fill' }
  }
  try {
    const reward = await AdMob.showRewardVideoAd()
    return reward ? { kind: 'granted' } : { kind: 'closed_without_reward' }
  } catch (err) {
    if ((err as { code?: string })?.code === 'REWARDED_AD_CANCELLED') return { kind: 'closed_without_reward' }
    console.warn('[admob] rewarded failed', err)
    return { kind: 'error', message: String((err as Error)?.message ?? err) }
  }
}

// ---------------------------------------------------------------------------
// Lugares de anúncio visíveis × zonas de exclusão (painel do vídeo premiado)

const visibleSlots = new Set<string>()
const visibleExclusions = new Set<string>()
let syncTimer: ReturnType<typeof setTimeout> | null = null

/** Banner aparece só com algum lugar de anúncio na tela e nenhuma zona de exclusão (puro). */
export function shouldShowNativeBanner(slots: number, exclusions: number): boolean {
  return slots > 0 && exclusions === 0
}

// Uma operação de banner por vez (mostrar/esconder em sequência, sempre com o estado mais novo).
let syncChain: Promise<void> = Promise.resolve()

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncChain = syncChain
      .then(async () => {
        if (shouldShowNativeBanner(visibleSlots.size, visibleExclusions.size)) await showNativeBanner()
        else await hideNativeBanner()
      })
      .catch(() => undefined)
  }, 250)
}

export function setNativeAdSlotVisible(id: string, visible: boolean): void {
  if (visible) visibleSlots.add(id)
  else visibleSlots.delete(id)
  scheduleSync()
}

export function setNativeAdExclusionVisible(id: string, visible: boolean): void {
  if (visible) visibleExclusions.add(id)
  else visibleExclusions.delete(id)
  scheduleSync()
}

/** Só para testes. */
export function __resetNativeAdsForTests(): void {
  visibleSlots.clear()
  visibleExclusions.clear()
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  syncChain = Promise.resolve()
  state = { ready: false, canRequestAds: false, personalized: false, privacyOptionsRequired: false }
  initPromise = null
  modPromise = null
  bannerVisible = false
  bannerShown = false
  bannerListenersAttached = false
}
