/**
 * Créditos do Vertal CRM mostrados ao público (landing, documentação e /docs do app) — os mesmos
 * números que o servidor cobra (`supabase/functions/_shared/vertalCrm/core.ts`). Módulo leve, sem as
 * traduções, para o app poder importar sem carregar os textos de todos os idiomas.
 * A sincronização sem IA vem do secret VERTAL_CRM_PLAIN_SYNC_COST, definido como 2 em produção
 * (decisão do Laércio, 2026-11-25); se mudar lá, mude aqui.
 */
import { CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST } from '../../supabase/functions/_shared/vertalCrm/core'

export const FREE_CRM_COSTS = {
  ai: CRM_AI_COST,
  activate: CRM_SYNC_ACTIVATE_COST,
  aiSync: CRM_SYNC_AI_RUN_COST,
  plainSync: 2,
} as const

export const FREE_CRM_LANDING_PATH = '/crm-gratis'
export const FREE_CRM_DOCS_PATH = '/docs/vertal-crm'
export const FREE_CRM_EN_LANDING_PATH = '/en/free-crm'
export const FREE_CRM_EN_DOCS_PATH = '/en/docs/vertal-crm'
