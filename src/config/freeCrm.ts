/**
 * Vertal CRM grátis · landing pública e documentação em vários idiomas
 * (geradas no build em HTML estático por `vite-plugins/freeCrm.ts`).
 *
 *   /crm-gratis                      → landing pt-BR (raiz)
 *   /<código>/<slug do idioma>       → landing traduzida (ex.: /en/free-crm, /de/kostenloses-crm)
 *   /docs/vertal-crm                 → documentação pt-BR
 *   /<código>/docs/vertal-crm        → documentação traduzida
 *
 * Regras de conteúdo (white-hat): só prometer o que o produto faz; preços só
 * daqui e de `src/lib/planConfig.ts`; sem avaliações/notas inventadas; sem
 * listas de palavras-chave. Para um idioma novo: criar o arquivo em
 * `src/config/freeCrm/` com o mesmo formato e incluir em FREE_CRM_LOCALES.
 *
 * Interruptor do build: VERTAL_FREE_CRM_SEO=false tira as páginas e as
 * entradas do sitemap (o resto do SEO fica idêntico).
 */
import { PLAN_CONFIG } from '../lib/planConfig'
import type { FreeCrmCopy } from './freeCrm/types'
import { ptBR } from './freeCrm/pt-BR'
import { ptPT } from './freeCrm/pt-PT'
import { en } from './freeCrm/en'
import { es } from './freeCrm/es'
import { fr } from './freeCrm/fr'
import { de } from './freeCrm/de'
import { it } from './freeCrm/it'
import { nl } from './freeCrm/nl'
import { pl } from './freeCrm/pl'
import { tr } from './freeCrm/tr'
import { ru } from './freeCrm/ru'
import { uk } from './freeCrm/uk'
import { ar } from './freeCrm/ar'
import { hi } from './freeCrm/hi'
import { id } from './freeCrm/id'
import { vi } from './freeCrm/vi'
import { th } from './freeCrm/th'
import { ja } from './freeCrm/ja'
import { ko } from './freeCrm/ko'
import { zhCN } from './freeCrm/zh-CN'
import { zhTW } from './freeCrm/zh-TW'

export type { FreeCrmCopy } from './freeCrm/types'

/** Liga/desliga as páginas no build (padrão: ligado). */
export function isFreeCrmSeoEnabled(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): boolean {
  const v = (env.VERTAL_FREE_CRM_SEO ?? '').trim().toLowerCase()
  return v !== 'false' && v !== '0' && v !== 'off'
}

/** pt-BR primeiro (raiz do site). A ordem é a do seletor de idiomas. */
export const FREE_CRM_LOCALES: FreeCrmCopy[] = [
  ptBR, en, es, ptPT, fr, de, it, nl, pl, tr, ru, uk, ar, hi, id, vi, th, ja, ko, zhCN, zhTW,
]

/** Idioma do x-default (página global): inglês. */
export const FREE_CRM_X_DEFAULT = 'en'

/** Slug fixo da documentação (nome do produto, igual em todos os idiomas). */
export const FREE_CRM_DOCS_SLUG = 'vertal-crm'

/** Nome do site como as pessoas pesquisam. */
export const FREE_CRM_SITE = 'Vertal Dev'

/** Créditos descontados (mesmos números do servidor). */
export { FREE_CRM_COSTS } from './freeCrmCosts'

/** Planos pagos à venda (mesma lista da página /pricing). */
export const FREE_CRM_PAID_PLANS = ['starter', 'pro', 'premium_1'] as const

export function paidPlans(): { id: string; name: string; priceUsd: number }[] {
  return FREE_CRM_PAID_PLANS.map((p) => ({ id: p, name: PLAN_CONFIG[p].displayName, priceUsd: PLAN_CONFIG[p].priceUsd }))
}

/** Menor preço mensal de um plano pago, formatado no idioma. */
export function cheapestPlanPrice(lang: string): string {
  const min = Math.min(...paidPlans().map((p) => p.priceUsd))
  return formatUsd(min, lang)
}

export function formatUsd(value: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)
  } catch {
    return `US$ ${value.toFixed(2)}`
  }
}

/** Caminho da landing de um idioma. */
export function freeCrmPath(c: Pick<FreeCrmCopy, 'code' | 'slug'>): string {
  return c.code === 'pt-BR' ? `/${c.slug}` : `/${c.code}/${c.slug}`
}

/** Caminho da documentação de um idioma. */
export function freeCrmDocsPath(c: Pick<FreeCrmCopy, 'code'>): string {
  return c.code === 'pt-BR' ? `/docs/${FREE_CRM_DOCS_SLUG}` : `/${c.code}/docs/${FREE_CRM_DOCS_SLUG}`
}

/** CTA: cadastro/entrada e volta para o CRM. */
export const FREE_CRM_SIGNUP_PATH = '/auth?redirect=%2Fcrm'
