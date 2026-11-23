// Gmail como secretário do cliente: regras puras usadas pelas funções gmail-*
// (sem rede, sem Deno.env), testadas em gmailOps_test.ts.

/** Escopo extra para organizar a caixa (rótulos, arquivar, lido, lixeira) e criar rascunhos. */
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

/** Operações de organização (gmail-modify-message). "trash" pede aprovação no chat. */
export const GMAIL_MODIFY_OPS = [
  "read", "unread", "archive", "inbox", "star", "unstar", "important", "not_important",
  "label", "unlabel", "trash", "untrash",
] as const;
export type GmailModifyOp = (typeof GMAIL_MODIFY_OPS)[number];

/** Corpo do POST .../modify para a operação (labelIds já resolvidos para label/unlabel). */
export function modifyBody(op: GmailModifyOp, labelIds: string[] = []): { addLabelIds?: string[]; removeLabelIds?: string[] } | null {
  switch (op) {
    case "read": return { removeLabelIds: ["UNREAD"] };
    case "unread": return { addLabelIds: ["UNREAD"] };
    case "archive": return { removeLabelIds: ["INBOX"] };
    case "inbox": return { addLabelIds: ["INBOX"] };
    case "star": return { addLabelIds: ["STARRED"] };
    case "unstar": return { removeLabelIds: ["STARRED"] };
    case "important": return { addLabelIds: ["IMPORTANT"] };
    case "not_important": return { removeLabelIds: ["IMPORTANT"] };
    case "label": return labelIds.length ? { addLabelIds: labelIds } : null;
    case "unlabel": return labelIds.length ? { removeLabelIds: labelIds } : null;
    default: return null; // trash/untrash usam endpoints próprios
  }
}

/** Resolve nomes de rótulos (sem diferenciar maiúsculas) para ids; devolve também os que faltam. */
export function resolveLabelIds(names: string[], labels: Array<{ id: string; name: string }>): { ids: string[]; missing: string[] } {
  const byName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
  const ids: string[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const id = byName.get(n.trim().toLowerCase());
    if (id) ids.push(id);
    else if (n.trim()) missing.push(n.trim());
  }
  return { ids, missing };
}

/** A resposta do Gmail diz que falta escopo? (conta conectada antes do gmail.modify → reconectar). */
export function isInsufficientScope(status: number, body: unknown): boolean {
  if (status !== 403) return false;
  const s = JSON.stringify(body ?? "").toLowerCase();
  return (s.includes("insufficient") && s.includes("scope")) || s.includes("access_token_scope_insufficient");
}

/** Cabeçalho seguro: sem quebra de linha (evita injeção de cabeçalhos no MIME). */
export function headerSafe(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

/** Codifica o assunto em RFC 2047 quando tem acento (o Gmail mostra certo). */
export function encodeSubject(subject: string): string {
  const s = headerSafe(subject);
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return `=?UTF-8?B?${b64}?=`;
}

export interface MimeInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

/** Mensagem text/plain em UTF-8, pronta para base64url (send ou drafts.create). */
export function buildMime(m: MimeInput): string {
  const headers = [
    `To: ${headerSafe(m.to)}`,
    ...(m.cc ? [`Cc: ${headerSafe(m.cc)}`] : []),
    `Subject: ${encodeSubject(m.subject)}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${headerSafe(m.inReplyTo)}`);
  if (m.references) headers.push(`References: ${headerSafe(m.references)}`);
  return [...headers, "", m.body].join("\r\n");
}

export function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Texto do encaminhamento: nota do usuário + cabeçalho e corpo do original (anexos citados por nome). */
export function forwardBody(note: string, orig: { from: string; date: string; subject: string; to: string; text: string; attachments?: string[] }): string {
  const att = orig.attachments?.length ? `\nAnexos no original: ${orig.attachments.join(", ")}` : "";
  return [
    note.trim(),
    "",
    "---------- Mensagem encaminhada ----------",
    `De: ${orig.from}`,
    `Data: ${orig.date}`,
    `Assunto: ${orig.subject}`,
    `Para: ${orig.to}`,
    "",
    orig.text.trim() + att,
  ].join("\n").replace(/^\n+/, "");
}

export function forwardSubject(subject: string): string {
  const s = headerSafe(subject || "(sem assunto)");
  return /^(fwd?|enc):/i.test(s) ? s : `Fwd: ${s}`;
}

/** Tipos de anexo que viram texto para o agente ler. Os outros voltam só com nome, tipo e tamanho. */
export function isTextAttachment(mime: string, filename: string): boolean {
  return /^text\//i.test(mime) ||
    /^application\/(json|xml|csv|x-csv|javascript|x-yaml|yaml)$/i.test(mime) ||
    /\.(txt|csv|md|json|xml|ya?ml|ics|log|html?)$/i.test(filename);
}

export const ATTACHMENT_TEXT_MAX = 20_000;
