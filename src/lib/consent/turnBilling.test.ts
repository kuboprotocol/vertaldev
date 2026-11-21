import { describe, expect, it, vi } from 'vitest';
import {
  chargeKeyFor, gateThenCharge, newTurnId, once, parseTurnId, turnChargeKey, type ChargeResult,
} from '../../../supabase/functions/_shared/turnBilling';

/** Razão de créditos falsa com a mesma semântica do RPC execute_atomic_credit_deduction: chave repetida = replay, sem debitar. */
function fakeLedger(start = 10) {
  let balance = start;
  const keys = new Set<string>();
  const debits: string[] = [];
  const deduct = async (amount: number, key: string): Promise<ChargeResult> => {
    if (keys.has(key)) return { ok: false, cost: amount, status: 409, error: 'duplicate_request' };
    keys.add(key);
    balance -= amount;
    debits.push(key);
    return { ok: true, cost: amount };
  };
  return { deduct, get balance() { return balance; }, debits };
}

/** Uma 1ª rodada do agent_chat como o creative-router faz: gate → cobrança adiada com a chave do turno. */
async function firstRound(ledger: ReturnType<typeof fakeLedger>, o: { userId: string; turnId: string | null; needsTerms: boolean }) {
  const charge = once(() => ledger.deduct(1, chargeKeyFor(o.userId, o.turnId) ?? `random-${Math.random()}`));
  return gateThenCharge({ gate: async () => ({ held: o.needsTerms }), charge });
}

describe('cobrança idempotente por turno (consent gate)', () => {
  it('turno segurado pelo gate não cobra; repetir depois de assinar cobra UMA vez', async () => {
    const ledger = fakeLedger(10);
    const turnId = newTurnId();
    const first = await firstRound(ledger, { userId: 'u1', turnId, needsTerms: true });
    expect(first).toEqual({ held: true, charged: 0 });
    expect(ledger.balance).toBe(10);

    // Usuário assinou o termo; o cliente repete a mesma rodada com o MESMO turnId.
    const retry = await firstRound(ledger, { userId: 'u1', turnId, needsTerms: false });
    expect(retry).toMatchObject({ held: false, charge: { ok: true, cost: 1 } });
    expect(ledger.balance).toBe(9);

    // Reenvio duplicado da mesma rodada (clique duplo, rede): a chave do turno impede o 2º débito.
    const dup = await firstRound(ledger, { userId: 'u1', turnId, needsTerms: false });
    expect(dup).toMatchObject({ held: false, charge: { ok: false, status: 409, error: 'duplicate_request' } });
    expect(ledger.balance).toBe(9);
    expect(ledger.debits).toEqual([turnChargeKey('u1', turnId)]);
  });

  it('turnos diferentes cobram normalmente (comportamento de antes)', async () => {
    const ledger = fakeLedger(10);
    await firstRound(ledger, { userId: 'u1', turnId: newTurnId(), needsTerms: false });
    await firstRound(ledger, { userId: 'u1', turnId: newTurnId(), needsTerms: false });
    expect(ledger.balance).toBe(8);
  });

  it('a chave é por usuário: o mesmo turnId de outra pessoa não colide', () => {
    expect(turnChargeKey('u1', 'abcdefgh')).not.toBe(turnChargeKey('u2', 'abcdefgh'));
  });

  it('gate com erro: o pedido segue e é cobrado (como antes)', async () => {
    const charge = vi.fn(async (): Promise<ChargeResult> => ({ ok: true, cost: 1 }));
    const out = await gateThenCharge({ gate: async () => { throw new Error('falhou'); }, charge });
    expect(out).toMatchObject({ held: false, charge: { ok: true } });
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('once: chamar a cobrança duas vezes na mesma requisição debita uma vez', async () => {
    const fn = vi.fn(async () => 1);
    const c = once(fn);
    await Promise.all([c(), c()]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('parseTurnId aceita só o formato seguro; sem turnId vale a chave antiga', () => {
    expect(parseTurnId(newTurnId())).not.toBeNull();
    expect(parseTurnId('curto')).toBeNull();
    expect(parseTurnId('a'.repeat(65))).toBeNull();
    expect(parseTurnId('abc def ghi')).toBeNull();
    expect(parseTurnId(42)).toBeNull();
    expect(chargeKeyFor('u1', null, 'hdr-key')).toBe('hdr-key');
    expect(chargeKeyFor('u1', null, '')).toBeUndefined();
    expect(chargeKeyFor('u1', 'abcdefgh', 'hdr-key')).toBe(turnChargeKey('u1', 'abcdefgh'));
  });
});
