import { describe, expect, it } from 'vitest';
import { crmAiRequiresPlan, isPaidCrmPlan } from '../../../supabase/functions/_shared/vertalCrm/core';
import { crmBuildFlagOn, isCrmRedirect } from './redirect';

describe('Vertal CRM · regra "IA exige plano pago" e redirect do cadastro', () => {
  it('flag ligada por padrão', () => {
    expect(crmAiRequiresPlan({})).toBe(true);
    expect(crmAiRequiresPlan({ VERTAL_CRM_AI_REQUIRES_PLAN: 'true' })).toBe(true);
    expect(crmAiRequiresPlan({ VERTAL_CRM_AI_REQUIRES_PLAN: 'false' })).toBe(false);
  });
  it('plano pago = assinatura ativa fora de free/beta', () => {
    expect(isPaidCrmPlan({ plan: 'starter', is_active: true })).toBe(true);
    expect(isPaidCrmPlan({ plan: 'enterprise', is_active: true })).toBe(true);
    expect(isPaidCrmPlan({ plan: 'premium_1', is_active: false })).toBe(false);
    expect(isPaidCrmPlan({ plan: 'free', is_active: true })).toBe(false);
    expect(isPaidCrmPlan({ plan: 'beta', is_active: true })).toBe(false);
    expect(isPaidCrmPlan(null)).toBe(false);
  });
  it('redirect para /crm só com a flag do CRM e só para /crm', () => {
    expect(isCrmRedirect('/crm')).toBe(true);
    expect(isCrmRedirect('/crm?aba=deals')).toBe(true);
    expect(isCrmRedirect('/crmx')).toBe(false);
    expect(isCrmRedirect('//evil.com/crm')).toBe(false);
    expect(crmBuildFlagOn({})).toBe(false);
    expect(crmBuildFlagOn({ VITE_VERTAL_CRM: 'true' })).toBe(true);
  });
});
