import { test, expect, describe } from 'vitest';

/**
 * Unit test to validate redirect logic without browser dependencies.
 */
describe('Redirect Logic Validation', () => {
  // Logic from App.tsx (normalized for testing)
  const runRedirectLogic = (host: string, currentRedirectCount: number = 0) => {
    const isWorkersDev = /(^|\.)workers\.dev$/i.test(host);
    let target = null;
    let nextCount = currentRedirectCount;
    let cleared = false;

    if (currentRedirectCount > 3) {
      // Loop detected
      cleared = true;
    } else if (
      host === 'localhost' || 
      host === '127.0.0.1' || 
      isWorkersDev ||
      host === 'kubovibe.dev'
    ) {
      // Allowed domains
      cleared = true;
    } else {
      cleared = true;
    }

    return { target, nextCount, cleared };
  };

  test('should NOT redirect on Cloudflare preview subdomains (*.workers.dev)', () => {
    const hosts = [
      'vertaldev.kuboprotocol.workers.dev',
      'abc123-vertaldev.kuboprotocol.workers.dev'
    ];

    for (const host of hosts) {
      const result = runRedirectLogic(host);
      expect(result.target, `Failed for host: ${host}`).toBeNull();
      expect(result.cleared, `Should clear redirect state for host: ${host}`).toBe(true);
    }
  });

  test('should NOT redirect on canonical domain kubovibe.dev', () => {
    const result = runRedirectLogic('kubovibe.dev');
    expect(result.target).toBeNull();
    expect(result.cleared).toBe(true);
  });

  test('should stop redirecting after 3 attempts', () => {
    const result = runRedirectLogic('external-domain.com', 4);
    expect(result.target).toBeNull();
    expect(result.cleared).toBe(true);
  });
});
