import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt, parseAgentAction, parseAgentTurn, TOOL_COSTS, VIBE_CODE_OPS } from './contract';
import { decodeMessage, encodeMessage, historyContent, type Artifact } from './artifacts';
import { summarizeVibeStream, vibeCodeHref, vibeCodeRequestBody, vibeConversationFromSearch, vibeHttpError } from './vibeBridge';
import { checkVibeOrigin } from '../../../supabase/functions/_shared/vibeAgentCore';

const CONV = '3f2b6c1e-8a4d-4c2b-9e7f-1a2b3c4d5e6f';

describe('vibe_code: parser do contrato', () => {
  it('start com prompt vira ação válida (sem conversa)', () => {
    expect(parseAgentAction({ tool: 'vibe_code', op: 'start', prompt: 'Landing page da cafeteria com cardápio' })).toEqual({
      tool: 'vibe_code', op: 'start', prompt: 'Landing page da cafeteria com cardápio',
    });
  });

  it('start ignora um conversationId que venha junto', () => {
    expect(parseAgentAction({ tool: 'vibe_code', op: 'start', prompt: 'Novo app de tarefas', conversationId: CONV })).toEqual({
      tool: 'vibe_code', op: 'start', prompt: 'Novo app de tarefas',
    });
  });

  it('continue exige prompt e conversationId válido', () => {
    expect(parseAgentAction({ tool: 'vibe_code', op: 'continue', prompt: 'Adicione modo escuro', conversationId: CONV })).toEqual({
      tool: 'vibe_code', op: 'continue', prompt: 'Adicione modo escuro', conversationId: CONV,
    });
    expect(parseAgentAction({ tool: 'vibe_code', op: 'continue', prompt: 'Adicione modo escuro' })).toBeNull();
    expect(parseAgentAction({ tool: 'vibe_code', op: 'continue', prompt: 'ok', conversationId: CONV })).toBeNull();
  });

  it('ask aceita conversa opcional; status só precisa da conversa', () => {
    expect(parseAgentAction({ tool: 'vibe_code', op: 'ask', prompt: 'Onde fica o login?' })).toEqual({
      tool: 'vibe_code', op: 'ask', prompt: 'Onde fica o login?',
    });
    expect(parseAgentAction({ tool: 'vibe_code', op: 'status', conversationId: CONV.toUpperCase() })).toEqual({
      tool: 'vibe_code', op: 'status', prompt: '', conversationId: CONV,
    });
    expect(parseAgentAction({ tool: 'vibe_code', op: 'status' })).toBeNull();
  });

  it('recusa op desconhecida e conversationId malformado', () => {
    expect(parseAgentAction({ tool: 'vibe_code', op: 'apply', prompt: 'Aplique tudo' })).toBeNull();
    expect(parseAgentAction({ tool: 'vibe_code', prompt: 'Sem op' })).toBeNull();
    expect(parseAgentAction({ tool: 'vibe_code', op: 'ask', prompt: 'Pergunta?', conversationId: 'abc' })).toBeNull();
  });

  it('passa pelo parseAgentTurn', () => {
    const turn = parseAgentTurn(JSON.stringify({ reply: 'Vou abrir no Vibe Code.', actions: [{ tool: 'vibe_code', op: 'start', prompt: 'Site de portfólio' }] }));
    expect(turn.actions).toEqual([{ tool: 'vibe_code', op: 'start', prompt: 'Site de portfólio' }]);
  });

  it('tem custo e está no prompt do sistema', () => {
    expect(VIBE_CODE_OPS).toEqual(['start', 'continue', 'ask', 'status']);
    expect(TOOL_COSTS.vibe_code).toContain('Vibe Code');
    const prompt = buildAgentSystemPrompt({ secretNames: [] });
    expect(prompt).toContain('"tool":"vibe_code"');
    expect(prompt).toContain('Vertal Vibe Code');
  });
});

describe('vibe_code: ponte com o vibe-code-agent', () => {
  it('monta o corpo sempre em preview e com origin vertal_chat', () => {
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'start', prompt: 'App de notas' })).toEqual({
      origin: 'vertal_chat', delegationDepth: 1, prompt: 'App de notas', mode: 'preview',
    });
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'continue', prompt: 'Mais um botão', conversationId: CONV })).toMatchObject({
      conversationId: CONV, mode: 'preview', origin: 'vertal_chat',
    });
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'ask', prompt: 'Qual é a rota?' })).toMatchObject({
      review: { command: 'ask', question: 'Qual é a rota?' },
    });
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'status', prompt: '', conversationId: CONV })).toBeNull();
  });

  it('leva o id da conversa do Chat para o handoff', () => {
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'start', prompt: 'App' }, CONV)).toMatchObject({ chatConversationId: CONV });
    expect(vibeCodeRequestBody({ tool: 'vibe_code', op: 'start', prompt: 'App' }, null)).not.toHaveProperty('chatConversationId');
  });

  it('o corpo gerado passa no limite de origem do servidor', () => {
    const body = vibeCodeRequestBody({ tool: 'vibe_code', op: 'start', prompt: 'App de notas' })!;
    expect(checkVibeOrigin(body)).toEqual({ ok: true, origin: 'vertal_chat' });
  });

  it('servidor: sem origin é o próprio Vibe Code; vertal_chat não delega de novo nem grava', () => {
    expect(checkVibeOrigin({ prompt: 'x' })).toEqual({ ok: true, origin: 'vibe_code' });
    expect(checkVibeOrigin({ origin: 'outro' })).toEqual({ ok: false, error: 'invalid_origin' });
    expect(checkVibeOrigin({ origin: 'vertal_chat', delegationDepth: 2 })).toEqual({ ok: false, error: 'delegation_depth_exceeded' });
    expect(checkVibeOrigin({ origin: 'vertal_chat', delegate: { to: 'x' } })).toEqual({ ok: false, error: 'delegation_depth_exceeded' });
    expect(checkVibeOrigin({ origin: 'vertal_chat', mode: 'apply' })).toEqual({ ok: false, error: 'delegation_preview_only' });
    expect(checkVibeOrigin({ origin: 'vertal_chat', apply: [] })).toEqual({ ok: false, error: 'delegation_preview_only' });
  });

  it('lê o stream SSE: conversa, resposta, arquivos e erro', () => {
    const lines = [
      { kind: 'message', title: 'Pedido vindo do Vertal Chat' },
      { kind: 'conversation', conversationId: CONV, title: 'App de notas', isNew: true },
      { kind: 'diff', path: 'src/App.tsx' },
      { kind: 'diff', path: 'src/App.tsx' },
      { kind: 'diff', path: 'index.html' },
      { kind: 'reply', detail: 'Preparei a prévia.' },
      { kind: 'done', title: 'Preview pronto — revise e aplique' },
    ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: {quebrado\n';
    expect(summarizeVibeStream(lines)).toEqual({
      conversationId: CONV, title: 'App de notas', reply: 'Preparei a prévia.', files: ['src/App.tsx', 'index.html'], done: 'Preview pronto — revise e aplique',
    });
    expect(summarizeVibeStream(`data: ${JSON.stringify({ kind: 'error', title: 'Agente parou' })}\n`).error).toBe('Agente parou');
  });

  it('erros HTTP de origem viram texto em português', () => {
    expect(vibeHttpError(400, '{"error":"delegation_depth_exceeded"}')).toContain('delegar');
    expect(vibeHttpError(500, 'boom')).toBe('O Vibe Code não respondeu (HTTP 500).');
  });

  it('link do Vibe Code ida e volta pela query ?conversation', () => {
    const href = vibeCodeHref(CONV);
    expect(href).toBe(`/vibe-code?conversation=${CONV}`);
    expect(vibeConversationFromSearch(href.slice(href.indexOf('?')))).toBe(CONV);
    expect(vibeConversationFromSearch('?conversation=nao-e-uuid')).toBeNull();
    expect(vibeConversationFromSearch('')).toBeNull();
  });
});

describe('artefato vibe', () => {
  it('sobrevive ao encode/decode e o histórico leva o conversationId', () => {
    const vibe: Artifact = { id: 'a1', kind: 'vibe', title: 'App de notas', conversationId: CONV, summary: 'Prévia pronta', files: ['src/App.tsx'] };
    const back = decodeMessage(encodeMessage('Pronto.', { artifacts: [vibe], panels: [], errors: [] }));
    expect(back.extras.artifacts).toEqual([vibe]);
    expect(historyContent('Pronto.', back.extras)).toContain(`conversationId ${CONV}`);
  });
});
