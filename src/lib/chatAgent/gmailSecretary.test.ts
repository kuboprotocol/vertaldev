// Gmail como secretário do cliente: contrato do chat + regras puras das funções gmail-*.
import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT_BUDGET, TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction } from './contract';
import { EMAIL_RULES } from '../../../supabase/functions/_shared/emailRouting';
import { isParallelSafe } from '../../../supabase/functions/_shared/chatOrchestrator';
import {
  GMAIL_MODIFY_OPS, buildMime, encodeSubject, forwardBody, forwardSubject, isInsufficientScope, isTextAttachment,
  modifyBody, resolveLabelIds,
} from '../../../supabase/functions/_shared/gmailOps';
import { GMAIL_CHAT_MODIFY_OPS } from '../../../supabase/functions/_shared/chatAgent';

const T = '18c2f0a9b1d2e3f4';

describe('gmail secretário: parse das ações', () => {
  it('rascunho válido (com Cc e resposta na conversa)', () => {
    expect(parseAgentAction({ tool: 'gmail_draft', to: 'a@b.com', subject: 'Re: oi', body: 'texto', cc: 'c@d.com; e@f.com', thread: T, in_reply_to: '<x@y.z>' }))
      .toEqual({ tool: 'gmail_draft', to: 'a@b.com', subject: 'Re: oi', body: 'texto', cc: 'c@d.com, e@f.com', thread: T, in_reply_to: '<x@y.z>' });
  });
  it('rascunho sem destinatário válido é recusado; Cc inválido some', () => {
    expect(parseAgentAction({ tool: 'gmail_draft', to: 'x', subject: 's', body: 'b' })).toBeNull();
    expect(parseAgentAction({ tool: 'gmail_draft', to: 'a@b.com', subject: 's', body: 'b', cc: 'nope' })).not.toHaveProperty('cc');
  });
  it('encaminhar exige id do e-mail e destinatário', () => {
    expect(parseAgentAction({ tool: 'gmail_forward', message: T, to: 'a@b.com', note: 'veja' })).toEqual({ tool: 'gmail_forward', message: T, to: 'a@b.com', note: 'veja' });
    expect(parseAgentAction({ tool: 'gmail_forward', message: '../x', to: 'a@b.com' })).toBeNull();
  });
  it('organizar: ops conhecidas, alvo obrigatório, rótulos só em label/unlabel', () => {
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'archive', thread: T })).toEqual({ tool: 'gmail_modify', op: 'archive', thread: T });
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'read', message: T })).toEqual({ tool: 'gmail_modify', op: 'read', message: T });
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'label', thread: T, labels: ['Clientes'] })).toEqual({ tool: 'gmail_modify', op: 'label', thread: T, labels: ['Clientes'] });
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'label', thread: T })).toBeNull();
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'delete_forever', thread: T })).toBeNull();
    expect(parseAgentAction({ tool: 'gmail_modify', op: 'trash' })).toBeNull();
  });
  it('anexo exige thread, e-mail e id do anexo', () => {
    expect(parseAgentAction({ tool: 'gmail_attachment', thread: T, message: T, attachment: 'ANGjdJ_abc123' }))
      .toEqual({ tool: 'gmail_attachment', thread: T, message: T, attachment: 'ANGjdJ_abc123' });
    expect(parseAgentAction({ tool: 'gmail_attachment', thread: T, message: T })).toBeNull();
  });
  it('só leitura de anexo roda em paralelo; escrita não', () => {
    expect(isParallelSafe({ tool: 'gmail_attachment', thread: T, message: T, attachment: 'ANGjdJ_abc123' })).toBe(true);
    expect(isParallelSafe({ tool: 'gmail_modify', op: 'trash', thread: T })).toBe(false);
    expect(isParallelSafe({ tool: 'gmail_forward', message: T, to: 'a@b.com', note: '' })).toBe(false);
  });
  it('custos: grátis como as outras ações do Gmail (sem tabela de desconto no repo)', () => {
    for (const t of ['gmail_draft', 'gmail_forward', 'gmail_modify', 'gmail_attachment'] as const) expect(TOOL_COSTS[t]).toMatch(/^grátis/);
  });
  it('ops do chat batem com as da função', () => {
    expect([...GMAIL_CHAT_MODIFY_OPS]).toEqual([...GMAIL_MODIFY_OPS]);
  });
  it('regras de e-mail trazem as ferramentas novas e cabem no orçamento', () => {
    for (const t of ['gmail_draft', 'gmail_forward', 'gmail_modify', 'gmail_attachment']) expect(EMAIL_RULES).toContain(`"tool":"${t}"`);
    const p = buildAgentSystemPrompt({ secretNames: [], email: 'gmail' });
    expect(p).toContain('gmail_modify');
    expect(p.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
    expect(EMAIL_RULES).not.toMatch(/openai|anthropic|claude|gpt/i);
  });
});

describe('gmailOps (funções gmail-*)', () => {
  it('modifyBody por op', () => {
    expect(modifyBody('archive')).toEqual({ removeLabelIds: ['INBOX'] });
    expect(modifyBody('read')).toEqual({ removeLabelIds: ['UNREAD'] });
    expect(modifyBody('star')).toEqual({ addLabelIds: ['STARRED'] });
    expect(modifyBody('label', ['Label_1'])).toEqual({ addLabelIds: ['Label_1'] });
    expect(modifyBody('label', [])).toBeNull();
    expect(modifyBody('trash')).toBeNull();
  });
  it('resolve rótulos pelo nome sem diferenciar maiúsculas', () => {
    expect(resolveLabelIds(['clientes', 'Novo'], [{ id: 'L1', name: 'Clientes' }])).toEqual({ ids: ['L1'], missing: ['Novo'] });
  });
  it('detecta falta de escopo (pede reconectar)', () => {
    expect(isInsufficientScope(403, { error: { message: 'Request had insufficient authentication scopes.' } })).toBe(true);
    expect(isInsufficientScope(403, { error: { message: 'Forbidden' } })).toBe(false);
    expect(isInsufficientScope(500, { error: { message: 'insufficient scopes' } })).toBe(false);
  });
  it('MIME sem injeção de cabeçalho e assunto com acento codificado', () => {
    const m = buildMime({ to: 'a@b.com\r\nBcc: x@y.z', subject: 'Reunião', body: 'oi', cc: 'c@d.com' });
    expect(m).not.toMatch(/\r\nBcc:/);
    expect(m).toContain('Cc: c@d.com');
    expect(encodeSubject('Reunião')).toMatch(/^=\?UTF-8\?B\?/);
    expect(encodeSubject('Hello')).toBe('Hello');
  });
  it('encaminhar cita o original e prefixa Fwd uma vez', () => {
    const b = forwardBody('Segue', { from: 'x@y.z', date: 'hoje', subject: 'Nota', to: 'me@a.com', text: 'conteúdo', attachments: ['nota.pdf'] });
    expect(b).toContain('Mensagem encaminhada');
    expect(b).toContain('conteúdo');
    expect(b).toContain('nota.pdf');
    expect(forwardSubject('Nota')).toBe('Fwd: Nota');
    expect(forwardSubject('Fwd: Nota')).toBe('Fwd: Nota');
  });
  it('anexos de texto viram texto; binários não', () => {
    expect(isTextAttachment('text/csv', 'a.csv')).toBe(true);
    expect(isTextAttachment('application/octet-stream', 'notas.txt')).toBe(true);
    expect(isTextAttachment('image/png', 'foto.png')).toBe(false);
  });
});
