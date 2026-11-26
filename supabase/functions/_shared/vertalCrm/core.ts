// Vertal CRM · regras puras (sem Deno/DOM), testadas no Vitest e no Deno.
//
// Partes adaptadas do Atomic CRM (https://github.com/marmelab/atomic-crm), Copyright (c) 2024-present,
// Francois Zaninotto, Marmelab — licença MIT (texto completo em src/components/vertal-crm/LICENSE.atomic-crm.md):
// modelo de dados (contatos/empresas/negócios/notas/tarefas/etiquetas), status de contato, tipos de tarefa,
// agrupamento do Kanban por etapa (getDealsByStage), reordenação ao arrastar e o formato CSV de importação/exportação.
// Mudanças: multi-tenant por workspace, vários funis com etapas personalizadas (aberta/ganha/perdida + probabilidade),
// textos em 21 idiomas, previsão ponderada e taxa de ganho, IA cobrada por crédito.

import { resolveUiLang, UI_LANG_AI_NAME, type UiLang } from "../vertalUiLang.ts";

export const CRM_NAME = "Vertal CRM";
export const CRM_ROUTE = "/crm";

/** Toda ação de IA dentro do CRM custa 1 crédito (resumo, e-mail, pontuação, próxima ação, busca em linguagem natural). */
export const CRM_AI_COST = 1;
/** Ativar a sincronização com um CRM externo pago: 4 créditos, uma vez por conexão (workspace + provedor). */
export const CRM_SYNC_ACTIVATE_COST = 4;
/** Cada execução de sincronização/mapeamento com IA entre o Vertal CRM e o outro CRM: 2 créditos. */
export const CRM_SYNC_AI_RUN_COST = 2;
export const CRM_CHARGE_REASON = "vertal_crm";

export type CrmEnv = Record<string, string | undefined>;
const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/**
 * Liga só com VERTAL_CRM_ENABLED=true E o usuário em VERTAL_CRM_USER_IDS.
 * Lista vazia = ninguém. "*" = todos (abrir para todos é decisão do Laércio; não está ligado).
 */
export function isCrmEnabled(env: CrmEnv, userId: string | null | undefined): boolean {
  if (!truthy(env.VERTAL_CRM_ENABLED) || !userId) return false;
  const ids = (env.VERTAL_CRM_USER_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!ids.length) return false;
  return ids.includes("*") || ids.includes(userId.trim().toLowerCase());
}
export const crmChargeOn = (env: CrmEnv) => truthy(env.VERTAL_CRM_CHARGE);
export const crmChargeAdmins = (env: CrmEnv) => truthy(env.VERTAL_CRM_CHARGE_ADMINS);
/**
 * Sincronização SEM IA (mapeamento padrão de campos). O Laércio não definiu preço: padrão 0 (grátis).
 * VERTAL_CRM_PLAIN_SYNC_COST=<n> passa a cobrar n créditos por execução. Decisão pendente dele.
 */
export function plainSyncCost(env: CrmEnv): number {
  const n = Math.floor(Number(env.VERTAL_CRM_PLAIN_SYNC_COST));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 0;
}

/**
 * IA do CRM só para quem tem plano pago (regra do Laércio, 2026-11-25). Padrão LIGADO;
 * VERTAL_CRM_AI_REQUIRES_PLAN=false desliga. Vale só para as ações de IA do CRM (op "ai" e
 * sincronização com IA); o resto do CRM continua grátis e sem plano.
 */
export function crmAiRequiresPlan(env: CrmEnv): boolean {
  const v = (env.VERTAL_CRM_AI_REQUIRES_PLAN ?? "").trim().toLowerCase();
  return !["false", "0", "off", "no", "nao", "não"].includes(v);
}
/** Planos pagos (mesmos ids de src/lib/planConfig.ts; "free" e "beta" não contam). */
export const CRM_PAID_PLANS = [
  "starter", "pro", "premium_1", "premium_2",
  "business_1", "business_2", "business_3", "business_4", "business_5", "business_6", "business_7", "enterprise",
] as const;
export function isPaidCrmPlan(sub: { plan?: string | null; is_active?: boolean | null } | null | undefined): boolean {
  if (!sub || sub.is_active !== true) return false;
  return (CRM_PAID_PLANS as readonly string[]).includes(String(sub.plan ?? "").trim().toLowerCase());
}

// ─── Idioma ──────────────────────────────────────────────────────────────
// Os 21 idiomas da interface (os mesmos das páginas de SEO do CRM grátis). "pt" = português do Brasil.
export type CrmLang = UiLang;
export function crmLang(...hints: Array<string | null | undefined>): CrmLang {
  return resolveUiLang(...hints);
}
/** Nome inicial de um workspace novo. */
export const CRM_DEFAULT_WS_NAME: Record<CrmLang, string> = {
  pt: "Meu CRM", "pt-PT": "O meu CRM", en: "My CRM", es: "Mi CRM", fr: "Mon CRM", de: "Mein CRM", it: "Il mio CRM", nl: "Mijn CRM",
  pl: "Mój CRM", tr: "CRM'im", ru: "Мой CRM", uk: "Мій CRM", ar: "نظام CRM الخاص بي", hi: "मेरा CRM", id: "CRM Saya", vi: "CRM của tôi",
  th: "CRM ของฉัน", ja: "マイCRM", ko: "내 CRM", "zh-CN": "我的 CRM", "zh-TW": "我的 CRM",
};
/** Moeda inicial de um workspace novo pelo idioma (o usuário muda nas Configurações). */
export const CRM_DEFAULT_CURRENCY: Record<CrmLang, string> = {
  pt: "BRL", "pt-PT": "EUR", en: "USD", es: "USD", fr: "EUR", de: "EUR", it: "EUR", nl: "EUR", pl: "PLN", tr: "TRY",
  ru: "RUB", uk: "UAH", ar: "USD", hi: "INR", id: "IDR", vi: "VND", th: "THB", ja: "JPY", ko: "KRW", "zh-CN": "CNY", "zh-TW": "TWD",
};

// ─── Funis e etapas ─────────────────────────────────────────────────────
export type StageKind = "open" | "won" | "lost";
export interface CrmStage { id: string; label: string; probability: number; kind: StageKind }
export interface CrmPipeline { id: string; name: string; stages: CrmStage[]; is_default?: boolean; position?: number }

// Etapas padrão de um funil novo: [id, rótulo, probabilidade, tipo]. Os ids ficam estáveis por idioma.
const STAGE_IDS = { pt: ["lead", "qualificado", "proposta", "negociacao", "ganho", "perdido"], en: ["lead", "qualified", "proposal", "negotiation", "won", "lost"], es: ["lead", "calificado", "propuesta", "negociacion", "ganado", "perdido"] } as const;
const STAGE_LABELS: Record<CrmLang, [string, string, string, string, string, string]> = {
  pt: ["Lead", "Qualificado", "Proposta enviada", "Em negociação", "Ganho", "Perdido"],
  "pt-PT": ["Lead", "Qualificado", "Proposta enviada", "Em negociação", "Ganho", "Perdido"],
  en: ["Lead", "Qualified", "Proposal sent", "In negotiation", "Won", "Lost"],
  es: ["Lead", "Calificado", "Propuesta enviada", "En negociación", "Ganado", "Perdido"],
  fr: ["Prospect", "Qualifié", "Proposition envoyée", "En négociation", "Gagné", "Perdu"],
  de: ["Lead", "Qualifiziert", "Angebot gesendet", "In Verhandlung", "Gewonnen", "Verloren"],
  it: ["Lead", "Qualificato", "Proposta inviata", "In trattativa", "Vinto", "Perso"],
  nl: ["Lead", "Gekwalificeerd", "Offerte verstuurd", "In onderhandeling", "Gewonnen", "Verloren"],
  pl: ["Lead", "Zakwalifikowany", "Oferta wysłana", "W negocjacjach", "Wygrany", "Przegrany"],
  tr: ["Potansiyel müşteri", "Nitelikli", "Teklif gönderildi", "Pazarlıkta", "Kazanıldı", "Kaybedildi"],
  ru: ["Лид", "Квалифицирован", "Предложение отправлено", "Переговоры", "Выиграна", "Проиграна"],
  uk: ["Лід", "Кваліфікований", "Пропозицію надіслано", "Переговори", "Виграно", "Програно"],
  ar: ["عميل محتمل", "مؤهَّل", "تم إرسال العرض", "قيد التفاوض", "مكسوبة", "خاسرة"],
  hi: ["लीड", "योग्य", "प्रस्ताव भेजा गया", "बातचीत जारी", "जीता", "हारा"],
  id: ["Prospek", "Terkualifikasi", "Penawaran terkirim", "Dalam negosiasi", "Menang", "Kalah"],
  vi: ["Khách tiềm năng", "Đủ điều kiện", "Đã gửi báo giá", "Đang đàm phán", "Thành công", "Thất bại"],
  th: ["ลีด", "ผ่านการคัดกรอง", "ส่งใบเสนอราคาแล้ว", "กำลังเจรจา", "ปิดการขายได้", "ไม่สำเร็จ"],
  ja: ["リード", "見込みあり", "提案送付済み", "交渉中", "受注", "失注"],
  ko: ["리드", "검증됨", "제안서 발송", "협상 중", "수주", "실패"],
  "zh-CN": ["潜在客户", "已确认", "已发送报价", "谈判中", "赢单", "输单"],
  "zh-TW": ["潛在客戶", "已確認", "已寄出報價", "洽談中", "成交", "未成交"],
};
const STAGE_PROB: Array<[number, StageKind]> = [[10, "open"], [25, "open"], [50, "open"], [75, "open"], [100, "won"], [0, "lost"]];
export const defaultStages = (lang: CrmLang = "pt"): CrmStage[] => {
  const ids = lang === "pt" || lang === "pt-PT" ? STAGE_IDS.pt : lang === "es" ? STAGE_IDS.es : STAGE_IDS.en;
  const labels = STAGE_LABELS[lang] ?? STAGE_LABELS.pt;
  return STAGE_PROB.map(([probability, kind], i) => ({ id: ids[i], label: labels[i], probability, kind }));
};
const PIPELINE_NAME: Record<CrmLang, string> = {
  pt: "Vendas", "pt-PT": "Vendas", en: "Sales", es: "Ventas", fr: "Ventes", de: "Vertrieb", it: "Vendite", nl: "Verkoop", pl: "Sprzedaż",
  tr: "Satış", ru: "Продажи", uk: "Продажі", ar: "المبيعات", hi: "बिक्री", id: "Penjualan", vi: "Bán hàng", th: "การขาย", ja: "営業",
  ko: "영업", "zh-CN": "销售", "zh-TW": "銷售",
};
export const defaultPipelineName = (lang: CrmLang = "pt") => PIPELINE_NAME[lang] ?? PIPELINE_NAME.pt;

export const slugify = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Valida/normaliza etapas vindas da tela (1–20, ids únicos, pelo menos uma aberta). */
export function normalizeStages(raw: unknown): CrmStage[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20) return null;
  const seen = new Set<string>();
  const out: CrmStage[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const label = String(o.label ?? "").trim().slice(0, 60);
    if (!label) return null;
    let id = slugify(String(o.id ?? "") || label) || `etapa-${out.length + 1}`;
    while (seen.has(id)) id = `${id}-${out.length + 1}`;
    seen.add(id);
    const kind: StageKind = o.kind === "won" || o.kind === "lost" ? o.kind : "open";
    const p = Math.round(Number(o.probability));
    const probability = kind === "won" ? 100 : kind === "lost" ? 0 : Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
    out.push({ id, label, probability, kind });
  }
  if (!out.some((s) => s.kind === "open")) return null;
  return out;
}

// ─── Kanban (adaptado do Atomic CRM: deals/stages.ts e DealListContent.tsx) ─────────
export interface KanbanDeal { id: string; stage: string; index: number; [k: string]: unknown }
export type DealsByStage<T extends KanbanDeal = KanbanDeal> = Record<string, T[]>;

/** Agrupa por etapa; etapa inexistente cai na primeira; cada coluna ordenada por index. */
export function getDealsByStage<T extends KanbanDeal>(deals: T[], stages: Pick<CrmStage, "id">[]): DealsByStage<T> {
  const by: DealsByStage<T> = Object.fromEntries(stages.map((s) => [s.id, [] as T[]]));
  if (!stages.length) return by;
  for (const d of deals) {
    const stage = by[d.stage] ? d.stage : stages[0].id;
    by[stage].push(d);
  }
  for (const s of stages) by[s.id].sort((a, b) => a.index - b.index);
  return by;
}

/**
 * Move um negócio (arrastar e soltar) e devolve o novo agrupamento + as linhas que precisam ser gravadas
 * (só as que mudaram de etapa ou de posição). Índices viram 0..n-1 em cada coluna afetada.
 */
export function moveDeal<T extends KanbanDeal>(
  by: DealsByStage<T>,
  dealId: string,
  toStage: string,
  toIndex: number,
): { next: DealsByStage<T>; updates: Array<{ id: string; stage: string; index: number }> } {
  const next: DealsByStage<T> = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v]]));
  let from: string | null = null;
  let deal: T | null = null;
  for (const [stage, list] of Object.entries(next)) {
    const i = list.findIndex((d) => d.id === dealId);
    if (i >= 0) {
      from = stage;
      deal = list.splice(i, 1)[0];
      break;
    }
  }
  if (!deal || !from || !next[toStage]) return { next: by, updates: [] };
  const target = next[toStage];
  const at = Math.max(0, Math.min(Number.isFinite(toIndex) ? toIndex : target.length, target.length));
  target.splice(at, 0, { ...deal, stage: toStage });
  const updates: Array<{ id: string; stage: string; index: number }> = [];
  for (const stage of new Set([from, toStage])) {
    next[stage] = next[stage].map((d, index) => {
      const orig = Object.values(by).flat().find((o) => o.id === d.id);
      if (!orig || orig.index !== index || orig.stage !== stage) updates.push({ id: d.id, stage, index });
      return { ...d, stage, index };
    });
  }
  return { next, updates };
}

// ─── Painel / relatórios ────────────────────────────────────────────────
export interface MetricDeal { amount: number | string | null; stage: string; status?: string | null; pipeline_id: string; expected_closing_date?: string | null; closed_at?: string | null; archived_at?: string | null; created_at?: string | null }

export interface CrmMetrics {
  openCount: number;
  openValue: number;
  weightedForecast: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  /** ganhos / (ganhos + perdidos), 0..1; null sem negócios fechados */
  winRate: number | null;
  avgDealValue: number | null;
  byStage: Array<{ pipelineId: string; stage: string; label: string; count: number; value: number }>;
  /** previsão ponderada por mês de fechamento esperado (YYYY-MM), só negócios abertos */
  forecastByMonth: Array<{ month: string; value: number; weighted: number }>;
}

export function computeMetrics(deals: MetricDeal[], pipelines: CrmPipeline[]): CrmMetrics {
  const stageOf = new Map<string, CrmStage>();
  for (const p of pipelines) for (const s of p.stages) stageOf.set(`${p.id}:${s.id}`, s);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  let openCount = 0, openValue = 0, weighted = 0, wonCount = 0, wonValue = 0, lostCount = 0;
  const byStage = new Map<string, { pipelineId: string; stage: string; label: string; count: number; value: number }>();
  const byMonth = new Map<string, { month: string; value: number; weighted: number }>();
  for (const d of deals) {
    if (d.archived_at) continue;
    const st = stageOf.get(`${d.pipeline_id}:${d.stage}`);
    const kind = (d.status as StageKind | undefined) ?? st?.kind ?? "open";
    const amount = num(d.amount);
    const key = `${d.pipeline_id}:${d.stage}`;
    const row = byStage.get(key) ?? { pipelineId: d.pipeline_id, stage: d.stage, label: st?.label ?? d.stage, count: 0, value: 0 };
    row.count++;
    row.value += amount;
    byStage.set(key, row);
    if (kind === "won") {
      wonCount++;
      wonValue += amount;
    } else if (kind === "lost") lostCount++;
    else {
      openCount++;
      openValue += amount;
      const w = amount * ((st?.probability ?? 0) / 100);
      weighted += w;
      const month = (d.expected_closing_date ?? "").slice(0, 7) || "sem-data";
      const m = byMonth.get(month) ?? { month, value: 0, weighted: 0 };
      m.value += amount;
      m.weighted += w;
      byMonth.set(month, m);
    }
  }
  const closed = wonCount + lostCount;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    openCount, openValue: round(openValue), weightedForecast: round(weighted), wonCount, wonValue: round(wonValue), lostCount,
    winRate: closed ? wonCount / closed : null,
    avgDealValue: wonCount ? round(wonValue / wonCount) : null,
    byStage: [...byStage.values()].map((r) => ({ ...r, value: round(r.value) })),
    forecastByMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, value: round(m.value), weighted: round(m.weighted) })),
  };
}

// ─── Status de contato e tipos de tarefa (Atomic CRM) ─────────────────────
export const CONTACT_STATUSES = ["cold", "warm", "hot", "in-contract"] as const;
export const TASK_TYPES = ["none", "email", "demo", "lunch", "meeting", "follow-up", "thank-you", "ship", "call"] as const;

// ─── CSV (formato compatível com o Atomic CRM + cabeçalhos em português) ─────
/** Parser RFC 4180 (aspas, vírgula ou ponto e vírgula, quebra de linha dentro de aspas). */
export function parseCsv(text: string): string[][] {
  const src = (text ?? "").replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  // Proteção contra injeção de fórmula ao abrir no Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\r\n");
}

/** Cabeçalhos aceitos → campo canônico (formato Atomic CRM em inglês + nomes comuns em pt/es). */
const CONTACT_HEADER_ALIASES: Record<string, string> = {
  first_name: "first_name", nome: "first_name", "primeiro nome": "first_name", "first name": "first_name", nombre: "first_name", name: "first_name",
  last_name: "last_name", sobrenome: "last_name", "last name": "last_name", apellido: "last_name",
  title: "title", cargo: "title", "job title": "title", puesto: "title",
  company: "company", empresa: "company", organization: "company", organizacao: "company", "organização": "company",
  email: "email_work", "e-mail": "email_work", email_work: "email_work", email_home: "email_home", email_other: "email_other", correo: "email_work",
  phone: "phone_work", telefone: "phone_work", celular: "phone_work", whatsapp: "phone_work", phone_work: "phone_work", phone_home: "phone_home", phone_other: "phone_other", telefono: "phone_work", "teléfono": "phone_work",
  background: "background", observacoes: "background", "observações": "background", notas: "background", notes: "background",
  status: "status", tags: "tags", etiquetas: "tags", linkedin_url: "linkedin_url", linkedin: "linkedin_url",
  gender: "gender", has_newsletter: "has_newsletter", first_seen: "first_seen", last_seen: "last_seen",
};
const normHeader = (h: string) => h.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export interface ImportedContact {
  first_name: string; last_name: string; title: string | null; company: string | null;
  emails: Array<{ email: string; type: "Work" | "Home" | "Other" }>;
  phones: Array<{ number: string; type: "Work" | "Home" | "Other" }>;
  background: string | null; status: string; tags: string[]; linkedin_url: string | null; has_newsletter: boolean;
}
export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

/** CSV → contatos (até `max` linhas). Linhas sem nome e sem e-mail são ignoradas. */
export function csvToContacts(text: string, max = 5000): { contacts: ImportedContact[]; skipped: number; unknownHeaders: string[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { contacts: [], skipped: 0, unknownHeaders: [] };
  const header = rows[0].map(normHeader);
  const fields = header.map((h) => CONTACT_HEADER_ALIASES[h] ?? null);
  const unknownHeaders = header.filter((_, i) => !fields[i]);
  const contacts: ImportedContact[] = [];
  let skipped = 0;
  for (const r of rows.slice(1, max + 1)) {
    const o: Record<string, string> = {};
    fields.forEach((f, i) => {
      if (f && (r[i] ?? "").trim() && !o[f]) o[f] = (r[i] ?? "").trim();
    });
    let first = o.first_name ?? "";
    let last = o.last_name ?? "";
    if (first && !last && header.includes("nome") && !header.includes("sobrenome") && first.includes(" ")) {
      const parts = first.split(/\s+/);
      first = parts.shift() ?? "";
      last = parts.join(" ");
    }
    const emails = (["email_work", "email_home", "email_other"] as const)
      .filter((k) => o[k] && EMAIL_RE.test(o[k]))
      .map((k) => ({ email: o[k].toLowerCase(), type: (k === "email_work" ? "Work" : k === "email_home" ? "Home" : "Other") as "Work" | "Home" | "Other" }));
    const phones = (["phone_work", "phone_home", "phone_other"] as const)
      .filter((k) => o[k])
      .map((k) => ({ number: o[k].slice(0, 40), type: (k === "phone_work" ? "Work" : k === "phone_home" ? "Home" : "Other") as "Work" | "Home" | "Other" }));
    if (!first && !last && !emails.length) {
      skipped++;
      continue;
    }
    const status = (CONTACT_STATUSES as readonly string[]).includes((o.status ?? "").toLowerCase()) ? o.status.toLowerCase() : "cold";
    contacts.push({
      first_name: first.slice(0, 120), last_name: last.slice(0, 120), title: o.title?.slice(0, 120) ?? null, company: o.company?.slice(0, 200) ?? null,
      emails, phones, background: o.background?.slice(0, 5000) ?? null, status,
      tags: (o.tags ?? "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20),
      linkedin_url: o.linkedin_url ?? null, has_newsletter: /^(true|1|sim|yes)$/i.test(o.has_newsletter ?? ""),
    });
  }
  return { contacts, skipped, unknownHeaders };
}

/** Cabeçalho da exportação: o mesmo do Atomic CRM, para quem migra de lá (ou volta). */
export const CONTACT_EXPORT_HEADERS = [
  "first_name", "last_name", "gender", "title", "background", "first_seen", "last_seen", "has_newsletter", "status", "tags",
  "linkedin_url", "company", "email_work", "email_home", "email_other", "phone_work", "phone_home", "phone_other",
];

// ─── IA (1 crédito cada) ────────────────────────────────────────────────
export const AI_KINDS = ["summary", "email", "score", "next_action", "search"] as const;
export type CrmAiKind = (typeof AI_KINDS)[number];
export const isAiKind = (v: unknown): v is CrmAiKind => typeof v === "string" && (AI_KINDS as readonly string[]).includes(v);

const LANG_NAME: Record<CrmLang, string> = UI_LANG_AI_NAME;

/** Contexto enxuto (sem segredos) que vai para o modelo. */
export function compactContext(ctx: unknown, max = 6000): string {
  const s = JSON.stringify(ctx, (_k, v) => (typeof v === "string" && v.length > 1500 ? `${v.slice(0, 1500)}…` : v));
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Rótulos dos valores técnicos que vão para o modelo (antes o resumo saía com "cold" em vez de "frio"). */
export const AI_VALUE_LABELS: Record<CrmLang, { status: Record<string, string>; dealStatus: Record<string, string>; taskType: Record<string, string> }> = {
  pt: {
    status: { cold: "frio", warm: "morno", hot: "quente", "in-contract": "cliente (em contrato)" },
    dealStatus: { open: "aberto", won: "ganho", lost: "perdido" },
    taskType: { none: "tarefa", email: "e-mail", demo: "demonstração", lunch: "almoço", meeting: "reunião", "follow-up": "follow-up", "thank-you": "agradecimento", ship: "entrega", call: "ligação" },
  },
  es: {
    status: { cold: "frío", warm: "tibio", hot: "caliente", "in-contract": "cliente (con contrato)" },
    dealStatus: { open: "abierto", won: "ganado", lost: "perdido" },
    taskType: { none: "tarea", email: "correo", demo: "demostración", lunch: "almuerzo", meeting: "reunión", "follow-up": "seguimiento", "thank-you": "agradecimiento", ship: "entrega", call: "llamada" },
  },
  en: {
    status: { cold: "cold", warm: "warm", hot: "hot", "in-contract": "customer (in contract)" },
    dealStatus: { open: "open", won: "won", lost: "lost" },
    taskType: {},
  },
  "pt-PT": {
    status: { cold: "frio", warm: "morno", hot: "quente", "in-contract": "cliente (com contrato)" },
    dealStatus: { open: "aberto", won: "ganho", lost: "perdido" },
    taskType: { none: "tarefa", email: "e-mail", demo: "demonstração", lunch: "almoço", meeting: "reunião", "follow-up": "seguimento", "thank-you": "agradecimento", ship: "entrega", call: "chamada" },
  },
  fr: {
    status: { cold: "froid", warm: "tiède", hot: "chaud", "in-contract": "client (sous contrat)" },
    dealStatus: { open: "ouverte", won: "gagnée", lost: "perdue" },
    taskType: { none: "tâche", email: "e-mail", demo: "démo", lunch: "déjeuner", meeting: "réunion", "follow-up": "relance", "thank-you": "remerciement", ship: "livraison", call: "appel" },
  },
  de: {
    status: { cold: "kalt", warm: "warm", hot: "heiß", "in-contract": "Kunde (unter Vertrag)" },
    dealStatus: { open: "offen", won: "gewonnen", lost: "verloren" },
    taskType: { none: "Aufgabe", email: "E-Mail", demo: "Demo", lunch: "Mittagessen", meeting: "Meeting", "follow-up": "Nachfassen", "thank-you": "Dankeschön", ship: "Lieferung", call: "Anruf" },
  },
  it: {
    status: { cold: "freddo", warm: "tiepido", hot: "caldo", "in-contract": "cliente (con contratto)" },
    dealStatus: { open: "aperta", won: "vinta", lost: "persa" },
    taskType: { none: "attività", email: "e-mail", demo: "demo", lunch: "pranzo", meeting: "riunione", "follow-up": "follow-up", "thank-you": "ringraziamento", ship: "consegna", call: "chiamata" },
  },
  nl: {
    status: { cold: "koud", warm: "lauw", hot: "warm", "in-contract": "klant (met contract)" },
    dealStatus: { open: "open", won: "gewonnen", lost: "verloren" },
    taskType: { none: "taak", email: "e-mail", demo: "demo", lunch: "lunch", meeting: "afspraak", "follow-up": "opvolging", "thank-you": "bedankje", ship: "levering", call: "telefoontje" },
  },
  pl: {
    status: { cold: "zimny", warm: "letni", hot: "gorący", "in-contract": "klient (z umową)" },
    dealStatus: { open: "otwarta", won: "wygrana", lost: "przegrana" },
    taskType: { none: "zadanie", email: "e-mail", demo: "demo", lunch: "lunch", meeting: "spotkanie", "follow-up": "follow-up", "thank-you": "podziękowanie", ship: "wysyłka", call: "telefon" },
  },
  tr: {
    status: { cold: "soğuk", warm: "ılık", hot: "sıcak", "in-contract": "müşteri (sözleşmeli)" },
    dealStatus: { open: "açık", won: "kazanıldı", lost: "kaybedildi" },
    taskType: { none: "görev", email: "e-posta", demo: "demo", lunch: "öğle yemeği", meeting: "toplantı", "follow-up": "takip", "thank-you": "teşekkür", ship: "teslimat", call: "arama" },
  },
  ru: {
    status: { cold: "холодный", warm: "тёплый", hot: "горячий", "in-contract": "клиент (по договору)" },
    dealStatus: { open: "открыта", won: "выиграна", lost: "проиграна" },
    taskType: { none: "задача", email: "письмо", demo: "демо", lunch: "обед", meeting: "встреча", "follow-up": "повторный контакт", "thank-you": "благодарность", ship: "доставка", call: "звонок" },
  },
  uk: {
    status: { cold: "холодний", warm: "теплий", hot: "гарячий", "in-contract": "клієнт (за договором)" },
    dealStatus: { open: "відкрита", won: "виграна", lost: "програна" },
    taskType: { none: "завдання", email: "лист", demo: "демо", lunch: "обід", meeting: "зустріч", "follow-up": "повторний контакт", "thank-you": "подяка", ship: "доставка", call: "дзвінок" },
  },
  ar: {
    status: { cold: "بارد", warm: "فاتر", hot: "ساخن", "in-contract": "عميل (بعقد)" },
    dealStatus: { open: "مفتوحة", won: "مكسوبة", lost: "خاسرة" },
    taskType: { none: "مهمة", email: "بريد إلكتروني", demo: "عرض توضيحي", lunch: "غداء", meeting: "اجتماع", "follow-up": "متابعة", "thank-you": "شكر", ship: "شحن", call: "مكالمة" },
  },
  hi: {
    status: { cold: "ठंडा", warm: "गुनगुना", hot: "गर्म", "in-contract": "ग्राहक (अनुबंध में)" },
    dealStatus: { open: "खुला", won: "जीता", lost: "हारा" },
    taskType: { none: "कार्य", email: "ईमेल", demo: "डेमो", lunch: "लंच", meeting: "मीटिंग", "follow-up": "फ़ॉलो-अप", "thank-you": "धन्यवाद", ship: "डिलीवरी", call: "कॉल" },
  },
  id: {
    status: { cold: "dingin", warm: "hangat", hot: "panas", "in-contract": "pelanggan (terikat kontrak)" },
    dealStatus: { open: "terbuka", won: "menang", lost: "kalah" },
    taskType: { none: "tugas", email: "email", demo: "demo", lunch: "makan siang", meeting: "rapat", "follow-up": "tindak lanjut", "thank-you": "ucapan terima kasih", ship: "pengiriman", call: "telepon" },
  },
  vi: {
    status: { cold: "lạnh", warm: "ấm", hot: "nóng", "in-contract": "khách hàng (có hợp đồng)" },
    dealStatus: { open: "đang mở", won: "thành công", lost: "thất bại" },
    taskType: { none: "công việc", email: "email", demo: "demo", lunch: "ăn trưa", meeting: "cuộc họp", "follow-up": "theo dõi", "thank-you": "cảm ơn", ship: "giao hàng", call: "cuộc gọi" },
  },
  th: {
    status: { cold: "เย็น", warm: "อุ่น", hot: "ร้อน", "in-contract": "ลูกค้า (มีสัญญา)" },
    dealStatus: { open: "เปิดอยู่", won: "ปิดได้", lost: "ไม่สำเร็จ" },
    taskType: { none: "งาน", email: "อีเมล", demo: "สาธิต", lunch: "มื้อกลางวัน", meeting: "ประชุม", "follow-up": "ติดตามผล", "thank-you": "ขอบคุณ", ship: "จัดส่ง", call: "โทร" },
  },
  ja: {
    status: { cold: "コールド", warm: "ウォーム", hot: "ホット", "in-contract": "顧客（契約中）" },
    dealStatus: { open: "進行中", won: "受注", lost: "失注" },
    taskType: { none: "タスク", email: "メール", demo: "デモ", lunch: "ランチ", meeting: "ミーティング", "follow-up": "フォローアップ", "thank-you": "お礼", ship: "発送", call: "電話" },
  },
  ko: {
    status: { cold: "콜드", warm: "웜", hot: "핫", "in-contract": "고객(계약 중)" },
    dealStatus: { open: "진행 중", won: "수주", lost: "실패" },
    taskType: { none: "할 일", email: "이메일", demo: "데모", lunch: "점심", meeting: "미팅", "follow-up": "후속 연락", "thank-you": "감사 인사", ship: "배송", call: "전화" },
  },
  "zh-CN": {
    status: { cold: "冷", warm: "温", hot: "热", "in-contract": "客户（已签约）" },
    dealStatus: { open: "进行中", won: "赢单", lost: "输单" },
    taskType: { none: "任务", email: "邮件", demo: "演示", lunch: "午餐", meeting: "会议", "follow-up": "跟进", "thank-you": "致谢", ship: "发货", call: "电话" },
  },
  "zh-TW": {
    status: { cold: "冷", warm: "溫", hot: "熱", "in-contract": "客戶（已簽約）" },
    dealStatus: { open: "進行中", won: "成交", lost: "未成交" },
    taskType: { none: "任務", email: "郵件", demo: "展示", lunch: "午餐", meeting: "會議", "follow-up": "跟進", "thank-you": "致謝", ship: "出貨", call: "電話" },
  },
};

/**
 * Troca valores técnicos do registro pelos rótulos no idioma do usuário antes de mandar ao modelo
 * (status do contato, status do negócio, tipo de tarefa). Não mexe em nada além dessas chaves.
 */
export function localizeAiContext(ctx: unknown, lang: CrmLang): unknown {
  const L = AI_VALUE_LABELS[lang] ?? AI_VALUE_LABELS.pt;
  const walk = (v: unknown, parentKey: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, parentKey));
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const isDeal = parentKey === "deals" || ("stage" in o && "amount" in o);
    for (const [k, x] of Object.entries(o)) {
      if (k === "status" && typeof x === "string") out[k] = (isDeal ? L.dealStatus[x] : L.status[x] ?? L.dealStatus[x]) ?? x;
      else if (k === "type" && typeof x === "string" && parentKey === "tasks") out[k] = L.taskType[x] ?? x;
      else out[k] = walk(x, k);
    }
    return out;
  };
  return walk(ctx, "");
}

/** Rede de segurança no texto do resumo: valor cru que o modelo copiou ("cold") vira o rótulo do idioma. */
export function localizeAiText(text: string, lang: CrmLang): string {
  if (lang === "en") return text;
  const L = AI_VALUE_LABELS[lang] ?? AI_VALUE_LABELS.pt;
  return text.replace(/(["'“”`]?)\b(in-contract|cold|warm|hot)\b\1/gi, (_m, _q, w: string) => L.status[w.toLowerCase()] ?? w);
}

export function aiMessages(kind: CrmAiKind, ctx: unknown, lang: CrmLang, extra: { query?: string; goal?: string } = {}) {
  const L = LANG_NAME[lang];
  const base = `Você é o assistente do Vertal CRM. Responda SEMPRE em ${L}. Use só os dados fornecidos; não invente fatos, valores nem e-mails.` +
    (kind === "search" ? "" : ` Nunca escreva valores técnicos crus (como cold, warm, hot, in-contract, open, won, lost): use palavras em ${L}.`);
  // A busca precisa dos ids crus (status/etapas viram filtro); os outros usos recebem os rótulos no idioma.
  const data = compactContext(kind === "search" ? ctx : localizeAiContext(ctx, lang));
  switch (kind) {
    case "summary":
      return [
        { role: "system", content: `${base} Faça um resumo executivo curto (até 8 linhas, tópicos) do registro: quem é, situação, últimos contatos, riscos e oportunidades.` },
        { role: "user", content: `Registro do CRM (JSON):\n${data}` },
      ];
    case "email":
      return [
        { role: "system", content: `${base} Escreva um e-mail de follow-up cordial, curto (até 120 palavras), sem promessas inventadas. Responda só JSON: {"subject": "...", "body": "..."}. É um RASCUNHO: o usuário revisa e envia ele mesmo.` },
        { role: "user", content: `Objetivo: ${(extra.goal ?? "follow-up").slice(0, 300)}\nRegistro do CRM (JSON):\n${data}` },
      ];
    case "score":
      return [
        { role: "system", content: `${base} Dê uma pontuação de 0 a 100 para a chance de este lead virar cliente, com até 3 motivos curtos. Responda só JSON: {"score": 0-100, "reasons": ["..."]}.` },
        { role: "user", content: `Registro do CRM (JSON):\n${data}` },
      ];
    case "next_action":
      return [
        { role: "system", content: `${base} Sugira a próxima melhor ação comercial. Responda só JSON: {"action": "frase curta", "why": "motivo", "task_type": "call|email|meeting|follow-up|demo|none", "due_in_days": 0-30}.` },
        { role: "user", content: `Registro do CRM (JSON):\n${data}` },
      ];
    case "search":
      return [
        {
          role: "system",
          content: `${base} Converta o pedido de busca em um filtro JSON. Responda só JSON com as chaves possíveis: ` +
            `{"entity":"contacts|companies|deals","text":"palavra","status":"cold|warm|hot|in-contract","tag":"nome","stage":"id da etapa",` +
            `"deal_status":"open|won|lost","min_amount":0,"max_amount":0,"min_score":0,"created_after":"YYYY-MM-DD","created_before":"YYYY-MM-DD","no_activity_days":0}. Omita o que não foi pedido.`,
        },
        { role: "user", content: `Etapas disponíveis: ${data}\nPedido: ${(extra.query ?? "").slice(0, 400)}` },
      ];
  }
}

/** Extrai o primeiro objeto JSON de uma resposta de modelo (com ou sem ```json). */
export function extractJson(text: string): Record<string, unknown> | null {
  const t = (text ?? "").replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(t.slice(start, i + 1));
          return v && typeof v === "object" && !Array.isArray(v) ? v : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface SearchFilter {
  entity: "contacts" | "companies" | "deals";
  text?: string; status?: string; tag?: string; stage?: string; deal_status?: "open" | "won" | "lost";
  min_amount?: number; max_amount?: number; min_score?: number; created_after?: string; created_before?: string; no_activity_days?: number;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Filtro do modelo → só chaves e valores permitidos (nada vira SQL cru). */
export function sanitizeSearchFilter(raw: unknown): SearchFilter {
  const o = (raw ?? {}) as Record<string, unknown>;
  const entity = o.entity === "companies" || o.entity === "deals" ? o.entity : "contacts";
  const f: SearchFilter = { entity };
  const str = (v: unknown, n = 80) => (typeof v === "string" && v.trim() ? v.trim().replace(/[%_,()*\\]/g, " ").slice(0, n).trim() : undefined);
  const nn = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const text = str(o.text);
  if (text) f.text = text;
  if (typeof o.status === "string" && (CONTACT_STATUSES as readonly string[]).includes(o.status)) f.status = o.status;
  const tag = str(o.tag, 60);
  if (tag) f.tag = tag;
  const stage = str(o.stage, 40);
  if (stage) f.stage = slugify(stage);
  if (o.deal_status === "open" || o.deal_status === "won" || o.deal_status === "lost") f.deal_status = o.deal_status;
  for (const k of ["min_amount", "max_amount", "min_score", "no_activity_days"] as const) {
    const v = nn(o[k]);
    if (v !== undefined) f[k] = k === "min_score" ? Math.min(100, v) : k === "no_activity_days" ? Math.min(3650, Math.floor(v)) : v;
  }
  for (const k of ["created_after", "created_before"] as const) if (typeof o[k] === "string" && DATE_RE.test(o[k] as string)) f[k] = o[k] as string;
  return f;
}

export function parseScore(text: string): { score: number; reasons: string[] } | null {
  const j = extractJson(text);
  const n = Math.round(Number(j?.score));
  if (!j || !Number.isFinite(n)) return null;
  const reasons = Array.isArray(j.reasons) ? j.reasons.map((r) => String(r).slice(0, 200)).slice(0, 3) : [];
  return { score: Math.max(0, Math.min(100, n)), reasons };
}
export function parseNextAction(text: string): { action: string; why: string; task_type: string; due_in_days: number } | null {
  const j = extractJson(text);
  const action = typeof j?.action === "string" ? j.action.trim().slice(0, 300) : "";
  if (!action) return null;
  const tt = typeof j?.task_type === "string" && (TASK_TYPES as readonly string[]).includes(j.task_type) ? j.task_type : "follow-up";
  const d = Math.round(Number(j?.due_in_days));
  return { action, why: typeof j?.why === "string" ? j.why.slice(0, 400) : "", task_type: tt, due_in_days: Number.isFinite(d) ? Math.max(0, Math.min(30, d)) : 2 };
}
export function parseEmailDraft(text: string): { subject: string; body: string } | null {
  const j = extractJson(text);
  const subject = typeof j?.subject === "string" ? j.subject.trim().slice(0, 200) : "";
  const body = typeof j?.body === "string" ? j.body.trim().slice(0, 4000) : "";
  if (body) return { subject, body };
  const raw = (text ?? "").trim();
  return raw ? { subject: "", body: raw.slice(0, 4000) } : null;
}

// ─── Webhooks e API ─────────────────────────────────────────────────────
const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*|metadata\.google\.internal)$/i;
/** Só https em host público (o banco faz o POST; nada de rede interna). */
export function isSafeWebhookUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 500) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (PRIVATE_HOST.test(h) || /^\d+$/.test(h) || !h.includes(".")) return false;
    if (u.port && u.port !== "443") return false;
    return true;
  } catch {
    return false;
  }
}

export const CRM_EVENT_TYPES = [
  "contact.created", "contact.updated", "contact.deleted",
  "company.created", "company.updated", "company.deleted",
  "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost", "deal.deleted",
  "task.created", "task.updated", "task.completed", "task.deleted",
  "note.created", "note.updated", "note.deleted",
] as const;
export function normalizeEvents(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  if (!list.length || list.includes("*")) return ["*"];
  const ok = list.filter((e) => (CRM_EVENT_TYPES as readonly string[]).includes(e));
  return ok.length ? [...new Set(ok)] : ["*"];
}

export const API_KEY_PREFIX = "vcrm_";
export const isApiKeyShape = (v: unknown): v is string => typeof v === "string" && /^vcrm_[A-Za-z0-9_-]{32,64}$/.test(v);

// ─── Integração com Vertal Prospector / Growth Team ───────────────────────
export interface CrmContactInput {
  first_name: string; last_name: string; title?: string | null;
  emails: Array<{ email: string; type: string }>; phones: Array<{ number: string; type: string }>;
  status: string; source: string; external_ids: Record<string, string>; background?: string | null;
}
export interface CrmCompanyInput { name: string; website?: string | null; phone?: string | null; address?: string | null; city?: string | null; tax_id?: string | null; sector?: string | null; source: string; external_ids: Record<string, string> }

const splitName = (full: string) => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first_name: (parts.shift() ?? "").slice(0, 120), last_name: parts.join(" ").slice(0, 120) };
};

/** Lead do Prospector → empresa + contato (decisor, ou o e-mail público da empresa). */
export function prospectorLeadToCrm(lead: Record<string, unknown>): { company: CrmCompanyInput; contact: CrmContactInput | null } {
  const dm = (lead.decision_maker ?? {}) as Record<string, unknown>;
  const email = typeof lead.email === "string" && EMAIL_RE.test(lead.email) && lead.email_status !== "invalid" ? lead.email.toLowerCase() : null;
  const status = lead.status === "won" ? "in-contract" : lead.status === "replied" || lead.status === "meeting" ? "hot" : lead.status === "contacted" ? "warm" : "cold";
  const company: CrmCompanyInput = {
    name: String(lead.name ?? "").slice(0, 200) || "Empresa",
    website: (lead.website as string) ?? null, phone: (lead.phone as string) ?? null, address: (lead.address as string) ?? null,
    city: (lead.city as string) ?? null, tax_id: (lead.cnpj as string) ?? null, sector: (lead.category as string) ?? null,
    source: "prospector", external_ids: { prospector_lead: String(lead.id ?? "") },
  };
  const dmName = typeof dm.name === "string" ? dm.name : "";
  if (!dmName && !email) return { company, contact: null };
  const n = dmName ? splitName(dmName) : { first_name: company.name.slice(0, 120), last_name: "" };
  return {
    company,
    contact: {
      ...n, title: typeof dm.role === "string" ? dm.role.slice(0, 120) : null,
      emails: email ? [{ email, type: "Work" }] : [],
      phones: lead.phone ? [{ number: String(lead.phone).slice(0, 40), type: "Work" }] : [],
      status, source: "prospector", external_ids: { prospector_lead: String(lead.id ?? "") },
      background: typeof lead.category === "string" ? `Lead do Vertal Prospector · ${lead.category}` : "Lead do Vertal Prospector",
    },
  };
}

/** Contato do Growth Team → contato do CRM (etapa vira status). */
export function growthContactToCrm(gc: Record<string, unknown>): { contact: CrmContactInput; company: string | null } | null {
  const email = typeof gc.email === "string" && EMAIL_RE.test(gc.email) ? gc.email.toLowerCase() : null;
  const name = typeof gc.name === "string" ? gc.name : "";
  if (!email && !name) return null;
  const status = gc.status === "opted_out" ? "cold"
    : gc.stage === "retencao" || gc.status === "converted" || gc.status === "active" ? "in-contract"
    : gc.stage === "conversao" || gc.status === "engaged" ? "hot" : "warm";
  const n = name ? splitName(name) : { first_name: (email ?? "").split("@")[0].slice(0, 120), last_name: "" };
  return {
    company: typeof gc.company === "string" && gc.company.trim() ? gc.company.trim().slice(0, 200) : null,
    contact: {
      ...n, emails: email ? [{ email, type: "Work" }] : [], phones: gc.phone ? [{ number: String(gc.phone).slice(0, 40), type: "Work" }] : [],
      status, source: "growth", external_ids: { growth_contact: String(gc.id ?? "") },
      background: `Vertal Growth Team · ${String(gc.stage ?? "")}${gc.status === "opted_out" ? " · NÃO CONTATAR (pediu para sair)" : ""}`,
    },
  };
}

// ─── Sincronização com CRMs externos (pelas conexões que o usuário já tem no Vertal Fluxos) ──────
export type SyncProvider = "pipedrive" | "hubspot" | "salesforce" | "zoho" | "rdstation";
export const SYNC_PROVIDERS: Array<{ id: SyncProvider; name: string; fluxosApp: string | null; push: boolean; pull: boolean }> = [
  { id: "pipedrive", name: "Pipedrive", fluxosApp: "pipedrive", push: true, pull: true },
  { id: "hubspot", name: "HubSpot", fluxosApp: "hubspot", push: true, pull: false },
  { id: "salesforce", name: "Salesforce", fluxosApp: "salesforce", push: false, pull: true },
  // Sem app no Vertal Fluxos ainda (e não criamos apps OAuth novos): aparecem como "em breve".
  { id: "zoho", name: "Zoho CRM", fluxosApp: null, push: false, pull: false },
  { id: "rdstation", name: "RD Station CRM", fluxosApp: null, push: false, pull: false },
];
export const providerInfo = (id: unknown) => SYNC_PROVIDERS.find((p) => p.id === id) ?? null;

/** Campos do contato do Vertal CRM disponíveis para mapear. */
export const CRM_CONTACT_FIELDS = ["full_name", "first_name", "last_name", "email", "phone", "title", "company", "website", "background"] as const;
export type Mapping = Record<string, string>; // parâmetro do provedor → campo do Vertal CRM

export const DEFAULT_MAPPING: Record<"pipedrive" | "hubspot", Mapping> = {
  pipedrive: { name: "full_name", emails: "email", phones: "phone" },
  hubspot: { email: "email", firstName: "first_name", lastName: "last_name", phone: "phone", company: "company", website: "website" },
};
export const PUSH_ACTION: Record<"pipedrive" | "hubspot", string> = { pipedrive: "createPerson", hubspot: "createContact" };

export function normalizeMapping(raw: unknown, provider: "pipedrive" | "hubspot", allowedParams: string[]): Mapping {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: Mapping = {};
  for (const [k, v] of Object.entries(o)) {
    if (!allowedParams.includes(k)) continue;
    if (typeof v === "string" && (CRM_CONTACT_FIELDS as readonly string[]).includes(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : { ...DEFAULT_MAPPING[provider] };
}

export interface FlatContact { full_name: string; first_name: string; last_name: string; email: string; phone: string; title: string; company: string; website: string; background: string }
export function flattenContact(c: Record<string, unknown>, companyRow?: Record<string, unknown> | null): FlatContact {
  const emails = Array.isArray(c.emails) ? (c.emails as Array<{ email?: string }>) : [];
  const phones = Array.isArray(c.phones) ? (c.phones as Array<{ number?: string }>) : [];
  const first = String(c.first_name ?? "");
  const last = String(c.last_name ?? "");
  return {
    full_name: `${first} ${last}`.trim(), first_name: first, last_name: last,
    email: emails[0]?.email ?? "", phone: phones[0]?.number ?? "", title: String(c.title ?? ""),
    company: String(companyRow?.name ?? ""), website: String(companyRow?.website ?? ""), background: String(c.background ?? "").slice(0, 500),
  };
}

/** Monta os parâmetros da ação do provedor a partir do mapeamento. Pipedrive usa listas [{email}], [{phone}]. */
export function pushParameters(provider: "pipedrive" | "hubspot", mapping: Mapping, flat: FlatContact): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const [param, field] of Object.entries(mapping)) {
    const v = flat[field as keyof FlatContact] ?? "";
    if (!v) continue;
    if (provider === "pipedrive" && param === "emails") p.emails = [{ email: v }];
    else if (provider === "pipedrive" && param === "phones") p.phones = [{ phone: v }];
    else p[param] = v;
  }
  if (provider === "pipedrive" && !p.name) p.name = flat.full_name || flat.email;
  return p;
}

/** Itens lidos do outro CRM → contatos do Vertal CRM (com id externo para não duplicar). */
export function pulledToContacts(provider: SyncProvider, items: unknown[]): Array<CrmContactInput & { company?: string | null }> {
  const out: Array<CrmContactInput & { company?: string | null }> = [];
  for (const it of Array.isArray(items) ? items.slice(0, 200) : []) {
    const o = ((it as Record<string, unknown>)?.raw ?? it ?? {}) as Record<string, unknown>;
    let id = "", name = "", email = "", phone = "", company: string | null = null, title: string | null = null;
    if (provider === "salesforce") {
      id = String(o.Id ?? "");
      name = `${o.FirstName ?? ""} ${o.LastName ?? ""}`.trim();
      email = String(o.Email ?? "");
      phone = String(o.Phone ?? "");
      title = o.Title ? String(o.Title) : null;
      const acc = o.Account as Record<string, unknown> | undefined;
      company = acc?.Name ? String(acc.Name) : null;
    } else {
      // Pipedrive: negócios/leads trazem person_name, person_id, org_name; pessoas trazem name/email[].
      id = String(o.person_id && typeof o.person_id === "object" ? (o.person_id as Record<string, unknown>).value ?? "" : o.person_id ?? o.id ?? "");
      name = String(o.person_name ?? (o.person_id as Record<string, unknown> | undefined)?.name ?? o.name ?? o.title ?? "");
      const em = (o.person_id as Record<string, unknown> | undefined)?.email ?? o.email;
      email = Array.isArray(em) ? String((em[0] as Record<string, unknown>)?.value ?? "") : String(em ?? "");
      const ph = (o.person_id as Record<string, unknown> | undefined)?.phone ?? o.phone;
      phone = Array.isArray(ph) ? String((ph[0] as Record<string, unknown>)?.value ?? "") : String(ph ?? "");
      company = o.org_name ? String(o.org_name) : null;
    }
    if (!id || (!name && !email)) continue;
    const n = splitName(name || email.split("@")[0]);
    out.push({
      ...n, title, company,
      emails: EMAIL_RE.test(email) ? [{ email: email.toLowerCase(), type: "Work" }] : [],
      phones: phone ? [{ number: phone.slice(0, 40), type: "Work" }] : [],
      status: "warm", source: "sync", external_ids: { [provider]: id },
    });
  }
  return out;
}

export const SALESFORCE_PULL_QUERY = "SELECT Id, FirstName, LastName, Email, Phone, Title, Account.Name FROM Contact ORDER BY CreatedDate DESC LIMIT 100";

export function mappingMessages(provider: string, params: Array<{ key: string; label?: string; required?: boolean }>, lang: CrmLang) {
  return [
    {
      role: "system",
      content: `Você mapeia campos entre o Vertal CRM e o ${provider}. Responda em ${LANG_NAME[lang]} e só com JSON: ` +
        `{"mapping": {"<parâmetro do ${provider}>": "<campo do Vertal CRM>"}, "notes": "explicação curta"}. ` +
        `Campos do Vertal CRM: ${CRM_CONTACT_FIELDS.join(", ")}. Use só parâmetros listados. Não invente.`,
    },
    { role: "user", content: `Parâmetros do ${provider}: ${JSON.stringify(params.slice(0, 40))}` },
  ];
}

// ─── Sanitização do CRUD pela API/Fluxos ───────────────────────────────────
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : v === null || v === undefined ? undefined : String(v).trim().slice(0, n));

/** Corpo de contato vindo da API/Fluxos → colunas permitidas (nunca workspace_id/owner). */
export function contactPatch(o: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const fn = s(o.first_name ?? o.firstName, 120);
  const ln = s(o.last_name ?? o.lastName, 120);
  if (fn !== undefined) p.first_name = fn;
  if (ln !== undefined) p.last_name = ln;
  if (!fn && !ln && typeof o.name === "string") Object.assign(p, splitName(o.name));
  const title = s(o.title, 120);
  if (title !== undefined) p.title = title;
  const email = s(o.email, 200);
  if (email && EMAIL_RE.test(email)) p.emails = [{ email: email.toLowerCase(), type: "Work" }];
  const phone = s(o.phone, 40);
  if (phone) p.phones = [{ number: phone, type: "Work" }];
  const bg = s(o.background ?? o.notes, 5000);
  if (bg !== undefined) p.background = bg;
  if (typeof o.status === "string" && (CONTACT_STATUSES as readonly string[]).includes(o.status)) p.status = o.status;
  const li = s(o.linkedin_url, 300);
  if (li !== undefined) p.linkedin_url = li;
  if (o.custom && typeof o.custom === "object" && !Array.isArray(o.custom)) p.custom = o.custom;
  return p;
}

export function dealPatch(o: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const name = s(o.name ?? o.title, 200);
  if (name) p.name = name;
  const stage = s(o.stage, 40);
  if (stage) p.stage = slugify(stage);
  const amount = Number(o.amount ?? o.value);
  if (o.amount !== undefined || o.value !== undefined) if (Number.isFinite(amount) && amount >= 0) p.amount = Math.round(amount * 100) / 100;
  const date = s(o.expected_closing_date ?? o.expectedCloseDate, 10);
  if (date && DATE_RE.test(date)) p.expected_closing_date = date;
  const desc = s(o.description, 5000);
  if (desc !== undefined) p.description = desc;
  const cat = s(o.category, 80);
  if (cat !== undefined) p.category = cat;
  return p;
}
