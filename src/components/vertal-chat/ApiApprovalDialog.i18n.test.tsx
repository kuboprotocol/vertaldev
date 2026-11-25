// Regressão: o cartão compartilhado "Permitir esta ação?" continua byte a byte igual para todo mundo.
// Só traduz quando o pedido vem do Agendador (labels) E a flag VITE_VERTAL_CHAT_SCHEDULER está ligada.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ApiApprovalDialog } from './VertalChat';
import { approvalLabels, registerSchedulerLangs } from '../../../supabase/functions/_shared/chatSchedulerI18n';
import { SCHEDULER_LANG_DATA } from '../../../supabase/functions/_shared/chatSchedulerLangs/index';

registerSchedulerLangs(SCHEDULER_LANG_DATA);

const APPROVALS = [
  { method: 'GET', url: 'https://api.x.com/v1', host: 'api.x.com', reason: 'ver dados', secrets: [], hasBody: false },
  { method: 'POST E-MAIL', url: 'para a@b.com', host: 'gmail', reason: 'Olá\nmundo', secrets: ['K1', 'K2'], hasBody: true },
  { method: 'TAREFA AGENDADA', url: 'Pagar boleto', host: 'Vertal Chat · Tarefas agendadas', reason: 'Lembrete: x\nQuando: y', secrets: [], hasBody: false },
];

// SHA-256 do HTML do diálogo (role=dialog) renderizado no main (ebbae80), antes desta mudança (ids do Radix normalizados).
const BASELINE = [
  '17e6c46eecc46cea518d766022231793f7f1aea3aa13105b5e5d30dfa0dafe42',
  '9b941725da1613e45513697c86c97e24d9a08bb690f14610f14aea906505347d',
  '9b7b51f3e1b17bf94d7dc7be185c03abca4d799368c8dffc9c3c671d42033944',
];

const sha = (s: string) => createHash('sha256').update(s.replace(/radix-:r\w+:/g, 'radix-:r:')).digest('hex');
function html(approval: Record<string, unknown>): string {
  const { unmount } = render(<ApiApprovalDialog approval={{ ...approval, resolve: () => {} } as never} />);
  const out = document.querySelector('[role="dialog"]')?.outerHTML ?? '';
  unmount();
  return out;
}

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('cartão de permissão compartilhado', () => {
  it('sem rótulos: idêntico ao main (flag desligada)', () => {
    vi.stubEnv('VITE_VERTAL_CHAT_SCHEDULER', '');
    APPROVALS.forEach((a, i) => expect(sha(html(a))).toBe(BASELINE[i]));
  });
  it('sem rótulos: idêntico ao main mesmo com a flag ligada', () => {
    vi.stubEnv('VITE_VERTAL_CHAT_SCHEDULER', 'true');
    APPROVALS.forEach((a, i) => expect(sha(html(a))).toBe(BASELINE[i]));
  });
  it('com rótulos mas flag desligada: idêntico ao main', () => {
    vi.stubEnv('VITE_VERTAL_CHAT_SCHEDULER', '');
    expect(sha(html({ ...APPROVALS[2], labels: approvalLabels('ja') }))).toBe(BASELINE[2]);
  });
  it('rótulos pt-BR com a flag ligada: mesmo texto de sempre', () => {
    vi.stubEnv('VITE_VERTAL_CHAT_SCHEDULER', 'true');
    const out = html({ ...APPROVALS[2], labels: approvalLabels('pt-BR') });
    for (const t of ['Permitir esta ação?', 'Não permitir', 'TAREFA AGENDADA Pagar boleto', 'Resumo (o que, quando, gatilho e permissões)', 'Serviço', 'Chamada']) {
      expect(out).toContain(t);
    }
  });
  it('flag ligada + rótulos: traduz e vira RTL em árabe', () => {
    vi.stubEnv('VITE_VERTAL_CHAT_SCHEDULER', 'true');
    const L = approvalLabels('ar');
    const out = html({ ...APPROVALS[2], labels: L });
    expect(out).toContain(L.title);
    expect(out).toContain(L.allow);
    expect(out).toContain(L.deny);
    expect(out).toContain(`${L.method} Pagar boleto`);
    expect(out).toContain('dir="rtl"');
    expect(out).not.toContain('Permitir esta ação?');
    const ja = html({ ...APPROVALS[2], labels: approvalLabels('ja') });
    expect(ja).toContain('この操作を許可しますか？');
    expect(ja).toContain('dir="ltr"');
  });
});
