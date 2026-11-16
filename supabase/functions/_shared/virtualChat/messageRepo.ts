/**
 * Repositório do histórico das mensagens de canal (Instagram e WhatsApp). Puro: recebe o cliente.
 *
 * Tabela: public.virtual_chat_channel_messages (ver migration 20261116120000).
 * RLS ligado sem políticas: só o service role grava e lê. Quem chama é uma edge function
 * que já validou o dono (CHANNEL_OWNER_USER_IDS). O corpo é guardado para o dono ler e
 * responder; logs nunca recebem o texto.
 */
import type { ChannelId } from "./types.ts";

export const CHANNEL_TABLE = "virtual_chat_channel_messages";
export const STORED_BODY_LIMIT = 8000;

export interface ChannelMessageRow {
  channel: Extract<ChannelId, "instagram" | "whatsapp">;
  direction: "in" | "out";
  contact_id: string;
  display_name: string | null;
  message_id: string;
  kind: "text" | "image" | "document" | "other";
  body: string | null;
  /** ISO 8601 da mensagem no provedor (entrada) ou do envio (saída). */
  occurred_at: string;
}

/** Grava uma mensagem. Devolve false se já existia (mesmo canal e mesmo message_id): é reenvio da Meta. */
export async function storeChannelMessage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  row: ChannelMessageRow,
): Promise<boolean> {
  const clean = { ...row, body: row.body ? row.body.slice(0, STORED_BODY_LIMIT) : null };
  const { data, error } = await admin
    .from(CHANNEL_TABLE)
    .upsert(clean, { onConflict: "channel,message_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`store ${error.code ?? "error"}`);
  return Array.isArray(data) && data.length > 0;
}

/** Epoch em ms da última mensagem recebida deste contato, ou null se nunca escreveu. */
// deno-lint-ignore no-explicit-any
export async function lastInboundAt(admin: any, channel: string, contactId: string): Promise<number | null> {
  const { data, error } = await admin
    .from(CHANNEL_TABLE)
    .select("occurred_at")
    .eq("channel", channel)
    .eq("contact_id", contactId)
    .eq("direction", "in")
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`lookup ${error.code ?? "error"}`);
  const at = Array.isArray(data) && data[0]?.occurred_at ? Date.parse(data[0].occurred_at) : NaN;
  return Number.isFinite(at) ? at : null;
}
