// VERTAL Code AI — adaptadores dos canais (enviar / receber / ler).
// Sem Deno direto: tudo entra por dependências (chamar outra edge function com o JWT
// do operador, fetch, env, SMTP), então dá para testar no Vitest com dublês.
// A política de aprovação NÃO mora aqui (channels.ts → channelDecision): quem chama
// um adaptador já decidiu que pode.
import {
  ChannelError,
  channelDef,
  crmListOp,
  crmMap,
  crmNoteOp,
  graphListUrl,
  graphSendMailBody,
  graphTokenRequest,
  type InboundItem,
  type InboundQuery,
  type OutboundMessage,
  outlookConfig,
  ownMailConfig,
  type OwnMailConfig,
} from "./channels.ts";

export interface FnResult {
  status: number;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON livre das funções existentes
}

export interface ChannelDeps {
  /** Chama uma edge function existente com o JWT do operador. GET usa `query`. */
  callFunction: (name: string, body: Record<string, unknown> | null, opts?: { method?: "GET" | "POST"; query?: Record<string, string> }) => Promise<FnResult>;
  /** Conta Gmail conectada do operador (gmail_accounts.id), ou null. */
  gmailAccountId: () => Promise<string | null>;
  env: (k: string) => string | undefined;
  fetchImpl?: typeof fetch;
  /** Envio SMTP (nodemailer na edge function). Ausente = domínio próprio não configurado. */
  smtpSend?: (cfg: OwnMailConfig, msg: OutboundMessage) => Promise<{ messageId?: string }>;
}

export interface SendResult {
  channel: string;
  delivered: string[];
  ref?: string;
}

function ok(r: FnResult, what: string): FnResult {
  if (r.status < 200 || r.status >= 300) {
    const err = typeof r.data?.error === "string" ? r.data.error : typeof r.data?.message === "string" ? r.data.message : `HTTP ${r.status}`;
    throw new ChannelError(`${what}: ${err}`, r.status === 409 || r.status === 503 ? "not_configured" : "failed");
  }
  return r;
}

async function outlookToken(deps: ChannelDeps): Promise<string> {
  const cfg = outlookConfig(deps.env);
  if (!cfg) throw new ChannelError("Outlook não configurado (VERTAL_OUTLOOK_CLIENT_ID/SECRET/REFRESH_TOKEN).", "not_configured");
  const f = deps.fetchImpl ?? fetch;
  const req = graphTokenRequest(cfg);
  const r = await f(req.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: req.body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || typeof d.access_token !== "string") throw new ChannelError("Outlook recusou o token.", "failed");
  return d.access_token;
}

export async function sendVia(msg: OutboundMessage, deps: ChannelDeps): Promise<SendResult> {
  const def = channelDef(msg.channel);
  if (!def) throw new ChannelError("Canal desconhecido.");
  switch (msg.channel) {
    case "gmail": {
      const accountId = await deps.gmailAccountId();
      if (!accountId) throw new ChannelError("Conecte o Gmail no Vertal Chat.", "not_configured");
      const refs: string[] = [];
      // Um envio por destinatário: o gmail-send-message aceita um "to".
      for (const to of msg.to) {
        const r = ok(await deps.callFunction("gmail-send-message", { accountId, to, subject: msg.subject, body: msg.text, mode: "send" }), "Gmail");
        if (r.data?.id) refs.push(String(r.data.id));
      }
      return { channel: msg.channel, delivered: msg.to, ref: refs.join(",") || undefined };
    }
    case "slack": {
      const refs: string[] = [];
      for (const channel of msg.to) {
        const r = ok(await deps.callFunction("slack-send-message", { channel, text: msg.subject ? `*${msg.subject}*\n${msg.text}` : msg.text }), "Slack");
        if (r.data?.ts) refs.push(String(r.data.ts));
      }
      return { channel: msg.channel, delivered: msg.to, ref: refs.join(",") || undefined };
    }
    case "outlook": {
      const token = await outlookToken(deps);
      const f = deps.fetchImpl ?? fetch;
      const r = await f("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(graphSendMailBody(msg)),
      });
      if (r.status !== 202) throw new ChannelError(`Outlook: HTTP ${r.status}`, "failed");
      return { channel: msg.channel, delivered: msg.to };
    }
    case "own_email": {
      const cfg = ownMailConfig(deps.env);
      if (!cfg || !deps.smtpSend) throw new ChannelError("E-mail do domínio próprio não configurado (VERTAL_MAIL_SMTP_*).", "not_configured");
      const r = await deps.smtpSend(cfg, msg);
      return { channel: msg.channel, delivered: msg.to, ref: r.messageId };
    }
    case "crm:pipedrive":
    case "crm:hubspot": {
      const map = crmMap(deps.env)[msg.channel];
      const r = ok(await deps.callFunction("creative-router", crmNoteOp(map, msg)), def.label);
      return { channel: msg.channel, delivered: msg.to, ref: typeof r.data?.result === "string" ? r.data.result.slice(0, 200) : undefined };
    }
  }
}

function clip(s: unknown, n = 300): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";
}

/** Só leitura: lista o que chegou. Nada é marcado como lido nem alterado. */
export async function receiveVia(q: InboundQuery, deps: ChannelDeps): Promise<InboundItem[]> {
  switch (q.channel) {
    case "gmail": {
      const accountId = await deps.gmailAccountId();
      if (!accountId) throw new ChannelError("Conecte o Gmail no Vertal Chat.", "not_configured");
      const r = ok(await deps.callFunction("gmail-list-messages", { accountId, q: q.query, maxResults: q.limit }), "Gmail");
      const list = (r.data?.messages ?? r.data?.items ?? []) as Array<Record<string, unknown>>;
      return list.slice(0, q.limit).map((m) => ({ id: String(m.threadId ?? m.id ?? ""), from: clip(m.from, 120), subject: clip(m.subject, 200), snippet: clip(m.snippet), at: clip(m.date, 40) }));
    }
    case "slack": {
      if (!q.scope) throw new ChannelError("Diga qual canal do Slack ler (scope).");
      const r = ok(await deps.callFunction("slack-list-messages", null, { method: "GET", query: { channel: q.scope, limit: String(q.limit ?? 10) } }), "Slack");
      const list = (r.data?.messages ?? []) as Array<Record<string, unknown>>;
      return list.slice(0, q.limit).map((m) => ({ id: String(m.ts ?? ""), from: clip(m.user, 40), snippet: clip(m.text), at: clip(m.ts, 40) }));
    }
    case "outlook": {
      const token = await outlookToken(deps);
      const f = deps.fetchImpl ?? fetch;
      const r = await f(graphListUrl(q), { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
      if (!r.ok) throw new ChannelError(`Outlook: HTTP ${r.status}`, "failed");
      const d = await r.json();
      return ((d?.value ?? []) as Array<Record<string, any>>).map((m) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: String(m.id),
        from: clip(m.from?.emailAddress?.address, 120),
        subject: clip(m.subject, 200),
        snippet: clip(m.bodyPreview),
        at: clip(m.receivedDateTime, 40),
      }));
    }
    case "own_email":
      throw new ChannelError("Leitura do e-mail do domínio próprio (IMAP) chega na fase 2.", "not_supported");
    case "crm:pipedrive":
    case "crm:hubspot": {
      const map = crmMap(deps.env)[q.channel];
      const r = ok(await deps.callFunction("creative-router", crmListOp(map, q)), channelDef(q.channel)!.label);
      // O Fluxos devolve texto compacto (compactResult); mantemos como um item legível.
      const text = typeof r.data?.result === "string" ? r.data.result : JSON.stringify(r.data?.result ?? "");
      return [{ id: `${q.channel}:${q.scope ?? "recentes"}`, subject: `${channelDef(q.channel)!.label} · ${q.scope ?? "recentes"}`, snippet: text.slice(0, 4000) }];
    }
  }
}

/** Só leitura: abre um item (fio do Gmail, mensagem do Outlook). */
export async function readVia(channel: string, id: string, deps: ChannelDeps): Promise<{ id: string; text: string }> {
  if (!/^[A-Za-z0-9_.=:-]{1,200}$/.test(id)) throw new ChannelError("Id inválido.");
  switch (channel) {
    case "gmail": {
      const accountId = await deps.gmailAccountId();
      if (!accountId) throw new ChannelError("Conecte o Gmail no Vertal Chat.", "not_configured");
      const r = ok(await deps.callFunction("gmail-get-thread", { accountId, threadId: id }), "Gmail");
      return { id, text: JSON.stringify(r.data).slice(0, 20_000) };
    }
    case "outlook": {
      const token = await outlookToken(deps);
      const f = deps.fetchImpl ?? fetch;
      const r = await f(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=subject,from,body,receivedDateTime`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new ChannelError(`Outlook: HTTP ${r.status}`, "failed");
      const d = await r.json();
      return { id, text: `${d.subject ?? ""}\n${clip(d.from?.emailAddress?.address, 120)}\n\n${String(d.body?.content ?? "").replace(/<[^>]+>/g, " ").slice(0, 20_000)}` };
    }
    case "slack":
    case "crm:pipedrive":
    case "crm:hubspot": {
      const items = await receiveVia({ channel: channel as InboundQuery["channel"], scope: channel === "slack" ? id : id, limit: 20 }, deps);
      return { id, text: items.map((i) => `${i.from ?? ""} ${i.snippet}`).join("\n").slice(0, 20_000) };
    }
    default:
      throw new ChannelError("Leitura indisponível neste canal.", "not_supported");
  }
}
