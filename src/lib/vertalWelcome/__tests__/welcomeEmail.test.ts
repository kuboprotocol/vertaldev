import { describe, expect, it } from 'vitest';
import {
  buildWelcomeEmail,
  firstNameFrom,
  welcomeAppliesTo,
  welcomeConfig,
  welcomeItems,
  WELCOME_DEFAULTS,
} from '../../../../supabase/functions/_shared/vertalWelcome/welcomeEmail';

const ME = '11111111-2222-4333-8444-555555555555';
const cfgOn = welcomeConfig({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_WELCOME_EMAIL: { enabled: true } }) })!;

describe('welcome v2 · flag', () => {
  it('desligado sem config, com config inválida ou enabled≠true', () => {
    expect(welcomeConfig({})).toBeNull();
    expect(welcomeConfig({ VERTAL_GPU_CONFIG: '{not json' })).toBeNull();
    expect(welcomeConfig({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OLLAMA_URL_2: 'x' }) })).toBeNull();
    expect(welcomeConfig({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_WELCOME_EMAIL: { enabled: false } }) })).toBeNull();
    expect(welcomeAppliesTo(null, ME)).toBe(false);
  });

  it('ligado dentro do VERTAL_GPU_CONFIG usa os padrões verificados', () => {
    expect(cfgOn).toMatchObject({
      enabled: true,
      docsUrl: 'https://vertal.dev/docs',
      logoUrl: 'https://vertal.dev/pwa-512x512.png',
      replyTo: 'support@kubovibe.dev',
      fromName: 'Vertal',
      crmOpen: false,
      vibePayOpen: false,
      userIds: [],
    });
    expect(welcomeAppliesTo(cfgOn, ME)).toBe(true);
  });

  it('segredo avulso vence; allowlist restringe; valores inseguros caem no padrão', () => {
    const c = welcomeConfig({
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_WELCOME_EMAIL: { enabled: false } }),
      VERTAL_WELCOME_EMAIL: JSON.stringify({ enabled: 'true', userIds: [ME, 'nope'], docsUrl: 'javascript:alert(1)', replyTo: 'x' }),
    })!;
    expect(c.userIds).toEqual([ME]);
    expect(c.docsUrl).toBe(WELCOME_DEFAULTS.docsUrl);
    expect(c.replyTo).toBe(WELCOME_DEFAULTS.replyTo);
    expect(welcomeAppliesTo(c, ME)).toBe(true);
    expect(welcomeAppliesTo(c, '99999999-2222-4333-8444-555555555555')).toBe(false);
  });
});

describe('welcome v2 · nome', () => {
  it('primeiro nome do cadastro por e-mail ou Google', () => {
    expect(firstNameFrom({ display_name: 'Ana Souza' })).toBe('Ana');
    expect(firstNameFrom({ full_name: 'Laércio Borges', name: 'x' })).toBe('Laércio');
    expect(firstNameFrom({ given_name: 'Maria' })).toBe('Maria');
    expect(firstNameFrom({ display_name: 'foo@bar.com' })).toBeNull();
    expect(firstNameFrom({ display_name: '  ' })).toBeNull();
    expect(firstNameFrom(null)).toBeNull();
  });

  it('remove quebras de linha (sem injeção de cabeçalho no Assunto) e escapa HTML', () => {
    expect(firstNameFrom({ display_name: 'Eve\r\nBcc: x@y.z' })).toBe('Eve');
    const e = buildWelcomeEmail({ firstName: 'A&B', cfg: cfgOn });
    expect(e.html).toContain('Hi A&amp;B,');
    expect(e.html).not.toContain('Hi A&B,');
  });
});

describe('welcome v2 · conteúdo', () => {
  it('assunto, pré-cabeçalho e versão texto exatamente como aprovados', () => {
    const e = buildWelcomeEmail({ firstName: 'Ana', cfg: cfgOn });
    expect(e.subject).toBe('Welcome to Vertal Dev, Ana');
    expect(e.preheader).toBe('Everything you need to build, launch and grow is already in your account.');
    expect(e.text).toMatchSnapshot();
  });

  it('HTML: logo com alt "Vertal", botão para a documentação, sem nomes de fornecedor', () => {
    const e = buildWelcomeEmail({ firstName: 'Ana', cfg: cfgOn });
    expect(e.html).toContain('src="https://vertal.dev/pwa-512x512.png"');
    expect(e.html).toContain('alt="Vertal"');
    expect(e.html).toMatch(/<a href="https:\/\/vertal\.dev\/docs"[^>]*>Explore the docs<\/a>/);
    expect(e.html).toContain('Everything you need to build, launch and grow is already in your account.');
    for (const vendor of [/lovable/i, /supabase/i, /stripe/i, /asaas/i, /autocad/i, /render\.com/i, /e2b/i, /cloudflare/i, /openrouter/i, /modal/i]) {
      expect(e.html).not.toMatch(vendor);
      expect(e.text).not.toMatch(vendor);
    }
    expect(e.html).toMatchSnapshot();
  });

  it('sem nome: assunto sem vírgula e "Hi there,"', () => {
    const e = buildWelcomeEmail({ firstName: null, cfg: cfgOn });
    expect(e.subject).toBe('Welcome to Vertal Dev');
    expect(e.text.startsWith('Hi there,\n')).toBe(true);
  });

  it('CRM e Vibe Pay: "opening soon" enquanto fechados; versão aberta quando liberados', () => {
    const closed = buildWelcomeEmail({ firstName: 'Ana', cfg: cfgOn }).text;
    expect(closed).toContain('• Free CRM: opening soon');
    expect(closed).toContain('• Vertal Vibe Pay: opening soon');
    const open = buildWelcomeEmail({ firstName: 'Ana', cfg: { ...cfgOn, crmOpen: true, vibePayOpen: true } }).text;
    expect(open).toContain('• Free CRM: contacts and deals together');
    expect(open).toContain('• Vertal Vibe Pay: get paid globally');
    expect(open).not.toContain('opening soon');
  });

  it('curto: ~120 palavras no corpo e 3–6 palavras por item, todas as vantagens presentes', () => {
    for (const cfg of [cfgOn, { ...cfgOn, crmOpen: true, vibePayOpen: true }]) {
      const items = welcomeItems(cfg);
      expect(items.map((i) => i.label)).toEqual([
        'Free CRM', 'Deploy and rendering', 'Vertal App', 'Vertal Run', 'Vertal Vibe Pay', 'Design, CAD, Office',
      ]);
      for (const i of items) {
        const n = `${i.label} ${i.text}`.split(/\s+/).length;
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(6);
      }
      const words = buildWelcomeEmail({ firstName: 'Ana', cfg }).text.replace(/^Explore the docs: .*$/m, 'Explore the docs').split(/\s+/).filter((w) => /\w/.test(w)).length;
      expect(words).toBeLessThanOrEqual(130);
    }
    expect(buildWelcomeEmail({ firstName: 'Ana', cfg: cfgOn }).text).toContain('You only pay for Vertal AI, by the credit.');
  });
});
