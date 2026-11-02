import { useCallback, useMemo, useRef, useState } from "react";
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
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VibeChatMessage, VibeStep, VibeStepKind } from "@/lib/vibeCodeAgentTypes";
import type { VibeConversationsApi } from "@/hooks/useVibeConversations";
import { VibeConversationList } from "./VibeConversationList";
import { VibeRequirementsCard } from "./VibeRequirementsCard";
import { cn } from "@/lib/utils";

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vibe-code-agent`;

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
  design: Palette,
  error: AlertCircle,
  done: CheckCircle2,
};

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border/60 bg-background/70 p-2 text-[11px] leading-relaxed font-mono">
      {diff.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+")
              ? "text-emerald-400"
              : line.startsWith("-")
              ? "text-rose-400"
              : "text-muted-foreground"
          }
        >
          {line}
        </div>
      ))}
    </pre>
  );
}

const SUGGESTIONS = [
  "Crie um app de agendamento com login e calendário",
  "Monte um painel de vendas com gráficos e exportação",
  "Crie uma loja com pagamento Pix e carrinho",
];

function StepRow({ step, disabled, onRevert }: { step: VibeStep; disabled: boolean; onRevert: (s: VibeStep) => void }) {
  const Icon = STEP_ICON[step.kind] ?? Brain;
  const failed = step.status === "failed";
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 text-xs">
        {step.status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : (
          <Icon className={cn("h-3.5 w-3.5 shrink-0", failed ? "text-rose-400" : "text-muted-foreground")} />
        )}
        <span className={cn("min-w-0 truncate", failed ? "text-rose-300" : "text-foreground/85")}>{step.title}</span>
        {step.commitSha && <span className="font-mono text-[10px] text-primary/80">{step.commitSha.slice(0, 7)}</span>}
        {typeof step.creditsCharged === "number" && (
          <span className="font-mono text-[10px] text-muted-foreground">-{step.creditsCharged} cr.</span>
        )}
        {step.reverted && <span className="text-[10px] text-rose-400">revertido</span>}
        {(step.commitSha || step.checkpointId) && !step.reverted && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-primary"
            onClick={() => onRevert(step)}
            disabled={disabled}
          >
            <Undo2 className="mr-1 h-3 w-3" /> Reverter
          </Button>
        )}
      </div>
      {step.detail && step.kind !== "diff" && (
        <p className="mt-0.5 pl-5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{step.detail}</p>
      )}
      {step.diff && (
        <div className="pl-5">
          <DiffView diff={step.diff} />
        </div>
      )}
    </div>
  );
}

function AssistantBlock({
  steps,
  open,
  onToggle,
  disabled,
  onRevert,
}: {
  steps: VibeStep[];
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
  onRevert: (s: VibeStep) => void;
}) {
  const visible = steps.filter((s) => s.kind !== "conversation");
  if (visible.length === 0) return null;
  const running = visible.some((s) => s.status === "running");
  const failed = visible.some((s) => s.status === "failed");
  const headline =
    [...visible].reverse().find((s) => s.kind === "done" || s.kind === "message" || s.kind === "plan") ??
    visible[visible.length - 1];
  const requirements = visible.filter((s) => s.kind === "requirements" && s.requirements && s.requirements.length > 0);
  const work = visible.filter((s) => s.kind !== "requirements");
  const expanded = open || running || failed;
  const files = visible.filter((s) => s.kind === "diff" && s.proposedContent).length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/40 bg-card/40 px-4 py-3">
        <div className="flex items-start gap-2">
          {running ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : failed ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/90">{headline.title}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", !expanded && "-rotate-90")} />
          {work.length} passo{work.length === 1 ? "" : "s"}
          {files > 0 && ` · ${files} arquivo${files === 1 ? "" : "s"} proposto${files === 1 ? "" : "s"}`}
        </button>
        {expanded && (
          <div className="mt-2 divide-y divide-border/30 border-t border-border/30">
            {work.map((step) => (
              <StepRow key={step.id} step={step} disabled={disabled} onRevert={onRevert} />
            ))}
          </div>
        )}
      </div>
      {requirements.map((step) => (
        <div key={step.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-300">{step.title}</p>
          <VibeRequirementsCard requirements={step.requirements ?? []} />
        </div>
      ))}
    </div>
  );
}

export function VibeCodeAgentChat({
  projectId,
  conversations,
}: {
  projectId?: string;
  conversations: VibeConversationsApi;
}) {
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
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

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
        toast.error("You must be signed in to run the agent.");
        return;
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
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
              setActiveId(evt.conversationId);
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
    },
    [projectId, pushStep, setActiveId],
  );

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || running) return;
    setInput("");
    setRunning(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: Date.now() },
      { id: assistantId, role: "assistant", content: "", steps: [], createdAt: Date.now() },
    ]);

    try {
      await runStream({ prompt, mode: autoApply ? "apply" : "preview" }, assistantId);
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
      await runStream(
        {
          apply: pendingEdits.map((s) => ({ path: s.path!, content: s.proposedContent! })),
        },
        assistantId,
      );
      toast.success("Changes committed to GitHub.");
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
      await runStream(
        step.checkpointId ? { revertCheckpointId: step.checkpointId } : { revertSha: step.commitSha },
        assistantId,
      );
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/60">
      <header className="flex items-center gap-3 border-b border-border/30 px-4 py-2.5">
        <Bot className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground/90">{activeTitle ?? "Nova conversa"}</p>
          <p className="text-[11px] text-muted-foreground">{running ? "Trabalhando…" : "Pronto"}</p>
        </div>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
              <MessagesSquare className="h-3.5 w-3.5" /> Conversas
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="h-80 w-72 p-3">
            <VibeConversationList api={conversations} onSelect={(id) => void openConversation(id)} onNew={newConversation} disabled={running} className="h-full" />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="auto-apply" className="text-[11px] text-muted-foreground">Auto-commit</Label>
          <Switch id="auto-apply" checked={autoApply} onCheckedChange={setAutoApply} className="scale-75" />
        </div>
      </header>

      {/* Radix sets the viewport content to display:table; force block so long lines wrap inside the chat. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
          {messages.length === 0 && (
            <div className="space-y-4 py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-medium">O que você quer criar?</p>
                <p className="text-xs text-muted-foreground">
                  O agente lê o projeto, escreve o código, revisa e avisa quais conectores o app precisa.
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                {SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInput(t)}
                    className="rounded-full border border-border/50 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary/10 px-4 py-2.5 text-sm text-foreground">
                  {m.content}
                </div>
              </div>
            ) : (
              <AssistantBlock
                key={m.id}
                steps={m.steps ?? []}
                open={!!openSteps[m.id]}
                onToggle={() => setOpenSteps((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                disabled={running}
                onRevert={revertStep}
              />
            ),
          )}
        </div>
      </ScrollArea>

      {pendingEdits.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/30 bg-primary/5 px-4 py-2.5">
          <span className="text-xs text-foreground/80">
            {pendingEdits.length} arquivo{pendingEdits.length > 1 ? "s" : ""} pronto{pendingEdits.length > 1 ? "s" : ""} para salvar
          </span>
          <Button size="sm" onClick={applyPending} disabled={running} className="h-8 gap-2 px-3 text-xs">
            Salvar alterações <Rocket className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="border-t border-border/30 p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border/50 bg-card/60 p-2 focus-within:border-primary/40">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Peça para criar, corrigir ou alterar…"
            className="min-h-[44px] flex-1 resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
            disabled={running}
          />
          <Button
            onClick={() => void send()}
            disabled={running || !input.trim()}
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            aria-label="Enviar"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground/60">
          Cada conversa guarda memória e código. Commits reais no GitHub quando conectado.
        </p>
      </div>
    </div>
  );
}

export default VibeCodeAgentChat;
