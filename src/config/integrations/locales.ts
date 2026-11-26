/**
 * Idiomas das páginas de integração. O português do Brasil é o principal (raiz,
 * `/integracoes/<slug>`, x-default); os outros 21 idiomas ficam em
 * `/<código>/<segmento>/<slug>`, com o segmento traduzido ("integrations",
 * "integraciones"…). Arquivo leve: o Worker (`worker/payPerCrawl.ts`) usa só isto.
 */
export interface IntegrationLocale {
  /** Prefixo da URL. */
  code: string
  /** Atributo lang / hreflang (BCP 47). */
  lang: string
  dir?: 'rtl'
  ogLocale: string
  /** Nome do idioma no próprio idioma (seletor). */
  label: string
  /** Segmento traduzido da URL (só ASCII). */
  segment: string
}

export const ROOT_INTEGRATION_LOCALE: IntegrationLocale = {
  code: 'pt-BR', lang: 'pt-BR', ogLocale: 'pt_BR', label: 'Português (Brasil)', segment: 'integracoes',
}

/** Os 21 idiomas nativos mais falados (além do português). */
export const INTEGRATION_LOCALES: IntegrationLocale[] = [
  { code: 'zh-CN', lang: 'zh-CN', ogLocale: 'zh_CN', label: '简体中文', segment: 'integrations' },
  { code: 'es', lang: 'es', ogLocale: 'es_ES', label: 'Español', segment: 'integraciones' },
  { code: 'en', lang: 'en', ogLocale: 'en_US', label: 'English', segment: 'integrations' },
  { code: 'hi', lang: 'hi', ogLocale: 'hi_IN', label: 'हिन्दी', segment: 'integrations' },
  { code: 'bn', lang: 'bn', ogLocale: 'bn_BD', label: 'বাংলা', segment: 'integrations' },
  { code: 'ru', lang: 'ru', ogLocale: 'ru_RU', label: 'Русский', segment: 'integratsii' },
  { code: 'ja', lang: 'ja', ogLocale: 'ja_JP', label: '日本語', segment: 'integrations' },
  { code: 'pa', lang: 'pa', ogLocale: 'pa_IN', label: 'ਪੰਜਾਬੀ', segment: 'integrations' },
  { code: 'vi', lang: 'vi', ogLocale: 'vi_VN', label: 'Tiếng Việt', segment: 'tich-hop' },
  { code: 'tr', lang: 'tr', ogLocale: 'tr_TR', label: 'Türkçe', segment: 'entegrasyonlar' },
  { code: 'mr', lang: 'mr', ogLocale: 'mr_IN', label: 'मराठी', segment: 'integrations' },
  { code: 'te', lang: 'te', ogLocale: 'te_IN', label: 'తెలుగు', segment: 'integrations' },
  { code: 'ko', lang: 'ko', ogLocale: 'ko_KR', label: '한국어', segment: 'integrations' },
  { code: 'fr', lang: 'fr', ogLocale: 'fr_FR', label: 'Français', segment: 'integrations' },
  { code: 'ta', lang: 'ta', ogLocale: 'ta_IN', label: 'தமிழ்', segment: 'integrations' },
  { code: 'ar', lang: 'ar', dir: 'rtl', ogLocale: 'ar_AR', label: 'العربية', segment: 'integrations' },
  { code: 'de', lang: 'de', ogLocale: 'de_DE', label: 'Deutsch', segment: 'integrationen' },
  { code: 'ur', lang: 'ur', dir: 'rtl', ogLocale: 'ur_PK', label: 'اردو', segment: 'integrations' },
  { code: 'jv', lang: 'jv', ogLocale: 'jv_ID', label: 'Basa Jawa', segment: 'integrasi' },
  { code: 'it', lang: 'it', ogLocale: 'it_IT', label: 'Italiano', segment: 'integrazioni' },
  { code: 'fa', lang: 'fa', dir: 'rtl', ogLocale: 'fa_IR', label: 'فارسی', segment: 'integrations' },
]

export const ALL_INTEGRATION_LOCALES: IntegrationLocale[] = [ROOT_INTEGRATION_LOCALE, ...INTEGRATION_LOCALES]

/** Caminho do índice de integrações no idioma ("/integracoes", "/en/integrations"). */
export function integrationsHubPath(l: IntegrationLocale): string {
  return l.code === ROOT_INTEGRATION_LOCALE.code ? `/${l.segment}` : `/${l.code}/${l.segment}`
}

/** Prefixos de todas as versões (Pay Per Crawl: grátis). */
export const INTEGRATION_PATH_PREFIXES: string[] = ALL_INTEGRATION_LOCALES.map(integrationsHubPath)
