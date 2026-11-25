// Regras do vídeo premiado (GAM rewarded) e do Vertal Node (SDKs de compartilhamento de banda:
// Honeygain, Cash Raven e outros provedores).
//
// Sem imports: o mesmo arquivo roda no Deno (funções `rewarded-video-claim` e
// `vertal-node-heartbeat`) e no vitest (src/test/rewards-core.test.ts).
//
// O que é decidido aqui é só leitura/validação. A parte que precisa ser atômica
// (marcar o nonce como usado, conferir cooldown e limite diário, creditar) roda
// no Postgres: public.claim_rewarded_video e public.record_vertal_node_heartbeat.

export const REWARDS_TZ = "America/Sao_Paulo";

export interface RewardedVideoConfig {
  amount: number;
  cooldownSeconds: number;
  dailyCap: number;
  nonceTtlSeconds: number;
}

/** Provedores de SDK de banda conhecidos. pawns/bright/infatica/earnfm aguardam aprovação dos parceiros. */
export const NODE_PROVIDERS = ["honeygain", "cashraven", "pawns", "bright", "infatica", "earnfm"] as const;
export type NodeProvider = (typeof NODE_PROVIDERS)[number];
/** Ligados por padrão (os outros só com VERTAL_NODE_PROVIDERS, depois do acordo com o parceiro). */
export const DEFAULT_ENABLED_NODE_PROVIDERS: readonly NodeProvider[] = ["honeygain", "cashraven"];
/** Heartbeat sem `provider` (apps antigos) = Honeygain. */
export const LEGACY_NODE_PROVIDER: NodeProvider = "honeygain";

export interface NodeConfig {
  /** Créditos por dia ativo (0 desliga o crédito). */
  dailyAmount: number;
  /** false (padrão): 1 crédito/dia por usuário, não importa quantos provedores. true: 1/dia por provedor. */
  creditPerProvider: boolean;
  /** Provedores aceitos pelo servidor. */
  enabledProviders: NodeProvider[];
}

/** @deprecated use NodeConfig */
export type HoneygainConfig = Pick<NodeConfig, "dailyAmount">;

type Env = (name: string) => string | undefined;

function intFromEnv(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

export function rewardedVideoConfig(env: Env): RewardedVideoConfig {
  return {
    // edits_limit é inteiro: o crédito é sempre um número inteiro de créditos.
    amount: intFromEnv(env, "REWARDED_VIDEO_CREDITS", 1, 1, 100),
    cooldownSeconds: intFromEnv(env, "REWARDED_VIDEO_COOLDOWN_SECONDS", 60, 0, 86_400),
    dailyCap: intFromEnv(env, "REWARDED_VIDEO_DAILY_CAP", 10, 1, 1_000),
    nonceTtlSeconds: intFromEnv(env, "REWARDED_VIDEO_NONCE_TTL_SECONDS", 30 * 60, 60, 24 * 3600),
  };
}

export function isNodeProvider(value: unknown): value is NodeProvider {
  return typeof value === "string" && (NODE_PROVIDERS as readonly string[]).includes(value);
}

function boolFromEnv(env: Env, name: string, fallback: boolean): boolean {
  const raw = env(name)?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export function nodeConfig(env: Env): NodeConfig {
  // VERTAL_NODE_DAILY_CREDITS; HONEYGAIN_NODE_DAILY_CREDITS continua valendo como nome antigo.
  const legacy = intFromEnv(env, "HONEYGAIN_NODE_DAILY_CREDITS", 2, 0, 100);
  const listed = (env("VERTAL_NODE_PROVIDERS") ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(isNodeProvider);
  return {
    // 0 desliga o crédito (o heartbeat continua registrando o dispositivo).
    dailyAmount: intFromEnv(env, "VERTAL_NODE_DAILY_CREDITS", legacy, 0, 100),
    creditPerProvider: boolFromEnv(env, "VERTAL_NODE_CREDIT_PER_PROVIDER", false),
    enabledProviders: listed.length > 0 ? Array.from(new Set(listed)) : [...DEFAULT_ENABLED_NODE_PROVIDERS],
  };
}

/** @deprecated use nodeConfig */
export function honeygainConfig(env: Env): HoneygainConfig {
  return { dailyAmount: nodeConfig(env).dailyAmount };
}

/**
 * Chave de idempotência do crédito diário (espelha public.record_vertal_node_heartbeat).
 * Mesma chave para todos os provedores = vários SDKs não multiplicam o crédito.
 */
export function nodeRewardKey(day: string, provider: NodeProvider, perProvider: boolean): string {
  return perProvider ? `vertal_node:${provider}:${day}` : `vertal_node:${day}`;
}

/** Dia civil (YYYY-MM-DD) em America/Sao_Paulo para um instante. */
export function rewardDay(nowMs: number, tz: string = REWARDS_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Nonce de uso único: 32 bytes aleatórios em hex (64 caracteres). */
export function newNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidNonce(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export interface ClaimedSession {
  claimed_at: string;
  reward_day: string | null;
}

export interface RewardedVideoStatus {
  amount: number;
  daily_cap: number;
  cooldown_seconds: number;
  claimed_today: number;
  remaining_today: number;
  next_available_at: string | null;
  can_watch: boolean;
  /** Motivo quando can_watch = false. */
  reason: "daily_cap_reached" | "cooldown" | null;
  day: string;
}

export function rewardedVideoStatus(
  claimed: ClaimedSession[],
  nowMs: number,
  cfg: RewardedVideoConfig,
): RewardedVideoStatus {
  const day = rewardDay(nowMs);
  let claimedToday = 0;
  let lastMs: number | null = null;
  for (const s of claimed) {
    const at = Date.parse(s.claimed_at);
    if (!Number.isFinite(at)) continue;
    const sDay = s.reward_day ?? rewardDay(at);
    if (sDay === day) claimedToday += 1;
    if (lastMs === null || at > lastMs) lastMs = at;
  }

  const remaining = Math.max(0, cfg.dailyCap - claimedToday);
  const cooldownEnds = lastMs === null ? null : lastMs + cfg.cooldownSeconds * 1000;
  const inCooldown = cooldownEnds !== null && cooldownEnds > nowMs;

  let reason: RewardedVideoStatus["reason"] = null;
  if (remaining === 0) reason = "daily_cap_reached";
  else if (inCooldown) reason = "cooldown";

  return {
    amount: cfg.amount,
    daily_cap: cfg.dailyCap,
    cooldown_seconds: cfg.cooldownSeconds,
    claimed_today: claimedToday,
    remaining_today: remaining,
    next_available_at: remaining > 0 && inCooldown ? new Date(cooldownEnds!).toISOString() : null,
    can_watch: reason === null,
    reason,
    day,
  };
}

export interface HeartbeatInput {
  device_id: string;
  platform: "desktop" | "android";
  provider: NodeProvider;
  app_version: string | null;
  opted_in: boolean;
  running: boolean;
}

/**
 * Valida o corpo do heartbeat. Retorna a mensagem de erro em `error` quando inválido.
 * `provider` ausente = Honeygain (apps antigos). Provedor conhecido mas fora de `enabledProviders`
 * -> `provider_disabled`.
 */
export function parseHeartbeat(
  body: unknown,
  enabledProviders: readonly NodeProvider[] = DEFAULT_ENABLED_NODE_PROVIDERS,
): { ok: true; value: HeartbeatInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const deviceId = b.device_id;
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(deviceId)) {
    return { ok: false, error: "invalid_device_id" };
  }
  if (b.platform !== "desktop" && b.platform !== "android") {
    return { ok: false, error: "invalid_platform" };
  }
  const provider = b.provider === undefined || b.provider === null ? LEGACY_NODE_PROVIDER : b.provider;
  if (!isNodeProvider(provider)) {
    return { ok: false, error: "invalid_provider" };
  }
  if (!enabledProviders.includes(provider)) {
    return { ok: false, error: "provider_disabled" };
  }
  if (typeof b.opted_in !== "boolean" || typeof b.running !== "boolean") {
    return { ok: false, error: "invalid_state" };
  }
  let appVersion: string | null = null;
  if (b.app_version !== undefined && b.app_version !== null) {
    if (typeof b.app_version !== "string" || b.app_version.length > 40) {
      return { ok: false, error: "invalid_app_version" };
    }
    appVersion = b.app_version;
  }
  return {
    ok: true,
    value: {
      device_id: deviceId,
      platform: b.platform,
      provider,
      app_version: appVersion,
      opted_in: b.opted_in,
      running: b.running,
    },
  };
}

/** Soma dos créditos de um ledger (reward_events) por fonte. */
export function sumCredits(rows: { credits: number }[]): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(Number(r.credits)) ? Number(r.credits) : 0), 0);
}
