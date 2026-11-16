import { describe, expect, it } from 'vitest';
import { groupActionsForExecution, isParallelSafe } from '../../../supabase/functions/_shared/chatOrchestrator';
import { TOOL_COSTS, parseAgentAction, parseAgentTurn } from './contract';

describe('canais no Vertal Chat: channel_send', () => {
  it('aceita envio válido para Instagram e WhatsApp', () => {
    expect(parseAgentAction({ tool: 'channel_send', channel: 'instagram', to: '1234567890', text: 'Oi!' }))
      .toEqual({ tool: 'channel_send', channel: 'instagram', to: '1234567890', text: 'Oi!' });
    expect(parseAgentAction({ tool: 'channel_send', channel: 'whatsapp', to: '5511999998888', text: 'Olá' }))
      .toEqual({ tool: 'channel_send', channel: 'whatsapp', to: '5511999998888', text: 'Olá' });
  });

  it('recusa canal desconhecido, destinatário que não é número e texto vazio', () => {
    expect(parseAgentAction({ tool: 'channel_send', channel: 'telegram', to: '1234567890', text: 'x' })).toBeNull();
    expect(parseAgentAction({ tool: 'channel_send', channel: 'instagram', to: '@maria', text: 'x' })).toBeNull();
    expect(parseAgentAction({ tool: 'channel_send', channel: 'instagram', to: '123', text: 'x' })).toBeNull();
    expect(parseAgentAction({ tool: 'channel_send', channel: 'whatsapp', to: '1234567890', text: '   ' })).toBeNull();
  });

  it('é uma ação com efeito: nunca roda em paralelo com leituras', () => {
    const send = { tool: 'channel_send' as const, channel: 'instagram' as const, to: '1234567890', text: 'a' };
    expect(isParallelSafe(send)).toBe(false);
    const groups = groupActionsForExecution([
      { tool: 'channel_inbox' },
      { tool: 'channel_inbox', channel: 'whatsapp' },
      send,
    ]);
    expect(groups).toEqual([
      [{ tool: 'channel_inbox' }, { tool: 'channel_inbox', channel: 'whatsapp' }],
      [send],
    ]);
  });
});

describe('canais no Vertal Chat: channel_inbox', () => {
  it('é leitura: pode rodar em paralelo e não pede limite obrigatório', () => {
    expect(isParallelSafe({ tool: 'channel_inbox' })).toBe(true);
    expect(parseAgentAction({ tool: 'channel_inbox' })).toEqual({ tool: 'channel_inbox', limit: 20 });
  });

  it('limita o número de mensagens e descarta filtro inválido', () => {
    expect(parseAgentAction({ tool: 'channel_inbox', channel: 'instagram', contact: '1234567890', limit: 500 }))
      .toEqual({ tool: 'channel_inbox', channel: 'instagram', contact: '1234567890', limit: 50 });
    expect(parseAgentAction({ tool: 'channel_inbox', channel: 'sms', contact: 'abc' }))
      .toEqual({ tool: 'channel_inbox', limit: 20 });
  });

  it('custo informado ao usuário é grátis', () => {
    expect(TOOL_COSTS.channel_inbox).toBe('grátis');
    expect(TOOL_COSTS.channel_send).toContain('confirma');
  });
});

describe('parseAgentTurn com canais', () => {
  it('mantém só as ações de canal válidas dentro de uma resposta', () => {
    const turn = parseAgentTurn(JSON.stringify({
      reply: 'Respondi.',
      actions: [
        { tool: 'channel_send', channel: 'whatsapp', to: '5511999998888', text: 'Oi' },
        { tool: 'channel_send', channel: 'whatsapp', to: 'nao', text: 'Oi' },
      ],
    }));
    expect(turn.actions).toEqual([{ tool: 'channel_send', channel: 'whatsapp', to: '5511999998888', text: 'Oi' }]);
  });
});
