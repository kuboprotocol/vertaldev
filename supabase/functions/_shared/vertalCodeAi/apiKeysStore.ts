// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// Criação de chave da VERTAL AI API num lugar só: usada pelo /keys (vertal-ai-api → manageKeys "create")
// e pelo conector Vertal AI (chave escopada ao projeto). Mesmas regras: limite de 10 chaves ativas,
// parseNewKey, só o hash no banco, a chave inteira devolvida UMA vez. Nunca loga a chave.
import { aiKeyPrefix, generateAiKey, hashAiKey, parseNewKey, type NewKeyInput } from "./apiKeys.ts";

export const AI_KEY_COLS = "id, name, key_prefix, monthly_cap_credits, rpm, spent_micro, spent_period, created_at, last_used_at, expires_at, revoked_at";
export const MAX_ACTIVE_AI_KEYS = 10;

export type CreateAiKeyResult =
  | { ok: true; key: string; record: Record<string, unknown> & { id: string } }
  | { ok: false; status: 400 | 500; error: string };

export async function createAiKeyRecord(
  admin: any,
  userId: string,
  input: NewKeyInput,
  defaults: { monthlyCapCredits: number; rpm: number },
  extra: { features?: Record<string, unknown> } = {},
): Promise<CreateAiKeyResult> {
  const { count } = await admin.from("vertal_ai_api_keys").select("id", { count: "exact", head: true }).eq("owner_id", userId).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_AI_KEYS) return { ok: false, status: 400, error: "Limite de 10 chaves ativas." };
  let fields;
  try {
    fields = parseNewKey(input, defaults);
  } catch (e) {
    return { ok: false, status: 400, error: e instanceof Error ? e.message : "Dados inválidos." };
  }
  const key = generateAiKey();
  const { data, error } = await admin
    .from("vertal_ai_api_keys")
    .insert({ owner_id: userId, ...fields, key_hash: await hashAiKey(key), key_prefix: aiKeyPrefix(key), ...(extra.features ? { features: extra.features } : {}) })
    .select(AI_KEY_COLS)
    .single();
  if (error || !data) return { ok: false, status: 500, error: "Não consegui criar a chave." };
  return { ok: true, key, record: data };
}
