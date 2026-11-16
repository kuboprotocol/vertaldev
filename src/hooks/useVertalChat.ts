// Vertal Chat: conversa com um agente que usa as ferramentas do Painel Criativo.
//
// Cada mensagem do usuário abre um turno: o agente responde com texto e ações,
// o navegador executa as ações (pelas funções de cada painel) e, quando o agente
// precisa ler o resultado (ex.: resposta de uma API), há uma nova rodada.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { conversationService } from '@/services/conversationService';
import { functionErrorCode } from '@/lib/functionError';
import type { ConversationListItem } from '@/types/conversation';
import type { AgentAction, PanelKey, ToolResult } from '@/lib/chatAgent/contract';
import {
  EMPTY_EXTRAS,
  decodeMessage,
  encodeMessage,
  historyContent,
  nextArtifactId,
  type Artifact,
  type MessageExtras,
} from '@/lib/chatAgent/artifacts';
import { actionLabel, runAction, type ApiApprovalRequest } from '@/lib/chatAgent/runAction';
import { loadConnections } from '@/lib/chatAgent/connections';
import {
  PLAN_LIMITS,
  completePlanTask,
  initPlanState,
  type ChatPlanAction,
  type ChatPlanState,
} from '@/lib/chatAgent/brain';

export interface ChatStep {
  label: string;
  state: 'running' | 'done' | 'error';
}

export interface VertalMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  extras: MessageExtras;
  /** Só na mensagem em andamento: o que o agente está fazendo agora. */
  steps?: ChatStep[];
  pending?: boolean;
  /** O chat guardou ou esqueceu algo da memória neste turno (aviso discreto, não vai para o histórico). */
  memory?: { saved: number; forgotten: number };
}

export interface PendingApproval extends ApiApprovalRequest {
  resolve: (approved: boolean) => void;
}

/** Rodadas de ferramentas seguidas (ex.: buscar → ler → responder) antes de o agente ter de responder. */
const MAX_TOOL_ROUNDS = PLAN_LIMITS.maxToolRounds;
/** Teto de chamadas ao agente num turno (plano + ferramentas + síntese). */
const MAX_AGENT_CALLS = PLAN_LIMITS.maxAgentCallsPerTurn;

const AGENT_ERRORS: Record<string, string> = {
  deduction_failed: 'Seus créditos acabaram. Recarregue para continuar conversando.',
  insufficient_credits: 'Seus créditos acabaram. Recarregue para continuar conversando.',
  ai_unavailable: 'A IA está indisponível agora. Tente de novo em instantes.',
  invalid_model_output: 'A IA não conseguiu responder desta vez. Tente reformular.',
  invalid_messages: 'Escreva uma mensagem para enviar.',
  Unauthorized: 'Sua sessão expirou. Entre novamente.',
};

interface AgentResponse {
  reply: string;
  actions: AgentAction[];
  memory?: { saved: number; forgotten: number };
}

interface AgentCallOptions {
  conversationId?: string | null;
  /** Última rodada: o servidor manda responder sem novas ações. */
  final?: boolean;
  /** Plano em execução (tarefa atual ou fase final). */
  plan?: ChatPlanState;
}

async function callAgent(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  toolResults: ToolResult[],
  options: AgentCallOptions = {},
): Promise<AgentResponse> {
  const { data, error } = await supabase.functions.invoke<AgentResponse>('creative-router', {
    body: {
      tool: 'agent_chat',
      messages: history,
      agent: {
        ...(toolResults.length ? { tool_results: toolResults.slice(-8) } : {}),
        ...(options.final ? { final: true } : {}),
        ...(options.plan ? { plan: options.plan } : {}),
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          connections: loadConnections(),
          ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
        },
      },
    },
  });
  if (error) {
    const code = await functionErrorCode(error);
    if (code?.startsWith('rate_limit_exceeded')) throw new Error('Muitas mensagens em pouco tempo. Aguarde um minuto.');
    throw new Error((code && AGENT_ERRORS[code]) || 'Não foi possível responder agora. Tente de novo.');
  }
  if (!data || typeof data.reply !== 'string' || !Array.isArray(data.actions)) throw new Error('Resposta inesperada do chat.');
  return data;
}

const titleOf = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || 'Nova conversa';
};

export function useVertalChat(options: {
  /** `extra` leva o que o painel precisa abrir (o design do figCraft). */
  onOpenPanel: (panel: PanelKey, extra?: { designId?: string }) => void;
  onArtifact: (artifact: Artifact) => void;
  onChatOnly: (chatOnly: boolean) => void;
}) {
  const { user } = useAuth();
  const { subscription, canEdit, editsRemaining, incrementEdit, refetch: refetchCredits } = useSubscription();
  const [messages, setMessages] = useState<VertalMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  /** Prévia ao vivo do app em construção. */
  const [livePreview, setLivePreview] = useState<string | null>(null);

  // Refs: o turno do agente é longo e não pode ler estado velho de um render anterior.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const allowedHostsRef = useRef(new Set<string>());
  const planRef = useRef({ subscription, canEdit, incrementEdit });
  planRef.current = { subscription, canEdit, incrementEdit };

  const refreshConversations = useCallback(async () => {
    if (!user?.id) return;
    try {
      setConversations(await conversationService.listConversations(user.id, { archived: false, limit: 40, offset: 0 }));
    } catch {
      // A lista é secundária: a conversa atual continua funcionando.
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setLivePreview(null);
    allowedHostsRef.current = new Set();
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setLoadingConversation(true);
    setError(null);
    try {
      const rows = await conversationService.loadConversation(id);
      setConversationId(id);
      allowedHostsRef.current = new Set();
      setMessages(
        rows.map((row) => {
          const { text, extras } = decodeMessage(row.content);
          return { id: row.id, role: row.role, text, extras };
        }),
      );
    } catch {
      setError('Não foi possível abrir esta conversa.');
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    try {
      await conversationService.deleteConversation(id);
      if (conversationRef.current === id) newConversation();
      await refreshConversations();
    } catch {
      setError('Não foi possível excluir a conversa.');
    }
  }, [newConversation, refreshConversations]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await conversationService.updateConversation(id, { title: title.trim() || 'Sem título' });
      await refreshConversations();
    } catch {
      setError('Não foi possível renomear a conversa.');
    }
  }, [refreshConversations]);

  const pinConversation = useCallback(async (id: string, pinned: boolean) => {
    try {
      await conversationService.pinConversation(id, pinned);
      await refreshConversations();
    } catch {
      setError('Não foi possível fixar a conversa.');
    }
  }, [refreshConversations]);

  /** Pergunta ao usuário antes de cada chamada de API (um domínio aprovado vale para a conversa). */
  const approveApi = useCallback((request: ApiApprovalRequest) => {
    if (allowedHostsRef.current.has(request.host) && request.secrets.length === 0 && request.method === 'GET') {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      setApproval({
        ...request,
        resolve: (approved) => {
          if (approved) allowedHostsRef.current.add(request.host);
          setApproval(null);
          resolve(approved);
        },
      });
    });
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !user?.id) return;
    setBusy(true);
    setError(null);

    const userMessage: VertalMessage = { id: crypto.randomUUID(), role: 'user', text, extras: EMPTY_EXTRAS };
    const draftId = crypto.randomUUID();
    const draft: VertalMessage = { id: draftId, role: 'assistant', text: '', extras: { artifacts: [], panels: [], errors: [] }, steps: [], pending: true };
    const before = messagesRef.current;
    setMessages([...before, userMessage, draft]);

    const patchDraft = (fn: (m: VertalMessage) => VertalMessage) =>
      setMessages((list) => list.map((m) => (m.id === draftId ? fn(m) : m)));

    let convId = conversationRef.current;
    try {
      if (!convId) {
        const conv = await conversationService.createConversation(user.id, { title: titleOf(text), model_used: 'vertal-agent' });
        convId = conv.id;
        setConversationId(conv.id);
        conversationRef.current = conv.id;
      }
      await conversationService.addMessage(convId, 'user', text);

      const history = [...before, userMessage].map((m) => ({ role: m.role, content: historyContent(m.text, m.extras) }));
      const known: Artifact[] = before.flatMap((m) => m.extras.artifacts);
      const made: Artifact[] = [];
      const panels: PanelKey[] = [];
      const errors: string[] = [];
      const memory = { saved: 0, forgotten: 0 };
      let calls = 0;
      const conversationForAgent = convId;

      const addStep = (label: string) => patchDraft((m) => ({ ...m, steps: [...(m.steps ?? []), { label, state: 'running' }] }));
      const finishStep = (index: number, state: ChatStep['state']) =>
        patchDraft((m) => ({ ...m, steps: (m.steps ?? []).map((s, i) => (i === index ? { ...s, state } : s)) }));
      let stepCount = 0;
      const pushStep = (label: string) => {
        addStep(label);
        return stepCount++;
      };

      /**
       * Laço do agente: pergunta → ações → resultados → nova rodada, até o agente
       * responder sem ações ou acabar o limite de rodadas (aí ele responde com o que tem).
       */
      const runLoop = async (opts: { plan?: ChatPlanState; show: boolean }) => {
        const replies: string[] = [];
        let toolResults: ToolResult[] = [];
        let planAction: ChatPlanAction | undefined;
        for (let round = 0; round <= MAX_TOOL_ROUNDS && calls < MAX_AGENT_CALLS; round++) {
          const last = round === MAX_TOOL_ROUNDS || calls === MAX_AGENT_CALLS - 1;
          calls++;
          const turn = await callAgent(
            round === 0 ? history : [...history, { role: 'assistant' as const, content: replies.join('\n\n') || '(executando ferramentas)' }],
            round === 0 ? [] : toolResults,
            { conversationId: conversationForAgent, final: round > 0 && last, plan: opts.plan },
          );
          if (turn.memory) {
            memory.saved += turn.memory.saved;
            memory.forgotten += turn.memory.forgotten;
          }
          if (turn.reply) replies.push(turn.reply);
          if (opts.show) patchDraft((m) => ({ ...m, text: replies.join('\n\n') }));
          const plan = !opts.plan && round === 0 ? turn.actions.find((a): a is ChatPlanAction => a.tool === 'plan') : undefined;
          if (plan) {
            planAction = plan;
            break;
          }
          const actions = turn.actions.filter((a) => a.tool !== 'plan');
          if (actions.length === 0 || last) break;

          let followUp = false;
          for (const action of actions) {
            const step = pushStep(actionLabel(action));
            const outcome = await runAction(action, {
              userId: user.id,
              artifacts: [...known, ...made],
              newId: () => nextArtifactId([...known, ...made]),
              approveApi,
              onAppPreview: setLivePreview,
              appBlockedReason: () => {
                const plan = planRef.current;
                if (!plan.subscription?.is_active && !plan.canEdit) return 'Construir aplicativos precisa de um plano ativo. Veja os planos em Preços.';
                if (!plan.canEdit) return 'Suas edições do plano acabaram. Recarregue para continuar construindo.';
                return null;
              },
              chargeAppEdit: () => planRef.current.incrementEdit(),
              setChatOnly: (value) => optionsRef.current.onChatOnly(value),
            });
            if (action.tool === 'app') setLivePreview(null);
            // Resultados acumulam entre rodadas (ex.: a busca continua visível quando o agente lê uma página).
            toolResults = [...toolResults, outcome.result].slice(-8);
            if (outcome.needsFollowUp) followUp = true;
            if (outcome.error) errors.push(outcome.error);
            if (outcome.panel && !panels.includes(outcome.panel)) panels.push(outcome.panel);
            if (outcome.artifact) {
              // Uma edição devolve o mesmo id: substitui a versão anterior desta mensagem.
              const at = made.findIndex((a) => a.id === outcome.artifact!.id);
              if (at >= 0) made[at] = outcome.artifact;
              else made.push(outcome.artifact);
              optionsRef.current.onArtifact(outcome.artifact);
            }
            finishStep(step, outcome.error ? 'error' : 'done');
            patchDraft((m) => ({ ...m, extras: { artifacts: [...made], panels: [...panels], errors: [...errors] } }));
            if (outcome.panel) optionsRef.current.onOpenPanel(outcome.panel, outcome.figcraft);
          }
          if (!followUp) break;
        }
        return { replies, planAction };
      };

      const first = await runLoop({ show: true });
      let replies = first.replies;

      // Modo plano (motor do Vibe Code): uma tarefa por vez, depois a síntese revisada.
      if (first.planAction) {
        let state = initPlanState(first.planAction);
        const intro = first.replies.join('\n\n');
        const total = state.tasks.length;
        while (state.phase === 'execute' && state.current !== undefined && calls < MAX_AGENT_CALLS - 1) {
          const task = state.tasks.find((t) => t.id === state.current)!;
          const position = state.tasks.filter((t) => t.status !== 'pending').length + 1;
          const step = pushStep(`Etapa ${position}/${total}: ${task.title}`);
          const run = await runLoop({ plan: state, show: false });
          const result = run.replies.join(' ').trim();
          const ok = result.length > 0;
          finishStep(step, ok ? 'done' : 'error');
          state = completePlanTask(state, task.id, ok, result || 'Sem resultado.');
        }
        if (state.phase !== 'final') state = { ...state, current: undefined, phase: 'final' };
        const finalStep = pushStep('Revisando e escrevendo a resposta final');
        const synthesis = calls < MAX_AGENT_CALLS ? await runLoop({ plan: state, show: false }) : { replies: [] as string[] };
        finishStep(finalStep, synthesis.replies.length ? 'done' : 'error');
        const doneTitles = state.tasks.filter((t) => t.status === 'done').map((t) => t.title);
        const trail = doneTitles.length ? `\n\n_Feito em ${doneTitles.length} etapa(s): ${doneTitles.join(' → ')}._` : '';
        replies = synthesis.replies.length ? [`${synthesis.replies.join('\n\n')}${trail}`] : [intro, 'Não consegui concluir todas as etapas do plano.'].filter(Boolean);
      }

      const finalText = replies.join('\n\n') || (made.length ? 'Pronto.' : errors.length ? 'Não consegui concluir.' : '…');
      const extras: MessageExtras = { artifacts: made, panels, errors };
      patchDraft((m) => ({
        ...m, text: finalText, extras, steps: undefined, pending: false,
        ...(memory.saved || memory.forgotten ? { memory: { ...memory } } : {}),
      }));
      await conversationService.addMessage(convId, 'assistant', encodeMessage(finalText, extras));
      void refreshConversations();
      void refetchCredits();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível responder agora.';
      setError(message);
      // Sem resposta: tira o rascunho; a mensagem do usuário fica para ele tentar de novo.
      setMessages((list) => list.filter((m) => m.id !== draftId || m.text || m.extras.artifacts.length > 0).map((m) => (m.id === draftId ? { ...m, steps: undefined, pending: false } : m)));
    } finally {
      setLivePreview(null);
      setBusy(false);
    }
  }, [approveApi, busy, refetchCredits, refreshConversations, user?.id]);

  /** Troca um artefato já entregue (ex.: imagem com URL renovada). */
  const replaceArtifact = useCallback((artifact: Artifact) => {
    setMessages((list) =>
      list.map((m) =>
        m.extras.artifacts.some((a) => a.id === artifact.id)
          ? { ...m, extras: { ...m.extras, artifacts: m.extras.artifacts.map((a) => (a.id === artifact.id ? artifact : a)) } }
          : m,
      ),
    );
  }, []);

  /** Executa uma ação diretamente (sem passar por conversação com agente). */
  const execute = useCallback(async (action: AgentAction) => {
    const outcome = await runAction(action, {
      userId: user?.id ?? '',
      artifacts: messagesRef.current.flatMap((m) => m.extras.artifacts),
      newId: () => nextArtifactId(messagesRef.current.flatMap((m) => m.extras.artifacts)),
      approveApi,
      onAppPreview: setLivePreview,
      appBlockedReason: () => {
        const plan = planRef.current;
        if (!plan.subscription?.is_active && !plan.canEdit) return 'Construir aplicativos precisa de um plano ativo. Veja os planos em Preços.';
        if (!plan.canEdit) return 'Suas edições do plano acabaram. Recarregue para continuar construindo.';
        return null;
      },
      chargeAppEdit: () => planRef.current.incrementEdit(),
      setChatOnly: (value) => optionsRef.current.onChatOnly(value),
    });
    if (outcome.panel) optionsRef.current.onOpenPanel(outcome.panel);
    if (outcome.artifact) optionsRef.current.onArtifact(outcome.artifact);
  }, [approveApi, user?.id]);

  return {
    messages, busy, error, clearError: () => setError(null),
    conversationId, conversations, loadingConversation,
    newConversation, openConversation, removeConversation, renameConversation, pinConversation,
    send, approval, livePreview, replaceArtifact, execute,
    credits: editsRemaining,
  };
}
