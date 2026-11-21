// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergePrefill } from './consentRoutes';

const prev = {
  signer: {
    fullName: 'Maria da Silva',
    document: { type: 'cpf' as const, number: '52998224725', country: 'BR' },
    address: { line1: 'Rua A, 1', city: 'São Paulo', country: 'BR' },
  },
};

describe('pré-preenchimento do termo: CPF só do cadastro (Stripe)', () => {
  it('sem CPF no cadastro/Stripe: documento VAZIO (campo editável), mesmo com aceite anterior', () => {
    const p = mergePrefill(prev, null, null);
    expect(p.document).toBeUndefined();
    expect(p).toMatchObject({ fullName: 'Maria da Silva', source: 'previous' });
    expect(mergePrefill(null, { fullName: 'Maria da Silva' }, null).document).toBeUndefined();
    expect(mergePrefill(null, null, 'Maria')).toEqual({ fullName: 'Maria', source: 'profile' });
    expect(mergePrefill(null, null, null)).toEqual({ source: 'none' });
  });

  it('com CPF válido no Stripe: vem preenchido (o cartão trava o campo)', () => {
    const doc = { type: 'cpf' as const, number: '11144477735', country: 'BR' };
    expect(mergePrefill(null, { fullName: 'João Souza', document: doc }, null)).toMatchObject({ document: doc, source: 'stripe' });
    expect(mergePrefill(prev, { document: doc }, null)).toMatchObject({ document: doc, fullName: 'Maria da Silva', source: 'previous' });
  });
});
