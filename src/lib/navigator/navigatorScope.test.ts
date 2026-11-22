// Fix navigator-scope-email (22/11): escopo, DuckDuckGo, senha fora da tarefa,
// aprovação de escrita e e-mail pelo conector do Gmail.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ op: string; body: Record<string, unknown> }> = [];
vi.mock('./client', () => ({
  callNavigator: vi.fn(async (op: string, body: Record<string, unknown>) => {
    calls.push({ op, body });
    return { ok: true, status: 'ok' };
  }),
}));

import { approvalCopy } from '@/components/navigator/navigatorUi';
import { emailRoute, rerouteEmailActions } from '../../../supabase/functions/_shared/emailRouting';
import { NAVIGATOR_MESSAGES, framedNavigatorTask, needsActionApproval } from './navigatorCore';
import { __resetNavigatorStore, getNavigatorState, runNavigatorTask } from './store';

describe('senha digitada na tarefa', () => {
  beforeEach(() => {
    calls.length = 0;
    __resetNavigatorStore();
  });

  it('não sai do aparelho: o store recusa antes de chamar o servidor', async () => {
    const out = await runNavigatorTask('Email, fulano@gmail.com e senha Abcdef1@#$');
    expect(out.ok).toBe(false);
    expect(out.message).toBe(NAVIGATOR_MESSAGES.credentials_in_task);
    expect(getNavigatorState().error).toBe(NAVIGATOR_MESSAGES.credentials_in_task);
    expect(calls).toEqual([]);
  });
});

describe('escopo e buscador', () => {
  it('a tarefa enquadrada manda fazer só o pedido e pesquisar no DuckDuckGo', () => {
    const t = framedNavigatorTask('veja o preço do café');
    expect(t).toContain('SOMENTE o que a tarefa pede');
    expect(t).toContain('nunca google.com/search');
  });

  it('cartão de aprovação: escrita tem título e botão próprios; pagamento continua igual', () => {
    expect(needsActionApproval('click', 'Enviar', 'https://mail.google.com/')?.category).toBe('write');
    expect(approvalCopy({ category: 'write' })).toMatchObject({ isWrite: true, approveLabel: 'Aprovar e enviar' });
    expect(approvalCopy({})).toMatchObject({ isWrite: false, title: 'Aprovar ação de pagamento?', approveLabel: 'Aprovar e clicar' });
  });
});

describe('e-mail pelo conector do Gmail (não pelo navegador)', () => {
  it('pedido de e-mail vai para o Gmail; navegador só se o usuário insistir', () => {
    expect(emailRoute(['entre no meu email, leia e me pergunte se quero responder; preencha os convites'])).toBe('gmail');
    expect(emailRoute(['Entre no gmail', 'Pelo navegador'])).toBe('browser');
    const r = rerouteEmailActions([{ tool: 'navigator', op: 'open', url: 'https://mail.google.com/' }], 'gmail');
    expect(r.actions).toEqual([{ tool: 'gmail_search', query: 'in:inbox newer_than:7d', max: 10 }]);
  });
});
