import { describe, expect, it } from 'vitest';
import { TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction, parseAgentTurn } from './contract';
import { wantsBrowserForm } from '@/lib/browserForm/formCore';

describe('contrato: browser_form', () => {
  it('inspect só precisa de URL pública (normalizada)', () => {
    expect(parseAgentAction({ tool: 'browser_form', op: 'inspect', url: 'forms.gle/abc', values: { a: 'x' } })).toEqual({
      tool: 'browser_form', op: 'inspect', url: 'https://forms.gle/abc',
    });
  });

  it('preview e submit levam os valores validados', () => {
    expect(parseAgentAction({
      tool: 'browser_form', op: 'preview', url: 'https://example.com/form', values: { nome: 'Vertal', termos: true, n: 3, lixo: { x: 1 } },
    })).toEqual({ tool: 'browser_form', op: 'preview', url: 'https://example.com/form', values: { nome: 'Vertal', termos: true, n: '3' } });
    expect(parseAgentAction({
      tool: 'browser_form', op: 'submit', url: 'https://example.com/form', values: { nome: 'Vertal' }, submitSelector: '[data-vertal-submit="s1"]',
    })).toEqual({
      tool: 'browser_form', op: 'submit', url: 'https://example.com/form', values: { nome: 'Vertal' }, submitSelector: '[data-vertal-submit="s1"]',
    });
  });

  it('descarta seletor de envio que o servidor não marcou', () => {
    const a = parseAgentAction({ tool: 'browser_form', op: 'submit', url: 'https://example.com/form', values: { a: 'b' }, submitSelector: '#apagar-conta' });
    expect(a).toEqual({ tool: 'browser_form', op: 'submit', url: 'https://example.com/form', values: { a: 'b' } });
  });

  it('recusa op inválida, URL interna e submit sem valores', () => {
    expect(parseAgentAction({ tool: 'browser_form', op: 'click', url: 'https://example.com' })).toBeNull();
    expect(parseAgentAction({ tool: 'browser_form', op: 'inspect', url: 'http://169.254.169.254/latest' })).toBeNull();
    expect(parseAgentAction({ tool: 'browser_form', op: 'inspect', url: 'http://localhost:5173/form' })).toBeNull();
    expect(parseAgentAction({ tool: 'browser_form', op: 'inspect' })).toBeNull();
    expect(parseAgentAction({ tool: 'browser_form', op: 'submit', url: 'https://example.com/form', values: {} })).toBeNull();
  });

  it('passa pelo parse do turno completo', () => {
    const turn = parseAgentTurn(JSON.stringify({
      reply: 'Vou abrir o formulário.',
      actions: [{ tool: 'browser_form', op: 'inspect', url: 'https://example.com/inscricao' }],
    }));
    expect(turn.actions).toEqual([{ tool: 'browser_form', op: 'inspect', url: 'https://example.com/inscricao' }]);
  });

  it('o prompt ensina a ordem, a aprovação e a proibição de inventar dados (só quando a conversa fala de formulário)', () => {
    const prompt = buildAgentSystemPrompt({ secretNames: ['MINHA_CHAVE'], browserForm: true });
    expect(prompt).toContain('{"tool":"browser_form","op":"inspect|preview|submit"');
    expect(prompt).toContain('Formulários: 1) "inspect"');
    expect(prompt).toContain('NUNCA invente dados');
    expect(prompt).toContain('só envia quando o usuário clica em "Enviar"');
    expect(prompt).not.toContain('MINHA_CHAVE');
    expect(TOOL_COSTS.browser_form).toContain('4 créditos');
    const base = buildAgentSystemPrompt({ secretNames: ['MINHA_CHAVE'] });
    expect(base).not.toContain('browser_form');
    expect(base).toContain('MINHA_CHAVE');
  });

  it('com a ferramenta, o prompt cheio continua no orçamento do gateway', () => {
    const heavy = buildAgentSystemPrompt({
      browserForm: true,
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora',
      memories: 'x'.repeat(2_500),
      recall: 'y'.repeat(700),
      summary: 'z'.repeat(2_400),
      plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_000);
  });
});

describe('wantsBrowserForm', () => {
  it('liga com pedido de formulário, link de form ou resultado da ferramenta', () => {
    expect(wantsBrowserForm(['inscreva minha startup neste formulário https://x.com/a'])).toBe(true);
    expect(wantsBrowserForm([{ content: 'https://forms.gle/abc' }])).toBe(true);
    expect(wantsBrowserForm([{ tool: 'browser_form', summary: 'ok' }])).toBe(true);
    expect(wantsBrowserForm([{ content: '[artefato a2: formulário "Prévia: X"]' }, { content: 'o CNPJ é 12.345' }])).toBe(true);
  });
  it('fica desligado em conversa comum e olha só as mensagens recentes', () => {
    expect(wantsBrowserForm(['crie uma imagem de um gato', { content: 'Pronto!' }])).toBe(false);
    const old = ['preencha o formulário', ...Array.from({ length: 10 }, () => 'e o clima?')];
    expect(wantsBrowserForm(old)).toBe(false);
  });
});
