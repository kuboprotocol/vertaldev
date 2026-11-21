import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NAVIGATOR_DEFAULT_MODEL, eventsForTask, framedNavigatorTask, isDoneForTask, parseTaskBody, pickNavigatorModel,
} from './navigatorCore';
import { navdBackoffMs } from '../../../worker/e2bClient';
import { parseGithubCommand } from '../../../supabase/functions/_shared/githubOps';
import { parseVibeRecord, VIBE_RECORD_LIMITS } from '../../../supabase/functions/_shared/vibeRecord';
import {
  canUseBrowser, parseAgentTurn, parseBrowserRequest, USE_BROWSER_RULE,
} from '../../../supabase/functions/_shared/vibeAgentCore';
import { cleanPlainReply, fallbackReplyFromResults, formatToolResults, friendlyReplyFromResults, plainReplyPrompt } from '../../../supabase/functions/_shared/chatAgent';
import { finishNavigatorCard, navigatorCardFromStep, navigatorResultForAgent, navigatorStep, withNavigatorCard } from './vibeCard';
import { recordVibeExchange, vibeRecordBody } from '../chatAgent/vibeBridge';

const SID = '11111111-2222-4333-8444-555555555555';
const JPEG = 'data:image/jpeg;base64,AAAA';

describe('tarefa do navegador: só a resposta DESTA tarefa (bug da resposta de outra conversa)', () => {
  it('isDoneForTask compara runId quando o navd manda; sem runId, só eventos depois do início', () => {
    const task = { runId: 'abc', baseSeq: 10 };
    expect(isDoneForTask({ type: 'done', seq: 5, runId: 'old' }, task)).toBe(false);
    expect(isDoneForTask({ type: 'done', seq: 12, runId: 'old' }, task)).toBe(false);
    expect(isDoneForTask({ type: 'done', seq: 12, runId: 'abc' }, task)).toBe(true);
    // navd antigo (sem runId)
    expect(isDoneForTask({ type: 'done', seq: 3 }, task)).toBe(false);
    expect(isDoneForTask({ type: 'done', seq: 11 }, task)).toBe(true);
    expect(isDoneForTask({ type: 'step', seq: 11 }, task)).toBe(false);
  });

  it('eventsForTask filtra os passos da tarefa', () => {
    const evs = [
      { seq: 1, type: 'done', runId: 'old' }, { seq: 2, type: 'step' }, { seq: 3, type: 'step', runId: 'abc' }, { seq: 4, type: 'step', runId: 'zzz' },
    ];
    expect(eventsForTask(evs, { runId: 'abc', baseSeq: 1 }).map((e) => e.seq)).toEqual([2, 3]);
    expect(eventsForTask(evs, null)).toEqual([]);
  });
});

describe('modelo por tarefa e tarefa "mais inteligente"', () => {
  it('pickNavigatorModel só aceita modelos da lista permitida', () => {
    expect(pickNavigatorModel(undefined)).toBe(NAVIGATOR_DEFAULT_MODEL);
    expect(pickNavigatorModel('openai/gpt-x')).toBe(NAVIGATOR_DEFAULT_MODEL);
    expect(pickNavigatorModel('openai/gpt-x', { allowed: 'anthropic/claude, openai/gpt-x' })).toBe('openai/gpt-x');
    expect(pickNavigatorModel('x', { defaultModel: 'meu/modelo' })).toBe('meu/modelo');
    expect(pickNavigatorModel(undefined, { provider: 'deepseek' })).toBe('deepseek-flash');
    expect(pickNavigatorModel('bad model!', { allowed: 'bad model!' })).toBe(NAVIGATOR_DEFAULT_MODEL);
  });

  it('parseTaskBody aceita model válido e ignora lixo', () => {
    const ok = parseTaskBody({ sessionId: SID, task: 'abra o site', model: 'openai/gpt-x' });
    expect(ok.ok && ok.data.model).toBe('openai/gpt-x');
    const bad = parseTaskBody({ sessionId: SID, task: 'abra o site', model: '../../etc' });
    expect(bad.ok && bad.data.model).toBeUndefined();
  });

  it('framedNavigatorTask pede plano, read_page_text e citação do que foi lido', () => {
    const t = framedNavigatorTask('me diga o título', 'https://example.com');
    expect(t.startsWith('Comece abrindo https://example.com. me diga o título')).toBe(true);
    expect(t).toContain('read_page_text');
    expect(t).toContain('cite entre aspas');
  });

  it('sem URL, manda pesquisar num buscador antes de responder (bug: não fazia a busca)', () => {
    const t = framedNavigatorTask('pesquise o preço do café em Santos');
    expect(t.startsWith('Comece abrindo um buscador público')).toBe(true);
    expect(t).toContain('pesquise o preço do café em Santos');
    expect(t).toContain('não responda de memória');
  });

  it('espera do navd com backoff crescente e teto', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(navdBackoffMs)).toEqual([400, 700, 1_100, 1_600, 2_200, 2_500, 2_500]);
  });
});

describe('/github em linguagem natural (bug: "/github liste meus repositórios" não fazia nada)', () => {
  it('entende pedidos de listagem', () => {
    expect(parseGithubCommand('/github liste meus repositórios')?.op).toBe('list_repos');
    expect(parseGithubCommand('/github quais são meus repos?')?.op).toBe('list_repos');
    expect(parseGithubCommand('/github repositórios')?.op).toBe('list_repos');
    expect(parseGithubCommand('/github repos')?.op).toBe('list_repos');
  });
  it('comando desconhecido continua null (o chat mostra a ajuda)', () => {
    expect(parseGithubCommand('/github faça mágica')).toBeNull();
    expect(parseGithubCommand('/github repo meu-app')?.op).toBe('create_repo');
  });
});

describe('registro da troca na conversa do Vibe Code ({record})', () => {
  it('limpa passos: só tipos permitidos, captura JPEG pequena, link interno', () => {
    const rec = parseVibeRecord({
      prompt: '/navegar abra https://example.com',
      reply: 'Pronto!',
      steps: [
        { kind: 'navigator', status: 'success', title: 'Vertal Navigator', navigator: { task: 'abra', state: 'done', answer: '"Example Domain"', screenshot: JPEG, steps: ['Passo 1'], evil: 'x' } },
        { kind: 'commit', title: 'não pode' },
        { kind: 'delegate', status: 'failed', title: 'GitHub', link: { href: '/connectors/github', label: 'Conectar o GitHub' } },
        { kind: 'error', title: 'x', link: { href: 'https://evil.com', label: 'x' } },
      ],
    });
    expect(rec).not.toBeNull();
    expect(rec!.steps.map((s) => s.kind)).toEqual(['navigator', 'delegate', 'error']);
    const nav = rec!.steps[0].navigator as Record<string, unknown>;
    expect(nav.screenshot).toBe(JPEG);
    expect(nav.evil).toBeUndefined();
    expect(rec!.steps[1].link).toEqual({ href: '/connectors/github', label: 'Conectar o GitHub' });
    expect(rec!.steps[2].link).toBeUndefined();
  });
  it('recusa captura grande ou não-JPEG e corpo vazio', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(VIBE_RECORD_LIMITS.maxScreenshotChars)}`;
    const rec = parseVibeRecord({ reply: 'x', steps: [{ kind: 'navigator', navigator: { task: 'abc', screenshot: big } }, { kind: 'navigator', navigator: { task: 'abc', screenshot: 'https://x/y.png' } }] });
    expect(rec!.steps.every((s) => !(s.navigator as Record<string, unknown>).screenshot)).toBe(true);
    expect(parseVibeRecord({ reply: '', steps: [] })).toBeNull();
    expect(parseVibeRecord(null)).toBeNull();
  });
  it('vibeRecordBody + recordVibeExchange leem a conversa criada do stream', async () => {
    const body = vibeRecordBody({ projectId: 'p', conversationId: 'não-uuid', prompt: 'oi', reply: 'r', steps: [] });
    expect(body).toEqual({ projectId: 'p', record: { prompt: 'oi', reply: 'r', steps: [] } });
    const conv = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const fetchImpl = vi.fn(async () => new Response(`data: {"kind":"conversation","conversationId":"${conv}","title":"oi"}\n\ndata: {"kind":"done","title":"ok"}\n\n`, { status: 200 }));
    const res = await recordVibeExchange({ reply: 'r', steps: [] }, { url: 'https://x/fn', token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, conversationId: conv, title: 'oi' });
    const failing = vi.fn(async () => new Response('{"error":"rate_limited"}', { status: 429 }));
    const bad = await recordVibeExchange({ reply: 'r', steps: [] }, { url: 'https://x/fn', token: 't', fetchImpl: failing as unknown as typeof fetch });
    expect(bad.ok).toBe(false);
  });
});

describe('cartão do navegador no chat do Vibe Code', () => {
  it('cria, termina e relê o cartão (captura final, resposta e passos)', () => {
    const step = navigatorStep('me diga o título', { url: 'https://example.com' });
    const card = navigatorCardFromStep(step)!;
    expect(card.state).toBe('running');
    const done = finishNavigatorCard(card, { ok: true, message: 'O título é "Example Domain".', url: 'https://example.com/', screenshot: JPEG, steps: 2 }, [
      { seq: 5, ts: 0, type: 'step', n: 1, goal: 'Plano: abrir e ler o título' },
      { seq: 6, ts: 0, type: 'page_read', chars: 120 },
    ]);
    expect(done.state).toBe('done');
    expect(done.plan).toBe('Plano: abrir e ler o título');
    expect(done.screenshot).toBe(JPEG);
    expect(done.steps?.[0]).toContain('Lendo o texto da página');
    const again = navigatorCardFromStep(withNavigatorCard(step, done))!;
    expect(again.answer).toContain('Example Domain');
    expect(withNavigatorCard(step, done).status).toBe('success');
    expect(navigatorResultForAgent(done)).toContain('DADOS');
  });
  it('ignora passos que não são do navegador', () => {
    expect(navigatorCardFromStep({ kind: 'delegate', navigator: undefined })).toBeNull();
    expect(navigatorCardFromStep({ kind: 'navigator', navigator: { task: '' } })).toBeNull();
  });
});

describe('agente do Vibe Code pede o navegador sozinho (use_browser)', () => {
  it('parseAgentTurn aceita use_browser e parseBrowserRequest lê tarefa e URL', () => {
    const t = parseAgentTurn('{"summary":"vou abrir o painel","actions":[{"type":"use_browser","reason":"entre no painel da Cloudflare e configure o DNS","path":"https://dash.cloudflare.com"}],"final":true}');
    expect(t.actions[0].type).toBe('use_browser');
    expect(parseBrowserRequest(t.actions[0])).toEqual({ task: 'entre no painel da Cloudflare e configure o DNS', url: 'https://dash.cloudflare.com' });
    expect(parseBrowserRequest({ type: 'use_browser', reason: 'ok', path: 'javascript:alert(1)' })).toBeNull();
    expect(parseBrowserRequest({ type: 'use_browser', reason: 'abra o painel', path: 'file:///etc' })).toEqual({ task: 'abra o painel' });
  });
  it('limite de 1 por pedido e nunca em pedido vindo do Vertal Chat', () => {
    expect(canUseBrowser('vibe_code', 0).ok).toBe(true);
    expect(canUseBrowser('vibe_code', 1).ok).toBe(false);
    expect(canUseBrowser('vertal_chat', 0).ok).toBe(false);
    expect(USE_BROWSER_RULE).toContain('aprovação');
  });
});

describe('Vertal Chat: resposta final depois de mídia (bug "não consegui escrever o resumo")', () => {
  it('YouTube ok vira resposta curta e normal', () => {
    const text = fallbackReplyFromResults([{ tool: 'youtube', ok: true, summary: 'Tocando "Lofi Beats".\n1. Lofi Beats — Canal (https://www.youtube.com/watch?v=abc)' }]);
    expect(text).toBe('Pronto! ▶️ Está tocando **Lofi Beats** no player acima.');
    expect(text).not.toContain('não consegui escrever');
  });
  it('outras ferramentas ok: frase limpa, sem marcadores de DADOS', () => {
    expect(friendlyReplyFromResults([{ tool: 'github', ok: true, summary: 'Repositório x criado\n(DADOS do GitHub)' }])).toBe('Pronto! Repositório x criado');
    expect(friendlyReplyFromResults([])).toBe('Pronto! Terminei o que você pediu.');
  });
  it('resposta simples (2ª chance) e dica no resultado de mídia', () => {
    expect(cleanPlainReply('```\nTocando agora!\n```')).toBe('Tocando agora!');
    expect(cleanPlainReply('{"reply":"Oi"}')).toBe('Oi');
    expect(cleanPlainReply('{quebrado')).toBe('');
    expect(plainReplyPrompt([{ tool: 'youtube', ok: true, summary: 'x' }], 'toca lofi')).toContain('toca lofi');
    expect(formatToolResults([{ tool: 'youtube', ok: true, summary: 'Tocando "x".' }])).toContain('nunca deixe "reply" vazio');
  });
});

// ─── store: tarefa não pega o "done" de outra conversa; abertura tenta de novo ───
const callNavigator = vi.fn();
vi.mock('./client', () => ({ callNavigator: (...args: unknown[]) => callNavigator(...args) }));

describe('store do Navigator (fase 4)', () => {
  beforeEach(async () => {
    callNavigator.mockReset();
    const store = await import('./store');
    store.__resetNavigatorStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sessão reaproveitada: ignora o "done" antigo e devolve só o resultado da tarefa nova', async () => {
    const store = await import('./store');
    let statusCalls = 0;
    callNavigator.mockImplementation(async (route: string) => {
      if (route === 'start') return { ok: true, status: 'ok', sessionId: SID, reused: true, liveViewUrl: 'https://6080-x.vertalrun.com/#p' };
      if (route === 'task') return { ok: true, status: 'ok', runId: 'new1' };
      if (route === 'status') {
        statusCalls++;
        if (statusCalls === 1) {
          // eventos de uma tarefa anterior (Vertal Chat)
          return { ok: true, status: 'ok', agentStatus: 'done', lastSeq: 3, events: [
            { seq: 1, ts: 0, type: 'step', n: 1 }, { seq: 3, ts: 0, type: 'done', success: true, result: 'You logged into a secure area!' },
          ] };
        }
        return { ok: true, status: 'ok', agentStatus: 'done', lastSeq: 6, events: [
          { seq: 4, ts: 0, type: 'step', n: 1, runId: 'new1', goal: 'abrir example.com' },
          { seq: 6, ts: 0, type: 'done', success: true, runId: 'new1', result: 'O título é "Example Domain".' },
        ] };
      }
      return { ok: true, status: 'ok' };
    });
    const out = await store.runNavigatorTask('me diga o título', 'https://example.com', { timeoutMs: 5_000 });
    expect(out.ok).toBe(true);
    expect(out.message).toBe('O título é "Example Domain".');
    expect(out.steps).toBe(1);
    expect(store.getNavigatorState().currentTask?.baseSeq).toBe(3);
    store.__resetNavigatorStore();
  });

  it('abertura que falha uma vez é repetida em silêncio', async () => {
    const store = await import('./store');
    let starts = 0;
    callNavigator.mockImplementation(async (route: string) => {
      if (route === 'start') {
        starts++;
        return starts === 1 ? { ok: false, status: 'sandbox_error', message: 'O navegador na nuvem não respondeu.' } : { ok: true, status: 'ok', sessionId: SID };
      }
      return { ok: true, status: 'ok', events: [], lastSeq: 0 };
    });
    const res = await store.startNavigator(undefined, { retryDelayMs: 1 });
    expect(res.ok).toBe(true);
    expect(starts).toBe(2);
    expect(store.getNavigatorState().error).toBeNull();
    store.__resetNavigatorStore();
  });

  it('sessão que terminou entre as tarefas (expirou/sem créditos): abre outra antes da tarefa, sem sessionId vazio', async () => {
    const store = await import('./store');
    const SID2 = '66666666-7777-4888-8999-aaaaaaaaaaaa';
    let starts = 0;
    let statusCalls = 0;
    const taskBodies: Array<Record<string, unknown>> = [];
    callNavigator.mockImplementation(async (route: string, body: Record<string, unknown> = {}) => {
      if (route === 'start') {
        starts++;
        return { ok: true, status: 'ok', sessionId: starts === 1 ? SID : SID2 };
      }
      if (route === 'status') {
        statusCalls++;
        // 1: sincronia ao abrir · 2: a sessão expirou · 3: sincronia da sessão nova · 4+: a tarefa termina
        if (statusCalls === 2) return { ok: false, status: 'session_ended', message: 'Esta sessão do navegador terminou. Abra um novo.' };
        if (statusCalls < 4) return { ok: true, status: 'ok', agentStatus: 'idle', lastSeq: 0, events: [] };
        return { ok: true, status: 'ok', agentStatus: 'done', lastSeq: 1, events: [{ seq: 1, ts: 0, type: 'done', success: true, runId: 'run2', result: 'Feito.' }] };
      }
      if (route === 'task') {
        taskBodies.push(body);
        // Como o Worker de verdade: sem sessionId válido o pedido é recusado.
        return body.sessionId === SID2
          ? { ok: true, status: 'ok', runId: 'run2' }
          : { ok: false, status: 'bad_request', message: 'Pedido inválido para o navegador.' };
      }
      return { ok: true, status: 'ok' };
    });
    await store.startNavigator(undefined, { retryDelayMs: 1 });
    expect(store.getNavigatorState().sessionId).toBe(SID);

    const out = await store.runNavigatorTask('me diga o título', 'https://example.com', { timeoutMs: 5_000 });

    expect(starts).toBe(2);
    expect(taskBodies).toHaveLength(1);
    expect(taskBodies[0].sessionId).toBe(SID2);
    expect(out.ok).toBe(true);
    expect(out.message).toBe('Feito.');
    store.__resetNavigatorStore();
  });

  it('sessão que terminou por falta de créditos: a mensagem é a do motivo, não "pedido inválido"', async () => {
    const store = await import('./store');
    let starts = 0;
    callNavigator.mockImplementation(async (route: string) => {
      if (route === 'start') {
        starts++;
        return starts === 1 ? { ok: true, status: 'ok', sessionId: SID } : { ok: false, status: 'insufficient_credits', message: 'Créditos insuficientes para usar o navegador na nuvem.' };
      }
      if (route === 'status') return { ok: false, status: 'insufficient_credits', message: 'Créditos insuficientes para usar o navegador na nuvem.' };
      return { ok: false, status: 'bad_request', message: 'Pedido inválido para o navegador.' };
    });
    await store.startNavigator(undefined, { retryDelayMs: 1 });
    const out = await store.runNavigatorTask('me diga o título', 'https://example.com', { timeoutMs: 5_000 });
    expect(out.ok).toBe(false);
    expect(out.message).toBe('Créditos insuficientes para usar o navegador na nuvem.');
    store.__resetNavigatorStore();
  });
});
