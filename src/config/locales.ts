/**
 * Idiomas das páginas de SEO traduzidas (`/<código>/...`). O português do
 * Brasil é o site principal, na raiz. Só os códigos ficam aqui para que o
 * Worker (`worker/payPerCrawl.ts`) reconheça o prefixo sem carregar as
 * traduções; os textos ficam em `src/config/seoLocales.ts`.
 */
export const ROOT_LOCALE = 'pt-BR'

export const LOCALE_CODES = [
  'en', 'es', 'fr', 'de', 'it', 'pt-PT', 'nl', 'pl', 'ru', 'uk', 'be', 'cs', 'sk',
  'ro', 'hu', 'el', 'bg', 'sr', 'hr', 'sv', 'fi', 'da', 'nb', 'lt', 'lv', 'et',
  'ga', 'tr', 'ar', 'he', 'fa', 'ur', 'hi', 'bn', 'ta', 'te', 'mr', 'zh-CN',
  'zh-TW', 'ja', 'ko', 'id', 'ms', 'vi', 'th', 'fil', 'sw', 'am', 'ha', 'yo',
  'zu', 'af',
] as const

export type LocaleCode = (typeof LOCALE_CODES)[number]

const CODE_SET = new Set<string>(LOCALE_CODES)

/** Separa o prefixo de idioma do caminho: "/es/alternativas" → ["es", "/alternativas"]. */
export function splitLocalePath(pathname: string): [LocaleCode | null, string] {
  const m = /^\/([a-zA-Z]{2,3}(?:-[A-Z]{2})?)(\/.*)?$/.exec(pathname)
  if (m && CODE_SET.has(m[1])) return [m[1] as LocaleCode, m[2] || '/']
  return [null, pathname]
}
