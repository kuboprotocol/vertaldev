// VERTAL Code AI — canais (enviar / receber / ler) do cérebro e dos relatórios.
//
// Uma abstração única no lugar de "Gmail fixo": Gmail, Slack, Outlook, e-mail do
// domínio próprio do Vertal e CRMs (Pipedrive, HubSpot). Este módulo é PURO: tipos,
// catálogo, roteamento ("para onde vai") e a política de aprovação. A conversa com
// cada serviço fica em channelAdapters.ts, que reaproveita o que já existe:
//   gmail     → funções gmail-send-message / gmail-list-messages / gmail-get-thread
//   slack     → funções slack-send-message / slack-list-messages
//   crm:*     → Vertal Fluxos (conexão do próprio usuário, via creative-router tool "fluxos_apps")
//   outlook   → Microsoft Graph (envs VERTAL_OUTLOOK_*; sem credenciais = "não configurado")
//   own_email → SMTP (porta 465) por env VERTAL_MAIL_*; leitura (IMAP) só fase 2
//
// Regra de ouro: LER e RECEBER nunca escrevem nada (só leitura). ENVIAR para qualquer
// destino que não seja o próprio Laércio pede cartão de aprovação. Escrita em CRM
// sempre pede cartão.

export type ChannelId = "gmail" | "slack" | "outlook" | "own_email" | "crm:pipedrive" | "crm:hubspot";
export type ChannelOp = "send" | "receive" | "read";

export interface ChannelDef {
  id: ChannelId;
  /** Nome na interface (marca do serviço só aqui e na documentação). */
  label: string;
  kind: "email" | "chat" | "crm";
  ops: ChannelOp[];
  /** Fase em que cada operação existe. */
  phase: Partial<Record<ChannelOp, 1 | 2>>;
}

export const CHANNELS: ChannelDef[] = [
  { id: "gmail", label: "Gmail", kind: "email", ops: ["send", "receive", "read"], phase: { send: 1, receive: 1, read: 1 } },
  { id: "slack", label: "Slack", kind: "chat", ops: ["send", "receive", "read"], phase: { send: 1, receive: 1, read: 1 } },
  { id: "outlook", label: "Outlook", kind: "email", ops: ["send", "receive", "read"], phase: { send: 1, receive: 1, read: 1 } },
  { id: "own_email", label: "E-mail Vertal", kind: "email", ops: ["send", "receive", "read"], phase: { send: 1, receive: 2, read: 2 } },
  { id: "crm:pipedrive", label: "Pipedrive", kind: "crm", ops: ["send", "receive", "read"], phase: { send: 1, receive: 1, read: 1 } },
  { id: "crm:hubspot", label: "HubSpot", kind: "crm", ops: ["send", "receive", "read"], phase: { send: 1, receive: 1, read: 1 } },
];

export function channelDef(id: unknown): ChannelDef | null {
  return CHANNELS.find((c) => c.id === id) ?? null;
}

/** Mensagem de saída, igual para todo canal. Em CRM, "send" = registrar nota/atividade. */
export interface OutboundMessage {
  channel: ChannelId;
  /** E-mail, canal/usuário do Slack (C…/U…/D…/#nome), ou id do registro no CRM. */
  to: string[];
  subject?: string;
  text: string;
}

export interface InboundQuery {
  channel: ChannelId;
  /** Texto de busca (sintaxe do serviço quando houver). */
  query?: string;
  /** Slack: canal a listar. CRM: tipo do registro ("deals", "persons", "contacts"…). */
  scope?: string;
  limit?: number;
}

export interface InboundItem {
  id: string;
  from?: string;
  subject?: string;
  snippet: string;
  at?: string;
}

/** Quem é o próprio Laércio em cada canal (para dispensar o cartão quando ele é o único destino). */
export interface OperatorIdentity {
  emails: string[];
  slackUserIds: string[];
}

export function operatorIdentityFromEnv(env: (k: string) => string | undefined, loginEmail: string | null): OperatorIdentity {
  const list = (k: string) => (env(k) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const emails = new Set(list("VERTAL_OPERATOR_EMAILS"));
  if (loginEmail) emails.add(loginEmail.trim().toLowerCase());
  return { emails: [...emails], slackUserIds: list("VERTAL_OPERATOR_SLACK_IDS").map((s) => s.toUpperCase()) };
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SLACK_TARGET_RE = /^(#[a-z0-9._-]{1,80}|[CDGU][A-Z0-9]{6,20})$/i;

export class ChannelError extends Error {
  constructor(message: string, readonly code: "invalid" | "not_configured" | "not_supported" | "failed" = "invalid") {
    super(message);
  }
}

/** Normaliza e valida o envio antes de qualquer efeito. */
export function parseOutbound(raw: unknown): OutboundMessage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const def = channelDef(r.channel);
  if (!def) throw new ChannelError("Canal desconhecido.");
  const toRaw = Array.isArray(r.to) ? r.to : typeof r.to === "string" ? r.to.split(",") : [];
  const to = [...new Set(toRaw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  if (!to.length) throw new ChannelError("Diga para quem enviar.");
  if (def.kind === "email" && !to.every((t) => EMAIL_RE.test(t))) throw new ChannelError("E-mail de destino inválido.");
  if (def.id === "slack" && !to.every((t) => SLACK_TARGET_RE.test(t))) throw new ChannelError("Destino do Slack inválido (#canal, C…, D… ou U…).");
  if (def.kind === "crm" && !to.every((t) => /^[A-Za-z0-9_-]{1,64}$/.test(t))) throw new ChannelError("Registro do CRM inválido.");
  const text = typeof r.text === "string" ? r.text.trim().slice(0, 40_000) : "";
  if (!text) throw new ChannelError("Mensagem vazia.");
  const subject = typeof r.subject === "string" ? r.subject.trim().slice(0, 300) : undefined;
  if (def.kind === "email" && !subject) throw new ChannelError("E-mail precisa de assunto.");
  return { channel: def.id, to, subject, text };
}

export function parseInbound(raw: unknown): InboundQuery {
  const r = (raw ?? {}) as Record<string, unknown>;
  const def = channelDef(r.channel);
  if (!def) throw new ChannelError("Canal desconhecido.");
  const limit = Math.min(50, Math.max(1, Number(r.limit) || 10));
  return {
    channel: def.id,
    query: typeof r.query === "string" ? r.query.slice(0, 500) : undefined,
    scope: typeof r.scope === "string" ? r.scope.slice(0, 80) : undefined,
    limit,
  };
}

/** Todos os destinos são o próprio Laércio? (só aí o envio dispensa o cartão) */
export function isOnlyOperator(msg: OutboundMessage, me: OperatorIdentity): boolean {
  const def = channelDef(msg.channel);
  if (!def || def.kind === "crm") return false; // CRM é registro de terceiros: sempre cartão
  return msg.to.every((t) => {
    if (def.kind === "email") return me.emails.includes(t.toLowerCase());
    if (def.id === "slack") return me.slackUserIds.includes(t.toUpperCase());
    return false;
  });
}

export type ChannelDecision = { kind: "run" } | { kind: "needs_approval"; reason: string } | { kind: "deny"; reason: string };

/**
 * Política de aprovação dos canais:
 *  - receive/read: só leitura, roda direto (operador);
 *  - send ao próprio Laércio (e-mail/Slack dele): roda direto;
 *  - send a qualquer outro destino, ou escrita em CRM: cartão;
 *  - operação de fase 2 ou canal que não a tem: nega.
 */
export function channelDecision(op: ChannelOp, channel: ChannelId, operator: boolean, opts: { outbound?: OutboundMessage; me?: OperatorIdentity } = {}): ChannelDecision {
  if (!operator) return { kind: "deny", reason: "Somente o operador do Vertal usa os canais do cérebro." };
  const def = channelDef(channel);
  if (!def || !def.ops.includes(op)) return { kind: "deny", reason: "Operação indisponível neste canal." };
  if (def.phase[op] !== 1) return { kind: "deny", reason: `${def.label}: "${op}" chega numa próxima fase.` };
  if (op !== "send") return { kind: "run" };
  if (!opts.outbound || !opts.me) return { kind: "needs_approval", reason: "envio" };
  if (isOnlyOperator(opts.outbound, opts.me)) return { kind: "run" };
  return { kind: "needs_approval", reason: def.kind === "crm" ? "escrita no CRM" : "envio para outra pessoa" };
}

/** Texto do cartão: canal, destinos e começo da mensagem. */
export function outboundCardText(msg: OutboundMessage): string {
  const def = channelDef(msg.channel)!;
  const head = def.kind === "crm" ? `Registrar no ${def.label} (${msg.to.join(", ")})` : `Enviar por ${def.label} para ${msg.to.join(", ")}`;
  return `${head}${msg.subject ? `\nAssunto: ${msg.subject}` : ""}\n\n${msg.text.slice(0, 500)}${msg.text.length > 500 ? "…" : ""}`;
}

// ---------------------------------------------------------------------------
// Outlook (Microsoft Graph) — construtores puros de requisição
// ---------------------------------------------------------------------------

export const GRAPH = "https://graph.microsoft.com/v1.0";

export interface OutlookConfig {
  tenant: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function outlookConfig(env: (k: string) => string | undefined): OutlookConfig | null {
  const c = {
    tenant: env("VERTAL_OUTLOOK_TENANT") || "common",
    clientId: env("VERTAL_OUTLOOK_CLIENT_ID") ?? "",
    clientSecret: env("VERTAL_OUTLOOK_CLIENT_SECRET") ?? "",
    refreshToken: env("VERTAL_OUTLOOK_REFRESH_TOKEN") ?? "",
  };
  return c.clientId && c.clientSecret && c.refreshToken ? c : null;
}

export function graphTokenRequest(c: OutlookConfig): { url: string; body: string } {
  const p = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
    refresh_token: c.refreshToken,
    scope: "offline_access Mail.Read Mail.Send",
  });
  return { url: `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, body: p.toString() };
}

export function graphSendMailBody(msg: OutboundMessage) {
  return {
    message: {
      subject: msg.subject ?? "",
      body: { contentType: "Text", content: msg.text },
      toRecipients: msg.to.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  };
}

export function graphListUrl(q: InboundQuery): string {
  const p = new URLSearchParams({ $top: String(q.limit ?? 10), $select: "id,subject,from,receivedDateTime,bodyPreview" });
  if (q.query) p.set("$search", `"${q.query.replace(/"/g, "")}"`);
  else p.set("$orderby", "receivedDateTime desc");
  return `${GRAPH}/me/mailFolders/inbox/messages?${p.toString()}`;
}

// ---------------------------------------------------------------------------
// E-mail do domínio próprio (SMTP/IMAP por env)
// ---------------------------------------------------------------------------

export interface OwnMailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** SMTP com TLS implícito (465): as Edge Functions bloqueiam 25 e 587. */
export function ownMailConfig(env: (k: string) => string | undefined): OwnMailConfig | null {
  const host = env("VERTAL_MAIL_SMTP_HOST") ?? "";
  const port = Number(env("VERTAL_MAIL_SMTP_PORT") ?? 465);
  const user = env("VERTAL_MAIL_SMTP_USER") ?? "";
  const pass = env("VERTAL_MAIL_SMTP_PASS") ?? "";
  const from = env("VERTAL_MAIL_FROM") ?? user;
  if (!host || !user || !pass || !EMAIL_RE.test(from)) return null;
  if (port === 25 || port === 587) return null;
  return { host, port, user, pass, from };
}

// ---------------------------------------------------------------------------
// CRM genérico (via Vertal Fluxos) — Pipedrive e HubSpot primeiro
// ---------------------------------------------------------------------------

export interface CrmMap {
  /** App no Fluxos. */
  app: string;
  /** Ação que registra uma nota/atividade no registro. */
  noteAction: string;
  /** Busca (trigger/search) que lista registros recentes, por escopo. */
  searches: Record<string, string>;
}

/**
 * Chaves padrão das ações no Fluxos. Podem mudar com a versão do Fluxos: sobrescreva
 * por env VERTAL_CRM_MAP (JSON) sem deploy de código. O handler do Fluxos responde
 * "action_not_found" se a chave não existir (nada é executado).
 */
export const DEFAULT_CRM_MAP: Record<"crm:pipedrive" | "crm:hubspot", CrmMap> = {
  "crm:pipedrive": { app: "pipedrive", noteAction: "createNote", searches: { deals: "newDeals", persons: "newPersons", leads: "newLeads", activities: "newActivities" } },
  "crm:hubspot": { app: "hubspot", noteAction: "createNote", searches: { contacts: "newContacts", deals: "newDeals" } },
};

export function crmMap(env: (k: string) => string | undefined): Record<string, CrmMap> {
  try {
    const o = JSON.parse(env("VERTAL_CRM_MAP") ?? "{}");
    return { ...DEFAULT_CRM_MAP, ...(o && typeof o === "object" ? o : {}) };
  } catch {
    return DEFAULT_CRM_MAP;
  }
}

/** Corpo do creative-router (tool fluxos_apps) para registrar a nota no CRM. */
export function crmNoteOp(map: CrmMap, msg: OutboundMessage) {
  return {
    tool: "fluxos_apps",
    fluxos: {
      op: "run",
      app: map.app,
      kind: "action",
      key: map.noteAction,
      parameters: { content: msg.subject ? `${msg.subject}\n\n${msg.text}` : msg.text, ...(map.app === "pipedrive" ? { dealId: msg.to[0] } : { objectId: msg.to[0] }) },
    },
  };
}

export function crmListOp(map: CrmMap, q: InboundQuery) {
  const key = map.searches[q.scope ?? ""] ?? Object.values(map.searches)[0];
  return { tool: "fluxos_apps", fluxos: { op: "run", app: map.app, kind: "trigger", key, parameters: q.query ? { query: q.query } : {} } };
}
