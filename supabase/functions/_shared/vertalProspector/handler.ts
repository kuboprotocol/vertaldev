// Vertal Prospector · operações do servidor (action "prospector" da edge function vertal-code-ai).
//
// Tudo que é rede (sites, mapa, CNPJ, DNS, Gmail) e banco entra por `deps`, então
// o Vitest testa este arquivo com dublês. Nada sai para um contato sem uma mensagem
// APROVADA pelo usuário na tela, e o portão (sendGate) roda de novo em cada envio.
// WhatsApp: nunca envia; devolve um link wa.me que o próprio usuário toca.

import {
  ANALYZE_SYSTEM, ENRICH_SYSTEM, FOLLOWUP_DAYS, OPT_OUT_WHATSAPP, REPLY_SYSTEM, WRITE_SYSTEM,
  buildOverpassQuery, candidateEmails, classifyEmail, classifyInbound, dailyCap, describeSignals, detectSignals,
  domainOf, extractCnpjs, extractEmails, extractJson, extractPhones, hasMxAnswer, htmlToText, icpMissing, inferPattern,
  isBlocked, isEmail, isPublicHost, isRoleAddress, isValidCnpj, meetingSlots, meetingText, normalizeDnc, normalizeWebsite,
  onlyDigits, optOutFooter, overpassAreaId, parseCompanyProfile, parseIcp, parseOverpassElements, parseSequence,
  pickInternalLinks, sendGate, slugName, textProblems, waLink,
  type DncKind, type EmailPattern, type Icp, type MessageKind, type ProspectorEnv, type Sender,
} from "./core.ts";
import { b64url, buildMime } from "../gmailOps.ts";

// Cliente do Supabase sem tipos gerados (mesmo padrão das outras funções).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProspectorDeps {
  admin: Loose;
  userId: string;
  env: ProspectorEnv;
  fetch: typeof fetch;
  /** Roteador do VERTAL Code AI (LLM própria → grátis → pago). */
  callModel: (messages: ModelMessage[], o: { json: boolean; maxTokens: number }) => Promise<{ content: string; label?: string }>;
  /** Token de acesso do Gmail já conectado no Vertal (mesma integração do Gmail secretário). */
  gmailToken: (accountId: string) => Promise<{ token: string; email: string }>;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface ProspectorResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): ProspectorResult => ({ status: 200, body: { ok: true, ...body } });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): ProspectorResult => ({ status, body: { error, ...extra } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const UA = "VertalProspector/1.0 (+https://vertal.dev)";

export const PROSPECTOR_OPS = [
  "status", "list_campaigns", "get_campaign", "create_campaign", "update_icp", "update_settings", "find_leads",
  "enrich_lead", "draft_messages", "update_message", "approve", "reject", "send", "whatsapp_link", "mark_sent",
  "check_replies", "update_lead", "delete_lead", "delete_campaign", "dnc_list", "dnc_add", "dnc_remove",
] as const;
export type ProspectorOp = (typeof PROSPECTOR_OPS)[number];

/** Operações que usam modelo (para o log de custo estimado; cobrança desligada). */
const LLM_OPS = new Set<string>(["create_campaign", "enrich_lead", "draft_messages", "check_replies"]);

// ─── Rede segura ─────────────────────────────────────────────────────────

/** Prazo da requisição (AbortSignal.timeout quando o ambiente tem). */
const timeoutSignal = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== "undefined" && typeof (AbortSignal as { timeout?: unknown }).timeout === "function" ? AbortSignal.timeout(ms) : undefined;

/** GET de página pública: só https/http em host público, até 3 redirecionamentos checados, 600 KB, 8 s. */
export async function safeFetchText(f: typeof fetch, url: string, timeoutMs = 8_000): Promise<{ url: string; html: string } | null> {
  let current = normalizeWebsite(url);
  for (let hop = 0; current && hop < 4; hop++) {
    const u = new URL(current);
    if (!isPublicHost(u.hostname)) return null;
    let r: Response;
    try {
      r = await f(current, {
        redirect: "manual",
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
        signal: timeoutSignal(timeoutMs),
      });
    } catch {
      // https falhou: tenta http uma vez (sites pequenos sem certificado).
      if (hop === 0 && u.protocol === "https:") {
        current = current.replace(/^https:/, "http:");
        continue;
      }
      return null;
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel();
      if (!loc) return null;
      try {
        current = normalizeWebsite(new URL(loc, current).toString());
      } catch {
        return null;
      }
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      return null;
    }
    const type = r.headers.get("content-type") ?? "";
    if (type && !/html|text\/plain/i.test(type)) {
      await r.body?.cancel();
      return null;
    }
    const reader = r.body?.getReader();
    if (!reader) return { url: current, html: "" };
    const dec = new TextDecoder();
    let html = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (html.length > 600_000) {
        await reader.cancel();
        break;
      }
    }
    return { url: current, html };
  }
  return null;
}

async function fetchJson(f: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<{ status: number; data: unknown }> {
  try {
    const r = await f(url, { ...init, signal: timeoutSignal(timeoutMs) });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Cadastro público do CNPJ (BrasilAPI). */
async function lookupCnpj(f: typeof fetch, cnpj: string) {
  if (!isValidCnpj(cnpj)) return null;
  const { status, data } = await fetchJson(f, `https://brasilapi.com.br/api/cnpj/v1/${onlyDigits(cnpj)}`, { headers: { "User-Agent": UA } });
  if (status !== 200 || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const qsa = Array.isArray(d.qsa) ? (d.qsa as Array<Record<string, unknown>>) : [];
  return {
    legalName: String(d.razao_social ?? ""),
    tradeName: String(d.nome_fantasia ?? ""),
    cnae: String(d.cnae_fiscal_descricao ?? ""),
    city: String(d.municipio ?? ""),
    uf: String(d.uf ?? ""),
    status: String(d.descricao_situacao_cadastral ?? ""),
    partners: qsa.slice(0, 5).map((p) => ({ name: String(p.nome_socio ?? ""), role: String(p.qualificacao_socio ?? "") })).filter((p) => p.name),
  };
}

async function domainHasMx(f: typeof fetch, domain: string, cache: Map<string, boolean | null>): Promise<boolean | null> {
  if (cache.has(domain)) return cache.get(domain)!;
  const { status, data } = await fetchJson(f, `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
    headers: { Accept: "application/dns-json" },
  }, 5_000);
  const v = status === 200 ? hasMxAnswer(data) : null;
  cache.set(domain, v);
  return v;
}

// ─── Banco ───────────────────────────────────────────────────────────────

const T = { c: "prospector_campaigns", l: "prospector_leads", m: "prospector_messages", d: "prospector_dnc" } as const;

async function loadCampaign(deps: ProspectorDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.c).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}

async function loadLead(deps: ProspectorDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.l).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}

async function loadMessage(deps: ProspectorDeps, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await deps.admin.from(T.m).select("*").eq("id", id).eq("user_id", deps.userId).maybeSingle();
  return data ?? null;
}

async function loadDnc(deps: ProspectorDeps): Promise<Array<{ kind: string; value: string }>> {
  const { data } = await deps.admin.from(T.d).select("kind, value").eq("user_id", deps.userId).limit(5000);
  return data ?? [];
}

/** Início do dia em Brasília (UTC−3), em ISO. */
export function startOfDaySp(now: Date): string {
  const sp = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3)).toISOString();
}

async function sentTodayCount(deps: ProspectorDeps, now: Date): Promise<number> {
  const { data } = await deps.admin.from(T.m).select("id").eq("user_id", deps.userId).eq("direction", "out").eq("channel", "email")
    .eq("status", "sent").gte("sent_at", startOfDaySp(now)).limit(500);
  return (data ?? []).length;
}

const senderOf = (c: Loose): Sender => {
  const s = (c?.settings ?? {}) as Record<string, unknown>;
  return {
    name: typeof s.senderName === "string" ? s.senderName.slice(0, 80) : "",
    company: typeof s.senderCompany === "string" && s.senderCompany ? s.senderCompany.slice(0, 120) : String(c?.company_name ?? ""),
    bookingLink: typeof s.bookingLink === "string" && /^https:\/\//.test(s.bookingLink) ? s.bookingLink.slice(0, 300) : undefined,
  };
};

async function model(deps: ProspectorDeps, system: string, user: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  const r = await deps.callModel([{ role: "system", content: system }, { role: "user", content: user }], { json: true, maxTokens });
  return extractJson(r.content);
}

// ─── Operações ───────────────────────────────────────────────────────────

export async function handleProspector(body: Record<string, Loose>, deps: ProspectorDeps): Promise<ProspectorResult> {
  const op = String(body?.op ?? "status") as ProspectorOp;
  if (!(PROSPECTOR_OPS as readonly string[]).includes(op)) return err(400, "unknown_op");
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? ((m: string) => console.log(m));

  if (op !== "status" && op !== "list_campaigns" && op !== "get_campaign" && op !== "dnc_list") {
    try {
      const { data: rl } = await deps.admin.rpc("bump_rate_limit", { _bucket: "vertal_prospector", _user: deps.userId, _window_seconds: 60 });
      if (typeof rl === "number" && rl > 40) return err(429, "rate_limited");
    } catch {
      /* sem limitador: segue */
    }
  }
  if (LLM_OPS.has(op)) log(`[vertal-prospector] op=${op} usa modelo (custo estimado no log do roteador; cobrança desligada)`);

  switch (op) {
    case "status": {
      const { data: accounts } = await deps.admin.from("gmail_accounts").select("id, email").eq("user_id", deps.userId);
      return ok({ enabled: true, cap: dailyCap(deps.env), sentToday: await sentTodayCount(deps, now), gmailAccounts: accounts ?? [] });
    }

    case "list_campaigns": {
      const { data } = await deps.admin.from(T.c).select("id, company_name, cnpj, website, status, created_at, updated_at")
        .eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(50);
      return ok({ campaigns: data ?? [] });
    }

    case "get_campaign": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      const { data: leads } = await deps.admin.from(T.l).select("*").eq("campaign_id", c.id).eq("user_id", deps.userId)
        .order("created_at", { ascending: true }).limit(500);
      const { data: messages } = await deps.admin.from(T.m).select("*").eq("campaign_id", c.id).eq("user_id", deps.userId)
        .order("created_at", { ascending: true }).limit(2000);
      return ok({ campaign: c, leads: leads ?? [], messages: messages ?? [], cap: dailyCap(deps.env), sentToday: await sentTodayCount(deps, now) });
    }

    case "create_campaign": {
      const companyName = typeof body.companyName === "string" ? body.companyName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
      const cnpj = onlyDigits(typeof body.cnpj === "string" ? body.cnpj : "");
      const website = normalizeWebsite(typeof body.website === "string" ? body.website : "");
      if (!companyName) return err(400, "company_name_required");
      if (cnpj && !isValidCnpj(cnpj)) return err(400, "invalid_cnpj");
      if (body.website && !website) return err(400, "invalid_website");
      const findings: string[] = [];
      const registry = cnpj ? await lookupCnpj(deps.fetch, cnpj) : null;
      if (cnpj && !registry) findings.push("Não consegui ler o cadastro do CNPJ agora.");
      let siteText = "";
      if (website) {
        const home = await safeFetchText(deps.fetch, website);
        if (home) {
          siteText = htmlToText(home.html, 6_000);
          const more = pickInternalLinks(home.html, home.url).slice(0, 1);
          for (const u of more) {
            const p = await safeFetchText(deps.fetch, u);
            if (p) siteText += `\n\n[${u}]\n${htmlToText(p.html, 2_500)}`;
          }
        } else findings.push("Não consegui abrir o site da empresa.");
      }
      if (!siteText && !registry) findings.push("Sem site e sem cadastro: o perfil foi montado só pelo nome — revise o ICP com atenção.");
      const user = [
        `EMPRESA: ${companyName}`,
        registry ? `CADASTRO (DADOS): ${JSON.stringify({ ...registry, partners: undefined })}` : "",
        siteText ? `SITE (DADOS):\n${siteText}` : "",
      ].filter(Boolean).join("\n\n");
      const out = await model(deps, ANALYZE_SYSTEM, user, 1_200).catch(() => null);
      if (!out) return err(502, "model_failed");
      const profile = { ...parseCompanyProfile(out.profile), registry: registry ? { ...registry, partners: undefined } : undefined };
      const icp = parseIcp(out.icp);
      if (!icp.area && registry?.city) icp.area = `${registry.city}, ${registry.uf}`;
      const { data: c, error } = await deps.admin.from(T.c).insert({
        user_id: deps.userId, company_name: companyName, cnpj: cnpj || null, website, profile, icp, status: "icp_pending",
        settings: { senderCompany: registry?.tradeName || companyName },
      }).select("*").single();
      if (error || !c) return err(500, "db_error");
      return ok({ campaign: c, findings, missing: icpMissing(icp) });
    }

    case "update_icp": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      const icp = parseIcp(body.icp ?? c.icp);
      const confirm = body.confirm === true;
      const missing = icpMissing(icp);
      if (confirm && missing.length) return err(400, "icp_incomplete", { missing });
      const { data } = await deps.admin.from(T.c).update({ icp, status: confirm ? "icp_confirmed" : "icp_pending", updated_at: now.toISOString() })
        .eq("id", c.id).eq("user_id", deps.userId).select("*").single();
      return ok({ campaign: data, missing });
    }

    case "update_settings": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      const s = (body.settings ?? {}) as Record<string, unknown>;
      const booking = typeof s.bookingLink === "string" ? s.bookingLink.trim() : "";
      if (booking && !/^https:\/\/[^\s]+$/.test(booking)) return err(400, "invalid_booking_link");
      const settings = {
        ...(c.settings ?? {}),
        senderName: typeof s.senderName === "string" ? s.senderName.slice(0, 80) : c.settings?.senderName ?? "",
        senderCompany: typeof s.senderCompany === "string" ? s.senderCompany.slice(0, 120) : c.settings?.senderCompany ?? c.company_name,
        bookingLink: booking || null,
      };
      const { data } = await deps.admin.from(T.c).update({ settings, updated_at: now.toISOString() }).eq("id", c.id).eq("user_id", deps.userId).select("*").single();
      return ok({ campaign: data });
    }

    case "find_leads": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      if (c.status !== "icp_confirmed") return err(400, "icp_not_confirmed");
      const icp = parseIcp(c.icp) as Icp;
      const limit = Math.max(1, Math.min(Number(body.limit) || 25, 60));
      const geo = await fetchJson(deps.fetch, `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&q=${encodeURIComponent(icp.area)}`, {
        headers: { "User-Agent": UA, "Accept-Language": "pt-BR" },
      });
      const places = Array.isArray(geo.data) ? (geo.data as Array<{ osm_type?: string; osm_id?: number; display_name?: string }>) : [];
      const place = places.find((p) => p.osm_type === "relation") ?? places.find((p) => p.osm_type === "way");
      const areaId = place ? overpassAreaId(String(place.osm_type), Number(place.osm_id)) : null;
      if (!areaId) return err(400, "area_not_found", { finding: `Não achei a região "${icp.area}" no mapa. Ajuste a região do ICP (ex.: "Campinas, SP").` });
      const q = buildOverpassQuery(icp.osmTags, areaId, 200);
      const over = await fetchJson(deps.fetch, "https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: `data=${encodeURIComponent(q)}`,
      }, 35_000);
      if (over.status === 429 || over.status === 504 || over.status === 0) {
        return err(503, "map_busy", { finding: "O serviço de mapa aberto está ocupado agora (limite de uso). Tente de novo em 1 a 2 minutos." });
      }
      if (over.status !== 200) return err(502, "map_failed");
      const found = parseOverpassElements(over.data, icp.osmTags);
      const dnc = await loadDnc(deps);
      // Sem repetir empresas que já estão em qualquer campanha do usuário (mesmo domínio ou mesmo ponto no mapa).
      const { data: existing } = await deps.admin.from(T.l).select("domain, osm_id").eq("user_id", deps.userId).limit(5000);
      const knownDomains = new Set((existing ?? []).map((e: Loose) => e.domain).filter(Boolean));
      const knownOsm = new Set((existing ?? []).map((e: Loose) => e.osm_id).filter(Boolean));
      let skippedDnc = 0, skippedDup = 0;
      const rows: Loose[] = [];
      for (const l of found) {
        if (rows.length >= limit) break;
        if (knownOsm.has(l.osmId) || (l.domain && knownDomains.has(l.domain))) {
          skippedDup++;
          continue;
        }
        if (isBlocked(dnc, { email: l.email, domain: l.domain, phone: l.phone })) {
          skippedDnc++;
          continue;
        }
        if (l.domain) knownDomains.add(l.domain);
        rows.push({
          user_id: deps.userId, campaign_id: c.id, name: l.name, website: l.website, domain: l.domain, phone: l.phone,
          email: l.email, email_status: l.email ? "unknown" : null, address: l.address, city: l.city, category: l.category,
          osm_id: l.osmId, source: "mapa", status: "new", signals: {}, decision_maker: {},
        });
      }
      if (rows.length) {
        const { error } = await deps.admin.from(T.l).insert(rows);
        if (error) return err(500, "db_error");
      }
      const findings: string[] = [];
      if (!found.length) findings.push("O mapa não trouxe empresas com essas categorias nessa região. Tente outras categorias ou uma região maior.");
      if (skippedDup) findings.push(`${skippedDup} já estavam em campanhas suas.`);
      if (skippedDnc) findings.push(`${skippedDnc} estão na lista de não contatar.`);
      return ok({ added: rows.length, found: found.length, findings, area: place?.display_name ?? icp.area });
    }

    case "enrich_lead": {
      const lead = await loadLead(deps, body.leadId);
      if (!lead) return err(404, "lead_not_found");
      const c = await loadCampaign(deps, lead.campaign_id);
      if (!c) return err(404, "campaign_not_found");
      const findings: string[] = [];
      let html = "", text = "", siteUrl = lead.website as string | null;
      if (siteUrl) {
        const home = await safeFetchText(deps.fetch, siteUrl);
        if (home) {
          html = home.html;
          siteUrl = home.url;
          text = htmlToText(home.html, 5_000);
          for (const u of pickInternalLinks(home.html, home.url)) {
            const p = await safeFetchText(deps.fetch, u);
            if (p) {
              html += `\n${p.html}`;
              text += `\n\n[${u}]\n${htmlToText(p.html, 2_500)}`;
            }
          }
        } else findings.push("Site não abriu.");
      } else findings.push("Empresa sem site no mapa.");
      const domain = lead.domain ?? (siteUrl ? domainOf(siteUrl) : null);
      const sig = html ? detectSignals(html, siteUrl ?? "") : null;
      const signalList = sig ? describeSignals(sig, now.getUTCFullYear()) : [];
      const published = new Set<string>([...extractEmails(html), ...(lead.email ? [String(lead.email).toLowerCase()] : [])]);
      const { phones, whatsapp } = extractPhones(html);
      const cnpj = lead.cnpj ?? extractCnpjs(html)[0] ?? null;
      const registry = cnpj ? await lookupCnpj(deps.fetch, cnpj) : null;
      const partners = registry?.partners ?? [];

      let fit: number | null = null, why = "", observation = "";
      let dm: { name: string; role: string; source: string } = { name: "", role: "", source: "" };
      if (text || partners.length) {
        const icp = parseIcp(c.icp);
        const out = await model(deps, ENRICH_SYSTEM, [
          `ICP: ${icp.summary}\nSinais de compra procurados: ${icp.buyingSignals.join("; ")}\nCargos que decidem: ${icp.decisionRoles.join(", ")}`,
          `EMPRESA: ${lead.name} (${lead.category ?? ""}, ${lead.city ?? ""})`,
          signalList.length ? `SINAIS OBJETIVOS: ${signalList.join("; ")}` : "",
          partners.length ? `SÓCIOS NO CADASTRO PÚBLICO (DADOS): ${partners.map((p) => `${p.name} (${p.role})`).join("; ")}` : "",
          text ? `SITE (DADOS):\n${text.slice(0, 7_000)}` : "",
        ].filter(Boolean).join("\n\n"), 500).catch(() => null);
        if (out) {
          fit = Number.isFinite(Number(out.fit)) ? Math.max(0, Math.min(10, Math.round(Number(out.fit)))) : null;
          why = typeof out.why === "string" ? out.why.slice(0, 300) : "";
          observation = typeof out.observation === "string" ? out.observation.slice(0, 300) : "";
          const d = (out.decisionMaker ?? {}) as Record<string, unknown>;
          const name = typeof d.name === "string" ? d.name.trim().slice(0, 80) : "";
          // Anti-invenção: o nome precisa estar escrito no site ou no cadastro.
          const haystack = slugName(`${text} ${partners.map((p) => p.name).join(" ")}`);
          const tokens = slugName(name).split(" ").filter((t) => t.length > 2);
          if (name && tokens.length >= 2 && tokens.every((t) => haystack.includes(t))) {
            dm = { name, role: typeof d.role === "string" ? d.role.slice(0, 80) : "", source: partners.some((p) => slugName(p.name).includes(tokens[0])) ? "cadastro" : "site" };
          }
        } else findings.push("O modelo não respondeu; ficaram só os sinais objetivos.");
      }
      if (!dm.name && partners.length) {
        const adm = partners.find((p) => /administrador|diretor|presidente/i.test(p.role)) ?? partners[0];
        dm = { name: adm.name, role: adm.role, source: "cadastro" };
      }

      // E-mail: publicado pela empresa > padrão confirmado > palpite.
      const mxCache = new Map<string, boolean | null>();
      const dnc = await loadDnc(deps);
      const sameDomain = [...published].filter((e) => domain && e.endsWith(`@${domain}`));
      const personal = sameDomain.filter((e) => !isRoleAddress(e));
      const role = sameDomain.find(isRoleAddress) ?? [...published].find((e) => isRoleAddress(e)) ?? [...published][0] ?? null;
      let email: string | null = null, published_ = false, patternConfirmed = false;
      let candidates: string[] = [];
      if (dm.name && domain) {
        const direct = personal.find((e) => inferPattern(e, dm.name));
        if (direct) {
          email = direct;
          published_ = true;
        } else {
          // Padrão de outro endereço pessoal publicado no mesmo domínio (ex.: maria.souza@ → first.last).
          const shape: EmailPattern | null = personal.length
            ? (personal[0].split("@")[0].includes(".") ? "first.last" : personal[0].split("@")[0].includes("_") ? "first_last" : null)
            : null;
          candidates = candidateEmails(dm.name, domain, shape);
          if (shape && candidates[0]) {
            email = candidates[0];
            patternConfirmed = true;
          }
        }
      }
      if (!email && role) {
        email = role;
        published_ = true;
      }
      if (!email && candidates[0]) email = candidates[0];
      const emailDomain = email?.split("@")[1] ?? null;
      const hasMx = emailDomain ? await domainHasMx(deps.fetch, emailDomain, mxCache) : null;
      const blocked = isBlocked(dnc, { email, domain, phone: lead.phone });
      const emailStatus = classifyEmail({ email, published: published_, patternConfirmed, hasMx, blocked });
      if (hasMx === null && email) findings.push("Não consegui checar o domínio do e-mail agora (DNS).");
      if (blocked) findings.push("Contato está na lista de não contatar.");

      const patch = {
        domain,
        website: siteUrl,
        cnpj: cnpj ?? null,
        signals: { list: signalList, raw: sig, why, observation },
        fit,
        decision_maker: dm.name ? dm : {},
        email,
        email_status: emailStatus,
        email_candidates: { published: [...published].slice(0, 10), candidates },
        phone: lead.phone ?? (phones[0] ?? null),
        whatsapp: whatsapp[0] ?? null,
        status: lead.status === "new" ? "enriched" : lead.status,
        updated_at: now.toISOString(),
      };
      const { data } = await deps.admin.from(T.l).update(patch).eq("id", lead.id).eq("user_id", deps.userId).select("*").single();
      return ok({ lead: data, findings });
    }

    case "draft_messages": {
      const lead = await loadLead(deps, body.leadId);
      if (!lead) return err(404, "lead_not_found");
      if (lead.status === "opted_out") return err(400, "lead_opted_out");
      const c = await loadCampaign(deps, lead.campaign_id);
      if (!c) return err(404, "campaign_not_found");
      const sender = senderOf(c);
      const icp = parseIcp(c.icp);
      const profile = (c.profile ?? {}) as Record<string, unknown>;
      const dm = (lead.decision_maker ?? {}) as { name?: string; role?: string };
      const sig = (lead.signals ?? {}) as { list?: string[]; observation?: string };
      const out = await model(deps, WRITE_SYSTEM, [
        `QUEM ESCREVE: ${sender.name || "(sem nome)"} da ${sender.company}`,
        `OFERTA: ${String(profile.offer ?? "")}\nDORES QUE RESOLVE: ${((profile.pains as string[]) ?? []).join("; ")}`,
        `ICP: ${icp.summary}`,
        `EMPRESA ALVO (DADOS): ${lead.name} — ${lead.category ?? ""} — ${lead.city ?? ""}`,
        dm.name ? `DECISOR: ${dm.name}${dm.role ? ` (${dm.role})` : ""}` : "DECISOR: desconhecido",
        sig.observation ? `OBSERVAÇÃO CONCRETA: ${sig.observation}` : "",
        sig.list?.length ? `SINAIS: ${sig.list.join("; ")}` : "",
      ].filter(Boolean).join("\n"), 900).catch(() => null);
      const seq = parseSequence(out);
      if (!seq) return err(502, "model_failed");
      // Rascunhos antigos (não enviados) deste lead saem; enviados ficam.
      await deps.admin.from(T.m).delete().eq("lead_id", lead.id).eq("user_id", deps.userId).eq("direction", "out").in("status", ["draft", "rejected", "approved"]).neq("kind", "reply");
      const footer = optOutFooter(sender);
      const base = { user_id: deps.userId, campaign_id: c.id, lead_id: lead.id, direction: "out", status: "draft" };
      const rows: Loose[] = [];
      const canEmail = !!lead.email && lead.email_status !== "invalid";
      if (canEmail) {
        rows.push({ ...base, channel: "email", kind: "first", subject: seq.subject, body: seq.first, footer });
        if (seq.followup1) rows.push({ ...base, channel: "email", kind: "followup1", subject: `Re: ${seq.subject}`, body: seq.followup1, footer });
        if (seq.followup2) rows.push({ ...base, channel: "email", kind: "followup2", subject: `Re: ${seq.subject}`, body: seq.followup2, footer });
      }
      const phone = lead.whatsapp ?? lead.phone;
      if (seq.whatsapp && phone) rows.push({ ...base, channel: "whatsapp", kind: "first", subject: "", body: `${seq.whatsapp}\n\n${OPT_OUT_WHATSAPP}`, footer: "" });
      if (!rows.length) return err(400, "no_channel", { finding: "Sem e-mail utilizável nem telefone para este lead." });
      const { data, error } = await deps.admin.from(T.m).insert(rows).select("*");
      if (error) return err(500, "db_error");
      await deps.admin.from(T.l).update({ status: lead.status === "new" || lead.status === "enriched" ? "drafted" : lead.status, updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
      return ok({ messages: data ?? [], problems: (data ?? []).map((m: Loose) => ({ id: m.id, problems: textProblems(m.channel, m.kind, m.subject ?? "", m.body ?? "") })) });
    }

    case "update_message": {
      const m = await loadMessage(deps, body.messageId);
      if (!m || m.direction !== "out") return err(404, "message_not_found");
      if (!["draft", "approved", "rejected", "failed"].includes(m.status)) return err(400, "message_locked");
      const subject = typeof body.subject === "string" ? body.subject.slice(0, 200) : m.subject;
      const text = typeof body.body === "string" ? body.body.slice(0, 5_000) : m.body;
      // Editou → volta para rascunho: precisa de nova aprovação.
      const { data } = await deps.admin.from(T.m).update({ subject, body: text, status: "draft", approved_at: null, error: null, updated_at: now.toISOString() })
        .eq("id", m.id).eq("user_id", deps.userId).select("*").single();
      return ok({ message: data, problems: textProblems(m.channel, m.kind, subject ?? "", text ?? "") });
    }

    case "approve":
    case "reject": {
      const ids = (Array.isArray(body.messageIds) ? body.messageIds : []).filter(isUuid).slice(0, 100);
      if (!ids.length) return err(400, "no_messages");
      const { data: msgs } = await deps.admin.from(T.m).select("*").eq("user_id", deps.userId).in("id", ids);
      const done: string[] = [];
      const blocked: Array<{ id: string; problems: string[] }> = [];
      for (const m of (msgs ?? []) as Loose[]) {
        if (m.direction !== "out") continue;
        if (op === "reject") {
          if (["draft", "approved"].includes(m.status)) {
            await deps.admin.from(T.m).update({ status: "rejected", approved_at: null, updated_at: now.toISOString() }).eq("id", m.id).eq("user_id", deps.userId);
            done.push(m.id);
          }
          continue;
        }
        if (m.status !== "draft") continue;
        const problems = textProblems(m.channel, m.kind, m.subject ?? "", m.body ?? "");
        if (problems.length) {
          blocked.push({ id: m.id, problems });
          continue;
        }
        await deps.admin.from(T.m).update({ status: "approved", approved_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", m.id).eq("user_id", deps.userId).eq("status", "draft");
        done.push(m.id);
      }
      return ok({ [op === "approve" ? "approved" : "rejected"]: done, blocked });
    }

    case "send": {
      const m = await loadMessage(deps, body.messageId);
      if (!m || m.direction !== "out") return err(404, "message_not_found");
      if (m.channel !== "email") return err(400, "whatsapp_is_manual");
      const lead = await loadLead(deps, m.lead_id);
      if (!lead) return err(404, "lead_not_found");
      const c = await loadCampaign(deps, m.campaign_id);
      if (!c) return err(404, "campaign_not_found");
      const accountId = isUuid(body.accountId) ? body.accountId : null;
      if (!accountId) return err(400, "gmail_account_required");
      const dnc = await loadDnc(deps);
      const kind = m.kind as MessageKind;
      // Follow-up: só depois do primeiro enviado e do prazo.
      let threadId: string | null = m.gmail_thread_id ?? null;
      let inReplyTo: string | undefined = m.meta?.inReplyTo;
      if (kind === "followup1" || kind === "followup2") {
        const { data: firsts } = await deps.admin.from(T.m).select("*").eq("lead_id", lead.id).eq("user_id", deps.userId)
          .eq("direction", "out").eq("channel", "email").eq("kind", "first").eq("status", "sent").limit(1);
        const first = (firsts ?? [])[0];
        if (!first) return err(400, "first_not_sent");
        const due = new Date(new Date(first.sent_at).getTime() + FOLLOWUP_DAYS[kind] * 86_400_000);
        if (now < due && body.force !== true) return err(400, "followup_not_due", { due: due.toISOString() });
        threadId = first.gmail_thread_id ?? null;
        inReplyTo = first.meta?.rfcMessageId ?? undefined;
      }
      // Parar a sequência: alguém da mesma empresa (domínio) já respondeu.
      const { data: inbound } = await deps.admin.from(T.m).select("lead_id, meta").eq("user_id", deps.userId).eq("direction", "in").limit(2000);
      // Respostas de verdade (devolução e resposta automática não param a sequência da empresa).
      const repliedLeadIds = new Set(((inbound ?? []) as Loose[]).filter((r) => ["reply", "opt_out"].includes(r.meta?.class)).map((r) => r.lead_id));
      let companyReplied = repliedLeadIds.has(lead.id);
      if (!companyReplied && lead.domain && repliedLeadIds.size) {
        const { data: same } = await deps.admin.from(T.l).select("id").eq("user_id", deps.userId).eq("domain", lead.domain).limit(50);
        companyReplied = (same ?? []).some((s: Loose) => repliedLeadIds.has(s.id));
      }
      const problems = sendGate({
        channel: "email", kind, subject: m.subject ?? "", body: m.body ?? "", status: m.status, to: lead.email,
        emailStatus: lead.email_status, allowRisky: body.allowRisky === true, leadStatus: lead.status,
        blocked: isBlocked(dnc, { email: lead.email, domain: lead.domain, phone: lead.phone }),
        sentToday: await sentTodayCount(deps, now), cap: dailyCap(deps.env), companyReplied,
      });
      if (problems.length) return err(409, "send_blocked", { problems });
      // Trava contra envio duplo: approved → sending (só um pedido ganha).
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
      const subject = m.subject ?? "";
      const raw = b64url(buildMime({ to: lead.email, subject, body: `${m.body}${kind === "reply" ? "" : (m.footer ?? "")}`, inReplyTo, references: inReplyTo }));
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
      // Message-ID real (para os follow-ups entrarem na mesma conversa).
      let rfcMessageId: string | undefined;
      try {
        const meta = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${out.id}?format=metadata&metadataHeaders=Message-ID`, {
          headers: { Authorization: `Bearer ${gmail.token}` },
        });
        const md = await meta.json();
        rfcMessageId = (md?.payload?.headers ?? []).find((h: Loose) => /^message-id$/i.test(h.name))?.value;
      } catch {
        /* opcional */
      }
      await deps.admin.from(T.m).update({
        status: "sent", sent_at: now.toISOString(), gmail_account_id: accountId, gmail_message_id: out.id, gmail_thread_id: out.threadId ?? threadId,
        error: null, meta: { ...(m.meta ?? {}), rfcMessageId, from: gmail.email }, updated_at: now.toISOString(),
      }).eq("id", m.id).eq("user_id", deps.userId);
      if (kind === "first") {
        await deps.admin.from(T.m).update({ send_after: new Date(now.getTime() + 3 * 86_400_000).toISOString() })
          .eq("lead_id", lead.id).eq("user_id", deps.userId).eq("kind", "followup1").eq("direction", "out");
        await deps.admin.from(T.m).update({ send_after: new Date(now.getTime() + 7 * 86_400_000).toISOString() })
          .eq("lead_id", lead.id).eq("user_id", deps.userId).eq("kind", "followup2").eq("direction", "out");
      }
      if (["new", "enriched", "drafted"].includes(lead.status)) {
        await deps.admin.from(T.l).update({ status: "contacted", updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
      }
      await deps.admin.from("connector_activity_logs").insert({
        user_id: deps.userId, connector_slug: "gmail", event_type: kind === "reply" ? "gmail_replied" : "gmail_sent",
        message: `Vertal Prospector: e-mail enviado para ${lead.email}`, status: "success",
        metadata: { to: lead.email, subject, accountEmail: gmail.email, messageId: out.id, threadId: out.threadId ?? threadId, source: "vertal_prospector" },
      });
      return ok({ sent: true, messageId: out.id, threadId: out.threadId ?? threadId });
    }

    case "whatsapp_link": {
      const m = await loadMessage(deps, body.messageId);
      if (!m || m.channel !== "whatsapp") return err(404, "message_not_found");
      if (m.status !== "approved" && m.status !== "sent") return err(409, "send_blocked", { problems: ["mensagem não aprovada"] });
      const lead = await loadLead(deps, m.lead_id);
      if (!lead) return err(404, "lead_not_found");
      const dnc = await loadDnc(deps);
      if (lead.status === "opted_out" || isBlocked(dnc, { phone: lead.whatsapp ?? lead.phone, domain: lead.domain })) {
        return err(409, "send_blocked", { problems: ["contato na lista de não contatar"] });
      }
      const link = waLink(lead.whatsapp ?? lead.phone, m.body ?? "");
      if (!link) return err(400, "invalid_phone");
      return ok({ link });
    }

    case "mark_sent": {
      // Só WhatsApp: o usuário enviou pelo próprio aparelho e marca aqui.
      const m = await loadMessage(deps, body.messageId);
      if (!m || m.channel !== "whatsapp") return err(404, "message_not_found");
      if (m.status !== "approved") return err(409, "send_blocked", { problems: ["mensagem não aprovada"] });
      await deps.admin.from(T.m).update({ status: "sent", sent_at: now.toISOString(), meta: { ...(m.meta ?? {}), manual: true }, updated_at: now.toISOString() })
        .eq("id", m.id).eq("user_id", deps.userId);
      const lead = await loadLead(deps, m.lead_id);
      if (lead && ["new", "enriched", "drafted"].includes(lead.status)) {
        await deps.admin.from(T.l).update({ status: "contacted", updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
      }
      return ok({ marked: true });
    }

    case "check_replies": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      const { data: sent } = await deps.admin.from(T.m).select("*").eq("campaign_id", c.id).eq("user_id", deps.userId)
        .eq("direction", "out").eq("channel", "email").eq("status", "sent").order("sent_at", { ascending: false }).limit(40);
      const { data: known } = await deps.admin.from(T.m).select("gmail_message_id").eq("campaign_id", c.id).eq("user_id", deps.userId).limit(5000);
      const knownIds = new Set((known ?? []).map((k: Loose) => k.gmail_message_id).filter(Boolean));
      const threads = new Map<string, Loose>();
      for (const s of (sent ?? []) as Loose[]) if (s.gmail_thread_id && !threads.has(s.gmail_thread_id)) threads.set(s.gmail_thread_id, s);
      const sender = senderOf(c);
      const profile = (c.profile ?? {}) as Record<string, unknown>;
      const summary = { replies: 0, optOuts: 0, bounces: 0, autoReplies: 0, drafts: 0 };
      const tokens = new Map<string, { token: string; email: string }>();
      for (const [threadId, s] of threads) {
        const acct = s.gmail_account_id as string;
        if (!acct) continue;
        let g = tokens.get(acct);
        if (!g) {
          try {
            g = await deps.gmailToken(acct);
            tokens.set(acct, g);
          } catch {
            continue;
          }
        }
        const r = await fetchJson(deps.fetch, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`, {
          headers: { Authorization: `Bearer ${g.token}` },
        });
        if (r.status !== 200) continue;
        const msgs = ((r.data as Loose)?.messages ?? []) as Loose[];
        for (const gm of msgs) {
          if (!gm?.id || knownIds.has(gm.id)) continue;
          const headers = (gm.payload?.headers ?? []) as Array<{ name: string; value: string }>;
          const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
          const from = h("from");
          if (from.toLowerCase().includes(g.email.toLowerCase())) continue; // nossa própria mensagem
          const text = gmailPlainText(gm.payload).slice(0, 4_000) || String(gm.snippet ?? "");
          const kind = classifyInbound(from, h("subject"), text);
          knownIds.add(gm.id);
          await deps.admin.from(T.m).insert({
            user_id: deps.userId, campaign_id: c.id, lead_id: s.lead_id, direction: "in", channel: "email", kind: "reply",
            subject: h("subject").slice(0, 300), body: text, status: "received", gmail_account_id: acct, gmail_message_id: gm.id,
            gmail_thread_id: threadId, meta: { from: from.slice(0, 200), class: kind, rfcMessageId: h("message-id") || undefined },
          });
          const lead = await loadLead(deps, s.lead_id);
          if (!lead) continue;
          if (kind === "auto_reply") {
            summary.autoReplies++;
            continue;
          }
          // Resposta, descadastro ou devolução: a sequência deste lead para (rascunhos/aprovados que não saíram).
          await deps.admin.from(T.m).update({ status: "cancelled", updated_at: now.toISOString() }).eq("lead_id", lead.id).eq("user_id", deps.userId)
            .eq("direction", "out").in("status", ["draft", "approved"]).neq("kind", "reply");
          if (kind === "bounce") {
            summary.bounces++;
            await deps.admin.from(T.l).update({ email_status: "invalid", updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
            continue;
          }
          if (kind === "opt_out") {
            summary.optOuts++;
            const email = normalizeDnc("email", lead.email ?? "");
            if (email) await deps.admin.from(T.d).upsert({ user_id: deps.userId, kind: "email", value: email, reason: "pediu para parar (resposta)" }, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
            await deps.admin.from(T.l).update({ status: "opted_out", updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
            await deps.admin.from(T.m).update({ status: "cancelled", updated_at: now.toISOString() }).eq("lead_id", lead.id).eq("user_id", deps.userId).eq("direction", "out").in("status", ["draft", "approved"]);
            continue;
          }
          summary.replies++;
          await deps.admin.from(T.l).update({ status: "replied", updated_at: now.toISOString() }).eq("id", lead.id).eq("user_id", deps.userId);
          const slots = meetingSlots(now);
          const out = await model(deps, REPLY_SYSTEM, [
            `OFERTA: ${String(profile.offer ?? "")}`,
            `QUEM RESPONDE: ${sender.name || "(sem nome)"} da ${sender.company}`,
            `TEXTO DE HORÁRIOS: ${meetingText(slots, sender.bookingLink)}`,
            `MENSAGEM DO CLIENTE (DADOS):\n${text.slice(0, 2_500)}`,
          ].join("\n\n"), 600).catch(() => null);
          const replyText = out && typeof out.reply === "string" ? out.reply.trim().slice(0, 3_000) : "";
          if (replyText) {
            const subj = h("subject") || "";
            await deps.admin.from(T.m).insert({
              user_id: deps.userId, campaign_id: c.id, lead_id: lead.id, direction: "out", channel: "email", kind: "reply",
              subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`, body: replyText, footer: "", status: "draft",
              gmail_thread_id: threadId, meta: { inReplyTo: h("message-id") || undefined, intent: out?.intent, slots },
            });
            summary.drafts++;
          }
        }
      }
      return ok({ summary, threads: threads.size });
    }

    case "update_lead": {
      const lead = await loadLead(deps, body.leadId);
      if (!lead) return err(404, "lead_not_found");
      const patch: Record<string, unknown> = { updated_at: now.toISOString() };
      if (typeof body.email === "string") {
        const e = body.email.trim().toLowerCase();
        if (e && !isEmail(e)) return err(400, "invalid_email");
        const d = e.split("@")[1];
        const hasMx = d ? await domainHasMx(deps.fetch, d, new Map()) : null;
        const dnc = await loadDnc(deps);
        patch.email = e || null;
        patch.email_status = classifyEmail({ email: e || null, published: false, patternConfirmed: false, manual: true, hasMx, blocked: isBlocked(dnc, { email: e, domain: lead.domain }) });
      }
      if (typeof body.status === "string" && ["new", "enriched", "drafted", "contacted", "replied", "meeting", "won", "lost"].includes(body.status)) patch.status = body.status;
      if (typeof body.decisionMaker === "object" && body.decisionMaker) {
        const dm = body.decisionMaker as Record<string, unknown>;
        patch.decision_maker = { name: String(dm.name ?? "").slice(0, 80), role: String(dm.role ?? "").slice(0, 80), source: "manual" };
      }
      const { data } = await deps.admin.from(T.l).update(patch).eq("id", lead.id).eq("user_id", deps.userId).select("*").single();
      return ok({ lead: data });
    }

    case "delete_lead": {
      // LGPD: apagar a pedido (lead + mensagens). Opcional: lembrar para não contatar de novo.
      const lead = await loadLead(deps, body.leadId);
      if (!lead) return err(404, "lead_not_found");
      if (body.addToDnc === true) {
        const rows: Loose[] = [];
        const e = lead.email ? normalizeDnc("email", lead.email) : null;
        const d = lead.domain ? normalizeDnc("domain", lead.domain) : null;
        if (e) rows.push({ user_id: deps.userId, kind: "email", value: e, reason: "apagado a pedido" });
        if (d) rows.push({ user_id: deps.userId, kind: "domain", value: d, reason: "apagado a pedido" });
        if (rows.length) await deps.admin.from(T.d).upsert(rows, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
      }
      await deps.admin.from(T.m).delete().eq("lead_id", lead.id).eq("user_id", deps.userId);
      await deps.admin.from(T.l).delete().eq("id", lead.id).eq("user_id", deps.userId);
      return ok({ deleted: true });
    }

    case "delete_campaign": {
      const c = await loadCampaign(deps, body.campaignId);
      if (!c) return err(404, "campaign_not_found");
      await deps.admin.from(T.m).delete().eq("campaign_id", c.id).eq("user_id", deps.userId);
      await deps.admin.from(T.l).delete().eq("campaign_id", c.id).eq("user_id", deps.userId);
      await deps.admin.from(T.c).delete().eq("id", c.id).eq("user_id", deps.userId);
      return ok({ deleted: true });
    }

    case "dnc_list": {
      const { data } = await deps.admin.from(T.d).select("id, kind, value, reason, created_at").eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(1000);
      return ok({ dnc: data ?? [] });
    }

    case "dnc_add": {
      const kind = (["email", "domain", "phone"].includes(body.kind) ? body.kind : "email") as DncKind;
      const value = normalizeDnc(kind, String(body.value ?? ""));
      if (!value) return err(400, "invalid_value");
      await deps.admin.from(T.d).upsert({ user_id: deps.userId, kind, value, reason: String(body.reason ?? "manual").slice(0, 120) }, { onConflict: "user_id,kind,value", ignoreDuplicates: true });
      // Cancela o que ainda não saiu para esse contato.
      const { data: leads } = await deps.admin.from(T.l).select("id, email, domain, phone").eq("user_id", deps.userId).limit(5000);
      const hit = ((leads ?? []) as Loose[]).filter((l) => isBlocked([{ kind, value }], { email: l.email, domain: l.domain, phone: l.phone })).map((l) => l.id);
      if (hit.length) {
        await deps.admin.from(T.m).update({ status: "cancelled", updated_at: now.toISOString() }).eq("user_id", deps.userId).eq("direction", "out").in("lead_id", hit).in("status", ["draft", "approved"]);
      }
      return ok({ added: { kind, value }, cancelledLeads: hit.length });
    }

    case "dnc_remove": {
      if (!isUuid(body.id)) return err(400, "invalid_id");
      await deps.admin.from(T.d).delete().eq("id", body.id).eq("user_id", deps.userId);
      return ok({ removed: true });
    }
  }
  return err(400, "unknown_op");
}

/** Texto simples de uma mensagem do Gmail (parte text/plain; senão, HTML sem tags). */
export function gmailPlainText(payload: Loose): string {
  let text = "", html = "";
  const dec = (data: string) => {
    try {
      const std = data.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
      return new TextDecoder("utf-8").decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    } catch {
      return "";
    }
  };
  const walk = (p: Loose) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !text) text = dec(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = dec(p.body.data);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  return (text || htmlToText(html, 8_000)).trim();
}
