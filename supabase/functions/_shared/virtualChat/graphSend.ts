/**
 * Envio de uma chamada à Graph API (Meta) com o token do canal.
 * Só este módulo e as edge functions de canal tocam em token; o corpo de erro NÃO é
 * devolvido para não vazar dados do cliente nos logs.
 */

export interface GraphSendResult {
  ok: boolean;
  status: number;
  /** Id da mensagem devolvido pela Meta (WhatsApp: messages[0].id; Instagram: message_id). */
  providerId: string | null;
}

export async function postGraph(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphSendResult> {
  const res = await fetchImpl(`https://graph.facebook.com/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, providerId: null };

  let providerId: string | null = null;
  try {
    const json = (await res.json()) as Record<string, unknown>;
    if (typeof json.message_id === "string") providerId = json.message_id;
    const messages = Array.isArray(json.messages) ? json.messages : [];
    const first = messages[0] as { id?: unknown } | undefined;
    if (typeof first?.id === "string") providerId = first.id;
  } catch {
    /* resposta sem JSON: envio foi aceito, só não há id */
  }
  return { ok: true, status: res.status, providerId };
}
