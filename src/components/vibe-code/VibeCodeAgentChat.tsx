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
  KeyRound,
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
        <div className="relative group">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask Vibe Agent to build, fix or refactor..."
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
        <p className="mt-2 text-center text-[9px] font-medium tracking-tight text-muted-foreground/40 uppercase">
          Cada conversa guarda memória e código · commits reais via GitHub quando conectado
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
