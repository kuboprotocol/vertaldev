// Formulários seguros do Navigator (núcleo puro): domínio → Cofre, entradas dos cartões,
// máscara de segredos (mesmos casos do navd.py em infra/vertal-browser/auth_cases.json).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authEventType, authPendingView, composePhone, connectorForLogin, maskKnownValues, maskSecretLike, normalizeOtpKind, normalizePhone,
  parseAuthInput, pickLoginForHost, siteSecretNames, siteSlugForHost, SECRET_MASK,
} from '../../../supabase/functions/_shared/navigatorAuthForms';
import { parseInputBody, sanitizeEvents, sanitizePending, auditDetail, NAVIGATOR_AUDIT_KINDS } from './navigatorCore';

const CASES = JSON.parse(readFileSync(resolve(__dirname, '../../../infra/vertal-browser/auth_cases.json'), 'utf8')) as {
  mask: Array<[string, string]>; keep: string[]; slug: Array<[string, string]>; connector: Array<[string, string, string, string | null]>;
};
const SID = '22222222-2222-4222-8222-222222222222';

describe('máscara de segredos (incidente 22/11: valor bruto no resultado)', () => {
  it.each(CASES.mask)('mascara %s', (src, want) => expect(maskSecretLike(src)).toBe(want));
  it.each(CASES.keep)('mantém %s', (t) => expect(maskSecretLike(t)).toBe(t));
  it('valores exatos conhecidos', () => {
    expect(maskKnownValues('entrei com abc123senha', ['abc123senha'])).toBe(`entrei com ${SECRET_MASK}`);
  });
  it('eventos, pedidos e auditoria saem mascarados', () => {
    const leaked = 'Zq8mT2vX9pL4kR7wN1bY6cH3jF5dG0sA';
    const ev = sanitizeEvents([{ seq: 1, ts: 1, type: 'done', result: `Falhou: ${leaked} vinculado a ai-providers` }]);
    expect(JSON.stringify(ev)).not.toContain(leaked);
    const pend = sanitizePending([{ id: 'abcdef1234567890', kind: 'text', question: `use ${leaked}?` }]);
    expect(JSON.stringify(pend)).not.toContain(leaked);
    expect(JSON.stringify(auditDetail({ task: `entre com ${leaked}` }))).not.toContain(leaked);
  });
  it('o navd.py tem a mesma regra (regex de prefixos e de tokens)', () => {
    const py = readFileSync(resolve(__dirname, '../../../infra/vertal-browser/navd.py'), 'utf8');
    expect(py).toContain('(?:sk|pk|rk|ghp|gho|ghs|ghu|github_pat|xox[abprs]|glpat|shpat|whsec)[-_][A-Za-z0-9_-]{12,}');
    expect(py).toContain('[A-Za-z0-9_+=-]{20,}');
    expect(py).toContain('SECRET_MASK = "[segredo oculto]"');
  });
});

describe('domínio → Cofre', () => {
  it.each(CASES.slug)('%s → %s', (host, want) => expect(siteSlugForHost(host)).toBe(want));
  it('nomes das variáveis', () => {
    expect(siteSecretNames('google-com')).toEqual({ username: 'GOOGLE_COM_LOGIN', password: 'GOOGLE_COM_PASSWORD', totp: 'GOOGLE_COM_TOTP', phone: 'GOOGLE_COM_PHONE' });
    expect(siteSecretNames('99freelas-com').username).toBe('SITE_99FREELAS_COM_LOGIN');
  });
  it('login salvo: subdomínios sim, SSO só quando vinculado a ele, segredo de outro vínculo nunca', () => {
    const secrets = [
      { id: '1', owner_id: 'u', env_key: 'GOOGLE_COM_LOGIN', bound_to: 'google-com', role: 'owner' as const },
      { id: '2', owner_id: 'u', env_key: 'GOOGLE_COM_PASSWORD', bound_to: 'google-com', role: 'owner' as const },
      { id: '3', owner_id: 'u', env_key: 'OPENAI_PASSWORD', bound_to: 'ai-providers', role: 'owner' as const },
      { id: '4', owner_id: 'u', env_key: 'NOTION_SO_PASSWORD', bound_to: 'notion-so', role: 'owner' as const },
    ];
    expect(pickLoginForHost(secrets, 'accounts.google.com')).toMatchObject({ username: { id: '1' }, password: { id: '2' } });
    expect(pickLoginForHost(secrets, 'mail.google.com').password?.id).toBe('2');
    expect(pickLoginForHost(secrets, 'www.notion.so').password?.id).toBe('4');
    // Notion com "Entrar com Google" abre accounts.google.com: só o segredo do google-com vale lá.
    expect(pickLoginForHost(secrets.filter((s) => s.id === '4' || s.id === '3'), 'accounts.google.com')).toEqual({ username: null, password: null });
  });
});

describe('Gmail: conector em vez de senha', () => {
  it.each(CASES.connector)('%s %s (%s) → %s', (host, url, task, want) => expect(connectorForLogin(host, url, task)).toBe(want));
});

describe('entradas dos cartões', () => {
  it('login: só os campos pedidos; senha não é aparada; guardar no Cofre por padrão', () => {
    expect(parseAuthInput({ kind: 'login', username: ' a@b.com ', password: ' x ' })).toEqual({ ok: true, data: { kind: 'login', save: true, username: 'a@b.com', password: ' x ' } });
    expect(parseAuthInput({ kind: 'login', username: 'a', password: 'p' }, ['password'])).toEqual({ ok: true, data: { kind: 'login', save: true, password: 'p' } });
    expect(parseAuthInput({ kind: 'login', username: 'a' }, ['username', 'password'])).toEqual({ ok: false, detail: 'password' });
    expect(parseAuthInput({ kind: 'login', username: 'a\nb', password: 'p' }).ok).toBe(false);
  });
  it('código + semente TOTP exige consentimento', () => {
    expect(parseAuthInput({ kind: 'code', value: '123 456' })).toEqual({ ok: true, data: { kind: 'code', value: '123456' } });
    expect(parseAuthInput({ kind: 'code', totpSeed: 'JBSWY3DPEHPK3PXP' })).toEqual({ ok: false, detail: 'confirmation_required' });
    expect(parseAuthInput({ kind: 'code', totpSeed: 'não é base32!' , confirmed: true })).toEqual({ ok: false, detail: 'totp_seed' });
    expect(parseAuthInput({ kind: 'code', totpSeed: 'JBSWY3DPEHPK3PXP', confirmed: true }).ok).toBe(true);
  });
  it('telefone: país + DDD + número em E.164 (padrão +55)', () => {
    expect(composePhone('55', '11', '99999-8888')).toBe('+5511999998888');
    expect(composePhone('55', '011', '3333 4444')).toBe('+551133334444');
    expect(composePhone('55', '1', '999998888')).toBeNull();
    expect(composePhone('55', '11', '899998888')).toBeNull();
    expect(composePhone('1', '415', '5550100')).toBe('+14155550100');
    expect(composePhone('351', '', '912345678')).toBe('+351912345678');
    expect(normalizePhone('(11) 99999-8888')).toBe('+5511999998888');
    expect(normalizePhone('abc')).toBeNull();
    expect(parseAuthInput({ kind: 'phone', value: '+351 912 345 678' })).toEqual({ ok: true, data: { kind: 'phone', value: '+351912345678', save: false } });
  });
  it('conector e cancelar', () => {
    expect(parseAuthInput({ kind: 'connector', connector: 'gmail' }).ok).toBe(true);
    expect(parseAuthInput({ kind: 'connector', connector: 'outlook' }).ok).toBe(false);
    expect(parseAuthInput({ kind: 'login', cancel: true })).toEqual({ ok: true, data: { kind: 'cancel' } });
  });
  it('/input encaminha o cartão seguro ao Worker (kind "auth"); código simples segue o caminho antigo', () => {
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'login', username: 'a', password: 'b' })).toMatchObject({ ok: true, data: { kind: 'auth' } });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'phone', value: '+5511999998888' })).toMatchObject({ ok: true, data: { kind: 'auth' } });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'code', value: '123456' })).toMatchObject({ ok: true, data: { kind: 'code' } });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'code', totpSeed: 'X' })).toMatchObject({ ok: true, data: { kind: 'auth' } });
  });
  it('tipo de código', () => {
    expect(normalizeOtpKind('authenticator')).toBe('totp');
    expect(normalizeOtpKind('SMS')).toBe('sms');
    expect(normalizeOtpKind('email')).toBe('email');
    expect(normalizeOtpKind('')).toBe('unknown');
  });
});

describe('o que o cartão recebe', () => {
  it('pedido de login vira cartão com domínio, campos e onde salvar — sem valores', () => {
    const view = authPendingView('login', { host: 'accounts.google.com', url: 'https://accounts.google.com/ServiceLogin?service=mail', fields: ['username'] });
    expect(view).toEqual({ host: 'accounts.google.com', site: 'google-com', domain: 'google.com', loginFields: ['username'], connector: 'gmail', saveAs: { username: 'GOOGLE_COM_LOGIN' } });
    expect(authEventType('login', ['password'])).toBe('needs_password');
    expect(authEventType('login', ['username', 'password'])).toBe('needs_login');
    expect(authEventType('code')).toBe('needs_otp');
    expect(authEventType('phone')).toBe('needs_phone');
  });
  it('sanitizePending passa só metadados do cartão', () => {
    const [p] = sanitizePending([{
      id: 'abcdef1234567890', kind: 'login', host: 'accounts.google.com', loginFields: ['username', 'password', 'pin'], retry: true,
      prefillUsername: 'laercio@gmail.com', connector: 'gmail', site: 'google-com', domain: 'google.com', saveAs: { password: 'GOOGLE_COM_PASSWORD', bad: 'x y' },
      password: 'nunca', value: 'nunca',
    }]);
    expect(p).toEqual({
      id: 'abcdef1234567890', kind: 'login', host: 'accounts.google.com', loginFields: ['username', 'password'], retry: true,
      prefillUsername: 'laercio@gmail.com', connector: 'gmail', site: 'google-com', domain: 'google.com', saveAs: { password: 'GOOGLE_COM_PASSWORD' },
    });
  });
  it('tipos novos de auditoria', () => {
    for (const k of ['login_entered', 'secret_saved', 'phone_entered', 'connector_chosen']) expect(NAVIGATOR_AUDIT_KINDS).toContain(k);
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261122180000_navigator_secure_forms.sql'), 'utf8');
    for (const k of NAVIGATOR_AUDIT_KINDS) expect(sql).toContain(`'${k}'`);
  });
});
