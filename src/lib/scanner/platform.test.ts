import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from './platform';

describe('bytesToBase64', () => {
  it('matches the standard encoding', () => {
    expect(bytesToBase64(new TextEncoder().encode('Vertal'))).toBe(btoa('Vertal'));
  });

  it('handles payloads larger than one chunk', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    let ref = '';
    for (let i = 0; i < big.length; i += 10_000) ref += btoa(String.fromCharCode(...big.subarray(i, i + 10_000)));
    expect(bytesToBase64(big).length).toBe(Math.ceil(big.length / 3) * 4);
    expect(atob(bytesToBase64(big)).length).toBe(big.length);
  });
});

import { SCANNER_PDF_CREDITS, scannerChargeMessage } from './pricing';

describe('scanner pricing', () => {
  it('charges 4 credits per PDF', () => {
    expect(SCANNER_PDF_CREDITS).toBe(4);
  });

  it('explains charge failures in Portuguese', () => {
    expect(scannerChargeMessage('insufficient_credits')).toMatch(/Créditos insuficientes/);
    expect(scannerChargeMessage('Unauthorized')).toMatch(/Entre na sua conta/);
    expect(scannerChargeMessage(undefined)).toMatch(/Tente de novo/);
  });
});
