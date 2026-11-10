// Recompensa por anúncio TERRA ADS (página /shortlinks).
//
// Regras (definidas pelo dono do produto em 2026-11-10):
// - cada clique no anúncio vale 0,0020 crédito;
// - um clique por hora, por usuário;
// - o saldo fica pendente e só pode ser retirado a partir de 5 créditos.
//
// Tudo é decidido no servidor. O saldo pendente é a soma das linhas de
// `ad_rewards` dos tipos abaixo: cliques somam, retiradas entram negativas.
// Sem imports: o mesmo arquivo roda no Deno (função `shortlinks`) e no vitest.

export const AD_REWARD_PER_CLICK = 0.002;
export const AD_CLICK_COOLDOWN_MS = 60 * 60 * 1000;
export const AD_MIN_WITHDRAW = 5;
export const AD_TYPE_CLICK = "terra_click";
export const AD_TYPE_WITHDRAWAL = "terra_withdrawal";

// Contas em inteiros (décimos de milésimo de crédito) para não somar erro de ponto flutuante.
const SCALE = 10000;
const toUnits = (credits: number) => Math.round(Number(credits) * SCALE);
const fromUnits = (units: number) => units / SCALE;

export interface AdRewardRow {
  ad_type: string;
  reward_credits: number;
  created_at: string;
}

export interface AdRewardStatus {
  reward_per_click: number;
  min_withdraw: number;
  cooldown_seconds: number;
  pending: number;
  clicks: number;
  withdrawals: number;
  last_click_at: string | null;
  next_click_at: string | null;
  can_click: boolean;
  /** Créditos inteiros que saem numa retirada agora (0 se abaixo do mínimo). */
  withdrawable: number;
  can_withdraw: boolean;
}

export function summarizeAdRewards(rows: AdRewardRow[], nowMs: number): AdRewardStatus {
  let pendingUnits = 0;
  let clicks = 0;
  let withdrawals = 0;
  let lastClickMs: number | null = null;

  for (const row of rows) {
    if (row.ad_type === AD_TYPE_CLICK) {
      clicks += 1;
      pendingUnits += toUnits(row.reward_credits);
      const at = Date.parse(row.created_at);
      if (Number.isFinite(at) && (lastClickMs === null || at > lastClickMs)) lastClickMs = at;
    } else if (row.ad_type === AD_TYPE_WITHDRAWAL) {
      withdrawals += 1;
      pendingUnits += toUnits(row.reward_credits);
    }
  }

  const pending = fromUnits(Math.max(0, pendingUnits));
  const nextClickMs = lastClickMs === null ? null : lastClickMs + AD_CLICK_COOLDOWN_MS;
  const canClick = nextClickMs === null || nowMs >= nextClickMs;
  const whole = Math.floor(pending);
  const withdrawable = whole >= AD_MIN_WITHDRAW ? whole : 0;

  return {
    reward_per_click: AD_REWARD_PER_CLICK,
    min_withdraw: AD_MIN_WITHDRAW,
    cooldown_seconds: AD_CLICK_COOLDOWN_MS / 1000,
    pending,
    clicks,
    withdrawals,
    last_click_at: lastClickMs === null ? null : new Date(lastClickMs).toISOString(),
    next_click_at: canClick || nextClickMs === null ? null : new Date(nextClickMs).toISOString(),
    can_click: canClick,
    withdrawable,
    can_withdraw: withdrawable > 0,
  };
}

/** UUID estável a partir de um texto: duas requisições iguais disputam a mesma chave primária. */
export async function deterministicUuid(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface AdRewardStore {
  listRows(userId: string): Promise<AdRewardRow[]>;
  /** "conflict" quando já existe uma linha com esse id. */
  insertRow(row: { id: string; user_id: string; reward_credits: number; ad_type: string }): Promise<"ok" | "conflict">;
  deleteRow(id: string): Promise<void>;
  /** Soma créditos inteiros ao saldo do usuário; repetir a mesma chave não soma de novo. */
  topup(userId: string, amount: number, idempotencyKey: string): Promise<void>;
}

export type AdRewardAction = "ad-status" | "ad-click" | "ad-withdraw";

export const AD_REWARD_ACTIONS: readonly string[] = ["ad-status", "ad-click", "ad-withdraw"];

export interface AdRewardResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleAdReward(
  action: AdRewardAction,
  userId: string,
  store: AdRewardStore,
  nowMs: number = Date.now(),
): Promise<AdRewardResult> {
  const before = summarizeAdRewards(await store.listRows(userId), nowMs);

  if (action === "ad-status") return { status: 200, body: { ...before } };

  if (action === "ad-click") {
    if (!before.can_click) {
      return { status: 429, body: { error: "cooldown", ...before } };
    }
    // O id depende do clique anterior: dois pedidos simultâneos geram o mesmo id e só um entra.
    const id = await deterministicUuid(`terra_click:${userId}:${before.last_click_at ?? "first"}`);
    const inserted = await store.insertRow({
      id,
      user_id: userId,
      reward_credits: AD_REWARD_PER_CLICK,
      ad_type: AD_TYPE_CLICK,
    });
    const after = summarizeAdRewards(await store.listRows(userId), nowMs);
    if (inserted === "conflict") return { status: 429, body: { error: "cooldown", ...after } };
    return { status: 200, body: { success: true, credits_earned: AD_REWARD_PER_CLICK, ...after } };
  }

  // ad-withdraw
  if (!before.can_withdraw) {
    return { status: 400, body: { error: "below_minimum", ...before } };
  }
  const amount = before.withdrawable;
  const seed = `terra_withdrawal:${userId}:${before.withdrawals}`;
  const id = await deterministicUuid(seed);
  const inserted = await store.insertRow({
    id,
    user_id: userId,
    reward_credits: -amount,
    ad_type: AD_TYPE_WITHDRAWAL,
  });
  if (inserted === "conflict") {
    const now = summarizeAdRewards(await store.listRows(userId), nowMs);
    return { status: 409, body: { error: "already_processing", ...now } };
  }
  try {
    await store.topup(userId, amount, `terra_ad_withdraw:${before.withdrawals}`);
  } catch (err) {
    // O crédito não entrou: devolve o saldo pendente.
    await store.deleteRow(id);
    throw err;
  }
  const after = summarizeAdRewards(await store.listRows(userId), nowMs);
  return { status: 200, body: { success: true, credits_withdrawn: amount, ...after } };
}
