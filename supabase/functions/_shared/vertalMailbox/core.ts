// Vertal Mail · caixa de e-mail profissional + contas conectadas (Gmail/Outlook) → Vertal CRM.
// Módulo puro (sem Deno/Node): usado pela edge function vertal-code-ai (action "mailbox"),
// pelo Worker do vertal.dev (recebimento via Cloudflare Email Routing) e pelos testes (deno e vitest).
//
// Desligado por padrão. Liga só com, dentro do segredo VERTAL_GPU_CONFIG (o projeto Supabase está
// no limite de 100 segredos):
//   "VERTAL_MAILBOX": {
//     "enabled": true,
//     "userIds": ["<uuid do Laércio>"],          // vazio = ninguém ("*" = todos; abrir é decisão dele)
//     "aliasDomains": ["mail.vertal.dev"],         // domínios onde o cliente pode criar endereço (Email Routing ligado)
//     "outboundDomains": ["mail.vertal.dev"],      // domínios verificados no provedor de envio já usado (Resend)
//     "dailySendCap": 50,                          // envios por usuário por dia (padrão 50, máx. 500)
//     "crmFeedDefault": true                       // endereço novo já alimenta o CRM (o usuário desliga)
//   }
// Um segredo avulso VERTAL_MAILBOX com o mesmo JSON vence (como nos outros módulos).

export type MailEnv = Record<string, string | undefined>;
type Loose = Record<string, unknown>;

export interface MailboxConfig {
  enabled: true;
  userIds: string[];
  aliasDomains: string[];
  outboundDomains: string[];
  dailySendCap: number;
  crmFeedDefault: boolean;
}

export const MAILBOX_LIMITS = {
  /** Tamanho máximo de um e-mail recebido (o Email Routing aceita até 25 MiB). */
  maxInboundBytes: 10 * 1024 * 1024,
  /** Texto/HTML guardados por mensagem. */
  maxBodyChars: 200_000,
  maxSubject: 998,
  maxRecipients: 20,
  /** Mensagens por sincronização de conta (Gmail/Outlook) para o CRM. */
  crmSyncBatch: 25,
} as const;

const truthy = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

function parseObj(v: unknown): Loose | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Loose;
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Loose) : null;
  } catch {
    return null;
  }
}

const domains = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.map((d) => String(d ?? "").trim().toLowerCase()).filter((d) => DOMAIN_RE.test(d)))]
    : [];

/** Config da caixa, ou null (= desligado). */
export function mailboxConfig(env: MailEnv): MailboxConfig | null {
  const c = parseObj(env.VERTAL_MAILBOX) ?? parseObj(parseObj(env.VERTAL_GPU_CONFIG)?.VERTAL_MAILBOX);
  if (!c || !truthy(c.enabled)) return null;
  const cap = Math.floor(Number(c.dailySendCap));
  return {
    enabled: true,
    userIds: Array.isArray(c.userIds)
      ? c.userIds.map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => x === "*" || UUID_RE.test(x))
      : [],
    aliasDomains: domains(c.aliasDomains),
    outboundDomains: domains(c.outboundDomains),
    dailySendCap: Number.isFinite(cap) && cap > 0 ? Math.min(cap, 500) : 50,
    crmFeedDefault: c.crmFeedDefault === undefined ? true : truthy(c.crmFeedDefault),
  };
}

/** Liga para este usuário? Lista vazia = ninguém; "*" = todos. */
export function isMailboxEnabled(env: MailEnv, userId: string | null | undefined): boolean {
  const cfg = mailboxConfig(env);
  if (!cfg || !userId) return false;
  const id = userId.trim().toLowerCase();
  return cfg.userIds.includes("*") || cfg.userIds.includes(id);
}

// ─── endereços ──────────────────────────────────────────────────────────────

/** Nomes que nunca viram endereço de cliente (marca, segurança, abuso). */
export const RESERVED_LOCAL_PARTS = new Set([
  "abuse", "admin", "administrator", "billing", "contato", "contact", "dmarc", "help", "hostmaster", "info",
  "mailer-daemon", "marketing", "no-reply", "noreply", "postmaster", "privacy", "root", "sales", "security",
  "suporte", "support", "vertal", "vertaldev", "webmaster", "www", "kubo", "kubovibe", "financeiro", "juridico",
]);

export type AddressCheck = { ok: true; localPart: string; domain: string; address: string } | { ok: false; error: string };

/** Valida "nome" + domínio permitido. Só letras minúsculas, números, ponto, hífen e sublinhado. */
export function checkNewAddress(localRaw: unknown, domainRaw: unknown, cfg: MailboxConfig): AddressCheck {
  const localPart = String(localRaw ?? "").trim().toLowerCase();
  const domain = String(domainRaw ?? cfg.aliasDomains[0] ?? "").trim().toLowerCase();
  if (!cfg.aliasDomains.length) return { ok: false, error: "no_alias_domain" };
  if (!cfg.aliasDomains.includes(domain)) return { ok: false, error: "domain_not_allowed" };
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,38}[a-z0-9])$/.test(localPart) || /[._-]{2}/.test(localPart)) {
    return { ok: false, error: "invalid_local_part" };
  }
  if (RESERVED_LOCAL_PARTS.has(localPart)) return { ok: false, error: "reserved_local_part" };
  return { ok: true, localPart, domain, address: `${localPart}@${domain}` };
}

/** Domínio de um endereço ("Ana <ana@x.com>" → "x.com"). */
export function domainOf(address: string): string {
  const m = /@([^>\s]+)>?\s*$/.exec(String(address ?? ""));
  return (m?.[1] ?? "").toLowerCase();
}

/** "Ana Silva <ana@x.com>" → { name, email }. Aceita também "ana@x.com". */
export function parseAddress(raw: unknown): { name: string; email: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  const email = (m ? m[2] : s).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const name = (m ? m[1] : "").replace(/\s+/g, " ").trim().slice(0, 200);
  return { name, email };
}

/** Lista "a@x.com, Ana <b@y.com>" → até `max` endereços válidos, sem repetição. */
export function parseAddressList(raw: unknown, max: number = MAILBOX_LIMITS.maxRecipients): Array<{ name: string; email: string }> {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[,;\n]+/);
  const out: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const a = parseAddress(p);
    if (!a || seen.has(a.email)) continue;
    seen.add(a.email);
    out.push(a);
    if (out.length >= max) break;
  }
  return out;
}

/** Cabeçalho seguro: sem quebra de linha (anti-injeção), cortado. */
export const safeHeader = (v: unknown, max = 998) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

/** "Re: " uma vez só. */
export function replySubject(subject: string): string {
  const s = safeHeader(subject);
  return /^(re|res|resp)\s*:/i.test(s) ? s : `Re: ${s || ""}`.trim();
}

/** Prévia curta para a lista. */
export function snippetOf(text: string, n = 180): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

/** Texto a partir de HTML (para prévia e para o CRM), sem executar nada. */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Chave de conversa: o Message-ID raiz (References[0] → In-Reply-To → o próprio). */
export function threadKeyOf(messageId: string | null, inReplyTo: string | null, references: string | null): string | null {
  const first = String(references ?? "").trim().split(/\s+/).filter(Boolean)[0];
  return (first || inReplyTo || messageId || null)?.slice(0, 998) ?? null;
}

// ─── CRM ────────────────────────────────────────────────────────────────────

/** Provedores de e-mail pessoal: o domínio não vira empresa no CRM. */
export const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.com.br",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com",
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "zoho.com", "yandex.com", "yandex.ru", "outlook.com.br",
  "hotmail.com.br", "live.com.br", "qq.com", "163.com",
]);

/** Remetentes automáticos: não viram contato no CRM. */
const AUTOMATED_RE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce[s]?|newsletter|alerts?)([+._-]|@)/i;

/** Empresa a partir do domínio ("acme-tech.com.br" → "Acme Tech"); null para e-mail pessoal. */
export function companyFromEmail(email: string): { name: string; domain: string } | null {
  const domain = domainOf(email.includes("@") ? email : `x@${email}`);
  if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;
  const labels = domain.split(".");
  // Tira sufixos públicos comuns de 2 níveis (com.br, co.uk…).
  const twoLevel = /^(com|net|org|gov|edu|co|ac)$/.test(labels[labels.length - 2] ?? "") && labels.length >= 3;
  const core = twoLevel ? labels[labels.length - 3] : labels[labels.length - 2] ?? labels[0];
  const name = String(core ?? "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return name ? { name: name.slice(0, 200), domain } : null;
}

/** "Ana Maria Silva" → { first: "Ana Maria", last: "Silva" }; sem nome usa o começo do e-mail. */
export function splitName(name: string, email: string): { first_name: string; last_name: string } {
  const n = String(name ?? "").replace(/["']/g, "").replace(/\s+/g, " ").trim();
  if (!n || EMAIL_RE.test(n)) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return { first_name: (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 100), last_name: "" };
  }
  const parts = n.split(" ");
  if (parts.length === 1) return { first_name: parts[0].slice(0, 100), last_name: "" };
  return { first_name: parts.slice(0, -1).join(" ").slice(0, 100), last_name: parts[parts.length - 1].slice(0, 100) };
}

export type MailSource = "mailbox" | "gmail" | "outlook";
export const MAIL_SOURCES: readonly MailSource[] = ["mailbox", "gmail", "outlook"];
export const isMailSource = (v: unknown): v is MailSource => typeof v === "string" && (MAIL_SOURCES as readonly string[]).includes(v);

/** Um e-mail pronto para virar contato + nota no CRM. */
export interface CrmMailItem {
  /** Id estável da mensagem na origem (dedupe: external_ref "<source>:<ref>"). */
  ref: string;
  source: MailSource;
  /** Conta de onde veio (endereço da caixa, e-mail do Gmail, "outlook"). */
  account: string;
  direction: "in" | "out";
  /** A outra pessoa da conversa (remetente se recebido; destinatário se enviado). */
  counterpart: { name: string; email: string };
  subject: string;
  snippet: string;
  date: string;
}

/** Monta o item do CRM; null quando não deve entrar (automático, sem e-mail, o próprio usuário). */
export function toCrmItem(input: {
  ref: string; source: MailSource; account: string; direction: "in" | "out";
  from: unknown; to: unknown; subject: unknown; text: unknown; date: unknown; ownEmails?: string[];
}): CrmMailItem | null {
  const own = new Set((input.ownEmails ?? []).map((e) => e.toLowerCase()));
  const cp = input.direction === "in" ? parseAddress(input.from) : parseAddressList(input.to, 1)[0] ?? null;
  if (!cp || own.has(cp.email) || AUTOMATED_RE.test(cp.email)) return null;
  const ref = String(input.ref ?? "").trim().slice(0, 300);
  if (!ref) return null;
  const d = new Date(String(input.date ?? ""));
  return {
    ref,
    source: input.source,
    account: String(input.account ?? "").slice(0, 320),
    direction: input.direction,
    counterpart: cp,
    subject: safeHeader(input.subject, 300),
    snippet: snippetOf(String(input.text ?? ""), 1500),
    date: Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
  };
}

const SOURCE_LABEL: Record<MailSource, string> = { mailbox: "Vertal Mail", gmail: "Gmail", outlook: "Outlook" };

/** Texto da nota no CRM (sem IA). */
export function crmNoteText(item: CrmMailItem): string {
  const arrow = item.direction === "in" ? "📥" : "📤";
  const who = item.counterpart.name ? `${item.counterpart.name} <${item.counterpart.email}>` : item.counterpart.email;
  return [
    `${arrow} ✉️ ${item.subject || "(sem assunto)"}`,
    `${item.direction === "in" ? "De" : "Para"}: ${who}`,
    `Conta: ${SOURCE_LABEL[item.source]} · ${item.account}`,
    `Data: ${item.date}`,
    "",
    item.snippet,
  ].join("\n").slice(0, 5000);
}

// ─── recebimento (Worker) ───────────────────────────────────────────────────

/** Linha de mailbox_messages a partir do e-mail já decodificado (postal-mime). */
export function inboundRow(input: {
  userId: string; addressId: string; envelopeFrom: string; envelopeTo: string; rawSize: number;
  parsed: {
    from?: { name?: string; address?: string } | null;
    to?: Array<{ name?: string; address?: string }> | null;
    cc?: Array<{ name?: string; address?: string }> | null;
    replyTo?: Array<{ name?: string; address?: string }> | null;
    subject?: string | null; text?: string | null; html?: string | null;
    messageId?: string | null; inReplyTo?: string | null; references?: string | null; date?: string | null;
    attachments?: Array<{ filename?: string | null; mimeType?: string; content?: ArrayBuffer | string | Uint8Array }> | null;
  };
}): Record<string, unknown> {
  const p = input.parsed ?? {};
  const fromAddr = (p.from?.address || input.envelopeFrom || "").toLowerCase().slice(0, 320);
  const list = (xs: Array<{ name?: string; address?: string }> | null | undefined) =>
    (xs ?? []).slice(0, 50).map((x) => ({ name: safeHeader(x.name, 200), email: String(x.address ?? "").toLowerCase().slice(0, 320) }))
      .filter((x) => x.email);
  const html = String(p.html ?? "").slice(0, MAILBOX_LIMITS.maxBodyChars);
  const text = String(p.text ?? "").slice(0, MAILBOX_LIMITS.maxBodyChars) || htmlToText(html).slice(0, MAILBOX_LIMITS.maxBodyChars);
  const messageId = p.messageId ? safeHeader(p.messageId) : null;
  const inReplyTo = p.inReplyTo ? safeHeader(p.inReplyTo) : null;
  const references = p.references ? safeHeader(p.references, 4000) : null;
  const atts = (p.attachments ?? []).slice(0, 50).map((a) => ({
    filename: safeHeader(a.filename ?? "anexo", 200),
    mimeType: safeHeader(a.mimeType ?? "application/octet-stream", 120),
    size: typeof a.content === "string" ? a.content.length : (a.content as ArrayBuffer | Uint8Array | undefined)?.byteLength ?? 0,
  }));
  const d = p.date ? new Date(p.date) : null;
  return {
    user_id: input.userId,
    address_id: input.addressId,
    direction: "in",
    folder: "inbox",
    status: "received",
    from_address: fromAddr,
    from_name: safeHeader(p.from?.name, 200) || null,
    to_addresses: list(p.to).length ? list(p.to) : [{ name: "", email: input.envelopeTo.toLowerCase() }],
    cc_addresses: list(p.cc),
    reply_to: list(p.replyTo)[0]?.email ?? null,
    subject: safeHeader(p.subject, MAILBOX_LIMITS.maxSubject),
    text_body: text,
    html_body: html || null,
    snippet: snippetOf(text),
    message_id: messageId,
    in_reply_to: inReplyTo,
    references_header: references,
    thread_key: threadKeyOf(messageId, inReplyTo, references),
    has_attachments: atts.length > 0,
    attachments: atts,
    size_bytes: Math.max(0, Math.floor(input.rawSize || 0)),
    sent_at: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
  };
}
