// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  fromBase64, hexOf, otsStamp, otsSummary, otsUpgrade, parseNodeBytes, parseOtsFile, serializeNode, serializeOtsFile, type OtsNode,
} from '../../../supabase/functions/_shared/openTimestamps';

const DIGEST = 'a'.repeat(64);
const pending = (uri: string): OtsNode => ({
  attestations: [],
  ops: [{ op: { op: 'append', arg: new Uint8Array([1, 2, 3, 4]) }, child: { attestations: [], ops: [{ op: { op: 'sha256' }, child: { attestations: [{ type: 'pending', uri }], ops: [] } }] } }],
});
const bin = (b: Uint8Array) => new Response(b.slice().buffer as ArrayBuffer, { status: 200 });

describe('OpenTimestamps (.ots)', () => {
  it('serializa e lê de volta (operações e atestações)', () => {
    const node = pending('https://alice.btc.calendar.opentimestamps.org');
    const back = parseNodeBytes(serializeNode(node));
    expect(otsSummary(back)).toEqual({ status: 'pending', bitcoinHeight: null, pendingUris: ['https://alice.btc.calendar.opentimestamps.org'] });
    const file = serializeOtsFile({ digest: new Uint8Array(32).fill(0xaa), root: back });
    const parsed = parseOtsFile(file);
    expect(hexOf(parsed.digest)).toBe(DIGEST);
    expect(() => parseOtsFile(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('carimba nos calendários públicos (resumo cru no POST /digest) e junta as respostas', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(hexOf(new Uint8Array(init!.body as Uint8Array))).toBe(DIGEST);
      if (url.includes('b.pool')) return new Response('down', { status: 503 });
      return bin(serializeNode(pending(url.replace('/digest', ''))));
    });
    const r = await otsStamp(DIGEST, { fetch: fetchMock as unknown as typeof fetch, calendars: ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org'] });
    expect(r.calendars).toEqual(['https://a.pool.opentimestamps.org']);
    const f = parseOtsFile(fromBase64(r.ots));
    expect(otsSummary(f.root).status).toBe('pending');
    await expect(otsStamp(DIGEST, { fetch: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch, calendars: ['https://a.pool.opentimestamps.org'] })).rejects.toThrow(/nenhum calendário/);
    await expect(otsStamp('xyz')).rejects.toThrow();
  });

  it('upgrade troca a pendência pela prova do bloco do Bitcoin (status confirmado)', async () => {
    const uri = 'https://alice.btc.calendar.opentimestamps.org';
    const file = serializeOtsFile({ digest: new Uint8Array(32).fill(0xaa), root: pending(uri) });
    const b64 = btoa(String.fromCharCode(...file));
    // Ainda pendente no calendário (404): nada muda.
    const still = await otsUpgrade(b64, { fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch });
    expect(still).toMatchObject({ changed: false, status: 'pending' });
    const proof: OtsNode = { attestations: [], ops: [{ op: { op: 'sha256' }, child: { attestations: [{ type: 'bitcoin', height: 871_234 }], ops: [] } }] };
    const seen: string[] = [];
    const up = await otsUpgrade(b64, {
      fetch: (async (url: string) => {
        seen.push(url);
        return bin(serializeNode(proof));
      }) as unknown as typeof fetch,
    });
    expect(seen[0]).toMatch(new RegExp(`^${uri}/timestamp/[0-9a-f]{64}$`));
    expect(up).toMatchObject({ changed: true, status: 'confirmed', bitcoinHeight: 871_234 });
    expect(otsSummary(parseOtsFile(fromBase64(up.ots)).root).pendingUris).toEqual([]);
  });

  it('não segue calendário fora da lista conhecida', async () => {
    const file = serializeOtsFile({ digest: new Uint8Array(32).fill(0xaa), root: pending('https://evil.example.com') });
    const spy = vi.fn();
    const r = await otsUpgrade(btoa(String.fromCharCode(...file)), { fetch: spy as unknown as typeof fetch });
    expect(spy).not.toHaveBeenCalled();
    expect(r.status).toBe('pending');
  });
});
