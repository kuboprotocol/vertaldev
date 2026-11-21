// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { base32Decode, hotp, isTotpSecretName, parseTotpSeed, totpNow, totpSeedError } from '../../../supabase/functions/_shared/totp';
import { totpBoundSlug, totpEnvKey, validateTotpForm } from './totpForm';

// RFC 6238, apêndice B: segredo ASCII "12345678901234567890" (SHA-1).
const RFC_SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP (RFC 6238) — 2FA do Navigator gerado no servidor', () => {
  it('decodifica base32 tolerando espaços e minúsculas', () => {
    expect(new TextDecoder().decode(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')!)).toBe('12345678901234567890');
    expect(base32Decode('0189')).toBeNull();
    expect(base32Decode('')).toBeNull();
  });

  it('bate com os vetores oficiais do RFC 6238 (8 e 6 dígitos)', async () => {
    const p8 = { ...parseTotpSeed(RFC_SEED)!, digits: 8 as const };
    expect(await hotp(p8, Math.floor(59 / 30))).toBe('94287082');
    expect(await hotp(p8, Math.floor(1111111109 / 30))).toBe('07081804');
    expect(await hotp(p8, Math.floor(1234567890 / 30))).toBe('89005924');
    const p6 = parseTotpSeed(RFC_SEED)!;
    expect(await hotp(p6, 1)).toBe('287082');
  });

  it('lê URI otpauth (digits, period, algorithm) e recusa HOTP/semente curta', () => {
    const p = parseTotpSeed(`otpauth://totp/GitHub:eu?secret=${RFC_SEED}&issuer=GitHub&digits=8&period=60&algorithm=SHA256`)!;
    expect(p.digits).toBe(8);
    expect(p.period).toBe(60);
    expect(p.algorithm).toBe('SHA-256');
    expect(parseTotpSeed(`otpauth://hotp/x?secret=${RFC_SEED}&counter=1`)).toBeNull();
    expect(parseTotpSeed('ABCDEFGH')).toBeNull();
    expect(parseTotpSeed(`otpauth://totp/x?secret=${RFC_SEED}&digits=4`)).toBeNull();
    expect(totpSeedError('')).toMatch(/Cole/);
    expect(totpSeedError(RFC_SEED)).toBeNull();
  });

  it('perto do fim da janela, entrega o código do próximo período', async () => {
    const p = parseTotpSeed(RFC_SEED)!;
    const early = await totpNow(p, 30_000 + 1_000); // 29 s de validade
    expect(early.expiresIn).toBe(29);
    expect(early.code).toBe(await hotp(p, 1));
    const late = await totpNow(p, 59_000); // 1 s de validade → próximo
    expect(late.code).toBe(await hotp(p, 2));
    expect(late.expiresIn).toBe(31);
  });

  it('convenção do cofre: env_key terminando em _TOTP (espelhada no navd.py)', () => {
    expect(isTotpSecretName('GITHUB_TOTP')).toBe(true);
    expect(isTotpSecretName('github_com_totp')).toBe(true);
    expect(isTotpSecretName('GITHUB_PASSWORD')).toBe(false);
    expect(isTotpSecretName('_TOTP')).toBe(false);
    const py = readFileSync(resolve(__dirname, '../../../infra/vertal-browser/navd.py'), 'utf8');
    expect(py).toContain('re.fullmatch(r"[A-Z][A-Z0-9_]{0,58}_TOTP"');
  });
});

describe('formulário do autenticador (consentimento explícito)', () => {
  it('monta bound_to e nome do segredo a partir do site', () => {
    expect(totpBoundSlug('https://www.GitHub.com/login')).toBe('github-com');
    expect(totpBoundSlug('accounts.google.com')).toBe('accounts-google-com');
    expect(totpBoundSlug('localhost')).toBeNull();
    expect(totpEnvKey('github-com')).toBe('GITHUB_COM_TOTP');
    expect(totpEnvKey('1password-com')).toBe('PASSWORD_COM_TOTP');
  });
  it('exige site, semente válida e o consentimento marcado', () => {
    expect(validateTotpForm({ site: 'github.com', seed: RFC_SEED, consent: false }).error).toMatch(/autoriza/i);
    expect(validateTotpForm({ site: '', seed: RFC_SEED, consent: true }).ok).toBe(false);
    expect(validateTotpForm({ site: 'github.com', seed: 'xx', consent: true }).ok).toBe(false);
    expect(validateTotpForm({ site: 'github.com', seed: RFC_SEED, consent: true })).toEqual({ ok: true, boundTo: 'github-com', envKey: 'GITHUB_COM_TOTP' });
  });
});
