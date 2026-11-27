/**
 * Google AdMob no app nativo do Vertal Dev (Capacitor, appId dev.kubovibe.app).
 *
 * Publisher do Laércio: pub-6320473908706491. AINDA NÃO EXISTE app nem bloco do AdMob para o
 * Vertal Dev — por isso os IDs reais abaixo estão vazios e NÃO devem ser inventados.
 * Depois de criar no AdMob (ver docs/PLANOS_E_ANUNCIOS.md → "App nativo: Google AdMob"):
 *   - App ID   → variável ADMOB_ANDROID_APP_ID / ADMOB_IOS_APP_ID no `npm run cap:admob`
 *                (vai para o AndroidManifest.xml / Info.plist; formato ca-app-pub-…~…)
 *   - Blocos   → variáveis de build VITE_ADMOB_ANDROID_BANNER_ID, VITE_ADMOB_IOS_BANNER_ID,
 *                VITE_ADMOB_ANDROID_REWARDED_ID, VITE_ADMOB_IOS_REWARDED_ID (formato ca-app-pub-…/…),
 *                ou preenchidos aqui.
 *
 * Builds de desenvolvimento/debug usam SEMPRE os IDs oficiais de teste do Google (src/lib/admob.ts).
 * Build de produção sem ID real = sem anúncio nativo (nunca mostra anúncio de teste para usuário real).
 */
export const ADMOB_PUBLISHER_ID = 'pub-6320473908706491'

export const ADMOB_PRODUCTION_IDS = {
  android: {
    /** ca-app-pub-6320473908706491~XXXXXXXXXX (criar no AdMob: app Android "Vertal Dev"). */
    appId: '',
    /** Bloco "Vertal Dev Android - Banner" (Banner). */
    banner: '',
    /** Bloco "Vertal Dev Android - Premiado" (Premiado / Rewarded). */
    rewarded: '',
  },
  ios: {
    /** ca-app-pub-6320473908706491~XXXXXXXXXX (criar no AdMob: app iOS "Vertal Dev"). */
    appId: '',
    /** Bloco "Vertal Dev iOS - Banner" (Banner). */
    banner: '',
    /** Bloco "Vertal Dev iOS - Premiado" (Premiado / Rewarded). */
    rewarded: '',
  },
} as const
