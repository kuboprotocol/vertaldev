import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Brain,
  FileCode2,
  FileEdit,
  GitCommit,
  Loader2,
  Plug,
  AlertCircle,
  CheckCircle2,
  Send,
  Undo2,
  Eye,
  MessageSquare,
  ChevronRight,
  Bot,
  Rocket,
  Zap,
  BookmarkCheck,
  Gauge,
  Database,
  HelpCircle,
  ShieldCheck,
  MessagesSquare,
  Palette,
  ChevronDown,
  KeyRound,
  Sparkles,
  Bug,
  Terminal,
  ListChecks,
  FileDiff,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import { activitySteps, collectCodeFiles, replyOf, type CodeFile } from "@/lib/vibeCodeFiles";
import { VibeCodeBox } from "./VibeCodeBox";
import { VibeConnectorPanel } from "./VibeConnectorPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { GlowPromptFrame } from "@/components/vibe-code/GlowPromptFrame";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VibeChatMessage, VibePlanRequest, VibePlanState, VibeStep, VibeStepKind } from "@/lib/vibeCodeAgentTypes";
import type { VibeConversationsApi } from "@/hooks/useVibeConversations";
import { VibeConversationList } from "./VibeConversationList";
import { VibeRequirementsCard } from "./VibeRequirementsCard";
import { VibeFixQueueCard } from "./VibeFixQueueCard";
import { VibePlanPanel } from "./VibePlanPanel";
import { VibeStagedChanges } from "./VibeStagedChanges";
import { hashText, SEVERITY_LABEL, type DevContext, type ReviewCommand, type ReviewFinding, type ReviewPayload } from "@/lib/vibeReview/engine";
import {
  currentFixItem,
  emptyFixQueue,
  fixQueueReducer,
  isQueueActive,
  prepareApply,
} from "@/lib/vibeReview/fixQueue";
import { matchSlashHints, parseSlashCommand, SLASH_COMMANDS } from "@/lib/vibeReview/slashCommands";
import { errorsFromMessages, previewErrorStore, usePreviewErrors } from "@/lib/vibeReview/previewErrors";
import { matchPlanSlashHints, parsePlanSlash, type ParsedPlanSlash } from "@/lib/vibePlan/planSlashCommands";
import { runAllDecision } from "@/lib/vibePlan/runAll";
import { createWriterLock, WriterBusyError } from "@/lib/vibePlan/writerLock";
import type { WriterKind } from "@/lib/vibePlan/engine";

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vibe-code-agent`;

/** Passos que "Executar todas" dá antes de parar para o Dev conferir. */
const RUN_ALL_MAX_STEPS = 20;

/** Quem grava em cada ação do plano (a trava do navegador espelha a do servidor). */
const PLAN_WRITER: Partial<Record<VibePlanRequest["action"], WriterKind>> = {
  apply: "manual",
  reject: "manual",
  stage_edit: "fix_queue",
  debug: "debug",
  rewind: "rewind",
};

/** Hash da versão que a correção usou como base ("" = arquivo novo), igual ao do servidor. */
const baseHashOf = (content: string | undefined) => (content ? hashText(content) : "");

/** Lê as linhas "data: {...}" de um corpo SSE já completo. */
function parseSseEvents(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.startsWith("data: ")) continue;
    try {
      out.push(JSON.parse(line.slice(6)));
    } catch {
      /* quadro parcial */
    }
  }
  return out;
}

const STEP_ICON: Record<VibeStepKind, typeof Brain> = {
  thinking: Brain,
  plan: MessageSquare,
  estimate: Gauge,
  read_file: FileCode2,
  edit_file: FileEdit,
  diff: Eye,
  commit: GitCommit,
  checkpoint: BookmarkCheck,
  credits: Zap,
  connector: Plug,
  message: MessageSquare,
  memory: Database,
  conversation: MessageSquare,
  requirements: Plug,
  question: HelpCircle,
  review: ShieldCheck,
  review_findings: ShieldCheck,
  plan_state: ListChecks,
  staged: FileDiff,
  design: Palette,
  reply: MessageSquare,
  error: AlertCircle,
  done: CheckCircle2,
};

/** Links https viram clicáveis; a pontuação final da frase fica fora do link. */
function Linkified({ text }: { text: string }) {
  const pieces = text.split(/(https:\/\/[^\s<>"'`]+)/g);
  return (
    <>
      {pieces.map((p, i) => {
        if (!p.startsWith("https://")) return <span key={i}>{p}</span>;
        const trail = p.match(/[.,;:!?)]+$/)?.[0] ?? "";
        const href = trail ? p.slice(0, -trail.length) : p;
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline-offset-2 hover:underline">
              {href}
            </a>
            {trail}
          </span>
        );
      })}
    </>
  );
}

/** Texto da resposta com `código` destacado, links clicáveis e quebras de linha preservadas. */
function ReplyText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-primary">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Linkified key={i} text={p} />
        ),
      )}
    </p>
  );
}

export function VibeCodeAgentChat({
  projectId,
  conversations,
  onOpenFile,
  openedPath,
}: {
  projectId?: string;
  conversations: VibeConversationsApi;
  /** Leva o usuário ao local do código quando ele toca numa caixinha. */
  onOpenFile?: (file: CodeFile) => void;
  openedPath?: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const { messages, setMessages, setActiveId, refresh, open, startNew } = conversations;
  const activeIdRef = useRef<string | null>(conversations.activeId);
  activeIdRef.current = conversations.activeId;
  const activeTitle = conversations.conversations.find((c) => c.id === conversations.activeId)?.title;
  const [pickerOpen, setPickerOpen] = useState(false);

  const openConversation = useCallback(
    async (id: string) => {
      setPickerOpen(false);
      try {
        await open(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível abrir a conversa.");
      }
    },
    [open],
  );

  const newConversation = useCallback(() => {
    setPickerOpen(false);
    startNew();
  }, [startNew]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Vibe Reviewer (PR-Agent): fila de correções "um a um, conversando com o Dev".
  const [queue, dispatchQueue] = useReducer(fixQueueReducer, emptyFixQueue);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const previewErrors = usePreviewErrors();
  const slashHints = useMemo(
    () => [
      ...matchPlanSlashHints(input).map((c) => ({ name: c.name, argHint: c.argHint, description: c.description })),
      ...matchSlashHints(input),
    ],
    [input],
  );
  /** Recebe os resultados "review_findings" do stream. */
  const reviewEventRef = useRef<(payload: ReviewPayload) => void>(() => {});

  /** Alvo da fila atual: correções da revisão do diff staged vão para o staged, não para o projeto. */
  const queueTargetRef = useRef<"project" | "staged">("project");
  const startQueue = useCallback((payload: ReviewPayload) => {
    queueTargetRef.current = payload.target === "staged" ? "staged" : "project";
    dispatchQueue({ type: "start", payload });
  }, []);

  // Plano/executor: grafo de tarefas + mudanças staged desta conversa.
  const [planState, setPlanStateRaw] = useState<VibePlanState | null>(null);
  const planStateRef = useRef<VibePlanState | null>(null);
  const setPlanState = useCallback((s: VibePlanState | null) => {
    planStateRef.current = s;
    setPlanStateRaw(s);
  }, []);
  const [planOpen, setPlanOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const runAllCancelRef = useRef(false);
  /** "Executar todas" parou esperando o Dev aplicar as mudanças staged; segue depois do Aplicar. */
  const runAllResumeRef = useRef(false);
  /** Um escritor por vez nesta conversa (executor, fila de correções, aplicar manual). */
  const writerLock = useMemo(() => createWriterLock(), []);

  /** Roda `fn` como único escritor; ocupado = aviso em pt-BR e nada é enviado. */
  const withWriter = useCallback(
    async <T,>(kind: WriterKind, fn: () => Promise<T>, opts?: { wait?: boolean }): Promise<T | undefined> => {
      try {
        return await writerLock.run(kind, fn, opts?.wait ? { wait: true, timeoutMs: 120_000 } : undefined);
      } catch (e) {
        if (e instanceof WriterBusyError) {
          toast.error(e.message);
          return undefined;
        }
        throw e;
      }
    },
    [writerLock],
  );

  /** Conversa aberta pelo próprio stream (ex.: /plano numa conversa nova): o estado chega pelo stream. */
  const streamOpenedRef = useRef<string | null>(null);

  // Trocar de conversa fecha a fila da conversa anterior e recarrega o plano dela.
  useEffect(() => {
    if (conversations.activeId && conversations.activeId === streamOpenedRef.current) return;
    dispatchQueue({ type: "close" });
    runAllCancelRef.current = true;
    runAllResumeRef.current = false;
    setPlanState(null);
    const convId = conversations.activeId;
    if (!convId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const resp = await fetch(AGENT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ projectId, conversationId: convId, plan: { action: "state" } satisfies VibePlanRequest }),
        });
        if (!resp.ok) return;
        const events = parseSseEvents(await resp.text());
        const last = [...events].reverse().find((e) => (e.kind === "plan_state" || e.kind === "staged") && e.planState);
        if (!cancelled && last && activeIdRef.current === convId) {
          const loaded = last.planState as VibePlanState;
          setPlanState(loaded);
          if (loaded.graph?.tasks.length) setPlanOpen(true);
        }
      } catch {
        /* sem plano: o painel só aparece com /plano */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations.activeId, projectId, setPlanState]);

  /** Arquivos que o agente tocou nesta conversa: o "PR" que o revisor olha primeiro. */
  const conversationFiles = useMemo(() => {
    const paths = new Set<string>();
    for (const m of messages) for (const f of collectCodeFiles(m.steps)) paths.add(f.path);
    return [...paths];
  }, [messages]);

  const knownErrors = useCallback(
    () => [...previewErrorStore.list().map((e) => e.message), ...errorsFromMessages(messages)],
    [messages],
  );

  /** Contexto do Dev que vai em todo pedido: erros, arquivo aberto e decisões da fila. */
  const buildDevContext = useCallback(
    (): DevContext => ({
      recentErrors: knownErrors().slice(-5),
      openedPath: openedPath ?? null,
      decisions: queueRef.current.decisions,
      conversationFiles,
    }),
    [knownErrors, openedPath, conversationFiles],
  );

  const pendingEdits = useMemo(() => {
    const last = messages[messages.length - 1];
    return (last?.steps ?? []).filter((s) => s.kind === "diff" && s.proposedContent);
  }, [messages]);

  const pushStep = useCallback((messageId: string, step: VibeStep) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const steps = [...(m.steps ?? [])];
        const idx = steps.findIndex(
          (s) => s.status === "running" && s.kind === step.kind && s.title.split(" ").pop() === step.title.split(" ").pop(),
        );
        if (idx >= 0 && step.status !== "running") steps[idx] = { ...steps[idx], ...step, finishedAt: Date.now() };
        else steps.push(step);
        return { ...m, steps };
      }),
    );
  }, [setMessages]);

  const runStream = useCallback(
    async (payload: Record<string, unknown>, assistantId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Entre na sua conta para usar o agente.");
        return { ok: false };
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const resp = await fetch(AGENT_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ projectId, conversationId: activeIdRef.current ?? undefined, ...payload }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        pushStep(assistantId, {
          id: crypto.randomUUID(),
          kind: "error",
          status: "failed",
          title: "Agent request failed",
          detail: text || `HTTP ${resp.status}`,
          startedAt: Date.now(),
        });
        return { ok: false };
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed = false;
      let continueNext = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.kind === "conversation" && typeof evt.conversationId === "string") {
              activeIdRef.current = evt.conversationId;
              streamOpenedRef.current = evt.conversationId;
              setActiveId(evt.conversationId);
            }
            if (evt.kind === "error") failed = true;
            if (evt.kind === "review_findings" && evt.review && typeof evt.review === "object") {
              reviewEventRef.current(evt.review as ReviewPayload);
            }
            if ((evt.kind === "plan_state" || evt.kind === "staged") && evt.planState && typeof evt.planState === "object") {
              setPlanState(evt.planState as VibePlanState);
              if (evt.continueNext === true) continueNext = true;
            }
            pushStep(assistantId, {
              id: crypto.randomUUID(),
              startedAt: Date.now(),
              ...evt,
            } as VibeStep);
          } catch {
            /* ignore partial frame */
          }
        }
      }
      return { ok: !failed, continueNext };
    },
    [projectId, pushStep, setActiveId, setPlanState],
  );

  /** Roda um comando do Vibe Reviewer e mostra o pedido do Dev como mensagem. */
  const runReview = useCallback(
    async (
      command: ReviewCommand,
      label: string,
      extra: { focus?: string; question?: string; errors?: string[]; finding?: ReviewFinding; comment?: string; fileContent?: string } = {},
    ) => {
      const assistantId = crypto.randomUUID();
      setRunning(true);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: label, createdAt: Date.now() },
        { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
      ]);
      try {
        return await runStream(
          {
            prompt: label,
            review: { command, paths: conversationFiles, ...extra },
            devContext: buildDevContext(),
          },
          assistantId,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "O revisor falhou");
        return { ok: false };
      } finally {
        setRunning(false);
        abortRef.current = null;
        void refresh();
      }
    },
    [buildDevContext, conversationFiles, refresh, runStream, setMessages],
  );

  const startReview = useCallback(
    (command: "review" | "improve" | "describe", focus = "") => {
      const name = SLASH_COMMANDS.find((c) => c.command === command)?.name ?? `/${command}`;
      reviewEventRef.current = startQueue;
      return runReview(command, focus ? `${name} ${focus}` : name, { focus: focus || undefined });
    },
    [runReview, startQueue],
  );

  const fixErrors = useCallback(
    (pasted = "") => {
      const errors = [...(pasted ? [pasted] : []), ...knownErrors()].slice(0, 10);
      if (!errors.length) {
        setInput("/fix ");
        toast.info("Não vi erros no preview nem nas últimas respostas. Cole o erro depois de /fix e envie.");
        return;
      }
      if (pasted) previewErrorStore.add(pasted, "manual");
      reviewEventRef.current = startQueue;
      const label = pasted ? `/fix ${pasted}` : `/fix — corrigir ${errors.length} erro(s) um a um`;
      return runReview("fix_errors", label, { errors });
    },
    [knownErrors, runReview, startQueue],
  );

  const askAboutCurrent = useCallback(
    (question: string) => {
      const item = currentFixItem(queueRef.current);
      reviewEventRef.current = () => {};
      return runReview("ask", question, { question, finding: item?.finding });
    },
    [runReview],
  );

  const applyCurrentFix = useCallback(async () => {
    if (running) return;
    const item = currentFixItem(queueRef.current);
    const prepared = prepareApply(queueRef.current);
    if (!item) return;
    if ("reason" in prepared) {
      dispatchQueue({ type: "apply_start" });
      dispatchQueue({ type: "apply_failed", error: `Não consegui aplicar: ${prepared.reason}. Use Ajustar para eu refazer, ou Pular.` });
      return;
    }
    dispatchQueue({ type: "apply_start" });
    setRunning(true);
    const assistantId = crypto.randomUUID();
    const { position, total } = { position: queueRef.current.index + 1, total: queueRef.current.items.length };
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: `Aplicar ${position}/${total}: ${item.finding.title} (${item.finding.path})`, createdAt: Date.now() },
      { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
    ]);
    const toStaged = queueTargetRef.current === "staged";
    try {
      // Correção da revisão do diff staged: edita a mudança staged (o projeto fica intacto).
      // Correção no projeto: vai com o hash da versão que o revisor leu (recusa se mudou por baixo).
      const baseHash = baseHashOf(queueRef.current.files[prepared.path]);
      const res = await withWriter("fix_queue", () =>
        runStream(
          toStaged
            ? { prompt: `Correção staged: ${prepared.path}`, plan: { action: "stage_edit", path: prepared.path, content: prepared.content } satisfies VibePlanRequest }
            : { apply: [{ path: prepared.path, content: prepared.content, baseHash }] },
          assistantId,
        ),
      );
      if (!res) dispatchQueue({ type: "apply_failed", error: "Outra ação está gravando nesta conversa. Espere terminar e tente de novo." });
      else if (res.ok) dispatchQueue({ type: "apply_success", content: prepared.content });
      else dispatchQueue({ type: "apply_failed", error: toStaged ? "Não consegui corrigir a mudança staged. Veja acima e tente de novo, ajuste ou pule." : "O commit falhou. Veja o que o agente fez acima e tente de novo, ajuste ou pule." });
    } catch (e) {
      dispatchQueue({ type: "apply_failed", error: e instanceof Error ? e.message : "Falha ao aplicar" });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, runStream, setMessages, withWriter]);

  const adjustCurrentFix = useCallback(
    async (comment: string) => {
      const state = queueRef.current;
      const item = currentFixItem(state);
      if (!item || running) return;
      dispatchQueue({ type: "adjust_start", comment });
      let got = false;
      reviewEventRef.current = (payload) => {
        if (payload.command !== "adjust" || !payload.findings[0]) return;
        got = true;
        dispatchQueue({ type: "adjust_result", finding: payload.findings[0], fileContent: payload.files?.[item.finding.path] });
      };
      await runReview("adjust", `Ajustar ${state.index + 1}/${state.items.length}: ${comment}`, {
        finding: item.finding,
        comment,
        fileContent: state.files[item.finding.path],
      });
      if (!got) dispatchQueue({ type: "adjust_failed", error: "Não consegui refazer a correção. Tente explicar de outro jeito, ou pule este item." });
    },
    [running, runReview],
  );

  /** Uma ação do plano/executor: mostra o pedido do Dev e segue o stream (plan_state, staged, revisão). */
  const runPlan = useCallback(
    async (req: VibePlanRequest, label: string, opts: { wait?: boolean } = {}): Promise<{ ok: boolean; continueNext?: boolean }> => {
      const exec = async () => {
        const assistantId = crypto.randomUUID();
        setRunning(true);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", content: label, createdAt: Date.now() },
          { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
        ]);
        // A revisão do diff staged chega como review_findings com alvo "staged".
        reviewEventRef.current = startQueue;
        try {
          return await runStream({ prompt: label, plan: req, devContext: buildDevContext() }, assistantId);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "O plano falhou");
          return { ok: false };
        } finally {
          setRunning(false);
          abortRef.current = null;
          void refresh();
        }
      };
      if (req.action === "state") return exec();
      const res = await withWriter(PLAN_WRITER[req.action] ?? "executor", exec, opts);
      return res ?? { ok: false };
    },
    [buildDevContext, refresh, runStream, setMessages, startQueue, withWriter],
  );

  /** "Executar todas (semi-autônomo)": uma tarefa por pedido, parando pela regra de runAll.ts. */
  const runAll = useCallback(async () => {
    if (runningAll) return;
    runAllCancelRef.current = false;
    runAllResumeRef.current = false;
    setRunningAll(true);
    setPlanOpen(true);
    let iterations = 0;
    let lastOk = true;
    try {
      for (;;) {
        const decision = runAllDecision(planStateRef.current, { iterations, maxIterations: RUN_ALL_MAX_STEPS, lastOk, cancelled: runAllCancelRef.current });
        if (decision.stop) {
          if (decision.reason === "awaiting_approval") runAllResumeRef.current = true;
          if (decision.reason === "error" || decision.reason === "blocked") toast.error(decision.message);
          else toast.info(decision.message);
          break;
        }
        const res = await runPlan({ action: "next" }, iterations ? "/proxima (sequência)" : "/executar", { wait: true });
        iterations++;
        lastOk = res.ok;
      }
    } finally {
      setRunningAll(false);
    }
  }, [runPlan, runningAll]);

  const stopAll = useCallback(() => {
    runAllCancelRef.current = true;
    runAllResumeRef.current = false;
    abortRef.current?.abort();
  }, []);

  const applyStaged = useCallback(
    async (paths?: string[]) => {
      const res = await runPlan({ action: "apply", ...(paths?.length ? { paths } : {}) }, paths?.length ? `/aplicar ${paths.join(" ")}` : "/aplicar");
      // A sequência segue sozinha quando o Dev aprovou tudo que estava staged.
      if (res.ok && runAllResumeRef.current && !planStateRef.current?.staged.length) void runAll();
      return res;
    },
    [runAll, runPlan],
  );

  const rejectStaged = useCallback(
    (paths?: string[]) => {
      runAllResumeRef.current = false;
      return runPlan({ action: "reject", ...(paths?.length ? { paths } : {}) }, paths?.length ? `/rejeitar ${paths.join(" ")}` : "/rejeitar");
    },
    [runPlan],
  );

  const setPlanConfig = useCallback(
    (patch: { autonomy?: VibePlanRequest["autonomy"]; modelPack?: VibePlanRequest["modelPack"] }) => {
      const label = patch.autonomy ? `/autonomia ${patch.autonomy}` : `/pacote ${patch.modelPack}`;
      return runPlan({ action: "config", ...patch }, label);
    },
    [runPlan],
  );

  /** Comandos de barra do plano (/plano /tarefas /proxima /executar /aplicar …). */
  const runPlanSlash = useCallback(
    async (cmd: ParsedPlanSlash, raw: string) => {
      const fileArg = cmd.arg && !cmd.all && !cmd.taskId ? cmd.arg.split(/\s+/).filter(Boolean) : undefined;
      switch (cmd.def.kind) {
        case "plan":
          setPlanOpen(true);
          return runPlan({ action: "create", prompt: cmd.arg }, raw);
        case "tasks":
          setPlanOpen(true);
          if (!planStateRef.current) return runPlan({ action: "state" }, raw);
          return;
        case "next":
          setPlanOpen(true);
          return runPlan({ action: "next", ...(cmd.taskId ? { taskId: cmd.taskId } : {}) }, raw);
        case "run":
          return runAll();
        case "apply":
          return applyStaged(fileArg);
        case "reject":
          return rejectStaged(fileArg);
        case "rewind":
          return runPlan({ action: "rewind" }, raw);
        case "debug": {
          const errors = [...(cmd.arg ? [cmd.arg] : []), ...knownErrors()].slice(0, 8);
          return runPlan({ action: "debug", ...(errors.length ? { errors } : {}) }, raw);
        }
        case "autonomy":
          if (!cmd.autonomy) {
            toast.info("Use /autonomia manual | basico | basico+ | semi | autonomo.");
            return;
          }
          return runPlan({ action: "config", autonomy: cmd.autonomy }, raw);
        case "pack":
          if (!cmd.modelPack) {
            toast.info("Use /pacote economico | equilibrado | forte.");
            return;
          }
          return runPlan({ action: "config", modelPack: cmd.modelPack }, raw);
        case "expand":
          return runPlan({ action: "expand", ...(cmd.taskId ? { taskId: cmd.taskId } : {}) }, raw);
      }
    },
    [applyStaged, knownErrors, rejectStaged, runAll, runPlan],
  );

  const openQueueFile = useCallback(
    (path: string) => {
      onOpenFile?.({
        path,
        content: queueRef.current.files[path] ?? null,
        diff: null,
        reason: null,
        status: "committed",
        commitSha: null,
        repoUrl: null,
        stepId: "vibe-review",
      });
    },
    [onOpenFile],
  );

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || running) return;

    // Comandos de barra do plano/executor (/plano, /proxima, /aplicar …).
    const planSlash = parsePlanSlash(prompt);
    if (planSlash) {
      if (planSlash.def.argRequired && !planSlash.arg) {
        toast.info(`Escreva ${planSlash.def.argHint ?? "o texto"} depois de ${planSlash.def.name}.`);
        return;
      }
      setInput("");
      await runPlanSlash(planSlash, prompt);
      return;
    }

    // Comandos de barra do Vibe Reviewer (/review, /improve, /fix, /describe, /ask).
    const slash = parseSlashCommand(prompt);
    if (slash) {
      if (slash.def.argRequired && !slash.arg) {
        toast.info(`Escreva ${slash.def.argHint ?? "o texto"} depois de ${slash.def.name}.`);
        return;
      }
      setInput("");
      if (slash.def.command === "fix_errors") await fixErrors(slash.arg);
      else if (slash.def.command === "ask") await askAboutCurrent(slash.arg);
      else await startReview(slash.def.command, slash.arg);
      return;
    }

    // Fila ativa: a mensagem do Dev vira uma pergunta sobre o item da vez.
    if (isQueueActive(queueRef.current)) {
      setInput("");
      await askAboutCurrent(prompt);
      return;
    }

    setInput("");
    setRunning(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: Date.now() },
      { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
    ]);

    try {
      const call = () => runStream({ prompt, mode: autoApply ? "apply" : "preview", devContext: buildDevContext() }, assistantId);
      if (autoApply) await withWriter("manual", call);
      else await call();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Agent failed");
    } finally {
      setRunning(false);
      abortRef.current = null;
      void refresh();
    }
  };

  const applyPending = async () => {
    if (!pendingEdits.length || running) return;
    setRunning(true);
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
    ]);
    try {
      const res = await withWriter("manual", () =>
        runStream(
          {
            apply: pendingEdits.map((s) => ({ path: s.path!, content: s.proposedContent! })),
          },
          assistantId,
        ),
      );
      if (res?.ok) toast.success("Alterações commitadas.");
    } finally {
      setRunning(false);
    }
  };

  const revertStep = async (step: VibeStep) => {
    if ((!step.commitSha && !step.checkpointId) || running) return;
    setRunning(true);
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
    ]);
    try {
      const res = await withWriter("rewind", () =>
        runStream(
          step.checkpointId ? { revertCheckpointId: step.checkpointId } : { revertSha: step.commitSha },
          assistantId,
        ),
      );
      if (!res?.ok) return;
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          steps: (m.steps ?? []).map((s) => (s.id === step.id ? { ...s, reverted: true } : s)),
        })),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/40 bg-[#080808]/80 backdrop-blur-xl transition-all">
      <div className="flex items-center justify-between border-b border-border/40 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-[0_0_10px_rgba(201,148,26,0.2)]">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground/90">Vibe Code Agent</h2>
            <div className="flex items-center gap-1.5">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-medium text-muted-foreground/80">Active in Branch: main</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {planState?.graph && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-border/30 px-2 text-[10px]"
              onClick={() => setPlanOpen((v) => !v)}
              aria-pressed={planOpen}
              aria-label="Plano"
            >
              <ListChecks className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Plano</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-border/30 px-2 text-[10px]"
            onClick={() => setConnectorsOpen(true)}
            aria-label="Conectores e chaves"
          >
            <Plug className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Conectores</span>
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 max-w-[150px] gap-1.5 border-border/30 px-2 text-[10px]">
                <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{activeTitle ?? "Conversas"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="h-80 w-72 p-3">
              <VibeConversationList api={conversations} onSelect={(id) => void openConversation(id)} onNew={newConversation} disabled={running} className="h-full" />
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 border border-border/20">
            <Label htmlFor="auto-apply" className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
              Auto-Commit
            </Label>
            <Switch id="auto-apply" checked={autoApply} onCheckedChange={setAutoApply} className="scale-75" />
          </div>
        </div>
      </div>

      {/* Radix sets the viewport content to display:table, which lets long lines widen the
          whole transcript past the card; force block so the content keeps the viewport width. */}
      <ScrollArea className="min-h-0 flex-1 px-4 py-6 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="relative space-y-6">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Converse com o agente: descreva o que quer construir ou pergunte algo. Ele responde aqui, guarda tudo nesta
              conversa, entrega o código em caixinhas que você toca para abrir o arquivo e avisa de quais conectores e
              chaves de API a aplicação precisa.
            </p>
          )}

          {messages.map((m, index) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end pb-4">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-foreground shadow-lg shadow-primary/5">
                    {m.content}
                  </div>
                </div>
              );
            }

            const reply = replyOf(m);
            const files = collectCodeFiles(m.steps);
            const activity = activitySteps(m.steps);
            const requirementsStep = activity.find((s) => s.kind === "requirements" && s.requirements?.length);
            const live = running && index === messages.length - 1;
            const showActivity = live || expanded.has(m.id);

            return (
              <div key={m.id} className="space-y-3" data-testid="vibe-assistant-message">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border/40 bg-card/50 px-4 py-3">
                    {reply ? (
                      <ReplyText text={reply} />
                    ) : live ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Trabalhando no seu pedido…
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {files.length ? "Alterações prontas." : "Sem resposta em texto nesta mensagem."}
                      </p>
                    )}
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2 pl-8" data-testid="vibe-code-boxes">
                    {files.map((f) => (
                      <VibeCodeBox key={f.path} file={f} active={openedPath === f.path} onOpen={(file) => onOpenFile?.(file)} />
                    ))}
                  </div>
                )}

                {(() => {
                  const reviewStep = [...(m.steps ?? [])].reverse().find(
                    (s) => s.kind === "review_findings" && s.review && s.review.command !== "adjust" && s.review.findings.length,
                  );
                  if (!reviewStep?.review) return null;
                  return (
                    <div className="space-y-1 pl-8" data-testid="vibe-review-findings">
                      {reviewStep.review.findings.map((f, i) => (
                        <div key={f.id + i} className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-2.5 py-1.5 text-[11px]">
                          <span className="font-mono text-muted-foreground/70">{i + 1}.</span>
                          <Badge variant="outline" className="h-4 rounded px-1 text-[9px] uppercase text-muted-foreground">
                            {SEVERITY_LABEL[f.severity]}
                          </Badge>
                          <span className="truncate text-foreground/85">{f.title}</span>
                          <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground/60">
                            {f.path.split("/").pop()}
                            {f.startLine ? `:${f.startLine}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {requirementsStep?.requirements && (
                  <div className="pl-8">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                      <KeyRound className="h-3.5 w-3.5" /> {requirementsStep.title}
                    </p>
                    <VibeRequirementsCard requirements={requirementsStep.requirements} />
                  </div>
                )}

                {activity.length > 0 && (
                  <div className="pl-8">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(m.id)}
                      disabled={live}
                      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-80"
                      aria-expanded={showActivity}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showActivity ? "" : "-rotate-90"}`} />
                      {showActivity ? "Ocultar" : "Ver"} o que o agente fez ({activity.length} passo{activity.length > 1 ? "s" : ""})
                    </button>
                  </div>
                )}

                {showActivity && (
              <div className="space-y-3 pl-8">
                {activity.filter((step) => step.kind !== "requirements").map((step) => {
                  const Icon = STEP_ICON[step.kind] ?? Brain;
                  return (
                    <div
                      key={step.id}
                      className="group relative rounded-xl border border-border/40 bg-card/40 px-3 py-3 transition-all hover:bg-card/60"
                    >
                      <div className="flex items-center gap-2">
                        {step.status === "running" ? (
                          <div className="relative">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                          </div>
                        ) : (
                          <Icon
                            className={`h-4 w-4 ${
                              step.status === "failed" ? "text-rose-500" : "text-primary"
                            }`}
                          />
                        )}
                        <span className="text-sm font-medium tracking-tight text-foreground/90">
                          {step.title}
                        </span>
                        
                        {step.commitSha && (
                          <Badge variant="outline" className="h-4 rounded-md border-primary/20 bg-primary/5 px-1.5 text-[9px] font-mono text-primary uppercase">
                            {step.commitSha.slice(0, 7)}
                          </Badge>
                        )}

                        {step.tier && (
                          <Badge variant="outline" className="h-4 rounded-md border-border/30 px-1.5 text-[9px] uppercase text-muted-foreground/70">
                            {step.tier}
                          </Badge>
                        )}

                        {typeof step.creditsCharged === "number" && (
                          <Badge variant="outline" className="h-4 rounded-md border-rose-500/20 bg-rose-500/5 px-1.5 text-[9px] font-mono text-rose-400">
                            -{step.creditsCharged} cr.
                            {typeof step.balanceAfter === "number" ? ` · saldo ${step.balanceAfter}` : ""}
                          </Badge>
                        )}

                        {step.reverted && (
                          <Badge variant="secondary" className="h-4 rounded-md bg-rose-500/10 px-1.5 text-[9px] text-rose-500 uppercase">
                            reverted
                          </Badge>
                        )}
                        
                        {(step.commitSha || step.checkpointId) && !step.reverted && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-primary"
                            onClick={() => revertStep(step)}
                            disabled={running}
                          >
                            <Undo2 className="h-3 w-3" /> Revert
                          </Button>
                        )}
                      </div>
                      
                      {step.detail && (
                        <div className="mt-2 flex items-start gap-2 rounded-lg bg-black/40 p-2 font-mono text-[10px] text-muted-foreground/80">
                          <span className="text-primary/60 mt-0.5">$</span>
                          <p className="leading-relaxed">{step.detail}</p>
                        </div>
                      )}
                      
                    </div>
                  );
                })}
              </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {planState && planOpen && (
        <VibePlanPanel
          state={planState}
          busy={running}
          runningAll={runningAll}
          onRunNext={() => void runPlan({ action: "next" }, "/proxima")}
          onRunAll={() => void runAll()}
          onStopAll={stopAll}
          onConfig={(patch) => void setPlanConfig(patch)}
          onClose={() => setPlanOpen(false)}
        />
      )}

      {planState && planState.staged.length > 0 && (
        <VibeStagedChanges
          staged={planState.staged}
          busy={running}
          onApply={(paths) => void applyStaged(paths)}
          onReject={(paths) => void rejectStaged(paths)}
        />
      )}

      <VibeFixQueueCard
        state={queue}
        busy={running}
        onApply={() => void applyCurrentFix()}
        onSkip={() => dispatchQueue({ type: "skip" })}
        onAdjust={(comment) => void adjustCurrentFix(comment)}
        onAskAbout={() => void askAboutCurrent("Explique melhor este item: o que acontece se eu não corrigir, e a correção proposta é segura?")}
        onOpenFile={openQueueFile}
        onRestart={() => void startReview(queue.command === "improve" ? "improve" : "review")}
        onClose={() => dispatchQueue({ type: "close" })}
      />

      {pendingEdits.length > 0 && (
        <div className="flex animate-in fade-in slide-in-from-bottom-2 items-center justify-between border-t border-border/40 bg-primary/5 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Eye className="h-3 w-3" />
            </div>
            <span className="text-xs font-medium text-foreground/80">
              {pendingEdits.length} staged change{pendingEdits.length > 1 ? 's' : ''} ready
            </span>
          </div>
          <Button 
            size="sm" 
            onClick={applyPending} 
            disabled={running}
            className="h-8 gap-2 bg-primary px-4 text-xs font-bold uppercase text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
          >
            Deploy Changes <Rocket className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="border-t border-border/40 bg-white/[0.01] p-4">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" data-testid="vibe-quick-actions">
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 rounded-full border-border/30 bg-black/40 px-2.5 text-[10px] hover:border-primary/40 hover:text-primary"
            onClick={() => void startReview("review")}
            disabled={running}
          >
            <ShieldCheck className="h-3 w-3" /> Revisar código
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 rounded-full border-border/30 bg-black/40 px-2.5 text-[10px] hover:border-primary/40 hover:text-primary"
            onClick={() => void startReview("improve")}
            disabled={running}
          >
            <Sparkles className="h-3 w-3" /> Sugerir melhorias
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 rounded-full border-border/30 bg-black/40 px-2.5 text-[10px] hover:border-primary/40 hover:text-primary"
            onClick={() => void fixErrors()}
            disabled={running}
          >
            <Bug className="h-3 w-3" /> Corrigir erros um a um
            {previewErrors.length > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-500/20 px-1.5 font-mono text-[9px] text-rose-300">{previewErrors.length}</span>
            )}
          </Button>
        </div>
        <GlowPromptFrame active={running}>
        <div className="relative group">
          {slashHints.length > 0 && !running && (
            <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-border/40 bg-[#0b0b0b]/95 shadow-2xl backdrop-blur-xl" role="listbox" aria-label="Comandos">
              {slashHints.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setInput(`${c.name} `)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/5"
                >
                  <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-primary">{c.name}</span>
                    {c.argHint && <span className="ml-1.5 text-[10px] text-muted-foreground/60">{c.argHint}</span>}
                    <span className="block truncate text-[11px] text-muted-foreground">{c.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              isQueueActive(queue)
                ? "Pergunte sobre o item da vez, ou use os botões da fila…"
                : "Peça para criar, corrigir ou refatorar… ou digite / para comandos"
            }
            className="min-h-[60px] w-full resize-none border-border/20 bg-black/60 pl-3 pr-12 pt-3 text-xs font-medium placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
            disabled={running}
          />
          <Button 
            onClick={() => void send()} 
            disabled={running || !input.trim()} 
            size="icon"
            className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-[0_0_15px_rgba(201,148,26,0.1)]"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        </GlowPromptFrame>
        <p className="mt-2 text-center text-[9px] font-medium tracking-tight text-muted-foreground/40 uppercase">
          Cada conversa guarda memória e código · /plano /proxima /aplicar · /review /fix · commits reais via GitHub quando conectado
        </p>
      </div>

      <Sheet open={connectorsOpen} onOpenChange={setConnectorsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Conectores e chaves</SheetTitle>
            <SheetDescription>
              Conectores ligam o app a serviços. As chaves de API ficam guardadas no Cofre de segredos.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <VibeConnectorPanel projectId={projectId || undefined} />
            <Button asChild variant="outline" className="w-full justify-start gap-2">
              <Link to="/connectors">
                <Plug className="h-4 w-4" /> Todos os conectores
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

export default VibeCodeAgentChat;
