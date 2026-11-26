// Vertal Mail · operações do servidor (edge function existente vertal-code-ai, action "mailbox").
// Sem função nova e sem segredo novo: config em VERTAL_GPU_CONFIG.VERTAL_MAILBOX (ver core.ts).
//
//   op status                        → config pública, endereços, contas (Gmail/Outlook) com "Alimentar o CRM", não lidos
//   op address_create {localPart, domain?, displayName?}
//   op address_update {id, displayName?, signature?, crmFeed?, active?}
//   op list {folder?, addressId?, before?, limit?, q?} · op read {id} · op mark {id, read} · op move {id, folder}
//   op send {addressId, to, cc?, subject, text, replyToId?}   → envia pelo provedor que o app já usa (Resend)
//   op feed_set {source:"gmail"|"outlook", accountRef, enabled}
//   op crm_sync {source?, accountRef?}                         → sincronização SEM IA e SEM crédito
//   op outlook_list {search?, top?} · outlook_read {messageId} · outlook_send {to, cc?, subject, body} · outlook_reply {messageId, comment}
//
// Nada aqui muda o conector Gmail/Outlook existente: a subpágina do Gmail usa as funções gmail-* de sempre
// (grátis na caixa do app) e o Outlook usa as ações do motor do Vertal Fluxos sem chatCharge (grátis).

import {
  checkNewAddress, companyFromEmail, crmNoteText, EMAIL_RE, isMailSource, MAILBOX_LIMITS, type MailboxConfig,
  parseAddressList, replySubject, safeHeader, snippetOf, splitName, threadKeyOf, toCrmItem, type CrmMailItem,
} from "./core.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Res = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Res => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null);
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const FOLDERS = new Set(["inbox", "sent", "trash", "spam"]);
/** Intervalo mínimo entre sincronizações automáticas de uma conta (ao abrir a caixa). */
export const AUTO_SYNC_MS = 15 * 60_000;

/** Linha pronta para o CRM (o handler do CRM faz o upsert). */
export interface MailCrmFeedItem {
  ref: string; source: "mailbox" | "gmail" | "outlook"; counterpart: { name: string; email: string };
  first_name: string; last_name: string; company: { name: string; domain: string } | null; note: string; date: string;
}

export interface MailboxDeps {
  admin: Loose;
  userId: string;
  cfg: MailboxConfig;
  fetch: typeof fetch;
  /** Chave do provedor de envio que o app já usa (RESEND_API_KEY). Sem ela, envio fica indisponível. */
  resendKey?: string | null;
  gmailToken?: (accountId: string) => Promise<{ token: string; email: string }>;
  /** Ação/busca do Outlook pelo motor do Vertal Fluxos (sem cobrança). */
  outlook?: (kind: "trigger" | "action", key: string, parameters: Record<string, unknown>) => Promise<{ ok: boolean; data?: Loose; error?: string; message?: string }>;
  /** Vertal CRM liberado para este usuário? */
  crmEnabled: boolean;
  crmFeed?: (items: MailCrmFeedItem[]) => Promise<Loose>;
  now?: () => Date;
}

export function toFeedItem(it: CrmMailItem): MailCrmFeedItem {
  const n = splitName(it.counterpart.name, it.counterpart.email);
  return {
    ref: it.ref, source: it.source, counterpart: it.counterpart, ...n,
    company: companyFromEmail(it.counterpart.email), note: crmNoteText(it), date: it.date,
  };
}

// ─── leitura de apoio ───────────────────────────────────────────────────────
async function addresses(deps: MailboxDeps) {
  const { data } = await deps.admin.from("mailbox_addresses")
    .select("id, address, local_part, domain, display_name, signature, crm_feed, active, created_at")
    .eq("user_id", deps.userId).order("created_at", { ascending: true });
  return (data ?? []) as Loose[];
}

async function feeds(deps: MailboxDeps) {
  const { data } = await deps.admin.from("mail_crm_feeds").select("source, account_ref, account_label, enabled, last_synced_at, last_result")
    .eq("user_id", deps.userId);
  return (data ?? []) as Loose[];
}

async function connectedAccounts(deps: MailboxDeps) {
  const { data: g } = await deps.admin.from("gmail_accounts").select("id, email, display_name").eq("user_id", deps.userId)
    .order("created_at", { ascending: true });
  const { data: o } = await deps.admin.from("fluxos_connections").select("app_key, status, screen_name").eq("user_id", deps.userId)
    .eq("app_key", "microsoft-outlook").maybeSingle();
  const f = await feeds(deps);
  const feedOf = (source: string, ref: string) => f.find((x) => x.source === source && x.account_ref === ref) ?? null;
  return {
    gmail: (g ?? []).map((a: Loose) => {
      const fd = feedOf("gmail", a.id);
      return { id: a.id, email: a.email, name: a.display_name ?? null, crmFeed: fd?.enabled === true, lastSyncedAt: fd?.last_synced_at ?? null, lastResult: fd?.last_result ?? null };
    }),
    outlook: o && o.status === "connected"
      ? (() => {
        const fd = feedOf("outlook", "microsoft-outlook");
        return { connected: true, label: o.screen_name ?? "Outlook", crmFeed: fd?.enabled === true, lastSyncedAt: fd?.last_synced_at ?? null, lastResult: fd?.last_result ?? null };
      })()
      : { connected: false, label: null, crmFeed: false, lastSyncedAt: null, lastResult: null },
  };
}

// ─── envio ──────────────────────────────────────────────────────────────────
async function sendViaResend(deps: MailboxDeps, payload: Record<string, unknown>): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!deps.resendKey) return { ok: false, error: "outbound_not_configured" };
  const r = await deps.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // (jsdom dos testes não tem AbortSignal.timeout; Deno e o Worker têm)
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(20_000) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  // Resend: 429 com "quota" = cota diária/mensal da conta (soma de todos os clientes); outro 429 = muitos pedidos por segundo.
  if (r.status === 429) return { ok: false, error: /quota/i.test(`${j?.name ?? ""} ${j?.message ?? ""}`) ? "global_daily_send_cap" : "rate_limited" };
  if (!r.ok) return { ok: false, error: `provider_${r.status}:${String(j?.message ?? j?.name ?? "").slice(0, 160)}` };
  return { ok: true, id: typeof j?.id === "string" ? j.id : null };
}

async function send(deps: MailboxDeps, body: Loose): Promise<Res> {
  const addrId = uuid(body.addressId);
  if (!addrId) return fail(400, "missing_address");
  const { data: addr } = await deps.admin.from("mailbox_addresses").select("*").eq("id", addrId).eq("user_id", deps.userId).maybeSingle();
  if (!addr || !addr.active) return fail(404, "address_not_found");
  if (!deps.cfg.outboundDomains.includes(addr.domain)) return fail(409, "outbound_domain_not_verified", { domain: addr.domain });
  const to = parseAddressList(body.to);
  const cc = parseAddressList(body.cc);
  if (!to.length) return fail(400, "invalid_recipient");
  if (to.length + cc.length > MAILBOX_LIMITS.maxRecipients) return fail(400, "too_many_recipients");
  let subject = safeHeader(body.subject, MAILBOX_LIMITS.maxSubject);
  const text = String(body.text ?? "").slice(0, 50_000);
  if (!text.trim()) return fail(400, "empty_body");

  // Limite diário por usuário (anti-abuso; protege a reputação do domínio).
  const now = deps.now?.() ?? new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count } = await deps.admin.from("mailbox_messages").select("id", { count: "exact", head: true })
    .eq("user_id", deps.userId).eq("direction", "out").gte("created_at", dayStart);
  if ((count ?? 0) >= deps.cfg.dailySendCap) return fail(429, "daily_send_cap", { cap: deps.cfg.dailySendCap });
  // Limite diário global (todos os clientes somados): o plano grátis do provedor de envio tem cota total por dia.
  const { count: total } = await deps.admin.from("mailbox_messages").select("id", { count: "exact", head: true })
    .eq("direction", "out").in("status", ["queued", "sent"]).gte("created_at", dayStart);
  if ((total ?? 0) >= deps.cfg.globalDailySendCap) return fail(429, "global_daily_send_cap");

  let inReplyTo: string | null = null;
  let references: string | null = null;
  const replyId = uuid(body.replyToId);
  if (replyId) {
    const { data: orig } = await deps.admin.from("mailbox_messages").select("message_id, references_header, subject, thread_key")
      .eq("id", replyId).eq("user_id", deps.userId).maybeSingle();
    if (orig?.message_id) {
      inReplyTo = orig.message_id;
      references = [orig.references_header, orig.message_id].filter(Boolean).join(" ").slice(-3900);
    }
    if (orig && !subject) subject = replySubject(orig.subject ?? "");
  }
  if (!subject) return fail(400, "missing_subject");
  const fromName = safeHeader(addr.display_name || addr.local_part, 120).replace(/[<>"]/g, "");
  const signature = addr.signature ? `\n\n-- \n${String(addr.signature).slice(0, 2000)}` : "";
  const messageId = `<${crypto.randomUUID()}@${addr.domain}>`;
  const fmt = (a: { name: string; email: string }) => (a.name ? `${a.name.replace(/[<>"]/g, "")} <${a.email}>` : a.email);
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references) headers["References"] = references;

  const row = {
    user_id: deps.userId, address_id: addr.id, direction: "out", folder: "sent", status: "queued",
    from_address: addr.address, from_name: fromName, to_addresses: to, cc_addresses: cc, subject,
    text_body: text + signature, snippet: snippetOf(text), message_id: messageId, in_reply_to: inReplyTo,
    references_header: references, thread_key: threadKeyOf(messageId, inReplyTo, references),
  };
  const { data: saved, error: insErr } = await deps.admin.from("mailbox_messages").insert(row).select("id").single();
  if (insErr || !saved) return fail(500, "save_failed");
  const r = await sendViaResend(deps, {
    from: `${fromName} <${addr.address}>`, to: to.map(fmt), ...(cc.length ? { cc: cc.map(fmt) } : {}),
    reply_to: addr.address, subject, text: text + signature, headers,
  });
  await deps.admin.from("mailbox_messages").update(
    r.ok ? { status: "sent", provider_message_id: r.id, sent_at: new Date().toISOString() } : { status: "failed", error: r.error.slice(0, 300) },
  ).eq("id", saved.id);
  if (!r.ok && (r.error === "global_daily_send_cap" || r.error === "rate_limited")) return fail(429, r.error, { id: saved.id });
  if (!r.ok) return fail(502, r.error.startsWith("outbound_") ? r.error : "send_failed", { id: saved.id });
  return ok({ id: saved.id });
}

// ─── CRM ────────────────────────────────────────────────────────────────────
async function syncMailbox(deps: MailboxDeps): Promise<Loose> {
  const addrs = (await addresses(deps)).filter((a) => a.crm_feed);
  if (!addrs.length) return { messages: 0 };
  const own = (await addresses(deps)).map((a) => a.address);
  const { data: rows } = await deps.admin.from("mailbox_messages")
    .select("id, address_id, direction, from_address, from_name, to_addresses, subject, text_body, created_at")
    .eq("user_id", deps.userId).is("crm_synced_at", null).in("address_id", addrs.map((a) => a.id))
    .neq("folder", "spam").order("created_at", { ascending: true }).limit(100);
  const items: MailCrmFeedItem[] = [];
  for (const m of rows ?? []) {
    const it = toCrmItem({
      ref: m.id, source: "mailbox", account: addrs.find((a) => a.id === m.address_id)?.address ?? "", direction: m.direction,
      from: m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address,
      to: (m.to_addresses ?? []).map((x: Loose) => (x.name ? `${x.name} <${x.email}>` : x.email)),
      subject: m.subject, text: m.text_body, date: m.created_at, ownEmails: own,
    });
    if (it) items.push(toFeedItem(it));
  }
  const res = items.length ? await deps.crmFeed!(items) : { notesAdded: 0, contactsCreated: 0 };
  if (res?.ok === false) return { messages: (rows ?? []).length, ...res };
  const ids = (rows ?? []).map((m: Loose) => m.id);
  if (ids.length) await deps.admin.from("mailbox_messages").update({ crm_synced_at: new Date().toISOString() }).in("id", ids);
  return { messages: ids.length, ...res };
}

async function syncGmail(deps: MailboxDeps, accountId: string, since: string | null): Promise<Loose> {
  if (!deps.gmailToken) return { ok: false, error: "gmail_unavailable" };
  const { token, email } = await deps.gmailToken(accountId);
  const h = { Authorization: `Bearer ${token}` };
  const after = since ? Math.floor(new Date(since).getTime() / 1000) - 60 : Math.floor(Date.now() / 1000) - 30 * 86400;
  const q = `(in:inbox OR in:sent) after:${after} -category:promotions -category:social -category:forums`;
  const list = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAILBOX_LIMITS.crmSyncBatch}&q=${encodeURIComponent(q)}`, { headers: h });
  if (!list.ok) return { ok: false, error: "gmail_failed" };
  const ids: string[] = ((await list.json())?.messages ?? []).map((m: Loose) => m.id).slice(0, MAILBOX_LIMITS.crmSyncBatch);
  const items: MailCrmFeedItem[] = [];
  for (const id of ids) {
    const r = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, { headers: h });
    if (!r.ok) continue;
    const m = await r.json();
    const hdr = (n: string) => (m?.payload?.headers ?? []).find((x: Loose) => String(x.name).toLowerCase() === n)?.value ?? "";
    const sent = (m?.labelIds ?? []).includes("SENT");
    const it = toCrmItem({
      ref: id, source: "gmail", account: email, direction: sent ? "out" : "in", from: hdr("from"), to: hdr("to"),
      subject: hdr("subject"), text: m?.snippet ?? "", date: hdr("date") || (m?.internalDate ? new Date(Number(m.internalDate)).toISOString() : ""),
      ownEmails: [email],
    });
    if (it) items.push(toFeedItem(it));
  }
  const res = items.length ? await deps.crmFeed!(items) : { notesAdded: 0, contactsCreated: 0 };
  return { messages: ids.length, ...res };
}

const graphAddr = (x: Loose) => {
  const e = x?.emailAddress ?? x;
  const email = String(e?.address ?? "").toLowerCase();
  return email ? (e?.name ? `${e.name} <${email}>` : email) : "";
};

async function syncOutlook(deps: MailboxDeps, since: string | null, label: string | null): Promise<Loose> {
  if (!deps.outlook) return { ok: false, error: "outlook_unavailable" };
  const r = await deps.outlook("trigger", "listMessages", { top: String(MAILBOX_LIMITS.crmSyncBatch), unreadOnly: "false" });
  if (!r.ok) return { ok: false, error: "outlook_failed", message: r.message ?? null };
  const sinceMs = since ? new Date(since).getTime() - 60_000 : Date.now() - 30 * 86400_000;
  const own = label && EMAIL_RE.test(label) ? [label.toLowerCase()] : [];
  const items: MailCrmFeedItem[] = [];
  const msgs = Array.isArray(r.data) ? r.data : [];
  for (const m of msgs) {
    const when = m?.receivedDateTime ?? m?.sentDateTime;
    if (!when || new Date(when).getTime() < sinceMs || m?.isDraft) continue;
    const from = graphAddr(m?.from);
    const out = own.length > 0 && from.toLowerCase().includes(own[0]);
    const it = toCrmItem({
      ref: String(m.id), source: "outlook", account: label ?? "Outlook", direction: out ? "out" : "in", from,
      to: (m?.toRecipients ?? []).map(graphAddr), subject: m?.subject, text: m?.bodyPreview ?? "", date: when, ownEmails: own,
    });
    if (it) items.push(toFeedItem(it));
  }
  const res = items.length ? await deps.crmFeed!(items) : { notesAdded: 0, contactsCreated: 0 };
  return { messages: msgs.length, ...res };
}

/** Sincroniza as contas com "Alimentar o CRM" ligado (ou só a pedida). `auto` respeita o intervalo mínimo. */
export async function crmSync(deps: MailboxDeps, body: Loose, auto = false): Promise<Res> {
  if (!deps.crmEnabled || !deps.crmFeed) return fail(409, "crm_disabled");
  const only = isMailSource(body?.source) ? body.source : null;
  const onlyRef = str(body?.accountRef, 200) || null;
  const results: Record<string, unknown> = {};
  const now = (deps.now?.() ?? new Date()).getTime();
  if (!only || only === "mailbox") results.mailbox = await syncMailbox(deps).catch((e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 120) }));
  const fs = (await feeds(deps)).filter((f) => f.enabled && f.source !== "mailbox" && (!only || f.source === only) && (!onlyRef || f.account_ref === onlyRef));
  for (const f of fs) {
    if (auto && f.last_synced_at && now - new Date(f.last_synced_at).getTime() < AUTO_SYNC_MS) continue;
    let r: Loose;
    try {
      r = f.source === "gmail"
        ? await syncGmail(deps, f.account_ref, f.last_synced_at)
        : await syncOutlook(deps, f.last_synced_at, f.account_label);
    } catch (e) {
      r = { ok: false, error: String((e as Error)?.message ?? e).slice(0, 120) };
    }
    results[`${f.source}:${f.account_ref}`] = r;
    const okRun = r?.ok !== false;
    await deps.admin.from("mail_crm_feeds").update({
      ...(okRun ? { last_synced_at: new Date(now).toISOString() } : {}), last_result: r, updated_at: new Date().toISOString(),
    }).eq("user_id", deps.userId).eq("source", f.source).eq("account_ref", f.account_ref);
  }
  return ok({ results });
}

// ─── ponto de entrada ──────────────────────────────────────────────────────
export async function handleMailbox(body: Loose, deps: MailboxDeps): Promise<Res> {
  const op = String(body?.op ?? "status");
  const a = deps.admin;
  switch (op) {
    case "status": {
      // Ao abrir a caixa: alimenta o CRM com o que chegou (no máximo a cada 15 min por conta). Nunca quebra o status.
      if (deps.crmEnabled && deps.crmFeed && body?.autoSync !== false) await crmSync(deps, {}, true).catch(() => null);
      const addrs = await addresses(deps);
      const { count: unread } = await a.from("mailbox_messages").select("id", { count: "exact", head: true })
        .eq("user_id", deps.userId).eq("folder", "inbox").is("read_at", null);
      return ok({
        enabled: true,
        config: { aliasDomains: deps.cfg.aliasDomains, outboundDomains: deps.cfg.outboundDomains, dailySendCap: deps.cfg.dailySendCap, globalDailySendCap: deps.cfg.globalDailySendCap, outbound: !!deps.resendKey },
        addresses: addrs, accounts: await connectedAccounts(deps), crmEnabled: deps.crmEnabled, unread: unread ?? 0,
      });
    }
    case "address_create": {
      const chk = checkNewAddress(body.localPart, body.domain, deps.cfg);
      if (!chk.ok) return fail(400, chk.error);
      const { count } = await a.from("mailbox_addresses").select("id", { count: "exact", head: true }).eq("user_id", deps.userId);
      if ((count ?? 0) >= 5) return fail(409, "address_limit");
      const { data, error } = await a.from("mailbox_addresses").insert({
        user_id: deps.userId, address: chk.address, local_part: chk.localPart, domain: chk.domain,
        display_name: str(body.displayName, 120) || null, crm_feed: deps.cfg.crmFeedDefault,
      }).select("*").single();
      if (error) return fail(409, /duplicate|unique/i.test(error.message) ? "address_taken" : "create_failed");
      return ok({ address: data });
    }
    case "address_update": {
      const id = uuid(body.id);
      if (!id) return fail(400, "missing_id");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.displayName === "string") patch.display_name = str(body.displayName, 120) || null;
      if (typeof body.signature === "string") patch.signature = str(body.signature, 2000) || null;
      if (typeof body.crmFeed === "boolean") patch.crm_feed = body.crmFeed;
      if (typeof body.active === "boolean") patch.active = body.active;
      const { data } = await a.from("mailbox_addresses").update(patch).eq("id", id).eq("user_id", deps.userId).select("*").maybeSingle();
      return data ? ok({ address: data }) : fail(404, "not_found");
    }
    case "list": {
      const folder = FOLDERS.has(String(body.folder)) ? String(body.folder) : "inbox";
      const limit = Math.min(Math.max(Math.floor(Number(body.limit) || 30), 1), 100);
      let q = a.from("mailbox_messages")
        .select("id, address_id, direction, folder, status, from_address, from_name, to_addresses, subject, snippet, has_attachments, read_at, created_at, thread_key")
        .eq("user_id", deps.userId).eq("folder", folder);
      const addrId = uuid(body.addressId);
      if (addrId) q = q.eq("address_id", addrId);
      if (typeof body.before === "string" && !Number.isNaN(Date.parse(body.before))) q = q.lt("created_at", new Date(body.before).toISOString());
      const qq = str(body.q, 100).replace(/[%_,()]/g, " ").trim();
      if (qq) q = q.or(`subject.ilike.%${qq}%,from_address.ilike.%${qq}%,snippet.ilike.%${qq}%`);
      const { data } = await q.order("created_at", { ascending: false }).limit(limit);
      return ok({ messages: data ?? [] });
    }
    case "read": {
      const id = uuid(body.id);
      const { data } = await a.from("mailbox_messages").select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
      if (!data) return fail(404, "not_found");
      if (!data.read_at) await a.from("mailbox_messages").update({ read_at: new Date().toISOString() }).eq("id", data.id);
      let thread: Loose[] = [];
      if (data.thread_key) {
        const { data: t } = await a.from("mailbox_messages").select("id, direction, from_address, from_name, subject, snippet, created_at")
          .eq("user_id", deps.userId).eq("thread_key", data.thread_key).neq("id", data.id).order("created_at", { ascending: true }).limit(50);
        thread = t ?? [];
      }
      return ok({ message: { ...data, read_at: data.read_at ?? new Date().toISOString() }, thread });
    }
    case "mark": {
      const id = uuid(body.id);
      const { data } = await a.from("mailbox_messages").update({ read_at: body.read === false ? null : new Date().toISOString() })
        .eq("id", id).eq("user_id", deps.userId).select("id").maybeSingle();
      return data ? ok() : fail(404, "not_found");
    }
    case "move": {
      const id = uuid(body.id);
      const folder = String(body.folder);
      if (!FOLDERS.has(folder)) return fail(400, "invalid_folder");
      const { data } = await a.from("mailbox_messages").update({ folder }).eq("id", id).eq("user_id", deps.userId).select("id").maybeSingle();
      return data ? ok() : fail(404, "not_found");
    }
    case "send":
      return send(deps, body);
    case "feed_set": {
      const source = String(body.source);
      if (source !== "gmail" && source !== "outlook") return fail(400, "invalid_source");
      const ref = source === "outlook" ? "microsoft-outlook" : uuid(body.accountRef);
      if (!ref) return fail(400, "missing_account");
      let label: string | null = null;
      if (source === "gmail") {
        const { data: g } = await a.from("gmail_accounts").select("id, email").eq("id", ref).eq("user_id", deps.userId).maybeSingle();
        if (!g) return fail(404, "account_not_found");
        label = g.email;
      } else {
        const { data: o } = await a.from("fluxos_connections").select("status, screen_name").eq("user_id", deps.userId).eq("app_key", "microsoft-outlook").maybeSingle();
        if (!o || o.status !== "connected") return fail(409, "outlook_not_connected");
        label = o.screen_name ?? null;
      }
      const enabled = body.enabled === true;
      const { error } = await a.from("mail_crm_feeds").upsert({
        user_id: deps.userId, source, account_ref: ref, account_label: label, enabled, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,source,account_ref" });
      if (error) return fail(500, "save_failed");
      return ok({ source, accountRef: ref, enabled });
    }
    case "crm_sync":
      return crmSync(deps, body, false);
    case "outlook_list":
    case "outlook_read":
    case "outlook_send":
    case "outlook_reply": {
      if (!deps.outlook) return fail(503, "outlook_unavailable");
      let r;
      if (op === "outlook_list") {
        const top = String(Math.min(Math.max(Math.floor(Number(body.top) || 25), 1), 50));
        const search = str(body.search, 200);
        r = await deps.outlook("trigger", "listMessages", { top, unreadOnly: "false", ...(search ? { search } : {}) });
      } else if (op === "outlook_read") {
        const id = str(body.messageId, 400);
        if (!id) return fail(400, "missing_id");
        r = await deps.outlook("trigger", "getMessage", { messageId: id });
      } else if (op === "outlook_send") {
        const to = parseAddressList(body.to).map((x) => x.email);
        const cc = parseAddressList(body.cc).map((x) => x.email);
        if (!to.length) return fail(400, "invalid_recipient");
        const subject = safeHeader(body.subject, MAILBOX_LIMITS.maxSubject);
        const text = String(body.body ?? "").slice(0, 50_000);
        if (!subject || !text.trim()) return fail(400, "missing_subject_or_body");
        r = await deps.outlook("action", "sendEmail", { to: to.join(","), subject, body: text, bodyType: "Text", ...(cc.length ? { cc: cc.join(",") } : {}) });
      } else {
        const id = str(body.messageId, 400);
        const comment = String(body.comment ?? "").slice(0, 50_000);
        if (!id || !comment.trim()) return fail(400, "missing_id_or_text");
        r = await deps.outlook("action", "replyToEmail", { messageId: id, comment, replyAll: "false" });
      }
      if (!r.ok) return fail(r.error === "not_connected" ? 409 : 502, r.error ?? "outlook_failed", { message: r.message ?? null });
      if (op === "outlook_list") return ok({ messages: Array.isArray(r.data) ? r.data : [] });
      if (op === "outlook_read") return ok({ message: Array.isArray(r.data) ? r.data[0] ?? null : null });
      return ok({ result: r.data ?? null });
    }
  }
  return fail(404, "unknown_op");
}
