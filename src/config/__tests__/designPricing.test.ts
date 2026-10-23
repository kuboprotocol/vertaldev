import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_TIERS,
  DESIGN_TIERS_INFO,
  canAffordDesign,
  formatDesignCredits,
  getDesignCost,
} from '@/config/designPricing';

// Vitest roda na raiz do repositório.
const SERVER_FILE = path.resolve(process.cwd(), 'supabase/functions/creative-design/index.ts');

describe('design pricing', () => {
  it('starts at 1 credit for a simple design and tops out at 10 for premium', () => {
    expect(getDesignCost('simple')).toBe(1);
    expect(getDesignCost('premium')).toBe(10);
    for (const tier of DESIGN_TIERS) {
      expect(getDesignCost(tier)).toBeGreaterThanOrEqual(1);
      expect(getDesignCost(tier)).toBeLessThanOrEqual(10);
    }
  });

  it('charges more for higher tiers', () => {
    const costs = DESIGN_TIERS.map(getDesignCost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('gives more variations to more expensive tiers', () => {
    expect(DESIGN_TIERS_INFO.simple.variants).toBe(1);
    expect(DESIGN_TIERS_INFO.premium.variants).toBe(4);
  });

  it('checks affordability against the tier cost', () => {
    expect(canAffordDesign('premium', 10)).toBe(true);
    expect(canAffordDesign('premium', 9)).toBe(false);
    expect(canAffordDesign('simple', 0)).toBe(false);
  });

  it('pluralizes credit labels', () => {
    expect(formatDesignCredits(1)).toBe('1 crédito');
    expect(formatDesignCredits(10)).toBe('10 créditos');
  });

  it('matches the costs and variant counts the server charges', () => {
    const server = readFileSync(SERVER_FILE, 'utf8');
    for (const tier of DESIGN_TIERS) {
      const pattern = new RegExp(`${tier}: \\{ credits: (\\d+), variants: (\\d+) \\}`);
      const match = server.match(pattern);
      expect(match, `server table is missing ${tier}`).not.toBeNull();
      expect(Number(match![1])).toBe(DESIGN_TIERS_INFO[tier].credits);
      expect(Number(match![2])).toBe(DESIGN_TIERS_INFO[tier].variants);
    }
  });
});
