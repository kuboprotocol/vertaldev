import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Globe, Loader2, MessageSquare, Plus, Search, Send, Square, Coins, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CREATIVE_ROUTER_FN, PUTER_MODELS } from "@/lib/puterAI";
import { readChatStream, type Source } from "./chatStream";

export type ConversationMode = "chat" | "research";

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; model?: string; error?: boolean };

const MODES: Record<ConversationMode, {
  title: string; description: string; cost: number; icon: typeof Search; placeholder: string; suggestions: string[];
}> = {
  chat: {
    title: "Modo de conversa",
    description: "Converse com a IA mantendo o contexto da conversa.",
    cost: 1,
    icon: MessageSquare,
    placeholder: "Pergunte qualquer coisa...",
    suggestions: [
      "Escreva uma legenda para lançar meu app no Instagram",
      "Resuma em 5 tópicos o que é economia criativa",
      "Traduza para o inglês: Bem-vindo ao futuro da criação",
    ],
  },
  research: {
    title: "Wide Research",
    description: "Pesquisa na internet em tempo real, compara fontes e cita cada uma.",
    cost: 3,
    icon: Search,
    placeholder: "O que você quer pesquisar na internet?",
    suggestions: [
      "Quais são as principais tendências de IA generativa este mês?",
      "Compare as taxas das principais carteiras cripto no Brasil",
      "Notícias mais recentes sobre regulação de Web3 no Brasil",
    ],
  },
};

const storageKey = (mode: ConversationMode) => `creative_conversation_${mode}`;

function loadMessages(mode: ConversationMode): Msg[] {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function errorText(status: number, body: string) {
  let err = body;
  try { err = JSON.parse(body)?.error ?? body; } catch { /* plain text */ }
  if (err.includes("insufficient_credits") || status === 402) return "Créditos insuficientes para esta mensagem.";
  if (err.includes("rate_limit") || status === 429) return "Muitas mensagens seguidas — aguarde alguns segundos.";
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (err.includes("OPENROUTER_API_KEY")) return "A IA não está configurada no servidor (OPENROUTER_API_KEY).";
  return `Não foi possível responder agora (${err || status}). Seus créditos foram devolvidos.`;
}

export function CreativeConversation({ mode, onSpent }: { mode: ConversationMode; onSpent?: () => void }) {
  const cfg = MODES[mode];
  const [messages, setMessages] = useState<Msg[]>(() => loadMessages(mode));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>(() => {
    const saved = localStorage.getItem("creative_kimi_model");
    return PUTER_MODELS.some((m) => m.id === saved) ? saved! : PUTER_MODELS[0].id;
  });
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey(mode), JSON.stringify(messages.slice(-40))); } catch { /* storage full or blocked */ }
  }, [messages, mode]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLast = (patch: (m: Msg) => Msg) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? patch(m) : m)));

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || loading) return;
    const history: Msg[] = [...messages.filter((m) => !m.error), { role: "user", content }];
    setMessages([...messages, { role: "user", content }, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${CREATIVE_ROUTER_FN}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          tool: "chat",
          mode,
          model: mode === "chat" ? model : undefined,
          messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!resp.ok || !resp.body) {
        const msg = errorText(resp.status, await resp.text().catch(() => ""));
        updateLast((m) => ({ ...m, content: msg, error: true }));
        toast.error(msg);
        return;
      }

      const usedModel = resp.headers.get("X-Model") ?? undefined;
      const result = await readChatStream(resp.body, (delta) => updateLast((m) => ({ ...m, content: m.content + delta })));
      updateLast((m) => ({
        ...m,
        model: usedModel,
        sources: result.sources,
        ...(m.content ? {} : { content: result.error ?? "A IA não retornou resposta. Tente de novo.", error: true }),
      }));
      onSpent?.();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        updateLast((m) => ({ ...m, content: m.content || "_Resposta interrompida._" }));
      } else {
        updateLast((m) => ({ ...m, content: "Falha de conexão. Verifique sua internet e tente de novo.", error: true }));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  const Icon = cfg.icon;
  // Mesmo critério do creative-router: modelos Sonnet custam o preço premium.
  const cost = mode === "chat" && model.includes("sonnet") ? 4 : cfg.cost;

  return (
    <Card className="flex flex-col h-[calc(100dvh-14rem)] min-h-[520px] bg-background/40 backdrop-blur-xl border-primary/10 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
        <div className="p-2 rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-orbitron font-bold text-foreground leading-tight">{cfg.title}</h3>
          <p className="text-xs text-muted-foreground truncate">{cfg.description}</p>
        </div>
        {mode === "chat" && (
          <Select value={model} onValueChange={(v) => { setModel(v); localStorage.setItem("creative_kimi_model", v); }}>
            <SelectTrigger className="h-8 w-[150px] sm:w-[190px] text-xs bg-background/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PUTER_MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" onClick={reset} disabled={!messages.length} title="Nova conversa">
          <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Nova</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <div className="p-4 rounded-2xl bg-primary/10 text-primary"><Icon className="h-8 w-8" /></div>
            <p className="text-sm text-muted-foreground max-w-sm">{cfg.description}</p>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {cfg.suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left text-sm rounded-xl border border-border/30 bg-card/50 px-4 py-2.5 hover:border-primary/40 hover:bg-card transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[88%] rounded-2xl px-4 py-3 text-sm",
              m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                : m.error ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-card/70 border border-border/30 rounded-bl-sm",
            )}>
              {m.role === "assistant" && !m.content && loading && i === messages.length - 1 ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "research" ? "Pesquisando na internet..." : "Pensando..."}
                </span>
              ) : m.role === "user" ? m.content : (
                <div className="leading-relaxed space-y-2 break-words [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded [&_pre]:overflow-x-auto [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre]:rounded-lg">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              )}

              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" /> Fontes
                  </div>
                  {m.sources.map((s, n) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-xs hover:text-primary group">
                      <span className="text-muted-foreground font-mono">[{n + 1}]</span>
                      <span className="flex-1 truncate">{s.title || new URL(s.url).hostname}</span>
                      <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              )}

              {m.role === "assistant" && m.content && !m.error && !(loading && i === messages.length - 1) && (
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <button onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copiado"); }} className="flex items-center gap-1 hover:text-foreground">
                    <Copy className="h-3 w-3" /> Copiar
                  </button>
                  {m.model && <span className="font-mono opacity-70">{m.model}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/20 p-3 space-y-2">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={cfg.placeholder}
            rows={1}
            className="min-h-[44px] max-h-40 resize-none bg-background/50 text-sm"
          />
          {loading ? (
            <Button size="icon" variant="secondary" className="h-11 w-11 shrink-0" onClick={() => abortRef.current?.abort()} title="Parar">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" className="h-11 w-11 shrink-0" onClick={() => send()} disabled={!input.trim()} title="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-amber-500/90">
          <Coins className="h-3.5 w-3.5" />
          {cost} {cost === 1 ? "crédito" : "créditos"} por mensagem · Enter envia, Shift+Enter quebra linha
        </div>
      </div>
    </Card>
  );
}
