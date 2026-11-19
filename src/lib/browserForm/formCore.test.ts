import { describe, expect, it } from 'vitest';
import {
  BROWSER_FORM_LIMITS, buildFormSchema, chooseSubmitButton, confirmationText, createRateLimiter, describeSchemaForAgent,
  detectCaptcha, isAllowedSubrequest, isBlockedHost, isHoneypot, isValidSubmitSelector, normalizeFormUrl, parseFormValues,
  planFill, type RawFormControl, type RawSubmitButton,
} from './formCore';

const control = (over: Partial<RawFormControl>): RawFormControl => ({
  index: 0, tag: 'input', type: 'text', name: '', id: '', label: '', placeholder: '', ariaLabel: '',
  required: false, disabled: false, readOnly: false, visible: true, ariaHidden: false, tabIndex: 0,
  autocomplete: '', value: '', checked: false, options: [], formIndex: 0, hint: '',
  ...over,
});

const startupForm: RawFormControl[] = [
  control({ index: 0, name: 'startup_name', label: 'Nome da startup', required: true }),
  control({ index: 1, type: 'email', name: 'email', label: 'E-mail', required: true }),
  control({ index: 2, tag: 'select', type: 'select-one', name: 'stage', label: 'Estágio', required: true,
    options: [{ value: '', label: 'Selecione' }, { value: 'idea', label: 'Ideia' }, { value: 'mvp', label: 'MVP' }, { value: 'scale', label: 'Tração' }] }),
  control({ index: 3, type: 'radio', name: 'remote', value: 'sim', label: 'Sim', hint: 'Time remoto?' }),
  control({ index: 4, type: 'radio', name: 'remote', value: 'nao', label: 'Não', hint: 'Time remoto?' }),
  control({ index: 5, type: 'checkbox', name: 'terms', label: 'Aceito os termos', required: true }),
  control({ index: 6, tag: 'textarea', type: 'textarea', name: 'pitch', label: 'Pitch' }),
  // Honeypots e controles que não são campos:
  control({ index: 7, name: 'website_hp', label: '', visible: false }),
  control({ index: 8, name: 'contact_me_by_fax_only', label: 'Não preencha este campo' }),
  control({ index: 9, type: 'hidden', name: 'csrf', value: 'abc' }),
  control({ index: 10, type: 'submit', name: 'go' }),
  control({ index: 11, type: 'file', name: 'deck', label: 'Pitch deck (PDF)' }),
];

const buttons: RawSubmitButton[] = [
  { index: 0, text: 'Buscar', formIndex: 1, visible: true },
  { index: 1, text: 'Enviar inscrição', formIndex: 0, visible: true },
  { index: 2, text: 'Enviar', formIndex: 0, visible: false },
];

describe('guarda SSRF', () => {
  it('aceita sites públicos e normaliza', () => {
    expect(normalizeFormUrl('forms.gle/abc123')).toBe('https://forms.gle/abc123');
    expect(normalizeFormUrl('https://www.startup.org/inscricao#topo')).toBe('https://www.startup.org/inscricao');
    expect(normalizeFormUrl('http://example.com/form')).toBe('http://example.com/form');
  });

  it.each([
    'http://localhost:3000', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://10.0.0.5',
    'http://169.254.169.254/latest/meta-data', 'http://192.168.1.1', 'http://172.20.1.1', 'http://[::1]/',
    'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://intranet/', 'https://printer.local/', 'file:///etc/passwd',
    'javascript:alert(1)', 'https://user:pass@example.com/', 'https://example.com:8443/', 'ftp://example.com',
  ])('bloqueia %s', (url) => {
    expect(normalizeFormUrl(url)).toBeNull();
  });

  it('não confunde domínios com letras de a-f com IPs', () => {
    expect(isBlockedHost('cafe.de')).toBe(false);
    expect(isBlockedHost('bad1.de')).toBe(false);
    expect(isBlockedHost('100.64.0.1')).toBe(true);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
  });

  it('subrequisições da página passam pela mesma guarda', () => {
    expect(isAllowedSubrequest('https://cdn.example.com/app.js')).toBe(true);
    expect(isAllowedSubrequest('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedSubrequest('http://169.254.169.254/')).toBe(false);
    expect(isAllowedSubrequest('chrome://settings')).toBe(false);
  });

  it('recusa URL gigante', () => {
    expect(normalizeFormUrl(`https://example.com/${'a'.repeat(BROWSER_FORM_LIMITS.maxUrlChars)}`)).toBeNull();
  });
});

describe('honeypots', () => {
  it('detecta campos escondidos, aria-hidden e "não preencha"', () => {
    expect(isHoneypot(control({ visible: false }))).toBe(true);
    expect(isHoneypot(control({ ariaHidden: true }))).toBe(true);
    expect(isHoneypot(control({ type: 'hidden' }))).toBe(true);
    expect(isHoneypot(control({ label: 'Não preencha' }))).toBe(true);
    expect(isHoneypot(control({ label: 'Por favor, deixe este campo em branco' }))).toBe(true);
    expect(isHoneypot(control({ placeholder: 'Leave this field empty' }))).toBe(true);
    expect(isHoneypot(control({ name: 'honeypot' }))).toBe(true);
    expect(isHoneypot(control({ name: '_gotcha' }))).toBe(true);
    expect(isHoneypot(control({ tabIndex: -1, autocomplete: 'off' }))).toBe(true);
  });

  it('não marca campos legítimos', () => {
    expect(isHoneypot(control({ name: 'website', label: 'Site (deixe em branco se não tiver)' }))).toBe(false);
    expect(isHoneypot(control({ name: 'phone', label: 'Telefone' }))).toBe(false);
    expect(isHoneypot(control({ name: 'hobby', label: 'Hobby' }))).toBe(false);
    expect(isHoneypot(control({ tabIndex: -1, autocomplete: 'off', label: 'CEP' }))).toBe(false);
  });
});

describe('buildFormSchema', () => {
  const schema = buildFormSchema(startupForm, buttons, 'Inscrição Programa X');

  it('monta os campos, junta radios e pula honeypots/botões/hidden', () => {
    expect(schema.fields.map((f) => f.key)).toEqual(['startup_name', 'email', 'stage', 'remote', 'terms', 'pitch', 'deck']);
    expect(schema.honeypotsSkipped).toBe(2); // hidden (csrf) não é armadilha: só não é campo
    const remote = schema.fields.find((f) => f.key === 'remote')!;
    expect(remote.type).toBe('radio');
    expect(remote.label).toBe('Time remoto?');
    expect(remote.options).toEqual([{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]);
    expect(remote.selector).toBe('input[type="radio"][name="remote"]');
    expect(schema.fields.find((f) => f.key === 'deck')!.unsupported).toBe(true);
    expect(schema.fields.find((f) => f.key === 'stage')!.options).toHaveLength(4);
    expect(schema.fields[0].selector).toBe('[data-vertal-field="f0"]');
  });

  it('lista só os botões de envio visíveis', () => {
    expect(schema.submitButtons).toEqual([
      { selector: '[data-vertal-submit="s0"]', text: 'Buscar' },
      { selector: '[data-vertal-submit="s1"]', text: 'Enviar inscrição' },
    ]);
  });

  it('gera chaves únicas quando falta name/id', () => {
    const s = buildFormSchema([
      control({ index: 0, label: 'Seu nome' }),
      control({ index: 1, label: 'Seu nome' }),
      control({ index: 2 }),
    ]);
    expect(s.fields.map((f) => f.key)).toEqual(['seu_nome', 'seu_nome_2', 'campo_2']);
  });

  it('ignora desativados e limita a quantidade de campos', () => {
    const many = Array.from({ length: 200 }, (_, i) => control({ index: i, name: `c${i}`, disabled: i === 0 }));
    const s = buildFormSchema(many);
    expect(s.fields[0].key).toBe('c1');
    expect(s.fields).toHaveLength(BROWSER_FORM_LIMITS.maxFields);
  });

  it('resumo para o agente traz chaves, obrigatoriedade e opções', () => {
    const text = describeSchemaForAgent(schema);
    expect(text).toContain('"startup_name" — Nome da startup [text; obrigatório]');
    expect(text).toContain('opções: Selecione | Ideia | MVP | Tração');
    expect(text).toContain('2 campo(s) armadilha');
  });
});

describe('planFill', () => {
  const schema = buildFormSchema(startupForm, buttons);

  it('casa por chave ou rótulo, converte opções e checkbox', () => {
    const plan = planFill(schema.fields, {
      startup_name: 'Vertal', 'E-mail': 'contato@vertal.dev', stage: 'mvp', remote: 'Sim', terms: 'sim', foo: 'bar',
    });
    expect(plan.fills).toEqual([
      { key: 'startup_name', selector: '[data-vertal-field="f0"]', type: 'text', value: 'Vertal' },
      { key: 'email', selector: '[data-vertal-field="f1"]', type: 'email', value: 'contato@vertal.dev' },
      { key: 'stage', selector: '[data-vertal-field="f2"]', type: 'select', value: 'mvp' },
      { key: 'remote', selector: 'input[type="radio"][name="remote"]', type: 'radio', value: 'sim' },
      { key: 'terms', selector: '[data-vertal-field="f5"]', type: 'checkbox', value: true },
    ]);
    expect(plan.unknownKeys).toEqual(['foo']);
    expect(plan.missingRequired).toEqual([]);
    expect(plan.errors).toEqual([]);
  });

  it('aponta obrigatórios em branco, opções inválidas e e-mail inválido', () => {
    const plan = planFill(schema.fields, { stage: 'Série Z', email: 'não é email', startup_name: '  ' });
    expect(plan.missingRequired.map((f) => f.key)).toEqual(['startup_name', 'email', 'stage', 'terms']);
    expect(plan.errors).toHaveLength(2);
    expect(plan.errors[0]).toContain('não é uma opção');
    expect(plan.errors[1]).toContain('e-mail inválido');
  });

  it('nunca preenche honeypot (não está no esquema) nem upload', () => {
    const plan = planFill(schema.fields, { website_hp: 'x', contact_me_by_fax_only: 'y', deck: 'arquivo.pdf' });
    expect(plan.fills).toEqual([]);
    expect(plan.unknownKeys).toEqual(['website_hp', 'contact_me_by_fax_only']);
    expect(plan.errors[0]).toContain('upload de arquivo');
  });
});

describe('parseFormValues', () => {
  it('aceita texto, booleano e número; descarta o resto e limita tamanho', () => {
    const values = parseFormValues({ a: 'x', b: true, c: 3, d: { nested: 1 }, e: ['x', 'y'], '  ': 'vazio', f: 'z'.repeat(9_999) });
    expect(values).toEqual({ a: 'x', b: true, c: '3', e: 'x, y', f: 'z'.repeat(BROWSER_FORM_LIMITS.maxValueChars) });
    expect(parseFormValues('texto')).toEqual({});
    expect(parseFormValues(null)).toEqual({});
  });
});

describe('captcha', () => {
  const none = { iframeSrcs: [], presentSelectors: [], title: 'Inscrição', bodyText: 'Preencha o formulário' };
  it('detecta reCAPTCHA, hCaptcha, Turnstile e páginas de desafio', () => {
    expect(detectCaptcha({ ...none, iframeSrcs: ['https://www.google.com/recaptcha/api2/anchor?k=x'] })).toEqual({ captcha: true, kind: 'recaptcha' });
    expect(detectCaptcha({ ...none, presentSelectors: ['.h-captcha'] })).toEqual({ captcha: true, kind: 'hcaptcha' });
    expect(detectCaptcha({ ...none, iframeSrcs: ['https://challenges.cloudflare.com/cdn-cgi/x'] })).toEqual({ captcha: true, kind: 'turnstile' });
    expect(detectCaptcha({ ...none, title: 'Just a moment...' }).captcha).toBe(true);
    expect(detectCaptcha({ ...none, bodyText: 'Confirme que você não é um robô' }).captcha).toBe(true);
  });
  it('página normal não é captcha', () => {
    expect(detectCaptcha(none)).toEqual({ captcha: false });
    expect(detectCaptcha({ ...none, iframeSrcs: ['https://www.youtube.com/embed/x'] })).toEqual({ captcha: false });
  });
});

describe('botão de envio', () => {
  it('só aceita seletores marcados pelo servidor', () => {
    expect(isValidSubmitSelector('[data-vertal-submit="s1"]')).toBe(true);
    expect(isValidSubmitSelector('#delete-account')).toBe(false);
    expect(isValidSubmitSelector('[data-vertal-submit="s1"], #x')).toBe(false);
  });
  it('usa o pedido do agente se válido e visível; senão o botão do formulário principal', () => {
    expect(chooseSubmitButton(startupForm, buttons, '[data-vertal-submit="s0"]')!.index).toBe(0);
    expect(chooseSubmitButton(startupForm, buttons, '[data-vertal-submit="s2"]')!.index).toBe(1);
    expect(chooseSubmitButton(startupForm, buttons, '#hack')!.index).toBe(1);
    expect(chooseSubmitButton(startupForm, [])).toBeNull();
  });
});

describe('confirmationText', () => {
  it('prioriza alertas e cabeçalhos, sem repetir', () => {
    expect(confirmationText({
      title: 'Obrigado', headings: ['Inscrição recebida!', 'Inscrição recebida!'], alerts: ['Enviamos um e-mail de confirmação para você.'], bodyText: 'x',
    })).toBe('Enviamos um e-mail de confirmação para você.\nInscrição recebida!');
  });
  it('sem cabeçalhos, usa o título e o começo do texto', () => {
    const text = confirmationText({ title: 'OK', headings: [], alerts: [], bodyText: 'Sua resposta foi registrada.   Enviar outra resposta' });
    expect(text).toBe('OK\nSua resposta foi registrada. Enviar outra resposta');
  });
});

describe('createRateLimiter', () => {
  it('limita por usuário dentro da janela', () => {
    const limiter = createRateLimiter(2, 1_000);
    expect(limiter.take('u1', 0)).toBe(true);
    expect(limiter.take('u1', 10)).toBe(true);
    expect(limiter.take('u1', 20)).toBe(false);
    expect(limiter.take('u2', 20)).toBe(true);
    expect(limiter.take('u1', 1_011)).toBe(true);
  });
});
