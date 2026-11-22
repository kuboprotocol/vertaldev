import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_CONFIRM_WORDS, CHECKOUT_URL_HINTS, GATED_ACTIONS, INVITE_HINTS, NAVIGATOR_LIMITS, PAYMENT_KEYWORDS, RSVP_WORDS, WRITE_KEYWORDS, isSessionId, liveViewUrl,
  looksLikeCheckout, minutesDue, needsPaymentApproval, normalizeNavigatorUrl, parseInputBody, parseSessionBody, parseStartBody,
  parseTaskBody, paymentKeyword, pickSecretForHost, sanitizeEvents, sanitizePending, secretMatchesHost, secretNeedsPasswordField,
  wantsNavigator, type VaultSecretMeta,
} from './navigatorCore';

const SID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

describe('gate de pagamento', () => {
  it('pede aprovação para pagar/comprar/confirmar pedido (pt e en, com ou sem acento)', () => {
    for (const label of ['Pagar agora', 'Finalizar compra', 'CONFIRMAR PEDIDO', 'Comprar', 'Place order', 'Buy now', 'Confirmar pagamento', 'Gerar boleto', 'Assinar plano', 'Pagar com Pix']) {
      expect(needsPaymentApproval('click', label), label).not.toBeNull();
    }
    expect(needsPaymentApproval('click', 'Concluír compra')).toBe('concluir compra');
    expect(needsPaymentApproval('select_dropdown', 'Purchase')).toBe('purchase');
  });

  it('não pede aprovação em cliques comuns nem ao digitar', () => {
    for (const label of ['Entrar', 'Próxima página', 'Pesquisar', 'Adicionar ao carrinho', 'Ver detalhes', 'Payload', 'Comprador']) {
      expect(needsPaymentApproval('click', label), label).toBeNull();
    }
    expect(needsPaymentApproval('input', 'Pagar')).toBeNull();
    expect(needsPaymentApproval('navigate', 'Pagar')).toBeNull();
    expect(paymentKeyword('')).toBeNull();
  });

  it('em página de checkout, "Finish"/"Continuar" também passam pelo gate', () => {
    expect(needsPaymentApproval('click', 'Finish', 'https://www.saucedemo.com/checkout-step-two.html')).toBe('checkout:finish');
    expect(needsPaymentApproval('click', 'Continuar', 'https://loja.com/pagamento')).toBe('checkout:continuar');
    expect(needsPaymentApproval('click', 'Finish', 'https://docs.site.com/tutorial')).toBeNull();
  });

  it('Enter só é barrado em página de checkout', () => {
    expect(needsPaymentApproval('send_keys', '', 'https://loja.com/checkout', '', 'Enter')).toBe('enter_on_checkout');
    expect(needsPaymentApproval('send_keys', '', 'https://loja.com/busca', 'Resultados', 'Enter')).toBeNull();
    expect(looksLikeCheckout('https://x.com/pay', '')).toBe(true);
    expect(looksLikeCheckout('https://x.com/paypal-info', 'Sobre')).toBe(false);
  });

  it('as listas são iguais às do daemon Python do sandbox (navd.py)', () => {
    const py = readFileSync(resolve(__dirname, '../../../infra/vertal-browser/navd.py'), 'utf8');
    const list = (name: string) => {
      const m = new RegExp(`${name} = \\[([\\s\\S]*?)\\]`).exec(py);
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
    };
    expect(list('PAYMENT_KEYWORDS')).toEqual([...PAYMENT_KEYWORDS]);
    // Ações de escrita (fix navigator-scope): mesmas listas no TS e no navd.py.
    expect(list('WRITE_KEYWORDS')).toEqual([...WRITE_KEYWORDS]);
    expect(list('RSVP_WORDS')).toEqual([...RSVP_WORDS]);
    expect(list('INVITE_HINTS')).toEqual([...INVITE_HINTS]);
    expect(py).toContain(`MAX_STEPS_CAP = ${NAVIGATOR_LIMITS.maxStepsCap}`);
    expect(py).toContain(`DEFAULT_MAX_STEPS = ${NAVIGATOR_LIMITS.defaultMaxSteps}`);
    expect(list('CHECKOUT_URL_HINTS')).toEqual([...CHECKOUT_URL_HINTS]);
    expect(list('CHECKOUT_CONFIRM_WORDS')).toEqual([...CHECKOUT_CONFIRM_WORDS]);
    const gated = /GATED_ACTIONS = \{([^}]*)\}/.exec(py)?.[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, ''));
    expect(gated?.sort()).toEqual([...GATED_ACTIONS].sort());
    // O daemon desliga JS arbitrário e upload (o gate não teria como ver o alvo).
    expect(py).toContain('exclude_actions=["evaluate", "upload_file"]');
  });
});

describe('guarda SSRF (reaproveitada do browser_form)', () => {
  it('aceita só http/https públicos', () => {
    expect(normalizeNavigatorUrl('https://github.com/login')).toBe('https://github.com/login');
    for (const bad of ['http://localhost:8787/health', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://10.0.0.5', 'http://192.168.1.1',
      'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@site.com', 'http://intranet', 'https://site.internal', 'http://[::1]/', 'http://100.64.0.1']) {
      expect(normalizeNavigatorUrl(bad), bad).toBeNull();
    }
  });

  it('start/task recusam URL interna', () => {
    expect(parseStartBody({ url: 'http://10.1.2.3' })).toEqual({ ok: false, status: 'blocked_url' });
    expect(parseStartBody({})).toEqual({ ok: true, data: {} });
    expect(parseTaskBody({ sessionId: SID, task: 'abra o painel', url: 'http://127.0.0.1:3000' })).toEqual({ ok: false, status: 'blocked_url' });
  });
});

describe('validação das rotas', () => {
  it('task: tarefa obrigatória, limites de tamanho e passos', () => {
    expect(parseTaskBody({ sessionId: 'x', task: 'abc' })).toMatchObject({ ok: false, detail: 'session_id' });
    expect(parseTaskBody({ sessionId: SID, task: 'a' })).toMatchObject({ ok: false, detail: 'task' });
    expect(parseTaskBody({ sessionId: SID, task: 'x'.repeat(NAVIGATOR_LIMITS.maxTaskChars + 1) })).toMatchObject({ ok: false, detail: 'task_too_long' });
    const ok = parseTaskBody({ sessionId: SID, task: '  entre no GitHub  ', url: 'https://github.com', maxSteps: 999 });
    expect(ok).toEqual({ ok: true, data: { sessionId: SID, task: 'entre no GitHub', url: 'https://github.com/', maxSteps: NAVIGATOR_LIMITS.maxStepsCap } });
    expect(parseTaskBody({ sessionId: SID, task: 'abc', maxSteps: 'x' })).toMatchObject({ ok: true, data: { maxSteps: NAVIGATOR_LIMITS.defaultMaxSteps } });
  });

  it('input: aprovação de pagamento exige confirmed: true (clique do usuário)', () => {
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'approval', approve: true })).toMatchObject({ ok: false, detail: 'confirmation_required' });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'approval', approve: true, confirmed: true })).toMatchObject({ ok: true, data: { approve: true } });
    // Recusar não precisa de confirmação.
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'approval', approve: false })).toMatchObject({ ok: true, data: { approve: false } });
  });

  it('input: segredo nunca vem do cliente; código 2FA só alfanumérico curto', () => {
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'secret', value: 'senha' })).toMatchObject({ ok: false, detail: 'kind' });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'code', value: '482 913' })).toMatchObject({ ok: true, data: { value: '482 913' } });
    expect(parseInputBody({ sessionId: SID, requestId: 'abcdef1234567890', kind: 'code', value: '<script>' })).toMatchObject({ ok: false, detail: 'code_format' });
    expect(parseInputBody({ sessionId: SID, requestId: 'nope', kind: 'code', value: '1234' })).toMatchObject({ ok: false, detail: 'request_id' });
  });

  it('status: id de sessão e cursor', () => {
    expect(isSessionId(SID)).toBe(true);
    expect(parseSessionBody({ sessionId: SID, after: '12' })).toEqual({ ok: true, data: { sessionId: SID, after: 12 } });
    expect(parseSessionBody({ sessionId: SID, after: -3 })).toEqual({ ok: true, data: { sessionId: SID, after: 0 } });
    expect(parseSessionBody({ sessionId: '../etc' })).toMatchObject({ ok: false });
  });
});

describe('segredos do cofre (fill_secret)', () => {
  it('bound_to casa com o host certo, nunca com outro domínio', () => {
    expect(secretMatchesHost('github', 'github.com')).toBe(true);
    expect(secretMatchesHost('github', 'api.github.com')).toBe(true);
    expect(secretMatchesHost('github-com', 'github.com')).toBe(true);
    expect(secretMatchesHost('app-vertal-dev', 'app.vertal.dev')).toBe(true);
    expect(secretMatchesHost('github', 'github.com.evil.io')).toBe(false);
    expect(secretMatchesHost('github', 'evilgithub.com')).toBe(false);
    expect(secretMatchesHost('github-com', 'notgithub.com')).toBe(false);
    expect(secretMatchesHost(null, 'github.com')).toBe(false);
    expect(secretMatchesHost('localhost', 'localhost')).toBe(false);
  });

  it('escolhe o segredo do dono antes do concedido e exige o vínculo', () => {
    const secrets: VaultSecretMeta[] = [
      { id: 'g', owner_id: 'o2', env_key: 'GITHUB_PASSWORD', bound_to: 'github', role: 'grant' },
      { id: 'o', owner_id: 'me', env_key: 'GITHUB_PASSWORD', bound_to: 'github', role: 'owner' },
      { id: 'x', owner_id: 'me', env_key: 'BANK_PASSWORD', bound_to: 'meubanco-com-br', role: 'owner' },
    ];
    expect(pickSecretForHost(secrets, 'github_password', 'github.com')?.id).toBe('o');
    expect(pickSecretForHost(secrets, 'BANK_PASSWORD', 'github.com')).toBeNull();
    expect(pickSecretForHost(secrets, 'BANK_PASSWORD', 'meubanco.com.br')?.id).toBe('x');
    expect(pickSecretForHost(secrets, 'NAO_EXISTE', 'github.com')).toBeNull();
    expect(pickSecretForHost(secrets, 'bad name!', 'github.com')).toBeNull();
  });

  it('senha só em campo de senha; usuário/e-mail podem ir em campo de texto', () => {
    expect(secretNeedsPasswordField('GITHUB_PASSWORD')).toBe(true);
    expect(secretNeedsPasswordField('API_TOKEN')).toBe(true);
    expect(secretNeedsPasswordField('GITHUB_USER')).toBe(false);
    expect(secretNeedsPasswordField('LOGIN_EMAIL')).toBe(false);
  });
});

describe('eventos para o cliente', () => {
  it('tira campos que poderiam carregar valores sensíveis', () => {
    const events = sanitizeEvents([
      { seq: 1, ts: 1, type: 'secret_filled', name: 'GITHUB_PASSWORD', value: 'vazou', password: 'x', token: 't', code: '123' },
      { seq: 2, ts: 2, type: 'step', goal: 'ok' },
      { nope: true },
    ]);
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toMatch(/vazou|"password"|"token"|"code"/);
    expect(events[0]).toMatchObject({ type: 'secret_filled', name: 'GITHUB_PASSWORD' });
  });

  it('pedidos pendentes: só tipos conhecidos e ids válidos', () => {
    const pending = sanitizePending([
      { id: 'abcdef1234567890', kind: 'approval', target: 'Pagar', url: 'https://x.com/checkout', future: {} },
      { id: 'abcdef1234567891', kind: 'evil' },
      { id: '../../x', kind: 'code' },
    ]);
    expect(pending).toEqual([{ id: 'abcdef1234567890', kind: 'approval', target: 'Pagar', url: 'https://x.com/checkout' }]);
  });
});

describe('cobrança por minuto', () => {
  const start = Date.parse('2026-11-21T10:00:00Z');
  it('pré-paga: o primeiro minuto é cobrado na abertura', () => {
    expect(minutesDue(start, 0, start)).toBe(1);
    expect(minutesDue(start, 1, start + 59_000)).toBe(0);
    expect(minutesDue(start, 1, start + 60_000)).toBe(1);
    expect(minutesDue(start, 1, start + 5 * 60_000 + 1)).toBe(5);
  });
  it('para no fim da sessão e no teto', () => {
    expect(minutesDue(start, 3, start + 30 * 60_000, start + 3 * 60_000 - 1)).toBe(0);
    expect(minutesDue(start, 0, start + 600 * 60_000)).toBe(NAVIGATOR_LIMITS.maxSessionMinutes);
  });
});

describe('tela ao vivo', () => {
  it('senha no fragmento (não vai ao servidor) e modo só-ver por padrão', () => {
    const url = liveViewUrl('abc123def456', 'vertalrun.com', 'Ab12Cd34', false);
    expect(url.startsWith('https://6080-abc123def456.vertalrun.com/vnc.html?')).toBe(true);
    expect(url).toContain('view_only=1');
    expect(new URL(url).search).not.toContain('Ab12Cd34');
    expect(new URL(url).hash).toBe('#password=Ab12Cd34');
    expect(liveViewUrl('abc123def456', 'vertalrun.com', 'Ab12Cd34', true)).toContain('view_only=0');
  });
});

describe('wantsNavigator', () => {
  it('liga quando a conversa pede para operar um site', () => {
    expect(wantsNavigator(['entre no site do banco e baixe o extrato'])).toBe(true);
    expect(wantsNavigator(['faça login no meu GitHub'])).toBe(true);
    expect(wantsNavigator([{ tool: 'navigator', summary: 'ok' }])).toBe(true);
  });
  it('fica desligado em conversa comum', () => {
    expect(wantsNavigator(['me escreva um poema sobre o mar', 'obrigado'])).toBe(false);
  });
});
