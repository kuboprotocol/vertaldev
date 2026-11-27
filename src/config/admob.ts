/**
 * Google AdMob no app nativo do Vertal Dev (Capacitor, appId dev.kubovibe.app).
 *
 * Publisher do Laércio: pub-6320473908706491. Apps e blocos criados no AdMob em 2026-11-27
 * (apps "Vertal Dev" Android e iOS; ainda "Requer revisão" até vincular às lojas).
 * Variáveis de ambiente continuam podendo sobrescrever:
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
    appId: 'ca-app-pub-6320473908706491~9745062762',
    /** Bloco "Vertal Dev Android - Banner" (Banner). */
    banner: 'ca-app-pub-6320473908706491/2119909527',
    /** Bloco "Vertal Dev Android - Premiado" (Premiado / Rewarded). */
    rewarded: 'ca-app-pub-6320473908706491/2573149758',
  },
  ios: {
    /** ca-app-pub-6320473908706491~XXXXXXXXXX (criar no AdMob: app iOS "Vertal Dev"). */
    appId: 'ca-app-pub-6320473908706491~9996344205',
    /** Bloco "Vertal Dev iOS - Banner" (Banner). */
    banner: 'ca-app-pub-6320473908706491/3451117154',
    /** Bloco "Vertal Dev iOS - Premiado" (Premiado / Rewarded). */
    rewarded: 'ca-app-pub-6320473908706491/8562349745',
  },
} as const
