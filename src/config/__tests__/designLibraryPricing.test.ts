import { describe, it, expect } from 'vitest';
import { designStorageCreditsPerDay } from '../designLibraryPricing';

describe('designStorageCreditsPerDay', () => {
  it('não cobra sem designs guardados', () => {
    expect(designStorageCreditsPerDay(0)).toBe(0);
  });

  it('cobra 1 crédito por dia até 10 designs', () => {
    expect(designStorageCreditsPerDay(1)).toBe(1);
    expect(designStorageCreditsPerDay(10)).toBe(1);
  });

  it('sobe para 2 créditos acima de 10 e segue nas faixas de 10', () => {
    expect(designStorageCreditsPerDay(11)).toBe(2);
    expect(designStorageCreditsPerDay(100)).toBe(2);
    expect(designStorageCreditsPerDay(101)).toBe(3);
    expect(designStorageCreditsPerDay(1000)).toBe(3);
    expect(designStorageCreditsPerDay(1001)).toBe(4);
    expect(designStorageCreditsPerDay(10000)).toBe(4);
    expect(designStorageCreditsPerDay(10001)).toBe(5);
  });
});
