// Camada de servidor do cofre de segredos: auditoria, leitura de segredos visíveis
// e resolução de variáveis para uma execução. Usa service role; quem chama já
// precisa ter autenticado o usuário.
//
// Regra central: um valor só sai do banco em decryptSecret, e só para (a) o dono
// ou um convidado com can_reveal, no fluxo de revelação, ou (b) a injeção feita
// pelo orquestrador dentro do servidor. Nunca vai parar em log ou em auditoria.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "./connectorCrypto.ts";
import { planReadiness, type PlanEntry, type VisibleSecret } from "./kuboSecretsCore.ts";

export const SECRET_COLUMNS =
  "id,owner_id,name,env_key,group_name,description,bound_to,masked_hint,created_at,updated_at,rotated_at,last_used_at";

export type AuditAction = "create" | "rotate" | "update" | "delete" | "reveal" | "grant" | "revoke" | "inject";

export interface AuditInput {
  secretId: string | null;
  ownerId: string | null;
  actorId: string;
  action: AuditAction;
  envKey?: string | null;
  meta?: Record<string, unknown>;
}

/** Grava uma linha de auditoria. Falha aqui não derruba a operação, mas é registrada. */
export async function audit(admin: SupabaseClient, entry: AuditInput): Promise<void> {
  const { error } = await admin.from("kubo_secret_audit").insert({
    secret_id: entry.secretId,
    owner_id: entry.ownerId,
    actor_id: entry.actorId,
    action: entry.action,
    env_key: entry.envKey ?? null,
    meta: entry.meta ?? {},
  });
  if (error) console.error("[kubo-secrets] audit insert failed:", error.message);
}

export interface SecretRowRecord {
  id: string;
  owner_id: string;
  env_key: string;
  rotated_at: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Segredos que o usuário pode usar: os dele e os que lhe foram concedidos.
 * Devolve só metadados e a relação (role), nunca o ciphertext.
 */
export async function listVisibleSecrets(
  admin: SupabaseClient,
  userId: string,
): Promise<VisibleSecret[]> {
  const { data: owned, error: ownedErr } = await admin
    .from("kubo_secrets")
    .select("id,owner_id,env_key,rotated_at")
    .eq("owner_id", userId);
  if (ownedErr) throw new Error(ownedErr.message);

  const { data: grants, error: grantErr } = await admin
    .from("kubo_secret_grants")
    .select("secret_id")
    .eq("grantee_id", userId);
  if (grantErr) throw new Error(grantErr.message);

  const grantedIds = (grants ?? []).map((g) => g.secret_id as string);
  let granted: Array<{ id: string; owner_id: string; env_key: string; rotated_at: string | null }> = [];
  if (grantedIds.length > 0) {
    const { data, error } = await admin
      .from("kubo_secrets")
      .select("id,owner_id,env_key,rotated_at")
      .in("id", grantedIds);
    if (error) throw new Error(error.message);
    granted = data ?? [];
  }

  const ownedRows: VisibleSecret[] = (owned ?? []).map((s) => ({
    id: s.id as string,
    owner_id: s.owner_id as string,
    env_key: s.env_key as string,
    rotated_at: (s.rotated_at as string | null) ?? null,
    role: "owner",
  }));
  const grantedRows: VisibleSecret[] = granted.map((s) => ({
    id: s.id,
    owner_id: s.owner_id,
    env_key: s.env_key,
    rotated_at: s.rotated_at,
    role: "grant",
  }));
  return [...ownedRows, ...grantedRows];
}

export interface ResolvedEnv {
  env: Record<string, string>;
  plan: PlanEntry[];
  missing: string[];
}

/**
 * Monta o mapa de variáveis para uma execução, no servidor.
 * Só inclui as chaves que o usuário tem direito de usar. As que faltam voltam em `missing`.
 * Cada injeção é auditada (variáveis e destino, sem valores).
 */
export async function resolveEnvForRun(
  admin: SupabaseClient,
  userId: string,
  requiredKeys: string[],
  context: { runId?: string; target?: string } = {},
  now: Date = new Date(),
): Promise<ResolvedEnv> {
  const visible = await listVisibleSecrets(admin, userId);
  const plan = planReadiness(requiredKeys, visible, now);
  const env: Record<string, string> = {};
  const missing: string[] = [];

  const readyIds = plan.filter((p) => p.status === "ready" && p.secret_id).map((p) => p.secret_id as string);
  let rows: SecretRowRecord[] = [];
  if (readyIds.length > 0) {
    const { data, error } = await admin
      .from("kubo_secrets")
      .select("id,owner_id,env_key,rotated_at,ciphertext,iv,tag")
      .in("id", readyIds);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as SecretRowRecord[];
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  const injected: Array<{ row: SecretRowRecord; envKey: string }> = [];
  for (const entry of plan) {
    if (entry.status !== "ready" || !entry.secret_id) {
      missing.push(entry.env_key);
      continue;
    }
    const row = byId.get(entry.secret_id);
    if (!row) {
      missing.push(entry.env_key);
      continue;
    }
    env[entry.env_key] = await decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
    injected.push({ row, envKey: entry.env_key });
  }

  if (injected.length > 0) {
    await admin
      .from("kubo_secrets")
      .update({ last_used_at: now.toISOString() })
      .in("id", injected.map((i) => i.row.id));
    // Uma linha por segredo, com o dono: o dono vê na própria auditoria quem usou o segredo dele.
    for (const { row, envKey } of injected) {
      await audit(admin, {
        secretId: row.id,
        ownerId: row.owner_id,
        actorId: userId,
        action: "inject",
        envKey,
        meta: { run_id: context.runId ?? null, target: context.target ?? null },
      });
    }
  }

  return { env, plan, missing };
}
