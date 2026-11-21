import { describe, expect, it } from 'vitest';
import { clampBuilderMode, isBuilderModeLocked, planRank } from './planAccess';

describe('planAccess (modos do Builder)', () => {
  it('enterprise libera todos os modos (bug: "Modo THINK requer plano Pro" no admin enterprise)', () => {
    expect(isBuilderModeLocked('think', 'enterprise')).toBe(false);
    expect(isBuilderModeLocked('ship', 'enterprise')).toBe(false);
    expect(isBuilderModeLocked('think', 'enterprise')).toBe(false);
    expect(isBuilderModeLocked('think', 'Enterprise')).toBe(false);
  });

  it('business_* libera tudo; plano no nível exigido ou acima libera', () => {
    for (const plan of ['business_1', 'business_7', 'business_9']) {
      expect(isBuilderModeLocked('think', plan)).toBe(false);
      expect(isBuilderModeLocked('ship', plan)).toBe(false);
    }
    expect(isBuilderModeLocked('think', 'starter')).toBe(false);
    expect(isBuilderModeLocked('think', 'pro')).toBe(false);
    expect(isBuilderModeLocked('think', 'premium_1')).toBe(false);
    expect(isBuilderModeLocked('ship', 'ultra')).toBe(false);
  });

  it('mantém as travas de quem está abaixo', () => {
    expect(isBuilderModeLocked('flow', 'free')).toBe(false);
    expect(isBuilderModeLocked('think', 'free')).toBe(true);
    expect(isBuilderModeLocked('ship', 'pro')).toBe(true);
    expect(isBuilderModeLocked('think', undefined)).toBe(true);
    expect(isBuilderModeLocked('think', 'plano-desconhecido')).toBe(true);
  });

  it('admin libera tudo, qualquer plano', () => {
    expect(isBuilderModeLocked('ship', 'free', true)).toBe(false);
    expect(isBuilderModeLocked('think', 'free', true)).toBe(false);
  });

  it('clampBuilderMode desce até o modo permitido', () => {
    expect(clampBuilderMode('ship', 'pro')).toBe('think');
    expect(clampBuilderMode('ship', 'free')).toBe('flow');
    expect(clampBuilderMode('ship', 'enterprise')).toBe('ship');
    expect(clampBuilderMode('think', 'free', true)).toBe('think');
    expect(planRank('ENTERPRISE')).toBeGreaterThan(planRank('ultra'));
  });
});
