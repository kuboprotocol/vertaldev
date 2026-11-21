// Acesso aos modos do Builder (FLOW / THINK / SHIP) por plano.
// Antes cada modo tinha uma lista fixa de planos ("pro", "ultra", "starter") e
// planos acima dela (business_*, enterprise) ficavam travados. Agora vale a
// ordem dos planos: quem está no plano exigido OU acima dele libera o modo, e
// admin libera tudo.

/** Ordem dos planos (maior = mais completo). Plano desconhecido conta como free. */
export const PLAN_RANK: Record<string, number> = {
  free: 0,
  beta: 0,
  starter: 1,
  pro: 2,
  premium_1: 3,
  premium_2: 3,
  ultra: 4,
  business_1: 5,
  business_2: 5,
  business_3: 5,
  business_4: 5,
  business_5: 5,
  business_6: 5,
  business_7: 5,
  enterprise: 6,
};

export type BuilderMode = 'flow' | 'think' | 'ship';

/** Plano mínimo de cada modo. */
export const MODE_MIN_PLAN: Record<BuilderMode, keyof typeof PLAN_RANK> = {
  flow: 'free',
  think: 'starter',
  ship: 'ultra',
};

export function planRank(plan: string | null | undefined): number {
  const key = String(plan ?? '').trim().toLowerCase();
  if (PLAN_RANK[key] !== undefined) return PLAN_RANK[key];
  // Variações novas de business (business_8…) ficam no nível business.
  if (/^business_\d+$/.test(key)) return PLAN_RANK.business_1;
  return 0;
}

/** true quando o modo está travado para este plano (admin nunca trava). */
export function isBuilderModeLocked(mode: BuilderMode, plan: string | null | undefined, isAdmin = false): boolean {
  if (isAdmin) return false;
  return planRank(plan) < PLAN_RANK[MODE_MIN_PLAN[mode]];
}

/** Modo mais alto que o plano permite, a partir do detectado (desce até caber). */
export function clampBuilderMode(detected: BuilderMode, plan: string | null | undefined, isAdmin = false): BuilderMode {
  const order: BuilderMode[] = ['ship', 'think', 'flow'];
  for (const mode of order.slice(order.indexOf(detected))) {
    if (!isBuilderModeLocked(mode, plan, isAdmin)) return mode;
  }
  return 'flow';
}
