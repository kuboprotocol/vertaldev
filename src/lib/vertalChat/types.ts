/**
 * Vertal Chat — tipos compartilhados entre canais, política de acesso e cobrança.
 */

export type ChannelId = "telegram" | "whatsapp" | "messenger";

/** Quem está pedindo algo: o dono da conta, ou um cliente dele falando por um canal. */
export type Audience = "owner" | "external_contact";

/** Mensagem de canal já normalizada: o resto do sistema não conhece o formato do provedor. */
export interface NormalizedInbound {
  channel: ChannelId;
  /** Identificador do remetente dentro do canal (chat id, wa_id, PSID…). */
  externalUserId: string;
  displayName: string | null;
  /** Identificador da conversa dentro do canal (pode ser igual ao externalUserId em chats 1:1). */
  conversationId: string;
  messageId: string;
  kind: "text" | "document" | "image" | "other";
  text: string | null;
  attachment: InboundAttachment | null;
  /** Epoch em milissegundos. */
  receivedAt: number;
}

export interface InboundAttachment {
  /** Id do arquivo no provedor; o download é feito pela edge function, nunca pelo cliente. */
  providerFileId: string;
  mimeType: string;
  filename: string | null;
  sizeBytes: number | null;
}

/** Envio já montado, pronto para a edge function executar com o token do canal. */
export interface OutboundRequest {
  channel: ChannelId;
  method: "POST" | "GET";
  /** Caminho relativo à base da API do canal. */
  path: string;
  body: Record<string, unknown>;
}
