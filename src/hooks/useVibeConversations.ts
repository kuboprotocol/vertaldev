import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VibeChatMessage, VibeConversation, VibeStep } from "@/lib/vibeCodeAgentTypes";

const CONVERSATIONS = "vibe_conversations" as never;
const MESSAGES = "vibe_messages" as never;

/**
 * Caixinhas de conversa do Vibe Code: lista, abre, renomeia e apaga conversas.
 * O agente cria a conversa e grava as mensagens; aqui só lemos e organizamos.
 */
export function useVibeConversations(projectId?: string) {
  const [conversations, setConversations] = useState<VibeConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VibeChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const refresh = useCallback(async () => {
    let query = supabase
      .from(CONVERSATIONS)
      .select("id, project_id, title, summary, message_count, archived, created_at, last_message_at")
      .eq("archived", false)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (!error) setConversations((data ?? []) as unknown as VibeConversation[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    void refresh();
  }, [refresh]);

  const loadMessages = useCallback(async (conversationId: string): Promise<VibeChatMessage[]> => {
    const { data, error } = await supabase
      .from(MESSAGES)
      .select("id, role, content, steps, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      steps: VibeStep[] | null;
      created_at: string;
    }>).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      steps: (m.steps ?? []).map((s, i) => ({
        ...s,
        id: s.id ?? `${m.id}-${i}`,
        startedAt: s.startedAt ?? new Date(m.created_at).getTime(),
      })),
      createdAt: new Date(m.created_at).getTime(),
    }));
  }, []);

  /** Abre uma caixinha: carrega as mensagens guardadas. */
  const open = useCallback(
    async (id: string) => {
      setActiveId(id);
      setMessages(await loadMessages(id));
    },
    [loadMessages],
  );

  /** Volta para a tela inicial; o agente cria a conversa no primeiro pedido. */
  const startNew = useCallback(() => {
    setActiveId(null);
    setMessages([]);
  }, []);

  const rename = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim().slice(0, 120);
      if (!clean) return;
      await supabase.from(CONVERSATIONS).update({ title: clean, updated_at: new Date().toISOString() } as never).eq("id", id);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await supabase.from(CONVERSATIONS).delete().eq("id", id);
      if (activeIdRef.current === id) {
        setActiveId(null);
        setMessages([]);
      }
      await refresh();
    },
    [refresh],
  );

  return { conversations, activeId, setActiveId, messages, setMessages, loading, refresh, loadMessages, open, startNew, rename, remove };
}

export type VibeConversationsApi = ReturnType<typeof useVibeConversations>;
