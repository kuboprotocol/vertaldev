/**
 * Textos de um idioma da landing "CRM grátis" e da documentação do Vertal CRM.
 *
 * Marcadores trocados no build: {ai}, {activate}, {aiSync}, {plainSync}
 * (créditos de FREE_CRM_COSTS) e {price} (menor plano pago, formatado no idioma).
 * Escreva como um falante nativo escreveria (não tradução literal), usando o
 * termo que as pessoas daquele país digitam na busca ("CRM gratis",
 * "kostenloses CRM", "無料CRM"…) de forma natural no título, H1 e texto.
 */
export interface FreeCrmCopy {
  /** Prefixo da URL ("pt-BR" fica na raiz). Mesmos códigos de `src/config/locales.ts`. */
  code: string
  /** Atributo lang do HTML e hreflang (BCP 47). */
  lang: string
  dir?: 'rtl'
  ogLocale: string
  /** Nome do idioma no próprio idioma. */
  label: string
  /** Segmento da URL da landing, só ASCII minúsculo e hífens (ex.: "free-crm"). */
  slug: string

  // ── landing
  title: string
  description: string
  badge: string
  h1: string
  lead: string
  cta: string
  ctaDocs: string
  ctaPricing: string
  rollout: string
  featuresTitle: string
  /** [título, texto] × 6 */
  features: [string, string][]
  pricingTitle: string
  pricingIntro: string
  colAction: string
  colCredits: string
  rowFree: string
  rowAi: string
  rowActivate: string
  rowAiSync: string
  rowPlainSync: string
  free: string
  pricingPlanNote: string
  dataTitle: string
  dataText: string
  connectTitle: string
  connectText: string
  faqTitle: string
  /** [pergunta, resposta] × 5 */
  faq: [string, string][]

  // ── documentação
  docsTitle: string
  docsDescription: string
  docsH1: string
  docsIntro: string
  docsBreadcrumb: string
  tocTitle: string
  whatTitle: string
  whatText: string
  docsFeaturesTitle: string
  howTitle: string
  howSteps: string[]
  docsPricingTitle: string
  docsPricingNotes: string[]
  connectDocsTitle: string
  connectDocsSteps: string[]
  comingSoon: string
  fluxosTitle: string
  fluxosText: string
  fluxosSteps: string[]
  exportTitle: string
  exportItems: string[]
  privacyTitle: string
  privacyText: string
  docsFaqTitle: string
  docsFaq: [string, string][]
  credit: string
  languages: string
  backToLanding: string
}
