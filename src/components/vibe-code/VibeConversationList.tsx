import { useState } from "react";
import { MessageSquarePlus, MessageSquare, Trash2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { VibeConversationsApi } from "@/hooks/useVibeConversations";

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** Caixinhas de conversa: cada assunto tem a sua, com memória própria. */
export function VibeConversationList({
  api,
  onSelect,
  onNew,
  disabled,
  className,
}: {
  api: VibeConversationsApi;
  onSelect: (id: string) => void;
  onNew: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { conversations, activeId, loading, rename, remove } = api;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full justify-start gap-2 border-primary/30 text-xs text-primary"
        onClick={onNew}
        disabled={disabled}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" /> Nova conversa
      </Button>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 pr-2">
          {loading && <p className="px-1 text-xs text-muted-foreground">Carregando…</p>}
          {!loading && conversations.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              Nenhuma conversa ainda. Peça algo ao agente e ela aparece aqui.
            </p>
          )}
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                className={cn(
                  "group rounded-lg border px-2.5 py-2 transition-colors",
                  active ? "border-primary/40 bg-primary/10" : "border-border/40 bg-card/30 hover:bg-card/60",
                )}
              >
                {editing === c.id ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(c.id, draft);
                      setEditing(null);
                    }}
                  >
                    <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 text-xs" autoFocus maxLength={120} />
                    <Button type="submit" size="icon" variant="ghost" className="h-7 w-7">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      onClick={() => onSelect(c.id)}
                      disabled={disabled}
                    >
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground/90">{c.title}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {c.message_count} msg · {ago(c.last_message_at)}
                        </span>
                      </span>
                    </button>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label="Renomear conversa"
                        onClick={() => {
                          setDraft(c.title);
                          setEditing(c.id);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:text-rose-400"
                        aria-label="Apagar conversa"
                        onClick={() => {
                          if (window.confirm(`Apagar a conversa "${c.title}"? O código guardado não é apagado.`)) void remove(c.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export default VibeConversationList;
