// VERTAL Code AI → Vertal Data Library ("logística reversa de dados para o Vertaldephin").
//
// Envia o USO do VERTAL Code AI para o livro "Vertal Code AI" do Knowledge Book
// (kuboprotocol/vertaldephin.Knowledge-API, POST /api/collect/vertal-code-ai/events, contrato vca.usage.v1).
// É a versão de servidor do mesmo protocolo do vertal-collect.js (mesma chave de ingestão por app,
// mesmo hash de usuário "vertal-code-ai:user:<id>", mesmo formato de lote com consentimento).
//
// Regras (todas testadas em src/lib/vertalCodeAi/dataLibrary.test.ts):
//  - DESLIGADO por padrão. Liga só com a config VERTAL_DATA_LIBRARY {"enabled":true,"endpoint":"https://…","key":"vdl_…"}
//    (segredo avulso, ou a chave "VERTAL_DATA_LIBRARY" dentro do VERTAL_GPU_CONFIG — o projeto está no limite de segredos).
//  - Sem consentimento GRAVADO não envia nada. Fontes que já existem (nenhuma tela nova):
//      rewards_panel  public.vertal_nodes.opted_in = true (aceite do Vertal Node no painel de recompensas /shortlinks)
//      cookie_banner  localStorage "cookie_consent" = "granted" (banner de cookies; o navegador repassa em dataConsent)
//    Recusa explícita (cookie "denied" ou Global Privacy Control) sempre vence.
//  - Por padrão só uso ANONIMIZADO: modo, opção, modelo próprio x reserva, latência, tokens, custo, sucesso/erro,
//    tipo de mídia e uma CATEGORIA do pedido (classificador abaixo). Nunca o texto do pedido, nomes de arquivo ou ids crus.
//  - Texto cru (trecho do pedido/código) só se a config permitir (rawContent) E o consentimento gravado cobrir isso
//    explicitamente (finalidade "vertal_code_ai_content" na evidência do banner). Nenhum consentimento atual cobre.
//  - Em lote, "dispara e esquece": timeout curto, erros engolidos, nunca atrasa nem derruba o pedido do usuário.
//  - Nada de payload nos logs.

export type VcaDlConsentSource = "rewards_panel" | "cookie_banner";
export type VcaDlEnv = Record<string, string | undefined>;

export interface VcaDlConfig {
  enabled: boolean;
  endpoint: string;
  key: string;
  policy: string;
  sources: VcaDlConsentSource[];
  rawContent: boolean;
  batchSize: number;
  timeoutMs: number;
}

const truthy = (v: unknown) => v === true || /^(1|true|yes|on|sim)$/i.test(String(v ?? "").trim());
const ALL_SOURCES: VcaDlConsentSource[] = ["rewards_panel", "cookie_banner"];

function parseObj(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Config lida de VERTAL_DATA_LIBRARY (vence) ou de VERTAL_GPU_CONFIG.VERTAL_DATA_LIBRARY. Inválida/ausente = desligado. */
export function dataLibraryConfig(env: VcaDlEnv): VcaDlConfig | null {
  const own = parseObj(env.VERTAL_DATA_LIBRARY);
  const viaGpu = parseObj(parseObj(env.VERTAL_GPU_CONFIG)?.VERTAL_DATA_LIBRARY);
  const c = own ?? viaGpu;
  if (!c || !truthy(c.enabled)) return null;
  const endpoint = typeof c.endpoint === "string" ? c.endpoint.trim().replace(/\/+$/, "") : "";
  const key = typeof c.key === "string" ? c.key.trim() : "";
  if (!/^https:\/\/[^\s/]+/i.test(endpoint) || !/^vdl_[A-Za-z0-9_-]{8,}$/.test(key)) return null;
  const sources = Array.isArray(c.sources)
    ? ALL_SOURCES.filter((s) => (c.sources as unknown[]).includes(s))
    : ALL_SOURCES;
  if (!sources.length) return null;
  return {
    enabled: true,
    endpoint,
    key,
    policy: typeof c.policy === "string" && /^[\w.-]{1,40}$/.test(c.policy) ? c.policy : "v1",
    sources,
    rawContent: truthy(c.rawContent),
    batchSize: Math.min(100, Math.max(1, Number(c.batchSize) || 20)),
    timeoutMs: Math.min(10_000, Math.max(500, Number(c.timeoutMs) || 3_000)),
  };
}

// ───────────────────────────── Consentimento (fontes que já existem) ─────────────────────────────

/** O que o navegador repassa do banner de cookies (mesmas chaves do ads-consent do vertal.app). */
export interface VcaCookieClaim {
  cookie?: "granted" | "denied" | null;
  purposes?: string[];
  noticeVersion?: string | null;
  gpc?: boolean;
}

export type VcaRewardsConsent = "granted" | "revoked" | "none";

export interface VcaConsentDecision {
  send: boolean;
  source: VcaDlConsentSource | null;
  /** Trecho cru permitido (só com finalidade explícita gravada). */
  rawContent: boolean;
  reason: "granted" | "no_consent_recorded" | "denied" | "gpc" | "revoked" | "disabled";
}

export const VCA_RAW_CONTENT_PURPOSE = "vertal_code_ai_content";

/** Saneia o dataConsent que veio do navegador (nunca confia em formato). */
export function parseCookieClaim(raw: unknown): VcaCookieClaim | null {
  const o = parseObj(raw);
  if (!o) return null;
  const cookie = o.cookie === "granted" || o.cookie === "denied" ? o.cookie : null;
  const purposes = Array.isArray(o.purposes) ? o.purposes.filter((p): p is string => typeof p === "string").slice(0, 10).map((p) => p.slice(0, 60)) : [];
  return {
    cookie,
    purposes,
    noticeVersion: typeof o.noticeVersion === "string" ? o.noticeVersion.slice(0, 60) : null,
    gpc: o.gpc === true,
  };
}

export function decideConsent(cfg: VcaDlConfig | null, rewards: VcaRewardsConsent, cookie: VcaCookieClaim | null): VcaConsentDecision {
  const no = (reason: VcaConsentDecision["reason"]): VcaConsentDecision => ({ send: false, source: null, rawContent: false, reason });
  if (!cfg) return no("disabled");
  const useCookie = cfg.sources.includes("cookie_banner");
  const useRewards = cfg.sources.includes("rewards_panel");
  // Recusa explícita vence qualquer aceite.
  if (cookie?.gpc) return no("gpc");
  if (useCookie && cookie?.cookie === "denied") return no("denied");
  if (useRewards && rewards === "granted") {
    return { send: true, source: "rewards_panel", rawContent: false, reason: "granted" };
  }
  if (useCookie && cookie?.cookie === "granted") {
    const raw = cfg.rawContent && (cookie.purposes ?? []).includes(VCA_RAW_CONTENT_PURPOSE);
    return { send: true, source: "cookie_banner", rawContent: raw, reason: "granted" };
  }
  if (useRewards && rewards === "revoked") return no("revoked");
  return no("no_consent_recorded");
}

/** Aceite do Vertal Node (painel de recompensas): mesma regra do src/lib/vertal-js.ts. */
export function rewardsConsentFromRows(rows: Array<{ opted_in: boolean | null }> | null | undefined): VcaRewardsConsent {
  if (!rows || rows.length === 0) return "none";
  return rows.some((r) => r.opted_in === true) ? "granted" : "revoked";
}

// ───────────────────────────── Classificador (só a categoria sai do servidor) ─────────────────────────────

export const VCA_PROMPT_CATEGORIES = [
  "ui", "styling", "backend", "database", "auth", "bugfix", "refactor", "test", "docs", "deploy",
  "game", "data", "integration", "question", "image", "video", "other",
] as const;
export type VcaPromptCategory = (typeof VCA_PROMPT_CATEGORIES)[number];

const CATEGORY_RULES: Array<[VcaPromptCategory, RegExp]> = [
  ["bugfix", /\b(bug|erro|error|falha|quebrad|broken|crash|n[aã]o funciona|not working|fix|corrig|conserta|exception|stack ?trace)/i],
  ["test", /\b(teste|testes|test|tests|vitest|jest|cypress|playwright|unit[aá]rio|coverage)\b/i],
  ["refactor", /\b(refator|refactor|limpa[r]? o c[oó]digo|clean ?up|reorganiz|renomei|rename)/i],
  ["auth", /\b(login|logout|auth|autentica|cadastro|signup|sign[- ]?in|senha|password|oauth|jwt|sess[aã]o)/i],
  ["database", /\b(banco de dados|database|sql|tabela|table|supabase|postgres|migra[cç][aã]o|migration|query|schema|rls)\b/i],
  ["deploy", /\b(deploy|publicar|produ[cç][aã]o|vercel|cloudflare|railway|docker|ci\/cd|pipeline|dom[ií]nio|domain)\b/i],
  ["game", /\b(jogo|game|phaser|babylon|three\.?js|sprite|fase|level|personagem|player)\b/i],
  ["integration", /\b(api|webhook|integra|stripe|pix|pagamento|payment|whatsapp|gmail|slack|openai|endpoint)\b/i],
  ["data", /\b(gr[aá]fico|chart|dashboard|relat[oó]rio|report|csv|planilha|excel|analytics|m[eé]trica)\b/i],
  ["styling", /\b(css|tailwind|cor|cores|color|tema|theme|dark ?mode|fonte|font|espa[cç]amento|padding|margin|anima[cç][aã]o|responsiv)/i],
  ["ui", /\b(bot[aã]o|button|tela|p[aá]gina|page|componente|component|formul[aá]rio|form|modal|menu|navbar|layout|landing|site|header|footer|card)\b/i],
  ["backend", /\b(servidor|server|backend|edge function|fun[cç][aã]o|node|express|nest|rota|route|cron)\b/i],
  ["docs", /\b(documenta|docs?|readme|coment[aá]rio|comment|explica)\b/i],
  ["question", /^\s*(como|o que|por que|porque|qual|quais|what|how|why|which|is it|d[aá] pra)\b|\?\s*$/i],
];

export function classifyPrompt(prompt: string, media?: "image" | "video"): VcaPromptCategory {
  if (media) return media;
  const text = prompt.slice(0, 4000);
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "other";
}

export function promptSizeBucket(chars: number): "xs" | "s" | "m" | "l" | "xl" {
  if (chars < 200) return "xs";
  if (chars < 1_000) return "s";
  if (chars < 5_000) return "m";
  if (chars < 20_000) return "l";
  return "xl";
}

// ───────────────────────────── Redação (só para o caminho opt-in de texto cru) ─────────────────────────────

const REDACT: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[chave-privada]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[jwt]"],
  [/\b(sk|pk|rk)[-_](live|test|or|proj)?[-_]?[A-Za-z0-9_-]{16,}\b/g, "[chave]"],
  [/\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[chave]"],
  [/\b(vdl|vcrm|vfk1)_[A-Za-z0-9_-]{12,}\b/g, "[chave]"],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [token]"],
  [/\b(pass(word|wd)?|senha|secret|token|api[_-]?key|apikey)\b(\s*[:=]\s*)["']?[^\s"',;]{4,}/gi, "$1$3[segredo]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[numero]"],
  [/(\+\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g, "[telefone]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/\b[A-Fa-f0-9]{40,}\b/g, "[hash]"],
  [/\b[A-Za-z0-9+/_-]{48,}={0,2}/g, "[opaco]"],
];

export function redactText(text: string, max = 1500): string {
  let out = text;
  for (const [re, rep] of REDACT) out = out.replace(re, rep);
  return out.slice(0, max);
}

// ───────────────────────────── Hash ─────────────────────────────

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mesmo hash do vertal-collect.js (identify): o apagamento por titular acha os dois lados. */
export const subjectHash = (userId: string) => sha256Hex(`vertal-code-ai:user:${userId}`);
export const runRef = async (runId: string) => (await sha256Hex(`vertal-code-ai:run:${runId}`)).slice(0, 16);

// ───────────────────────────── Envio em lote ─────────────────────────────

export interface VcaDlRecord {
  kind: "event" | "other";
  event_id: string;
  collected_at: string;
  metadata: Record<string, unknown>;
}

export interface VcaDlDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
  warn?: (msg: string) => void;
}

interface Pending {
  subject: string;
  kinds: Array<"event" | "other">;
  records: VcaDlRecord[];
}

export const VCA_DL_MAX_QUEUE = 500;

/** Fila por isolate. enqueue nunca lança; flush nunca lança e não espera mais que timeoutMs por lote. */
export class VcaDataLibrarySender {
  private queue: Pending[] = [];
  private size = 0;
  dropped = 0;

  constructor(private readonly cfg: VcaDlConfig, private readonly deps: VcaDlDeps) {}

  enqueue(subject: string, raw: boolean, record: VcaDlRecord): void {
    try {
      if (record.kind === "other" && !raw) return; // nunca: texto cru sem a finalidade explícita
      if (this.size >= VCA_DL_MAX_QUEUE) {
        this.dropped += 1;
        return;
      }
      const kinds: Array<"event" | "other"> = raw ? ["event", "other"] : ["event"];
      let slot = this.queue.find((p) => p.subject === subject && p.kinds.length === kinds.length && p.records.length < this.cfg.batchSize);
      if (!slot) {
        slot = { subject, kinds, records: [] };
        this.queue.push(slot);
      }
      slot.records.push(record);
      this.size += 1;
    } catch {
      /* nunca atrapalha o pedido */
    }
  }

  get pending(): number {
    return this.size;
  }

  /** Envia tudo o que está na fila. Falha = descarta (é telemetria, não dado do usuário). */
  async flush(): Promise<{ sent: number; failed: number }> {
    const batches = this.queue;
    this.queue = [];
    this.size = 0;
    let sent = 0;
    let failed = 0;
    await Promise.all(
      batches.map(async (b) => {
        try {
          const r = await this.deps.fetch(`${this.cfg.endpoint}/api/collect/vertal-code-ai/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Vertal-Ingest-Key": this.cfg.key },
            signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(this.cfg.timeoutMs) : undefined,
            body: JSON.stringify({
              consent: { state: "granted", policy_version: this.cfg.policy, kinds: b.kinds },
              subject_hash: b.subject,
              records: b.records,
            }),
          });
          await r.body?.cancel().catch(() => {});
          if (r.ok) sent += b.records.length;
          else failed += b.records.length;
        } catch {
          failed += b.records.length;
        }
      }),
    );
    if (failed) this.deps.warn?.(`[vertal-code-ai] data-library: ${failed} registro(s) não enviados`);
    return { sent, failed };
  }
}

// ───────────────────────────── Rastreio de um pedido ─────────────────────────────

export type VcaDlTier = "self_hosted" | "free" | "paid" | "none";

export interface VcaModelUsage {
  label: string;
  cost: string;
  fellBack: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
}

export interface VcaRunInfo {
  mode: "plan" | "build";
  option: string;
  effort: string;
  modelPinned: boolean;
  prompt: string;
  images: number;
  attachments: number;
  historyTurns: number;
  surface?: string;
}

const TEXT_OPTIONS = ["auto", "code", "livre", "turbo", "pro"];
const SURFACES = ["vertal_code_ai", "vibe_code", "vertal_chat"];
const tierOf = (cost: string): VcaDlTier => (cost === "self_hosted" || cost === "free" || cost === "paid" ? cost : "none");
const publicLabel = (l: string | null | undefined) => (l && /^(Vertal|VERTAL)\b/.test(l) ? l.slice(0, 60) : null);
const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export interface VcaRunTrackerDeps {
  sender: VcaDataLibrarySender;
  /** Decisão de consentimento (consulta em paralelo; o pedido não espera). */
  consent: Promise<VcaConsentDecision>;
  userId: string;
  runId: string;
  now?: () => number;
  /** Agenda o envio sem segurar a resposta (EdgeRuntime.waitUntil). */
  defer?: (p: Promise<unknown>) => void;
}

/** Rastreia um pedido de texto: run.started no início, run.finished no fim (+ run.content se permitido). */
export class VcaRunTracker {
  private readonly t0: number;
  private calls = 0;
  private tokensIn = 0;
  private tokensOut = 0;
  private costUsd = 0;
  private ownModel = false;
  private fellBack = false;
  private last: VcaModelUsage | null = null;
  private readonly category: VcaPromptCategory;
  private done = false;

  constructor(private readonly info: VcaRunInfo, private readonly deps: VcaRunTrackerDeps) {
    this.t0 = (deps.now ?? Date.now)();
    this.category = classifyPrompt(info.prompt);
  }

  private common(ref: string, source: VcaDlConsentSource) {
    return {
      schema: "vca.usage.v1",
      run_ref: ref,
      consent_source: source,
      ...(SURFACES.includes(this.info.surface ?? "") ? { surface: this.info.surface } : {}),
    };
  }

  private option() {
    return TEXT_OPTIONS.includes(this.info.option) ? this.info.option : "auto";
  }

  /** Chamado uma vez, logo que o pedido começa. Não espera nada. */
  started(): void {
    this.queue(async (ref, d) => [{
      kind: "event",
      event_id: `vca:${ref}:started`,
      collected_at: new Date(this.t0).toISOString(),
      metadata: {
        ...this.common(ref, d.source!),
        event: "run.started",
        mode: this.info.mode,
        option: this.option(),
        effort: ["auto", "low", "high", "max"].includes(this.info.effort) ? this.info.effort : "auto",
        model_pinned: this.info.modelPinned,
        prompt_category: this.category,
        prompt_size: promptSizeBucket(this.info.prompt.length),
        est_input_tokens: Math.ceil(this.info.prompt.length / 3.5),
        images: Math.min(4, this.info.images),
        attachments: Math.min(10, this.info.attachments),
        history_turns: Math.min(8, this.info.historyTurns),
      },
    }], false);
  }

  /** Cada resposta de modelo (envolve o callModel; nunca lança). */
  modelCall(reply: VcaModelUsage | null | undefined): void {
    try {
      if (!reply) return;
      this.calls += 1;
      this.last = reply;
      if (reply.cost === "self_hosted") this.ownModel = true;
      if (reply.fellBack) this.fellBack = true;
      this.tokensIn += int(reply.usage?.inputTokens);
      this.tokensOut += int(reply.usage?.outputTokens);
      const c = reply.usage?.costUsd;
      if (typeof c === "number" && Number.isFinite(c) && c > 0) this.costUsd += c;
    } catch {
      /* nunca atrapalha */
    }
  }

  /** Fim do pedido (sucesso ou erro). Envia e agenda o flush. */
  finished(r: { ok: boolean; errorCode?: "all_models_failed" | "deadline" | "internal" | null; filesChanged?: number; verified?: boolean | null; codeExcerpt?: string | null }): void {
    if (this.done) return;
    this.done = true;
    const latency = Math.max(0, (this.deps.now ?? Date.now)() - this.t0);
    this.queue(async (ref, d) => {
      const records: VcaDlRecord[] = [{
        kind: "event",
        event_id: `vca:${ref}:finished`,
        collected_at: new Date().toISOString(),
        metadata: {
          ...this.common(ref, d.source!),
          event: "run.finished",
          mode: this.info.mode,
          option: this.option(),
          prompt_category: this.category,
          outcome: r.ok ? "success" : "error",
          error_code: r.ok ? null : (r.errorCode ?? "internal"),
          latency_ms: Math.min(3_600_000, latency),
          model_calls: Math.min(200, this.calls),
          model_tier: this.last ? tierOf(this.last.cost) : "none",
          model_label: publicLabel(this.last?.label),
          own_model: this.ownModel,
          fell_back: this.fellBack,
          tokens_in: this.tokensIn,
          tokens_out: this.tokensOut,
          cost_usd: Math.round(this.costUsd * 1e6) / 1e6,
          files_changed: Math.min(500, r.filesChanged ?? 0),
          verified: r.ok ? (r.verified ?? null) : null,
        },
      }];
      if (d.rawContent) {
        records.push({
          kind: "other",
          event_id: `vca:${ref}:content`,
          collected_at: new Date().toISOString(),
          metadata: {
            ...this.common(ref, d.source!),
            event: "run.content",
            opt_in: true,
            prompt_excerpt: redactText(this.info.prompt),
            code_excerpt: r.codeExcerpt ? redactText(r.codeExcerpt) : null,
            prompt_sha256: await sha256Hex(this.info.prompt),
          },
        });
      }
      return records;
    }, true);
  }

  private queue(build: (ref: string, d: VcaConsentDecision) => Promise<VcaDlRecord[]>, flush: boolean): void {
    const job = (async () => {
      try {
        const d = await this.deps.consent;
        if (!d.send || !d.source) return;
        const [subject, ref] = await Promise.all([subjectHash(this.deps.userId), runRef(this.deps.runId)]);
        for (const rec of await build(ref, d)) this.deps.sender.enqueue(subject, d.rawContent, rec);
        if (flush) await this.deps.sender.flush();
      } catch {
        /* telemetria nunca derruba nada */
      }
    })();
    try {
      this.deps.defer?.(job);
    } catch {
      /* sem waitUntil: a promessa segue sozinha */
    }
  }
}

/** Evento de mídia (imagem/vídeo) — um só registro, enviado na hora. */
export function trackMedia(
  deps: Omit<VcaRunTrackerDeps, "now">,
  m: {
    mediaType: "image" | "video";
    ok: boolean;
    latencyMs: number;
    cost: string | null;
    label: string | null;
    fellBack: boolean;
    costUsd: number | null;
    referenceImages: number;
    outputs: number;
    videoSeconds: number | null;
    surface?: string;
  },
): void {
  const job = (async () => {
    try {
      const d = await deps.consent;
      if (!d.send || !d.source) return;
      const [subject, ref] = await Promise.all([subjectHash(deps.userId), runRef(deps.runId)]);
      deps.sender.enqueue(subject, false, {
        kind: "event",
        event_id: `vca:${ref}:media`,
        collected_at: new Date().toISOString(),
        metadata: {
          schema: "vca.usage.v1",
          run_ref: ref,
          consent_source: d.source,
          ...(SURFACES.includes(m.surface ?? "") ? { surface: m.surface } : {}),
          event: "media.finished",
          media_type: m.mediaType,
          outcome: m.ok ? "success" : "error",
          latency_ms: Math.min(3_600_000, Math.max(0, Math.round(m.latencyMs))),
          model_tier: m.cost ? tierOf(m.cost) : "none",
          model_label: publicLabel(m.label),
          own_model: m.cost === "self_hosted",
          fell_back: m.fellBack,
          cost_usd: Math.round(Math.max(0, m.costUsd ?? 0) * 1e6) / 1e6,
          reference_images: Math.min(4, m.referenceImages),
          outputs: Math.min(8, m.outputs),
          video_seconds: m.videoSeconds === null ? null : Math.min(600, Math.round(m.videoSeconds)),
          prompt_category: m.mediaType,
        },
      });
      await deps.sender.flush();
    } catch {
      /* nunca */
    }
  })();
  try {
    deps.defer?.(job);
  } catch {
    /* ok */
  }
}
