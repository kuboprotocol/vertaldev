// Vertal Ebook Engine — preço em créditos e modelo de IA.
// Fonte única: a edge function `creative-ebook` cobra com isto e o painel
// (src/config/ebookPricing.ts) exibe os mesmos números.
//
// Economia (out/2026):
//   • 1 crédito ≈ US$ 0,07–0,10 (pacotes de 50 a 350 créditos).
//   • Custo de IA de um e-book de 8 capítulos (~12 mil palavras) com
//     Kimi K2.6 no OpenRouter (~US$ 0,60 / 2,50 por 1M tokens in/out) + capa
//     ≈ US$ 0,10. Plano Essencial (48 créditos) ≈ US$ 3,40–4,80 → margem > 95%.
//   • Concorrentes cobram assinatura: Squibler US$ 29,99/mês, Designrr
//     US$ 29/mês, Sudowrite US$ 10–44/mês. Um e-book avulso a ~US$ 4 fica
//     bem abaixo disso para o cliente.

export const EBOOK_LAUNCH_DISCOUNT_PERCENT = 20;

export interface EbookTier {
  id: "essencial" | "profissional" | "premium";
  label: string;
  maxChapters: number;
  /** Preço cheio em créditos. */
  listCredits: number;
}

export const EBOOK_MIN_CHAPTERS = 3;
export const EBOOK_MAX_CHAPTERS = 15;
export const EBOOK_DEFAULT_CHAPTERS = 8;

export const EBOOK_TIERS: EbookTier[] = [
  { id: "essencial", label: "Essencial", maxChapters: 8, listCredits: 60 },
  { id: "profissional", label: "Profissional", maxChapters: 12, listCredits: 90 },
  { id: "premium", label: "Premium", maxChapters: EBOOK_MAX_CHAPTERS, listCredits: 120 },
];

/** Recursos avulsos do editor (roadmap). Exportar é sempre grátis. */
export const EBOOK_ADDON_CREDITS = {
  newChapter: 5,
  rewriteChapter: 5,
  cover: 10,
  illustrations: 10,
  fullReview: 15,
  translation: 20,
  export: 0,
} as const;

/** Modelos no OpenRouter, em ordem de preferência (sobrescreva com EBOOK_MODEL). */
export const EBOOK_OPENROUTER_MODELS = [
  "moonshotai/kimi-k2.6",
  "deepseek/deepseek-v3.2",
  "google/gemini-3-flash-preview",
];

export function clampChapters(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return EBOOK_DEFAULT_CHAPTERS;
  return Math.min(Math.max(v, EBOOK_MIN_CHAPTERS), EBOOK_MAX_CHAPTERS);
}

export function ebookTier(chapters: number): EbookTier {
  const c = clampChapters(chapters);
  return EBOOK_TIERS.find((t) => c <= t.maxChapters) ?? EBOOK_TIERS[EBOOK_TIERS.length - 1];
}

export function applyDiscount(listCredits: number): number {
  return Math.round(listCredits * (1 - EBOOK_LAUNCH_DISCOUNT_PERCENT / 100));
}

export function ebookCost(chapters: number): { tier: EbookTier; listCredits: number; credits: number } {
  const tier = ebookTier(chapters);
  return { tier, listCredits: tier.listCredits, credits: applyDiscount(tier.listCredits) };
}
