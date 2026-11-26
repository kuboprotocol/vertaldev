// VERTAL Code AI · provedores grátis extras (depois do Ollama Cloud) + monitor de cota grátis.
//
//   Cadeia de texto (Auto/Code/Turbo/Pro):  própria (VM) → GPU própria → Ollama Cloud →
//     [Grátis rápido (Cerebras) → Grátis leve (Gemini, plano grátis do AI Studio)] → outros grátis → pagos (só ALLOW_PAID)
//
//   Monitor: conta pedidos/tokens por provedor+modelo (minuto em memória; dia no banco, tabela já existente
//   rate_limit_counters, SEM migração nova), lê cabeçalhos x-ratelimit-* quando vêm, e PULA o modelo quando
//   chega perto do limite (padrão 90%) ou depois de 429/402/cota — até o reset (Gemini: meia-noite do Pacífico).
//
// Módulo PURO (sem Deno, sem rede): roda no Vitest e na edge function. Nomes de fornecedor só aqui e nos
// documentos; o usuário só vê os rótulos Vertal ("Vertal Livre · Veloz" etc.).
//
// Config (tudo opcional, dentro do VERTAL_GPU_CONFIG ou como segredo avulso):
//   VERTAL_CEREBRAS_KEY / VERTAL_GEMINI_KEY      chaves (segredos avulsos; sem chave = provedor fora)
//   VERTAL_FREE_CEREBRAS_MODELS                   ids na ordem (padrão "qwen-3.8-27b,gpt-oss-120b")
//   VERTAL_FREE_GEMINI_MODELS                     ids na ordem (padrão "gemini-3.5-flash-lite")
//   VERTAL_FREE_CEREBRAS_CONTEXT / _GEMINI_CONTEXT contexto útil (padrão 32 000 / 200 000)
//   VERTAL_FREE_TIER_ENABLED                      "false" tira os dois da cadeia sem apagar nada
//   VERTAL_FREE_QUOTA_THRESHOLD                   fração do limite que já pula (padrão 0.9)
//   VERTAL_FREE_QUOTA_LIMITS                      JSON {"gemini:gemini-3.5-flash-lite":{"rpd":500,"rpm":15}, …}
//   VERTAL_FREE_QUOTA_OLLAMA_MONTHLY_USD          teto estimado do mês no Ollama Cloud (opcional; só pula se definido)

import type { VcaEffort, VcaEnv, VcaModel } from "./router.ts";

export const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
export const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const CEREBRAS_MODELS_URL = "https://api.cerebras.ai/v1/models";
export const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_CEREBRAS_MODELS = ["qwen-3.8-27b", "gpt-oss-120b"];
export const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite"];
export const DEFAULT_QUOTA_THRESHOLD = 0.9;

const off = (v: string | undefined) => /^(0|false|no|off|nao|não)$/i.test((v ?? "").trim());
const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);
const list = (v: string | undefined, d: string[]) => {
  const l = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return l.length ? l.slice(0, 4) : d;
};

const ALL_EFFORTS: VcaEffort[] = ["auto", "low", "high", "max"];

/**
 * Modelos grátis extras na ordem da cadeia: Cerebras (todos) → Gemini (todos). Só entra quem tem chave.
 * Rótulos e ids sem nome de fornecedor (aparecem no app).
 */
export function freeTierModels(env: VcaEnv): VcaModel[] {
  if (off(env.VERTAL_FREE_TIER_ENABLED)) return [];
  const out: VcaModel[] = [];
  if ((env.VERTAL_CEREBRAS_KEY ?? "").trim()) {
    list(env.VERTAL_FREE_CEREBRAS_MODELS, DEFAULT_CEREBRAS_MODELS).forEach((model, i) =>
      out.push({
        id: i === 0 ? "vca-veloz-free" : `vca-veloz-free-${i + 1}`,
        label: i === 0 ? "Vertal Livre · Veloz" : `Vertal Livre · Veloz ${i + 1}`,
        provider: "cerebras",
        url: CEREBRAS_URL,
        keyEnv: "VERTAL_CEREBRAS_KEY",
        model,
        cost: "free",
        vision: false,
        context: num(env.VERTAL_FREE_CEREBRAS_CONTEXT, 32_000),
        jsonMode: true,
        reasoning: false,
        efforts: ALL_EFFORTS,
        maxOutputTokens: 8_000,
        price: { in: 0, out: 0 },
      })
    );
  }
  if ((env.VERTAL_GEMINI_KEY ?? "").trim()) {
    list(env.VERTAL_FREE_GEMINI_MODELS, DEFAULT_GEMINI_MODELS).forEach((model, i) =>
      out.push({
        id: i === 0 ? "vca-leve-free" : `vca-leve-free-${i + 1}`,
        label: i === 0 ? "Vertal Livre · Leve+" : `Vertal Livre · Leve+ ${i + 1}`,
        provider: "gemini",
        url: GEMINI_OPENAI_URL,
        keyEnv: "VERTAL_GEMINI_KEY",
        model: model.replace(/^models\//, ""),
        cost: "free",
        vision: true,
        context: num(env.VERTAL_FREE_GEMINI_CONTEXT, 200_000),
        jsonMode: true,
        reasoning: false,
        efforts: ALL_EFFORTS,
        maxOutputTokens: 8_000,
        price: { in: 0, out: 0 },
      })
    );
  }
  return out;
}

// ───────────────────────────── Limites ─────────────────────────────

export interface QuotaLimits {
  /** pedidos por minuto / por dia; tokens por minuto / por dia (null = sem limite conhecido). */
  rpm?: number | null;
  rpd?: number | null;
  tpm?: number | null;
  tpd?: number | null;
  /** Fuso do reset diário (IANA). */
  resetTz?: string;
  /** Teto estimado em US$ por mês (só Ollama Cloud, opcional). */
  monthlyUsd?: number | null;
}

/**
 * Limites padrão do plano grátis (informados pelo Laércio em 26/11/2026; cabeçalhos do provedor, quando vêm,
 * mandam mais). Chave: "provedor:modelo"; "provedor:*" vale para qualquer modelo do provedor.
 */
export const DEFAULT_QUOTA_LIMITS: Record<string, QuotaLimits> = {
  "cerebras:qwen-3.8-27b": { rpm: 450, tpd: 1_080_000_000, resetTz: "UTC" },
  "cerebras:gpt-oss-120b": { rpm: 5, resetTz: "UTC" },
  "cerebras:*": { rpm: 5, resetTz: "UTC" },
  // AI Studio, plano grátis: flash-lite 15 RPM / 500 RPD (+ 250k TPM); RPD zera à meia-noite do Pacífico.
  "gemini:*": { rpm: 15, rpd: 500, tpm: 250_000, resetTz: "America/Los_Angeles" },
  // OpenRouter ":free": só acompanha (o limite depende dos créditos da conta); 429 ainda põe em espera.
  "openrouter:free": { resetTz: "UTC" },
  // Ollama Cloud: créditos mensais do plano; a API não expõe o uso, então só estimamos o nosso gasto.
  "ollama_cloud:all": { resetTz: "UTC" },
};

/** Chave do monitor para um modelo, ou null se o modelo não é acompanhado. */
export function quotaKey(m: Pick<VcaModel, "provider" | "model" | "cost">): string | null {
  if (m.provider === "cerebras" || (m.provider === "gemini" && m.cost === "free")) return `${m.provider}:${m.model}`;
  if (m.provider === "openrouter" && m.cost === "free") return "openrouter:free";
  if (m.provider === "ollama_cloud") return "ollama_cloud:all";
  return null;
}

export function quotaLimits(env: VcaEnv, key: string): QuotaLimits {
  let over: Record<string, QuotaLimits> = {};
  try {
    const raw = (env.VERTAL_FREE_QUOTA_LIMITS ?? "").trim();
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && !Array.isArray(j)) over = j as Record<string, QuotaLimits>;
    }
  } catch { /* config ruim = padrões */ }
  const prov = key.split(":")[0];
  const base = DEFAULT_QUOTA_LIMITS[key] ?? DEFAULT_QUOTA_LIMITS[`${prov}:*`] ?? { resetTz: "UTC" };
  const merged: QuotaLimits = { ...base, ...(over[`${prov}:*`] ?? {}), ...(over[key] ?? {}) };
  if (prov === "ollama_cloud" && Number(env.VERTAL_FREE_QUOTA_OLLAMA_MONTHLY_USD) > 0) {
    merged.monthlyUsd = Number(env.VERTAL_FREE_QUOTA_OLLAMA_MONTHLY_USD);
  }
  return merged;
}

export function quotaThreshold(env: VcaEnv): number {
  const t = Number(env.VERTAL_FREE_QUOTA_THRESHOLD);
  return t > 0 && t <= 1 ? t : DEFAULT_QUOTA_THRESHOLD;
}

// ───────────────────────────── Relógio por fuso ─────────────────────────────

/** Dia corrente no fuso (YYYY-MM-DD), próximo reset (meia-noite local, em ms UTC) e mês (YYYY-MM). */
export function zonedDay(nowMs: number, tz: string): { day: string; month: string; resetAt: number } {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]),
    );
  } catch {
    return zonedDay(nowMs, "UTC");
  }
  const y = Number(parts.year), mo = Number(parts.month), d = Number(parts.day);
  const localMs = Date.UTC(y, mo - 1, d, Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  const offset = Math.round((localMs - nowMs) / 60_000) * 60_000;
  const resetAt = Date.UTC(y, mo - 1, d + 1) - offset;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { day: `${y}-${pad(mo)}-${pad(d)}`, month: `${y}-${pad(mo)}`, resetAt };
}

// ───────────────────────────── Armazenamento ─────────────────────────────

/** Contadores persistidos (dia/mês/espera). Implementação real: tabela rate_limit_counters (sem migração). */
export interface QuotaStore {
  /** Todos os contadores "vcaq:*" ainda válidos: bucket → {count, until(ms)}. */
  load(): Promise<Array<{ bucket: string; count: number; until: number }>>;
  /** Soma delta ao contador (bucket, until). */
  add(bucket: string, until: number, delta: number): Promise<void>;
}

export const QUOTA_BUCKET_PREFIX = "vcaq:";

interface MinuteWindow {
  start: number;
  req: number;
  tok: number;
}

interface KeyState {
  minute: MinuteWindow;
  /** dia: chave do dia → contagens (memória + último valor lido do banco) */
  dayLabel: string;
  dayReq: number;
  dayTok: number;
  monthLabel: string;
  monthUsdMicro: number;
  /** espera até (ms) e por quê */
  coolUntil: number;
  coolWhy: string | null;
  /** últimos cabeçalhos x-ratelimit-* vistos (nome curto → valor) */
  headers: Record<string, number>;
  headersAt: number;
  lastStatus: number | null;
  lastAt: number;
}

export interface QuotaEvent {
  status: number;
  headers?: { get(name: string): string | null; forEach?: (cb: (v: string, k: string) => void) => void } | null;
  /** texto do erro (até ~2 KB), para ler cota diária/retryDelay */
  errorText?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

const RL_HEADER = /^x-ratelimit-(limit|remaining|reset)-(requests|tokens)(?:-(minute|day|hour))?$/i;

function parseDurationSec(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  // "1m30s", "37s", "250ms", "2h"
  let total = 0;
  let matched = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "ms" ? n / 1000 : m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : n;
  }
  return matched ? total : null;
}

/**
 * Monitor de cota (um por isolate). Decisões síncronas (skipReason) a partir do estado em memória,
 * reabastecido do banco por refresh() (cache curto). Gravações em segundo plano via `defer`.
 */
export class FreeQuotaMonitor {
  private state = new Map<string, KeyState>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    private deps: {
      env: () => VcaEnv;
      store?: QuotaStore | null;
      now?: () => number;
      defer?: (p: Promise<unknown>) => void;
      log?: (m: string) => void;
      /** Quanto tempo o retrato do banco vale (padrão 20 s). */
      refreshMs?: number;
    },
  ) {}

  private now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private get(key: string): KeyState {
    const now = this.now();
    const lim = quotaLimits(this.deps.env(), key);
    const z = zonedDay(now, lim.resetTz ?? "UTC");
    const zm = zonedDay(now, "UTC");
    let s = this.state.get(key);
    if (!s) {
      s = {
        minute: { start: now, req: 0, tok: 0 },
        dayLabel: z.day,
        dayReq: 0,
        dayTok: 0,
        monthLabel: zm.month,
        monthUsdMicro: 0,
        coolUntil: 0,
        coolWhy: null,
        headers: {},
        headersAt: 0,
        lastStatus: null,
        lastAt: 0,
      };
      this.state.set(key, s);
    }
    if (now - s.minute.start >= 60_000) s.minute = { start: now, req: 0, tok: 0 };
    if (s.dayLabel !== z.day) {
      s.dayLabel = z.day;
      s.dayReq = 0;
      s.dayTok = 0;
    }
    if (s.monthLabel !== zm.month) {
      s.monthLabel = zm.month;
      s.monthUsdMicro = 0;
    }
    return s;
  }

  private buckets(key: string) {
    const now = this.now();
    const lim = quotaLimits(this.deps.env(), key);
    const z = zonedDay(now, lim.resetTz ?? "UTC");
    const zm = zonedDay(now, "UTC");
    const monthEnd = Date.UTC(Number(zm.month.slice(0, 4)), Number(zm.month.slice(5, 7)), 1);
    return {
      req: { b: `${QUOTA_BUCKET_PREFIX}${key}:d:${z.day}:req`, until: z.resetAt },
      tok: { b: `${QUOTA_BUCKET_PREFIX}${key}:d:${z.day}:tok`, until: z.resetAt },
      usd: { b: `${QUOTA_BUCKET_PREFIX}${key}:m:${zm.month}:usd_micro`, until: monthEnd },
      cool: { b: `${QUOTA_BUCKET_PREFIX}${key}:cool` },
      resetAt: z.resetAt,
    };
  }

  /** Lê os contadores do banco (no máximo a cada refreshMs). Falha = segue só com a memória. */
  async refresh(force = false): Promise<void> {
    const store = this.deps.store;
    if (!store) return;
    if (!force && this.now() - this.loadedAt < (this.deps.refreshMs ?? 20_000)) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const rows = await store.load();
        const now = this.now();
        for (const r of rows) {
          if (!r.bucket.startsWith(QUOTA_BUCKET_PREFIX)) continue;
          const rest = r.bucket.slice(QUOTA_BUCKET_PREFIX.length);
          const mCool = rest.match(/^(.+):cool$/);
          if (mCool) {
            const s = this.get(mCool[1]);
            if (r.until > now && r.until > s.coolUntil) {
              s.coolUntil = r.until;
              s.coolWhy = s.coolWhy ?? "quota_error";
            }
            continue;
          }
          const m = rest.match(/^(.+):(d|m):([0-9-]+):(req|tok|usd_micro)$/);
          if (!m) continue;
          const s = this.get(m[1]);
          if (m[2] === "d" && m[3] === s.dayLabel) {
            if (m[4] === "req") s.dayReq = Math.max(s.dayReq, r.count);
            if (m[4] === "tok") s.dayTok = Math.max(s.dayTok, r.count);
          } else if (m[2] === "m" && m[3] === s.monthLabel && m[4] === "usd_micro") {
            s.monthUsdMicro = Math.max(s.monthUsdMicro, r.count);
          }
        }
        this.loadedAt = this.now();
      } catch (e) {
        this.deps.log?.(`[vertal-code-ai] quota refresh failed: ${e instanceof Error ? e.message : "err"}`);
        this.loadedAt = this.now();
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Motivo para pular este modelo agora (ou null). Usa memória + último retrato do banco. */
  skipReason(m: Pick<VcaModel, "provider" | "model" | "cost">, inputTokens = 0): string | null {
    const key = quotaKey(m);
    if (!key) return null;
    const s = this.get(key);
    const now = this.now();
    if (s.coolUntil > now) return `cooldown:${s.coolWhy ?? "quota"}`;
    const env = this.deps.env();
    const lim = quotaLimits(env, key);
    const t = quotaThreshold(env);
    const near = (used: number, max: number | null | undefined) => !!max && max > 0 && used >= max * t;
    if (near(s.minute.req + 1, lim.rpm)) return "rpm";
    if (near(s.minute.tok + inputTokens, lim.tpm)) return "tpm";
    if (near(s.dayReq + 1, lim.rpd)) return "rpd";
    if (near(s.dayTok + inputTokens, lim.tpd)) return "tpd";
    if (lim.monthlyUsd && near(s.monthUsdMicro / 1e6, lim.monthlyUsd)) return "monthly_usd";
    // Cabeçalhos do provedor (frescos: últimos 2 min para minuto; até o reset para dia).
    const h = s.headers;
    const fresh = now - s.headersAt < 120_000;
    const low = (rem: number | undefined, max: number | undefined) =>
      rem !== undefined && max !== undefined && max > 0 && rem <= max * (1 - t);
    if (fresh && low(h["remaining-requests-minute"] ?? h["remaining-requests"], h["limit-requests-minute"] ?? h["limit-requests"])) return "hdr_rpm";
    if (fresh && low(h["remaining-tokens-minute"] ?? h["remaining-tokens"], h["limit-tokens-minute"] ?? h["limit-tokens"])) return "hdr_tpm";
    if (low(h["remaining-requests-day"], h["limit-requests-day"]) && now < (h["reset-at-requests-day"] ?? Infinity)) return "hdr_rpd";
    if (low(h["remaining-tokens-day"], h["limit-tokens-day"]) && now < (h["reset-at-tokens-day"] ?? Infinity)) return "hdr_tpd";
    return null;
  }

  private readHeaders(s: KeyState, ev: QuotaEvent) {
    const hs = ev.headers;
    if (!hs?.forEach) return;
    const now = this.now();
    let any = false;
    hs.forEach((v, k) => {
      const mm = k.match(RL_HEADER);
      if (!mm) return;
      const name = `${mm[1].toLowerCase()}-${mm[2].toLowerCase()}${mm[3] ? `-${mm[3].toLowerCase()}` : ""}`;
      if (mm[1].toLowerCase() === "reset") {
        const sec = parseDurationSec(v);
        if (sec !== null) {
          s.headers[name] = sec;
          s.headers[`reset-at-${mm[2].toLowerCase()}${mm[3] ? `-${mm[3].toLowerCase()}` : ""}`] = now + sec * 1000;
          any = true;
        }
        return;
      }
      const n = Number(v);
      if (Number.isFinite(n)) {
        s.headers[name] = n;
        any = true;
      }
    });
    if (any) s.headersAt = now;
  }

  /** Registra o resultado de uma chamada (sucesso ou erro). Grava no banco em segundo plano. */
  record(m: Pick<VcaModel, "provider" | "model" | "cost">, ev: QuotaEvent): void {
    const key = quotaKey(m);
    if (!key) return;
    const s = this.get(key);
    const now = this.now();
    s.lastStatus = ev.status;
    s.lastAt = now;
    this.readHeaders(s, ev);
    const b = this.buckets(key);
    const persist = (bucket: string, until: number, delta: number) => {
      if (!this.deps.store || !delta) return;
      const p = this.deps.store.add(bucket, until, delta).catch((e) =>
        this.deps.log?.(`[vertal-code-ai] quota write failed: ${e instanceof Error ? e.message : "err"}`)
      );
      if (this.deps.defer) this.deps.defer(p);
    };
    if (ev.status >= 200 && ev.status < 300) {
      const tok = Math.max(0, Math.round((ev.inputTokens ?? 0) + (ev.outputTokens ?? 0)));
      s.minute.req += 1;
      s.minute.tok += tok;
      s.dayReq += 1;
      s.dayTok += tok;
      persist(b.req.b, b.req.until, 1);
      persist(b.tok.b, b.tok.until, tok);
      const micro = Math.round(Math.max(0, ev.costUsd ?? 0) * 1e6);
      if (micro && key.startsWith("ollama_cloud")) {
        s.monthUsdMicro += micro;
        persist(b.usd.b, b.usd.until, micro);
      }
      return;
    }
    const text = (ev.errorText ?? "").slice(0, 4_000);
    const quotaErr = ev.status === 429 || ev.status === 402 ||
      (ev.status === 403 && /quota|rate.?limit|exceeded|billing/i.test(text));
    if (!quotaErr) return;
    // Até quando esperar: retry-after → reset dos cabeçalhos → retryDelay do Google → diário (reset do dia) → 60 s.
    let until = 0;
    let why = `http_${ev.status}`;
    const ra = parseDurationSec(ev.headers?.get("retry-after"));
    if (ra !== null) until = now + ra * 1000;
    const daily = /per.?day|PerDay|daily|requests_per_day|RPD|tokens per day/i.test(text);
    if (daily) {
      until = Math.max(until, b.resetAt);
      why = "daily_quota";
    } else {
      const rd = text.match(/"retryDelay"\s*:\s*"([^"]+)"/);
      const sec = rd ? parseDurationSec(rd[1]) : null;
      if (sec !== null) until = Math.max(until, now + sec * 1000);
      const hr = s.headers["reset-at-requests-day"];
      if (s.headers["remaining-requests-day"] === 0 && hr && hr > now) {
        until = Math.max(until, hr);
        why = "daily_quota";
      }
      const hm = Math.max(s.headers["reset-at-requests-minute"] ?? 0, s.headers["reset-at-tokens-minute"] ?? 0);
      if (!until && hm > now) until = hm;
    }
    if (ev.status === 402) {
      until = Math.max(until, b.resetAt);
      why = "no_credit";
    }
    if (!until) until = now + 60_000;
    until = Math.min(until, now + 32 * 86_400_000);
    if (until > s.coolUntil) {
      s.coolUntil = until;
      s.coolWhy = why;
      persist(b.cool.b, until, 1);
    }
  }

  /** Retrato para o painel/consulta: uso vs limite e se está sendo pulado. Só nomes internos (admin). */
  snapshot(models: Array<Pick<VcaModel, "id" | "label" | "provider" | "model" | "cost">>): QuotaStatus {
    const now = this.now();
    const env = this.deps.env();
    const t = quotaThreshold(env);
    const keys = new Map<string, Array<Pick<VcaModel, "id" | "label">>>();
    for (const m of models) {
      const k = quotaKey(m);
      if (!k) continue;
      keys.set(k, [...(keys.get(k) ?? []), { id: m.id, label: m.label }]);
    }
    for (const k of this.state.keys()) if (!keys.has(k)) keys.set(k, []);
    const rows: QuotaStatusRow[] = [];
    for (const [key, ms] of keys) {
      const s = this.get(key);
      const lim = quotaLimits(env, key);
      const [provider, ...rest] = key.split(":");
      const pct = (used: number, max: number | null | undefined) => (max ? Math.round((used / max) * 1000) / 10 : null);
      const probe = { provider, model: rest.join(":"), cost: provider === "ollama_cloud" ? "paid" : "free" } as Pick<VcaModel, "provider" | "model" | "cost">;
      const reason = this.skipReason(probe);
      rows.push({
        key,
        provider,
        model: rest.join(":"),
        models: ms,
        day: s.dayLabel,
        resetTz: lim.resetTz ?? "UTC",
        resetsAt: new Date(zonedDay(now, lim.resetTz ?? "UTC").resetAt).toISOString(),
        requestsToday: s.dayReq,
        tokensToday: s.dayTok,
        requestsThisMinute: s.minute.req,
        tokensThisMinute: s.minute.tok,
        limits: { rpm: lim.rpm ?? null, rpd: lim.rpd ?? null, tpm: lim.tpm ?? null, tpd: lim.tpd ?? null, monthlyUsd: lim.monthlyUsd ?? null },
        pct: {
          rpd: pct(s.dayReq, lim.rpd),
          tpd: pct(s.dayTok, lim.tpd),
          rpm: pct(s.minute.req, lim.rpm),
          tpm: pct(s.minute.tok, lim.tpm),
          monthlyUsd: lim.monthlyUsd ? pct(s.monthUsdMicro / 1e6, lim.monthlyUsd) : null,
        },
        estUsdThisMonth: provider === "ollama_cloud" ? Math.round(s.monthUsdMicro) / 1e6 : null,
        providerHeaders: Object.keys(s.headers).length ? { ...s.headers, ageSec: Math.round((now - s.headersAt) / 1000) } : null,
        cooldownUntil: s.coolUntil > now ? new Date(s.coolUntil).toISOString() : null,
        cooldownReason: s.coolUntil > now ? s.coolWhy : null,
        skipped: !!reason,
        skipReason: reason,
        lastStatus: s.lastStatus,
        lastAt: s.lastAt ? new Date(s.lastAt).toISOString() : null,
      });
    }
    rows.sort((a, b) => a.key.localeCompare(b.key));
    return {
      at: new Date(now).toISOString(),
      threshold: t,
      note: "requests/tokens 'Today' are shared across isolates (stored); 'ThisMinute' and providerHeaders are this isolate only.",
      providers: rows,
      anySkipped: rows.some((r) => r.skipped),
      warnings: rows.filter((r) => r.skipped || (r.pct.rpd ?? 0) >= 75 || (r.pct.tpd ?? 0) >= 75).map((r) => `${r.key}:${r.skipReason ?? "≥75%"}`),
    };
  }
}

export interface QuotaStatusRow {
  key: string;
  provider: string;
  model: string;
  models: Array<Pick<VcaModel, "id" | "label">>;
  day: string;
  resetTz: string;
  resetsAt: string;
  requestsToday: number;
  tokensToday: number;
  requestsThisMinute: number;
  tokensThisMinute: number;
  limits: { rpm: number | null; rpd: number | null; tpm: number | null; tpd: number | null; monthlyUsd: number | null };
  pct: { rpd: number | null; tpd: number | null; rpm: number | null; tpm: number | null; monthlyUsd: number | null };
  estUsdThisMonth: number | null;
  providerHeaders: Record<string, number> | null;
  cooldownUntil: string | null;
  cooldownReason: string | null;
  skipped: boolean;
  skipReason: string | null;
  lastStatus: number | null;
  lastAt: string | null;
}

export interface QuotaStatus {
  at: string;
  threshold: number;
  note: string;
  providers: QuotaStatusRow[];
  anySkipped: boolean;
  warnings: string[];
}
