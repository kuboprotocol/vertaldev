import { describe, expect, it } from 'vitest';
import { decryptWithConnectorKey, encryptWithConnectorKey, randomPassword, randomToken } from './navigatorCrypto';
import { filterCookies } from './navigatorRoutes';
import { VNC_PASSWORD_RE } from '../supabase/functions/_shared/navigatorCore';
import { DENY_OUT_CIDRS } from './e2bClient';

// 32 bytes em base64 e em hex (as duas formas valem, como nas edge functions).
const KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const KEY_HEX = '3031323334353637383961626364656630313233343536373839616263646566';

describe('cifra do Navigator (mesma CONNECTOR_ENC_KEY do cofre)', () => {
  it('cifra e decifra; base64 e hex da mesma chave são equivalentes', async () => {
    const enc = await encryptWithConnectorKey(KEY_B64, JSON.stringify([{ name: 'sid', value: 'abc', domain: '.github.com' }]));
    expect(enc.ciphertext).not.toContain('abc');
    expect(JSON.parse(await decryptWithConnectorKey(KEY_HEX, enc))).toEqual([{ name: 'sid', value: 'abc', domain: '.github.com' }]);
  });
  it('sem chave válida, falha em vez de gravar em claro', async () => {
    await expect(encryptWithConnectorKey(undefined, 'x')).rejects.toThrow(/CONNECTOR_ENC_KEY/);
    await expect(encryptWithConnectorKey('curta', 'x')).rejects.toThrow(/CONNECTOR_ENC_KEY/);
  });
  it('senhas da tela ao vivo e token do navd são aleatórios no formato certo', () => {
    const pws = new Set(Array.from({ length: 50 }, () => randomPassword()));
    expect(pws.size).toBe(50);
    for (const p of pws) expect(p).toMatch(VNC_PASSWORD_RE);
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('cookies salvos', () => {
  it('descarta cookies de hosts internos e lixo', () => {
    const out = filterCookies([
      { name: 'sid', value: '1', domain: '.github.com' },
      { name: 'x', value: '1', domain: 'localhost' },
      { name: 'y', value: '1', domain: '10.0.0.2' },
      { value: 'sem nome', domain: 'a.com' },
      null,
    ]);
    expect(out.map((c) => c.name)).toEqual(['sid']);
    expect(filterCookies('nope')).toEqual([]);
  });
});

describe('rede do sandbox', () => {
  it('bloqueia redes privadas e metadados na saída', () => {
    for (const cidr of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8']) expect(DENY_OUT_CIDRS).toContain(cidr);
  });
});
