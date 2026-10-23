// Estúdio de Design (Painel Criativo): níveis e custo em créditos.
//
// Mix esperado: ~80% das criações no nível Simples (1 crédito) e ~20% no Premium (2 créditos).
// O mix é uma meta de negócio, não algo que o código impõe: cada criação cobra o preço do nível escolhido.
//
// O servidor é quem cobra (supabase/functions/creative-design/index.ts). Estes valores só
// mostram o preço antes do clique. Ao mudar um número aqui, mude também na função:
// src/config/__tests__/designPricing.test.ts confere que as duas tabelas batem.

export const DESIGN_TIERS = ['simple', 'premium'] as const;
export type DesignTier = (typeof DESIGN_TIERS)[number];

export const DESIGN_FORMATS = ['post', 'story', 'banner', 'poster'] as const;
export type DesignFormat = (typeof DESIGN_FORMATS)[number];

export const DESIGN_PROMPT_MAX_LENGTH = 1000;

export const DESIGN_TIERS_INFO: Record<
  DesignTier,
  { label: string; description: string; credits: number; variants: number }
> = {
  simple: {
    label: 'Simples',
    description: 'Uma arte rápida, com layout limpo e uma ideia central.',
    credits: 1,
    variants: 1,
  },
  premium: {
    label: 'Premium',
    description: 'Duas variações com direção de arte de agência e acabamento editorial.',
    credits: 2,
    variants: 2,
  },
};

export const DESIGN_FORMATS_INFO: Record<DesignFormat, { label: string; hint: string }> = {
  post: { label: 'Post', hint: '1:1' },
  story: { label: 'Story', hint: '9:16' },
  banner: { label: 'Banner', hint: '16:9' },
  poster: { label: 'Cartaz', hint: '4:5' },
};

export function getDesignCost(tier: DesignTier): number {
  return DESIGN_TIERS_INFO[tier].credits;
}

export function canAffordDesign(tier: DesignTier, creditsAvailable: number): boolean {
  return creditsAvailable >= getDesignCost(tier);
}

export function formatDesignCredits(credits: number): string {
  return `${credits} crédito${credits !== 1 ? 's' : ''}`;
}
