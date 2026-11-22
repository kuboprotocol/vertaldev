// Cofre da auditoria + anti-telemetria do Vertal Navigator (pedido do Laércio, 22/11).
import { describe, expect, it } from 'vitest';
import cases from '../infra/vertal-browser/credential_cases.json';
import { findCredentialSpans, looksLikeCredentials, parseTaskBody, redactCredentials, auditDetail } from '../supabase/functions/_shared/navigatorCore';
import {
  AUDIT_KEY_DEDICATED, AUDIT_KEY_FALLBACK, auditWriteKey, needsAuditBackfill, openAuditDetail, sealAuditDetail, splitAuditDetail,
} from '../supabase/functions/_shared/navigatorAuditVault';
import { redactForLog, safeErrorMessage } from '../supabase/functions/_shared/logRedact';
import { scrubBreadcrumb, scrubEvent } from '../src/lib/sentry';

const AUDIT_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const OTHER_KEY = '6162636465666768696a6b6c6d6e6f707172737475767778797a303132333435';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const SID = '33333333-3333-4333-8333-333333333333';

describe('senha/PIN/código na tarefa (mesmos casos do navd.py)', () => {
  it.each(cases.refuse)('recusa: %s', (t) => {
    expect(looksLikeCredentials(t)).toBe(true);
    expect(parseTaskBody({ sessionId: SID, task: t.length >= 3 ? t : `${t}   ` })).toMatchObject({ ok: false, status: 'credentials_in_task' });
  });
  it.each(cases.allow)('aceita: %s', (t) => {
    expect(looksLikeCredentials(t)).toBe(false);
  });
  it('redige só o valor', () => {
    for (const [src, want] of cases.redact) expect(redactCredentials(src)).toBe(want);
    expect(findCredentialSpans('senha: x')).toEqual([[7, 8]]);
  });
});

describe('auditoria cifrada (navigator_audit)', () => {
  const env = { NAVIGATOR_AUDIT_KEY: AUDIT_KEY };

  it('prefere a chave dedicada; sem ela, cai no fallback documentado', () => {
    expect(auditWriteKey(env)).toEqual({ version: AUDIT_KEY_DEDICATED, raw: AUDIT_KEY });
    expect(auditWriteKey({ NAVIGATOR_ENC_KEY: OTHER_KEY })).toEqual({ version: AUDIT_KEY_FALLBACK, raw: OTHER_KEY });
    expect(auditWriteKey({ CONNECTOR_ENC_KEY: OTHER_KEY })?.version).toBe(AUDIT_KEY_FALLBACK);
    expect(auditWriteKey({ NAVIGATOR_AUDIT_KEY: 'curta' })).toBeNull();
  });

  it('tarefa, URL e host vão cifrados; em claro só end_reason/minutes/limit', async () => {
    const sealed = await sealAuditDetail(auditWriteKey(env), USER, 'task', {
      task: 'entre no banco e veja o extrato', url: 'https://banco.com.br/login?token=abc123#x', minutes: 3,
    });
    expect(sealed.detail).toEqual({ minutes: 3 });
    expect(sealed.key_version).toBe(1);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toContain('extrato');
    expect(blob).not.toContain('banco.com.br');
    const open = await openAuditDetail(env, { ...sealed, user_id: USER, kind: 'task' });
    expect(open).toEqual({ minutes: 3, task: 'entre no banco e veja o extrato', url: 'https://banco.com.br/login' });
  });

  it('nunca guarda senha, nem cifrada; segredo só pelo nome', async () => {
    const sealed = await sealAuditDetail(auditWriteKey(env), USER, 'secret_used', {
      name: 'GMAIL_PASSWORD', host: 'accounts.google.com', value: 'Hunter2!', password: 'Hunter2!', cookies: 'sid=1',
    });
    const open = await openAuditDetail(env, { ...sealed, user_id: USER, kind: 'secret_used' });
    expect(open).toEqual({ name: 'GMAIL_PASSWORD', host: 'accounts.google.com' });
    const t = await sealAuditDetail(auditWriteKey(env), USER, 'task', { task: 'login no site senha: Hunter2!' });
    const o = await openAuditDetail(env, { ...t, user_id: USER, kind: 'task' });
    expect(String(o.task)).not.toContain('Hunter2');
  });

  it('ciphertext copiado para outro usuário/tipo ou chave errada não abre', async () => {
    const sealed = await sealAuditDetail(auditWriteKey(env), USER, 'task', { task: 'abrir o gmail' });
    expect(await openAuditDetail(env, { ...sealed, user_id: OTHER_USER, kind: 'task' })).toEqual({ sealed: true });
    expect(await openAuditDetail(env, { ...sealed, user_id: USER, kind: 'secret_used' })).toEqual({ sealed: true });
    expect(await openAuditDetail({ NAVIGATOR_AUDIT_KEY: OTHER_KEY }, { ...sealed, user_id: USER, kind: 'task' })).toEqual({ sealed: true });
    expect(await openAuditDetail({}, { ...sealed, user_id: USER, kind: 'task' })).toEqual({ sealed: true });
  });

  it('sem chave válida, descarta a parte sensível em vez de gravar em claro', async () => {
    const sealed = await sealAuditDetail(null, USER, 'task', { task: 'abrir o gmail', minutes: 1 });
    expect(sealed).toEqual({ detail: { minutes: 1 }, detail_ciphertext: null, detail_iv: null, detail_tag: null, key_version: null });
  });

  it('linhas antigas: precisam de backfill até serem cifradas', () => {
    expect(needsAuditBackfill({ user_id: USER, kind: 'task', detail: { task: 'x' } })).toBe(true);
    expect(needsAuditBackfill({ user_id: USER, kind: 'session_end', detail: { end_reason: 'user_stop', minutes: 2 } })).toBe(false);
    expect(needsAuditBackfill({ user_id: USER, kind: 'task', detail: {}, detail_ciphertext: 'abc' })).toBe(false);
    expect(splitAuditDetail({ task: 'a', limit: 'R$ 10,00' })).toEqual({ clear: { limit: 'R$ 10,00' }, sensitive: { task: 'a' } });
    expect(auditDetail({ url: 'javascript:alert(1)' })).toEqual({});
  });
});

describe('logs sem dados sensíveis (Worker/edge)', () => {
  it('tira credenciais, query de URL, cabeçalhos, JWT, tokens e e-mails', () => {
    const msg = 'supabase POST navigator_audit → 400 {"task":"login senha: Abc123!","url":"https://x.com/r?token=zzz"} '
      + 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop cookie: sid=1; a=2 '
      + 'fulano@gmail.com ' + 'a'.repeat(64);
    const out = redactForLog(msg, 2000);
    for (const leak of ['Abc123!', 'token=zzz', 'eyJhbGci', 'sid=1', 'fulano@', 'a'.repeat(64)]) expect(out).not.toContain(leak);
    expect(out).toContain('https://x.com/r?[…]');
    expect(safeErrorMessage(new Error('navd /task: senha: x'))).not.toContain('senha: x');
    expect(redactForLog('x'.repeat(500)).length).toBeLessThanOrEqual(301);
  });
});

describe('OpenRouter sem coleta de dados', async () => {
  const { __test } = await import('./navigatorRoutes');
  it('data_collection "deny" por padrão; ZDR só se ligado', () => {
    expect(__test.llmPrivacy({} as never)).toEqual({ dataCollection: 'deny', zdr: false });
    expect(__test.llmPrivacy({ NAVIGATOR_LLM_ZDR: 'true' } as never)).toEqual({ dataCollection: 'deny', zdr: true });
    expect(__test.llmPrivacy({ NAVIGATOR_LLM_DATA_COLLECTION: 'allow' } as never).dataCollection).toBe('allow');
    expect(__test.llmPrivacy({ NAVIGATOR_LLM_DATA_COLLECTION: 'qualquer' } as never).dataCollection).toBe('deny');
  });
});

describe('Sentry não captura a tarefa nem o cartão de aprovação', () => {
  it('UI do Navigator mascarada; console sem argumentos; URLs sem query', () => {
    const el = document.createElement('button');
    const wrap = document.createElement('div');
    wrap.setAttribute('data-sentry-mask', '');
    wrap.appendChild(el);
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'div > button' }, { event: { target: el } })?.message).toBe('[navigator]');
    const c = scrubBreadcrumb({ category: 'console', message: 'tarefa: login senha: Abc123!', data: { arguments: ['senha: Abc123!'] } });
    expect(c?.data).toBeUndefined();
    expect(c?.message).not.toContain('Abc123!');
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: 'https://vertal.dev/api/navigator/task?x=1' } })?.data?.url).toBe('https://vertal.dev/api/navigator/task');
    const ev = scrubEvent({ message: 'falhou senha: Abc123!', request: { data: '{"task":"x"}', url: 'https://vertal.dev/a?b=1', headers: { Authorization: 'x' } } });
    expect(ev.message).not.toContain('Abc123!');
    expect(ev.request.data).toBeUndefined();
    expect(ev.request.headers.Authorization).toBeUndefined();
    expect(ev.request.url).toBe('https://vertal.dev/a');
  });
});
