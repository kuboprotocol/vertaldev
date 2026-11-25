// Vertal Growth Team · operações do servidor (action "growth" da edge function vertal-code-ai).
//
// A captação usa o Vertal Prospector (mesmas tabelas, mesmo portão de envio). Esta camada
// cuida do projeto (Vibe Code), da cobrança única de 20 créditos (atômica, idempotente, com
// devolução), da conversão e da retenção (contatos, rascunhos, Stripe, inatividade), da
// equipe de agentes (planos para o Vertal Agentes + Vertal Fluxos) e do painel por etapa.
// Tudo que é rede, banco, créditos e modelo entra por `deps` (o Vitest usa dublês).
// Nada sai para um contato sem uma mensagem APROVADA; o piloto automático só o dev liga.

import {
  classifyInbound, dailyCap, extractJson, isBlocked, isEmail, normalizeDnc, normalizeWebsite, OSM_KEYS, parseCompanyProfile,
  parseIcp, icpMissing, waLink,
} from "../vertalProspector/core.ts";
import { gmailPlainText, safeFetchText, startOfDaySp, type ModelMessage, type ProspectorResult } from "../vertalProspector/handler.ts";
import { b64url, buildMime } from "../gmailOps.ts";
import {
  abuseProblems, autopilotRequestOk, BUSINESS_MODELS, DRAFT_SYSTEM, fallbackDraft, GROWTH_AGENT_RUN_COST, GROWTH_CHARGE_REASON, GROWTH_KINDS,
  GROWTH_LAUNCH_COST, growthChargeOn, growthFooter, growthLang, growthSendGate, growthTextProblems, icpSystemFor, inferBusinessModel, KIND_DELAY_DAYS,
  KIND_STAGE, LANG_NAME, MAX_ACTIVE_CAMPAIGNS, MAX_CONTACTS_PER_CAMPAIGN, maxLaunchesPerDay, maxLeadsPerCampaign, parseDraft, planTeam, readProject,
  stageLabels, STAGES, teamEvent, type BusinessModel, type GrowthEnv, type GrowthEventType, type GrowthKind, type GrowthLang, type Stage,
} from "./core.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type DebitResult = { ok: true; charged: number; free?: boolean; balanceAfter?: number | null } | { ok: false; error: "insufficient_credits" | "duplicate_request" | "charge_failed" };

export interface GrowthDeps {
  admin: Loose;
  userId: string;
  env: GrowthEnv;
  fetch: typeof fetch;
  callModel: (messages: ModelMessage[], o: { json: boolean; maxTokens: number }) => Promise<{ content: string; label?: string }>;
  gmailToken: (accountId: string) => Promise<{ token: string; email: string }>;
  /** Créditos: débito atômico e idempotente (chave) + devolução idempotente. */
  credits: {
    debit: (amount: number, key: string, metadata: Record<string, unknown>) => Promise<DebitResult>;
    refund: (amount: number, key: string, metadata: Record<string, unknown>) => Promise<boolean>;
  };
  /** Chave do Stripe do Cofre do próprio dev (só leitura), ou null. */
  stripeKey: () => Promise<string | null>;
  /** O dev tem estes segredos no Cofre? (só nomes; nada é decifrado) */
  hasSecrets: (envKeys: string[]) => Promise<boolean>;
  /** Operações do Vertal Prospector (captação) com as mesmas dependências. */
  prospector: (body: Record<string, unknown>) => Promise<ProspectorResult>;
  now?: () => Date;
  log?: (msg: string) => void;
}

const ok = (body: Record<string, unknown>): ProspectorResult => ({ status: 200, body: { ok: true, ...body } });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): ProspectorResult => ({ status, body: { error, ...extra } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export const GROWTH_OPS = [
  "status", "list", "analyze_project", "launch", "get", "plan_team", "save_team", "sync", "add_contact", "update_contact", "delete_contact",
  "update_message", "approve", "reject", "send", "whatsapp_link", "mark_sent", "update_settings", "set_autopilot", "delete",
] as const;
export type GrowthOp = (typeof GROWTH_OPS)[number];

/** Segredos do Vertal Agentes no Cofre do dev (sem eles a equipe de agentes não é criada). */
const AGENT_SECRETS = ["HUGINN_URL", "HUGINN_USERNAME", "HUGINN_PASSWORD"];

const T = {
  g: "growth_campaigns", c: "growth_contacts", m: "growth_messages", e: "growth_events",
  pc: "prospector_campaigns", pl: "prospector_leads", pm: "prospector_messages", d: "prospector_dnc",
} as const;

// ─── Banco ───────────────────────────────────────────────────────────────

async function loadGrowth(deps: GrowthDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.g).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}
async function loadContact(deps: GrowthDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.c).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}
async function loadMsg(deps: GrowthDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.m).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}
async function loadDnc(deps: GrowthDeps): Promise<Array<{ kind: string; value: string }>> {
  const { data } = await deps.admin.from(T.d).select("kind, value").eq("user_id", deps.userId).limit(5000);
  return data ?? [];
}
async function logEvent(deps: GrowthDeps, growthId: string | null, kind: string, detail: Record<string, unknown> = {}) {
  try {
    await deps.admin.from(T.e).insert({ user_id: deps.userId, growth_id: growthId, kind, detail });
  } catch {
    /* log é opcional */
  }
}

/** Envios de e-mail de hoje (Brasília): Prospector + equipe, mesmo limite diário. */
export async function sentTodayAll(deps: GrowthDeps, now: Date): Promise<number> {
  const since = startOfDaySp(now);
  const a = await deps.admin.from(T.pm).select("id").eq("user_id", deps.userId).eq("direction", "out").eq("channel", "email")
    .eq("status", "sent").gte("sent_at", since).limit(500);
  const b = await deps.admin.from(T.m).select("id").eq("user_id", deps.userId).eq("channel", "email").eq("status", "sent").gte("sent_at", since).limit(500);
  return (a.data ?? []).length + (b.data ?? []).length;
}

const settingsOf = (g: Loose) => (g?.settings ?? {}) as Record<string, Loose>;
const langOf = (g: Loose): GrowthLang => growthLang(g?.lang);
const productOf = (g: Loose) => String(g?.project_name ?? "").slice(0, 120);

async function model(deps: GrowthDeps, system: string, user: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  const r = await deps.callModel([{ role: "system", content: system }, { role: "user", content: user }], { json: true, maxTokens });
  return extractJson(r.content);
}

/** Cria um rascunho (modelo com reserva de texto pronto). Não duplica o mesmo tipo para o mesmo contato. */
async function createDraft(
  deps: GrowthDeps, g: Loose, contact: Loose, kind: GrowthKind, now: Date, budget: { model: number }, detail = "",
): Promise<boolean> {
  const { data: dup } = await deps.admin.from(T.m).select("id").eq("contact_id", contact.id).eq("user_id", deps.userId).eq("kind", kind)
    .in("status", ["draft", "approved", "sending"]).limit(1);
  if ((dup ?? []).length) return false;
  const lang = langOf(g);
  const s = settingsOf(g);
  const link = typeof s.bookingLink === "string" && /^https:\/\//.test(s.bookingLink) ? s.bookingLink : (g.project_url || "");
  let draft: { subject: string; body: string } | null = null;
  if (budget.model > 0) {
    budget.model--;
    const out = await model(deps, DRAFT_SYSTEM, [
      `IDIOMA: ${LANG_NAME[lang]}`,
      `TIPO: ${kind}`,
      `MODELO: ${g.model}${g.subscription ? " (assinatura)" : ""}`,
      `PROJETO: ${productOf(g)}`,
      `OFERTA (DADOS): ${String(g.profile?.offer ?? g.description ?? "").slice(0, 600)}`,
      link ? `${kind.startsWith("conversion") ? "LINK DE AGENDA/SITE" : "SITE"}: ${link}` : "",
      `CONTATO: ${str(contact.name, 80) || "(sem nome)"}`,
      detail ? `CONTEXTO (DADOS): ${detail.slice(0, 800)}` : "",
    ].filter(Boolean).join("\n"), 500).catch(() => null);
    draft = parseDraft(out);
    if (draft && growthTextProblems(kind, draft.subject, draft.body).length) draft = null;
  }
  if (!draft) draft = fallbackDraft(lang, kind, { name: contact.name, product: productOf(g), link });
  const sender = { name: str(s.senderName, 80), company: str(s.senderCompany, 120) || productOf(g) };
  await deps.admin.from(T.m).insert({
    user_id: deps.userId, growth_id: g.id, contact_id: contact.id, stage: KIND_STAGE[kind], kind, channel: "email",
    subject: draft.subject, body: draft.body, footer: growthFooter(lang, sender, contact.source), status: "draft",
    send_after: new Date(now.getTime() + KIND_DELAY_DAYS[kind] * 86_400_000).toISOString(), meta: { lang },
  });
  return true;
}

async function stripeGet(deps: GrowthDeps, key: string, path: string): Promise<Loose | null> {
  try {
    const r = await deps.fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) {
      await r.body?.cancel();
      return null;
    }
    return await r.json();
  } catch {
    return null;
  }
}

// ─── Painel ──────────────────────────────────────────────────────────────

export function dashboard(model: BusinessModel, leads: Loose[], contacts: Loose[], messages: Loose[]) {
  const by = (st: string[]) => contacts.filter((c) => st.includes(c.status)).length;
  const leadReplied = leads.filter((l) => ["replied", "meeting", "won"].includes(l.status)).length;
  return {
    captacao: {
      leads: leads.length,
      contacted: leads.filter((l) => ["contacted", "replied", "meeting", "won", "lost"].includes(l.status)).length,
      replies: leadReplied,
      optedOut: leads.filter((l) => l.status === "opted_out").length,
    },
    conversao: {
      engaged: by(["engaged"]),
      conversions: by(["converted", "active", "at_risk", "won_back", "churned"]),
      drafts: messages.filter((m) => m.stage === "conversao" && m.status === "draft").length,
    },
    retencao: {
      active: by(["converted", "active", "won_back"]),
      atRisk: by(["at_risk"]),
      churned: by(["churned"]),
      wonBack: by(["won_back"]),
      drafts: messages.filter((m) => m.stage === "retencao" && m.status === "draft").length,
    },
    unit: model === "nonprofit" ? "donors" : "customers",
  };
}

// ─── Operações ───────────────────────────────────────────────────────────

export async function handleGrowth(body: Record<string, Loose>, deps: GrowthDeps): Promise<ProspectorResult> {
  const op = String(body?.op ?? "status") as GrowthOp;
  if (!(GROWTH_OPS as readonly string[]).includes(op)) return err(400, "unknown_op");
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? ((m: string) => console.log(m));

  if (!["status", "list", "get"].includes(op)) {
    try {
      const { data: rl } = await deps.admin.rpc("bump_rate_limit", { _bucket: "vertal_growth", _user: deps.userId, _window_seconds: 60 });
      if (typeof rl === "number" && rl > 40) return err(429, "rate_limited");
    } catch {
      /* sem limitador: segue */
    }
  }

  switch (op) {
    case "status": {
      const { data: accounts } = await deps.admin.from("gmail_accounts").select("id, email").eq("user_id", deps.userId);
      const { data: conns } = await deps.admin.from("fluxos_connections").select("app_key, status").eq("user_id", deps.userId);
      const apps = ((conns ?? []) as Loose[]).filter((c) => c.status === "connected").map((c) => c.app_key);
      return ok({
        enabled: true, chargeOn: growthChargeOn(deps.env), launchCost: GROWTH_LAUNCH_COST, runCost: GROWTH_AGENT_RUN_COST,
        maxLeads: maxLeadsPerCampaign(deps.env), cap: dailyCap(deps.env), sentToday: await sentTodayAll(deps, now),
        gmailAccounts: accounts ?? [], fluxosApps: apps, stripe: await deps.hasSecrets(["STRIPE_SECRET_KEY"]).catch(() => false),
        agents: await deps.hasSecrets(AGENT_SECRETS).catch(() => false),
      });
    }

    case "list": {
      const { data } = await deps.admin.from(T.g).select("id, project_id, project_name, model, status, created_at, prospector_campaign_id")
        .eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(50);
      return ok({ campaigns: data ?? [] });
    }

    case "analyze_project": {
      if (!isUuid(body.projectId)) return err(400, "project_required");
      const { data: p } = await deps.admin.from("projects").select("id, title, description, generated_code, published_url, is_published")
        .eq("id", body.projectId).eq("user_id", deps.userId).maybeSingle();
      if (!p) return err(404, "project_not_found");
      let extra = "";
      if (!p.generated_code && p.is_published && p.published_url) {
        const page = await safeFetchText(deps.fetch, p.published_url).catch(() => null);
        extra = page?.html ?? "";
      }
      const read = readProject(p, extra);
      const inference = inferBusinessModel(`${read.name}\n${read.description}\n${read.copy}`);
      return ok({
        project: { id: p.id, title: str(p.title, 120), url: read.website || null },
        prefill: { name: read.name, description: read.description, website: read.website },
        inference, lang: growthLang(body.lang, read.copy),
      });
    }

    case "launch": {
      if (body.acceptCost !== true) return err(400, "cost_not_accepted");
      const key = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.idempotencyKey) ? body.idempotencyKey : "";
      if (!key) return err(400, "idempotency_key_required");
      const name = str(body.name, 120);
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 1_500) : "";
      const bmodel = BUSINESS_MODELS.includes(body.model) ? (body.model as BusinessModel) : null;
      const website = body.website ? normalizeWebsite(String(body.website)) : null;
      const area = str(body.area, 120);
      const lang = growthLang(body.lang);
      if (!name) return err(400, "name_required");
      if (!bmodel) return err(400, "model_required");
      if (body.website && !website) return err(400, "invalid_website");
      const abuse = abuseProblems(`${name}\n${description}`);
      if (abuse.length) return err(400, "blocked_content", { problems: abuse });
      // Repetição do mesmo pedido (mesma chave): devolve a campanha que já existe, sem cobrar de novo.
      const { data: same } = await deps.admin.from(T.g).select("*").eq("user_id", deps.userId).eq("charge_key", key).limit(1);
      if ((same ?? [])[0]) return ok({ growth: same[0], prospectorCampaignId: same[0].prospector_campaign_id, replayed: true });
      const { data: active } = await deps.admin.from(T.g).select("id").eq("user_id", deps.userId).eq("status", "active").limit(MAX_ACTIVE_CAMPAIGNS + 1);
      if ((active ?? []).length >= MAX_ACTIVE_CAMPAIGNS) return err(400, "too_many_campaigns", { max: MAX_ACTIVE_CAMPAIGNS });
      const { data: today } = await deps.admin.from(T.g).select("id").eq("user_id", deps.userId).gte("created_at", startOfDaySp(now)).limit(50);
      if ((today ?? []).length >= maxLaunchesPerDay(deps.env)) return err(429, "launch_limit", { max: maxLaunchesPerDay(deps.env) });
      let projectId: string | null = null;
      let copy = "";
      let projectUrl = website;
      if (isUuid(body.projectId)) {
        const { data: p } = await deps.admin.from("projects").select("id, title, description, generated_code, published_url, is_published")
          .eq("id", body.projectId).eq("user_id", deps.userId).maybeSingle();
        if (!p) return err(404, "project_not_found");
        projectId = p.id;
        const r = readProject(p);
        copy = r.copy;
        projectUrl = projectUrl || r.website || null;
      }

      // 1) Cobrança única (atômica e idempotente). Devolvida se qualquer passo abaixo falhar.
      const chargeKey = `growth:${key}`;
      const meta = { source: GROWTH_CHARGE_REASON, projectId, model: bmodel, retail_note: "preço fixo de 20 créditos; custo estimado do modelo só no log" };
      let charged = 0;
      let free = false;
      if (growthChargeOn(deps.env)) {
        const d = await deps.credits.debit(GROWTH_LAUNCH_COST, chargeKey, meta);
        if (!d.ok) return err(d.error === "insufficient_credits" ? 402 : d.error === "duplicate_request" ? 409 : 500, d.error);
        charged = d.charged;
        free = !!d.free;
      }
      const refund = async (why: string) => {
        if (charged > 0) {
          const back = await deps.credits.refund(charged, chargeKey, { ...meta, why });
          await logEvent(deps, null, back ? "refund" : "refund_failed", { key: chargeKey, credits: charged, why });
          log(`[vertal-growth] devolução ${back ? "ok" : "FALHOU"} (${charged} créditos, ${why})`);
        }
      };

      try {
        // 2) Perfil + ICP (alvos conforme o modelo de negócio), via o mesmo roteador de modelos.
        let siteText = "";
        if (projectUrl && !copy) {
          const page = await safeFetchText(deps.fetch, projectUrl).catch(() => null);
          if (page) siteText = page.html;
        }
        const user = [
          `PROJETO: ${name}`,
          `MODELO: ${bmodel}${body.subscription ? " (assinatura)" : ""}`,
          area ? `REGIÃO PEDIDA: ${area}` : "",
          description ? `DESCRIÇÃO DO DEV (DADOS): ${description}` : "",
          copy || siteText ? `PÁGINA DO PROJETO (DADOS):\n${(copy || siteText).slice(0, 7_000)}` : "",
        ].filter(Boolean).join("\n\n");
        const out = await model(deps, icpSystemFor(bmodel, OSM_KEYS), user, 1_200).catch(() => null);
        if (!out) {
          await refund("model_failed");
          return err(502, "model_failed", { refunded: charged });
        }
        const profile = parseCompanyProfile(out.profile);
        if (!profile.offer) profile.offer = description.slice(0, 600);
        const icp = parseIcp(out.icp);
        if (area) icp.area = area;
        const maxLeads = maxLeadsPerCampaign(deps.env);
        const { data: pc, error: pcErr } = await deps.admin.from(T.pc).insert({
          user_id: deps.userId, company_name: name, website: projectUrl, profile, icp, status: "icp_pending",
          settings: { senderCompany: name, maxLeads, growth: true },
        }).select("*").single();
        if (pcErr || !pc) {
          await refund("db_error");
          return err(500, "db_error", { refunded: charged });
        }
        const { data: g, error: gErr } = await deps.admin.from(T.g).insert({
          user_id: deps.userId, project_id: projectId, project_name: name, project_url: projectUrl, description, model: bmodel,
          subscription: body.subscription === true, lang, profile, prospector_campaign_id: pc.id, status: "active",
          settings: { autopilot: false, bookingLink: null, inactivityDays: 30, senderCompany: name, maxLeads },
          team: {}, charge_key: key, charge: { key: chargeKey, credits: charged, free, at: now.toISOString() },
        }).select("*").single();
        if (gErr || !g) {
          await deps.admin.from(T.pc).delete().eq("id", pc.id).eq("user_id", deps.userId);
          await refund("db_error");
          return err(500, "db_error", { refunded: charged });
        }
        await deps.admin.from(T.pc).update({ settings: { ...(pc.settings ?? {}), growthId: g.id } }).eq("id", pc.id).eq("user_id", deps.userId);
        await logEvent(deps, g.id, "launch", { credits: charged, free, key: chargeKey, model: bmodel, projectId });
        log(`[vertal-growth] lançado ${g.id} modelo=${bmodel} créditos=${charged}${free ? " (admin, sem débito)" : ""}`);
        return ok({ growth: g, prospectorCampaignId: pc.id, missing: icpMissing(icp), charged, free });
      } catch (e) {
        await refund("exception");
        throw e;
      }
    }

    case "get": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      const [{ data: leads }, { data: contacts }, { data: messages }, { data: events }, { data: pc }] = await Promise.all([
        deps.admin.from(T.pl).select("id, name, email, status, fit, domain").eq("campaign_id", g.prospector_campaign_id).eq("user_id", deps.userId).limit(1000),
        deps.admin.from(T.c).select("*").eq("growth_id", g.id).eq("user_id", deps.userId).order("updated_at", { ascending: false }).limit(1000),
        deps.admin.from(T.m).select("*").eq("growth_id", g.id).eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(500),
        deps.admin.from(T.e).select("kind, detail, created_at").eq("growth_id", g.id).eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(20),
        deps.admin.from(T.pc).select("id, status, icp").eq("id", g.prospector_campaign_id).eq("user_id", deps.userId).maybeSingle(),
      ]);
      return ok({
        growth: g, prospector: pc ?? null, stages: stageLabels(g.model, langOf(g)),
        dashboard: dashboard(g.model, leads ?? [], contacts ?? [], messages ?? []),
        contacts: contacts ?? [], messages: messages ?? [], events: events ?? [],
        cap: dailyCap(deps.env), sentToday: await sentTodayAll(deps, now),
      });
    }

    case "plan_team": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      const { data: conns } = await deps.admin.from("fluxos_connections").select("app_key, status").eq("user_id", deps.userId);
      const apps = ((conns ?? []) as Loose[]).filter((c) => c.status === "connected").map((c) => c.app_key);
      const plan = planTeam(apps, langOf(g));
      return ok({ ...plan, connected: apps, runCost: GROWTH_AGENT_RUN_COST, agents: await deps.hasSecrets(AGENT_SECRETS).catch(() => false), stages: stageLabels(g.model, langOf(g)) });
    }

    case "save_team": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      const t = (body.team ?? {}) as Record<string, unknown>;
      const id = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 1e12 ? (v as number) : null);
      const webhookAgentId = id(t.webhookAgentId);
      if (!webhookAgentId) return err(400, "invalid_team");
      const agents = (Array.isArray(t.agents) ? t.agents : []).slice(0, 8).map((a: Loose) => ({
        preset: str(a?.preset, 40), stage: STAGES.includes(a?.stage) ? a.stage : "captacao", event: str(a?.event, 30),
        triggerAgentId: id(a?.triggerAgentId), agentId: id(a?.agentId), app: str(a?.app, 40), key: str(a?.key, 60),
      })).filter((a: Loose) => a.agentId && a.triggerAgentId);
      const team = { webhookAgentId, agents, createdAt: now.toISOString() };
      await deps.admin.from(T.g).update({ team, updated_at: now.toISOString() }).eq("id", g.id).eq("user_id", deps.userId);
      await logEvent(deps, g.id, "team_saved", { agents: agents.length, webhookAgentId });
      return ok({ team });
    }

    case "sync": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      const s = settingsOf(g);
      const summary = { newLeads: 0, engaged: 0, customers: 0, atRisk: 0, churned: 0, optOuts: 0, replies: 0, drafts: 0, autoSent: 0, stripe: false };
      const events: Array<ReturnType<typeof teamEvent>> = [];
      const budget = { model: 4 };
      const project = productOf(g);
      const dnc = await loadDnc(deps);

      // a) Respostas da captação (mesma leitura do Prospector).
      const { data: sentP } = await deps.admin.from(T.pm).select("id").eq("campaign_id", g.prospector_campaign_id).eq("user_id", deps.userId)
        .eq("status", "sent").eq("channel", "email").limit(1);
      if ((sentP ?? []).length) await deps.prospector({ op: "check_replies", campaignId: g.prospector_campaign_id }).catch(() => null);

      const { data: leadsRaw } = await deps.admin.from(T.pl).select("*").eq("campaign_id", g.prospector_campaign_id).eq("user_id", deps.userId).limit(1000);
      const { data: contactsRaw } = await deps.admin.from(T.c).select("*").eq("growth_id", g.id).eq("user_id", deps.userId).limit(MAX_CONTACTS_PER_CAMPAIGN);
      const contacts: Loose[] = contactsRaw ?? [];
      const byLead = new Map(contacts.filter((c) => c.lead_id).map((c) => [c.lead_id, c]));
      const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
      const addContact = async (row: Record<string, unknown>) => {
        if (contacts.length >= MAX_CONTACTS_PER_CAMPAIGN) return null;
        const { data } = await deps.admin.from(T.c).insert({ user_id: deps.userId, growth_id: g.id, ...row }).select("*").single();
        if (data) {
          contacts.push(data);
          if (data.lead_id) byLead.set(data.lead_id, data);
          if (data.email) byEmail.set(String(data.email).toLowerCase(), data);
        }
        return data ?? null;
      };
      const patch = async (c: Loose, p: Record<string, unknown>) => {
        Object.assign(c, p);
        await deps.admin.from(T.c).update({ ...p, updated_at: now.toISOString() }).eq("id", c.id).eq("user_id", deps.userId);
      };
      const cancelDrafts = async (c: Loose) =>
        deps.admin.from(T.m).update({ status: "cancelled", updated_at: now.toISOString() }).eq("contact_id", c.id).eq("user_id", deps.userId).in("status", ["draft", "approved"]);

      // Intenção da resposta (rascunho de resposta do Prospector guarda meta.intent).
      const { data: replyDrafts } = await deps.admin.from(T.pm).select("lead_id, meta").eq("campaign_id", g.prospector_campaign_id).eq("user_id", deps.userId)
        .eq("kind", "reply").eq("direction", "out").limit(1000);
      const positive = new Set(((replyDrafts ?? []) as Loose[]).filter((r) => ["interessado", "duvida"].includes(r.meta?.intent)).map((r) => r.lead_id));

      for (const l of (leadsRaw ?? []) as Loose[]) {
        let c = byLead.get(l.id);
        const lname = str(l.decision_maker?.name, 120) || str(l.name, 120);
        if (l.status === "opted_out") {
          if (c && c.status !== "opted_out") {
            await patch(c, { status: "opted_out" });
            await cancelDrafts(c);
            summary.optOuts++;
          }
          continue;
        }
        if (!c && ["contacted", "replied", "meeting", "won"].includes(l.status)) {
          c = await addContact({
            lead_id: l.id, email: l.email ? String(l.email).toLowerCase() : null, email_status: l.email_status ?? "unknown", name: lname, company: str(l.name, 120),
            phone: l.whatsapp ?? l.phone ?? null, stage: "captacao", status: "lead", source: "prospector", last_activity_at: now.toISOString(),
          });
          if (c) {
            summary.newLeads++;
            events.push(teamEvent("new_lead", { project, name: lname, email: l.email, phone: l.phone, company: l.name, website: l.website, detail: l.signals?.why ?? "", stage: "captacao" }));
          }
        }
        if (!c) continue;
        const isPositive = l.status === "meeting" || l.status === "won" || (l.status === "replied" && positive.has(l.id));
        if (isPositive && c.status === "lead") {
          await patch(c, { stage: l.status === "won" ? "retencao" : "conversao", status: l.status === "won" ? "converted" : "engaged", last_activity_at: now.toISOString() });
          summary.engaged++;
          events.push(teamEvent("reply_positive", { project, name: c.name, email: c.email, phone: c.phone, company: c.company, detail: "respondeu com interesse", stage: "conversao" }));
          // O 1º passo da conversão é o rascunho de resposta do Prospector (com horários); aqui entra o lembrete.
          if (l.status !== "won" && await createDraft(deps, g, c, "conversion2", now, budget, "A pessoa respondeu com interesse à 1ª mensagem.")) summary.drafts++;
        }
      }

      // b) Stripe (só leitura, chave do Cofre do próprio dev): assinatura nova = cliente/doador; cancelada/atrasada = risco.
      const key = await deps.stripeKey().catch(() => null);
      if (key) {
        summary.stripe = true;
        const since = Math.floor(new Date(g.created_at ?? now).getTime() / 1000);
        const subs = await stripeGet(deps, key, `subscriptions?status=all&limit=100&expand[]=data.customer`);
        for (const sub of ((subs?.data ?? []) as Loose[])) {
          const email = String(sub?.customer?.email ?? "").toLowerCase();
          if (!isEmail(email) || isBlocked(dnc, { email })) continue;
          const nm = str(sub?.customer?.name, 120);
          let c = byEmail.get(email);
          const st = String(sub.status ?? "");
          if (["active", "trialing"].includes(st)) {
            if (!c && Number(sub.created) >= since) {
              c = await addContact({ email, email_status: "verified", name: nm, stage: "retencao", status: "converted", source: "stripe", external_id: str(sub.id, 80), last_activity_at: now.toISOString() });
              if (c) {
                summary.customers++;
                events.push(teamEvent("new_customer", { project, name: nm, email, detail: g.model === "nonprofit" ? "doação recorrente" : "assinatura nova", stage: "retencao" }));
                if (await createDraft(deps, g, c, g.model === "nonprofit" ? "thanks" : "onboarding", now, budget)) summary.drafts++;
              }
            } else if (c && ["lead", "engaged"].includes(c.status)) {
              await patch(c, { stage: "retencao", status: "converted", external_id: str(sub.id, 80), last_activity_at: now.toISOString() });
              if (c.lead_id) await deps.admin.from(T.pl).update({ status: "won", updated_at: now.toISOString() }).eq("id", c.lead_id).eq("user_id", deps.userId);
              await cancelDrafts(c);
              summary.customers++;
              events.push(teamEvent("new_customer", { project, name: c.name, email, detail: "virou cliente", stage: "retencao" }));
              if (await createDraft(deps, g, c, g.model === "nonprofit" ? "thanks" : "onboarding", now, budget)) summary.drafts++;
            } else if (c && c.status === "churned") {
              await patch(c, { status: "won_back", last_activity_at: now.toISOString() });
              await cancelDrafts(c);
            }
          } else if (c && ["canceled", "unpaid", "incomplete_expired", "past_due"].includes(st) && ["converted", "active", "won_back", "at_risk"].includes(c.status)) {
            const churned = st !== "past_due";
            if (!churned && c.status === "at_risk") continue;
            await patch(c, { status: churned ? "churned" : "at_risk" });
            if (churned) summary.churned++;
            else summary.atRisk++;
            events.push(teamEvent("churn_risk", { project, name: c.name, email, detail: churned ? "cancelou" : "pagamento atrasado", stage: "retencao" }));
            if (await createDraft(deps, g, c, churned ? "winback" : "checkin", now, budget)) summary.drafts++;
          }
        }
        if (g.model === "nonprofit") {
          const charges = await stripeGet(deps, key, `charges?limit=100&created[gte]=${since}`);
          for (const ch of ((charges?.data ?? []) as Loose[])) {
            if (ch?.status !== "succeeded" || ch?.invoice) continue; // recorrente já entrou pelas assinaturas
            const email = String(ch?.billing_details?.email ?? ch?.receipt_email ?? "").toLowerCase();
            if (!isEmail(email) || byEmail.has(email) || isBlocked(dnc, { email })) continue;
            const c = await addContact({ email, email_status: "verified", name: str(ch?.billing_details?.name, 120), stage: "conversao", status: "converted", source: "stripe", external_id: str(ch.id, 80), last_activity_at: now.toISOString() });
            if (!c) continue;
            summary.customers++;
            events.push(teamEvent("new_customer", { project, name: c.name, email, detail: "primeira doação", stage: "conversao" }));
            if (await createDraft(deps, g, c, "thanks", now, budget)) summary.drafts++;
          }
        }
      }

      // c) Respostas aos e-mails da equipe (parar → não contatar; resposta → atividade).
      const { data: sentG } = await deps.admin.from(T.m).select("*").eq("growth_id", g.id).eq("user_id", deps.userId).eq("status", "sent")
        .order("sent_at", { ascending: false }).limit(20);
      const tokens = new Map<string, { token: string; email: string }>();
      for (const m of (sentG ?? []) as Loose[]) {
        if (!m.gmail_thread_id || !m.gmail_account_id) continue;
        let tk = tokens.get(m.gmail_account_id);
        if (!tk) {
          try {
            tk = await deps.gmailToken(m.gmail_account_id);
            tokens.set(m.gmail_account_id, tk);
          } catch {
            continue;
          }
        }
        let thread: Loose = null;
        try {
          const r = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(m.gmail_thread_id)}?format=full`, { headers: { Authorization: `Bearer ${tk.token}` } });
          thread = r.ok ? await r.json() : null;
        } catch {
          thread = null;
        }
        const seen = new Set<string>(Array.isArray(m.meta?.seenIds) ? m.meta.seenIds : []);
        const c = contacts.find((x) => x.id === m.contact_id);
        for (const gm of ((thread?.messages ?? []) as Loose[])) {
          if (!gm?.id || gm.id === m.gmail_message_id || seen.has(gm.id)) continue;
          seen.add(gm.id);
          const headers = (gm.payload?.headers ?? []) as Array<{ name: string; value: string }>;
          const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
          if (h("from").toLowerCase().includes(tk.email.toLowerCase())) continue;
          const kind = classifyInbound(h("from"), h("subject"), gmailPlainText(gm.payload).slice(0, 3_000) || String(gm.snippet ?? ""));
          if (!c || kind === "auto_reply") continue;
          if (kind === "opt_out" || kind === "bounce") {
            const email = normalizeDnc("email", c.email ?? "");
            if (email && kind === "opt_out") await deps.admin.from(T.d).upsert({ user_id: deps.userId, kind: "email", value: email, reason: "pediu para parar (Vertal Growth)" }, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
            await patch(c, kind === "opt_out" ? { status: "opted_out" } : { email_status: "invalid" });
            await cancelDrafts(c);
            summary.optOuts += kind === "opt_out" ? 1 : 0;
          } else {
            summary.replies++;
            await patch(c, { last_activity_at: now.toISOString(), ...(c.status === "churned" ? { status: "won_back" } : c.status === "at_risk" ? { status: "active" } : {}) });
          }
        }
        await deps.admin.from(T.m).update({ meta: { ...(m.meta ?? {}), seenIds: [...seen].slice(-50) } }).eq("id", m.id).eq("user_id", deps.userId);
      }

      // d) Inatividade: cliente/doador sem contato há N dias → check-in (rascunho para aprovar).
      const days = Math.max(7, Math.min(Number(s.inactivityDays) || 30, 180));
      const cutoff = now.getTime() - days * 86_400_000;
      for (const c of contacts) {
        if (!["converted", "active", "won_back"].includes(c.status)) continue;
        if (!c.last_activity_at || new Date(c.last_activity_at).getTime() > cutoff) continue;
        await patch(c, { status: "at_risk" });
        summary.atRisk++;
        events.push(teamEvent("churn_risk", { project, name: c.name, email: c.email, detail: `sem contato há ${days} dias`, stage: "retencao" }));
        if (await createDraft(deps, g, c, "checkin", now, budget)) summary.drafts++;
      }

      // e) Piloto automático (só se o PRÓPRIO dev ligou nas configurações): aprova e envia o que passa no portão.
      if (s.autopilot === true && s.autopilotBy === "user") {
        const accountId = isUuid(s.gmailAccountId) ? s.gmailAccountId : ((await deps.admin.from("gmail_accounts").select("id").eq("user_id", deps.userId).limit(1)).data ?? [])[0]?.id;
        if (accountId) {
          const { data: due } = await deps.admin.from(T.m).select("*").eq("growth_id", g.id).eq("user_id", deps.userId).in("status", ["draft", "approved"]).limit(100);
          for (const m of ((due ?? []) as Loose[])) {
            if (m.send_after && new Date(m.send_after) > now) continue;
            if (growthTextProblems(m.kind, m.subject ?? "", m.body ?? "").length) continue;
            if (m.status === "draft") {
              await deps.admin.from(T.m).update({ status: "approved", approved_at: now.toISOString(), meta: { ...(m.meta ?? {}), approvedBy: "autopilot" } }).eq("id", m.id).eq("user_id", deps.userId).eq("status", "draft");
            }
            const r = await sendOne(deps, m.id, accountId, now, { autopilot: true });
            if (r.status === 200) summary.autoSent++;
            else if ((r.body.problems as string[] | undefined)?.some((p) => p.startsWith("limite diário"))) break;
          }
        }
      }

      await deps.admin.from(T.g).update({ updated_at: now.toISOString(), last_sync_at: now.toISOString() }).eq("id", g.id).eq("user_id", deps.userId);
      await logEvent(deps, g.id, "sync", { ...summary, events: events.length });
      const hasTeam = !!g.team?.webhookAgentId;
      const teamEvents = hasTeam ? events.filter((e) => (g.team.agents ?? []).some((a: Loose) => a.event === e.type)) : [];
      return ok({ summary, events: teamEvents, eventsTotal: events.length, runCost: GROWTH_AGENT_RUN_COST });
    }

    case "add_contact": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      // LGPD: o dev declara que a pessoa já tem relação com o projeto (conta, cadastro, conversa ou doação).
      if (body.consent !== true) return err(400, "consent_required");
      const email = str(body.email, 200).toLowerCase();
      if (!isEmail(email)) return err(400, "invalid_email");
      const dnc = await loadDnc(deps);
      if (isBlocked(dnc, { email })) return err(409, "contact_blocked");
      const stage: Stage = STAGES.includes(body.stage) ? body.stage : "conversao";
      const status = stage === "retencao" ? "active" : stage === "conversao" ? "engaged" : "lead";
      const { data: dup } = await deps.admin.from(T.c).select("id").eq("growth_id", g.id).eq("user_id", deps.userId).eq("email", email).limit(1);
      if ((dup ?? []).length) return err(409, "contact_exists");
      const { data: all } = await deps.admin.from(T.c).select("id").eq("growth_id", g.id).eq("user_id", deps.userId).limit(MAX_CONTACTS_PER_CAMPAIGN);
      if ((all ?? []).length >= MAX_CONTACTS_PER_CAMPAIGN) return err(400, "contact_cap", { max: MAX_CONTACTS_PER_CAMPAIGN });
      const { data: c } = await deps.admin.from(T.c).insert({
        user_id: deps.userId, growth_id: g.id, email, email_status: "verified", name: str(body.name, 120), stage, status, source: "manual",
        last_activity_at: now.toISOString(),
      }).select("*").single();
      if (!c) return err(500, "db_error");
      const kind: GrowthKind | null = stage === "conversao" ? "conversion1" : stage === "retencao" ? (g.model === "nonprofit" ? "thanks" : "onboarding") : null;
      const budget = { model: 1 };
      if (kind) await createDraft(deps, g, c, kind, now, budget);
      if (kind === "conversion1") await createDraft(deps, g, c, "conversion2", now, budget);
      const type: GrowthEventType = stage === "retencao" ? "new_customer" : stage === "conversao" ? "reply_positive" : "new_lead";
      const ev = teamEvent(type, { project: productOf(g), name: c.name, email, stage });
      return ok({ contact: c, events: g.team?.webhookAgentId && (g.team.agents ?? []).some((a: Loose) => a.event === type) ? [ev] : [] });
    }

    case "update_contact": {
      const c = await loadContact(deps, body.contactId);
      if (!c) return err(404, "contact_not_found");
      const allowed = ["lead", "engaged", "converted", "active", "at_risk", "churned", "won_back", "opted_out"];
      const p: Record<string, unknown> = { updated_at: now.toISOString() };
      if (typeof body.status === "string") {
        if (!allowed.includes(body.status)) return err(400, "invalid_status");
        p.status = body.status;
        p.stage = ["lead"].includes(body.status) ? "captacao" : body.status === "engaged" ? "conversao" : body.status === "opted_out" ? c.stage : "retencao";
        p.last_activity_at = now.toISOString();
      }
      if (typeof body.name === "string") p.name = str(body.name, 120);
      await deps.admin.from(T.c).update(p).eq("id", c.id).eq("user_id", deps.userId);
      if (p.status === "opted_out") {
        const email = normalizeDnc("email", c.email ?? "");
        if (email) await deps.admin.from(T.d).upsert({ user_id: deps.userId, kind: "email", value: email, reason: "marcado pelo dev (Vertal Growth)" }, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
        await deps.admin.from(T.m).update({ status: "cancelled", updated_at: now.toISOString() }).eq("contact_id", c.id).eq("user_id", deps.userId).in("status", ["draft", "approved"]);
      }
      return ok({ updated: true });
    }

    case "delete_contact": {
      // LGPD: apagar a pedido remove o contato e as mensagens e o põe na lista de não contatar.
      const c = await loadContact(deps, body.contactId);
      if (!c) return err(404, "contact_not_found");
      const email = normalizeDnc("email", c.email ?? "");
      if (email && body.addToDnc !== false) await deps.admin.from(T.d).upsert({ user_id: deps.userId, kind: "email", value: email, reason: "pedido de exclusão (Vertal Growth)" }, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
      await deps.admin.from(T.m).delete().eq("contact_id", c.id).eq("user_id", deps.userId);
      await deps.admin.from(T.c).delete().eq("id", c.id).eq("user_id", deps.userId);
      return ok({ deleted: true });
    }

    case "update_message": {
      const m = await loadMsg(deps, body.messageId);
      if (!m) return err(404, "message_not_found");
      if (!["draft", "approved", "rejected"].includes(m.status)) return err(409, "message_locked");
      const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : m.subject;
      const text = typeof body.body === "string" ? body.body.slice(0, 4_000) : m.body;
      await deps.admin.from(T.m).update({ subject, body: text, status: "draft", approved_at: null, updated_at: now.toISOString() }).eq("id", m.id).eq("user_id", deps.userId);
      return ok({ problems: growthTextProblems(m.kind, subject ?? "", text ?? "") });
    }

    case "approve":
    case "reject": {
      const ids = (Array.isArray(body.messageIds) ? body.messageIds : []).filter(isUuid).slice(0, 100);
      if (!ids.length) return err(400, "no_messages");
      const { data: msgs } = await deps.admin.from(T.m).select("*").eq("user_id", deps.userId).in("id", ids);
      const done: string[] = [];
      const blocked: Array<{ id: string; problems: string[] }> = [];
      for (const m of (msgs ?? []) as Loose[]) {
        if (op === "reject") {
          if (["draft", "approved"].includes(m.status)) {
            await deps.admin.from(T.m).update({ status: "rejected", approved_at: null, updated_at: now.toISOString() }).eq("id", m.id).eq("user_id", deps.userId);
            done.push(m.id);
          }
          continue;
        }
        if (m.status !== "draft") continue;
        const problems = growthTextProblems(m.kind, m.subject ?? "", m.body ?? "");
        if (problems.length) {
          blocked.push({ id: m.id, problems });
          continue;
        }
        await deps.admin.from(T.m).update({ status: "approved", approved_at: now.toISOString(), meta: { ...(m.meta ?? {}), approvedBy: "user" }, updated_at: now.toISOString() })
          .eq("id", m.id).eq("user_id", deps.userId).eq("status", "draft");
        done.push(m.id);
      }
      return ok({ [op === "approve" ? "approved" : "rejected"]: done, blocked });
    }

    case "send": {
      const accountId = isUuid(body.accountId) ? body.accountId : null;
      if (!accountId) return err(400, "gmail_account_required");
      return await sendOne(deps, body.messageId, accountId, now, { allowRisky: body.allowRisky === true });
    }

    case "whatsapp_link": {
      const m = await loadMsg(deps, body.messageId);
      if (!m) return err(404, "message_not_found");
      if (m.status !== "approved" && m.status !== "sent") return err(409, "send_blocked", { problems: ["mensagem não aprovada"] });
      const c = await loadContact(deps, m.contact_id);
      if (!c || !c.phone) return err(400, "invalid_phone");
      const dnc = await loadDnc(deps);
      if (c.status === "opted_out" || isBlocked(dnc, { phone: c.phone, email: c.email })) return err(409, "send_blocked", { problems: ["contato na lista de não contatar"] });
      const link = waLink(c.phone, m.body ?? "");
      if (!link) return err(400, "invalid_phone");
      return ok({ link });
    }

    case "mark_sent": {
      // WhatsApp enviado pelo próprio aparelho do dev.
      const m = await loadMsg(deps, body.messageId);
      if (!m) return err(404, "message_not_found");
      if (m.status !== "approved") return err(409, "send_blocked", { problems: ["mensagem não aprovada"] });
      await deps.admin.from(T.m).update({ status: "sent", channel: "whatsapp", sent_at: now.toISOString(), meta: { ...(m.meta ?? {}), manual: true }, updated_at: now.toISOString() })
        .eq("id", m.id).eq("user_id", deps.userId);
      return ok({ marked: true });
    }

    case "update_settings": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      const s = (body.settings ?? {}) as Record<string, unknown>;
      if ("autopilot" in s) return err(400, "autopilot_needs_confirmation");
      const booking = typeof s.bookingLink === "string" ? s.bookingLink.trim() : "";
      if (booking && !/^https:\/\/[^\s]+$/.test(booking)) return err(400, "invalid_booking_link");
      const cur = settingsOf(g);
      const settings = {
        ...cur,
        bookingLink: "bookingLink" in s ? booking || null : cur.bookingLink ?? null,
        senderName: typeof s.senderName === "string" ? s.senderName.slice(0, 80) : cur.senderName ?? "",
        senderCompany: typeof s.senderCompany === "string" ? s.senderCompany.slice(0, 120) : cur.senderCompany ?? g.project_name,
        inactivityDays: Math.max(7, Math.min(Number(s.inactivityDays ?? cur.inactivityDays) || 30, 180)),
        gmailAccountId: isUuid(s.gmailAccountId) ? s.gmailAccountId : cur.gmailAccountId ?? null,
      };
      const lang = typeof body.lang === "string" ? growthLang(body.lang) : g.lang;
      await deps.admin.from(T.g).update({ settings, lang, updated_at: now.toISOString() }).eq("id", g.id).eq("user_id", deps.userId);
      // O remetente e o link de agenda valem também para a captação (Prospector).
      await deps.prospector({ op: "update_settings", campaignId: g.prospector_campaign_id, settings: { senderName: settings.senderName, senderCompany: settings.senderCompany, bookingLink: settings.bookingLink ?? "" } }).catch(() => null);
      return ok({ settings });
    }

    case "set_autopilot": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      if (!autopilotRequestOk(body)) return err(403, "autopilot_needs_confirmation");
      const enabled = body.enabled === true;
      const settings = { ...settingsOf(g), autopilot: enabled, autopilotBy: enabled ? "user" : null, autopilotAt: now.toISOString() };
      await deps.admin.from(T.g).update({ settings, updated_at: now.toISOString() }).eq("id", g.id).eq("user_id", deps.userId);
      await logEvent(deps, g.id, enabled ? "autopilot_on" : "autopilot_off", { by: "user" });
      return ok({ settings });
    }

    case "delete": {
      const g = await loadGrowth(deps, body.growthId);
      if (!g) return err(404, "growth_not_found");
      await deps.admin.from(T.m).delete().eq("growth_id", g.id).eq("user_id", deps.userId);
      await deps.admin.from(T.c).delete().eq("growth_id", g.id).eq("user_id", deps.userId);
      await deps.admin.from(T.e).delete().eq("growth_id", g.id).eq("user_id", deps.userId);
      await deps.admin.from(T.g).delete().eq("id", g.id).eq("user_id", deps.userId);
      if (body.keepProspector !== true && g.prospector_campaign_id) await deps.admin.from(T.pc).delete().eq("id", g.prospector_campaign_id).eq("user_id", deps.userId);
      return ok({ deleted: true, agentsKept: !!g.team?.webhookAgentId });
    }
  }
  return err(400, "unknown_op");
}

/** Envia UMA mensagem aprovada pelo Gmail conectado, com o portão rodando de novo. */
async function sendOne(deps: GrowthDeps, messageId: unknown, accountId: string, now: Date, o: { autopilot?: boolean; allowRisky?: boolean }): Promise<ProspectorResult> {
  const m = await loadMsg(deps, messageId);
  if (!m) return err(404, "message_not_found");
  const c = await loadContact(deps, m.contact_id);
  if (!c) return err(404, "contact_not_found");
  // Manual: o dev pode enviar antes do prazo sugerido; o piloto automático espera (tratado no laço do sync).
  const dnc = await loadDnc(deps);
  const problems = growthSendGate({
    status: m.status, kind: m.kind, subject: m.subject ?? "", body: m.body ?? "", to: c.email, emailStatus: c.email_status,
    contactStatus: c.status, blocked: isBlocked(dnc, { email: c.email, phone: c.phone }), sentToday: await sentTodayAll(deps, now),
    cap: dailyCap(deps.env), autopilot: o.autopilot, allowRisky: o.allowRisky,
  });
  if (problems.length) return err(409, "send_blocked", { problems });
  const { data: locked } = await deps.admin.from(T.m).update({ status: "sending", updated_at: now.toISOString() })
    .eq("id", m.id).eq("user_id", deps.userId).eq("status", "approved").select("id");
  if (!locked || !(locked as Loose[]).length) return err(409, "send_blocked", { problems: ["mensagem já está sendo enviada"] });
  let gmail: { token: string; email: string };
  try {
    gmail = await deps.gmailToken(accountId);
  } catch {
    await deps.admin.from(T.m).update({ status: "approved", error: "gmail_account" }).eq("id", m.id).eq("user_id", deps.userId);
    return err(400, "gmail_account_unavailable");
  }
  // Lead da captação: continua na mesma conversa do Gmail do Prospector.
  let threadId: string | undefined;
  let inReplyTo: string | undefined;
  if (c.lead_id) {
    const { data: prev } = await deps.admin.from(T.pm).select("gmail_thread_id, meta").eq("lead_id", c.lead_id).eq("user_id", deps.userId)
      .eq("direction", "out").eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
    const p = (prev ?? [])[0];
    if (p?.gmail_thread_id) {
      threadId = p.gmail_thread_id;
      inReplyTo = p.meta?.rfcMessageId ?? undefined;
    }
  }
  const raw = b64url(buildMime({ to: c.email, subject: m.subject ?? "", body: `${m.body}${m.footer ?? ""}`, inReplyTo, references: inReplyTo }));
  const r = await deps.fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${gmail.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  }).catch(() => null);
  const out = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok || !out?.id) {
    await deps.admin.from(T.m).update({ status: "approved", error: `gmail_${r?.status ?? 0}`, updated_at: now.toISOString() }).eq("id", m.id).eq("user_id", deps.userId);
    return err(502, r?.status === 403 ? "gmail_needs_reconsent" : "gmail_send_failed");
  }
  await deps.admin.from(T.m).update({
    status: "sent", sent_at: now.toISOString(), gmail_account_id: accountId, gmail_message_id: out.id, gmail_thread_id: out.threadId ?? threadId ?? null,
    error: null, meta: { ...(m.meta ?? {}), from: gmail.email, sentBy: o.autopilot ? "autopilot" : "user" }, updated_at: now.toISOString(),
  }).eq("id", m.id).eq("user_id", deps.userId);
  await deps.admin.from(T.c).update({ last_activity_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", c.id).eq("user_id", deps.userId);
  await deps.admin.from("connector_activity_logs").insert({
    user_id: deps.userId, connector_slug: "gmail", event_type: "gmail_sent", message: `Vertal Growth: e-mail enviado para ${c.email}`, status: "success",
    metadata: { to: c.email, subject: m.subject, accountEmail: gmail.email, messageId: out.id, source: "vertal_growth", autopilot: !!o.autopilot },
  });
  return ok({ sent: true, messageId: out.id });
}

export { GROWTH_KINDS };
