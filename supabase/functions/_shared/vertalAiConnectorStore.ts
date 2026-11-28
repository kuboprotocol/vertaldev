// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// Conector Vertal AI — camada de servidor (Supabase + Cofre). A lógica de decisão mora em
// vertalAiConnector.ts (pura, testada no Vitest); aqui só o acesso a dados.
//
// Onde a chave fica: kubo_secrets (Cofre do dono), cifrada em AES-GCM com CONNECTOR_ENC_KEY,
// env_key VERTAL_AI_API_KEY_P<projeto>. Só o servidor decifra (proxy do projeto). Cada escrita,
// remoção e uso entra na auditoria do Cofre (kubo_secret_audit), sem valores.
import { decryptSecret, encryptSecret } from "./connectorCrypto.ts";
import { maskSecret } from "./kuboSecretsCore.ts";
import { audit } from "./kuboSecrets.ts";
import { createAiKeyRecord } from "./vertalCodeAi/apiKeysStore.ts";
import {
  type ActiveConnector,
  type ConnectorConfig,
  type ConnectorDeps,
  type ConnectorFeatures,
  type ConnectorKeyRow,
  connectorAllowed,
  connectorOf,
  connectorScope,
  detectAiNeeds,
  ensureProjectConnector,
  loadConnectorConfig,
  parseVertalAiRequest,
  resolveVertalAiState,
  type VertalAiState,
  generateConnectorRef,
  proxyUrlFor,
  VERTAL_AI_VAULT_GROUP,
  vaultNamesFor,
} from "./vertalAiConnector.ts";

const notExpired = (r: { expires_at?: string | null }) => !r.expires_at || Date.parse(r.expires_at) > Date.now();

export function makeConnectorDeps(admin: any, actorId: string): ConnectorDeps {
  return {
    async findActiveKeys(ownerId, scope) {
      const { data, error } = await admin
        .from("vertal_ai_api_keys")
        .select("id, created_at, expires_at, features")
        .eq("owner_id", ownerId)
        .is("revoked_at", null)
        .eq("features->connector->>project", scope);
      if (error) throw new Error("connector_lookup_failed");
      return ((data ?? []) as Array<ConnectorKeyRow & { expires_at: string | null }>).filter(notExpired);
    },
    async createKey(ownerId, input, features) {
      // Mesma criação do /keys (limite de 10, parseNewKey, hash). Chave inteira só neste retorno.
      const r = await createAiKeyRecord(admin, ownerId, { name: input.name, monthlyCapCredits: input.monthlyCapCredits, rpm: input.rpm }, { monthlyCapCredits: input.monthlyCapCredits, rpm: input.rpm }, { features: features as Record<string, unknown> });
      if (r.ok === false) throw new Error(r.error);
      return { id: r.record.id, key: r.key };
    },
    async revokeKey(ownerId, keyId) {
      await admin.from("vertal_ai_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId).eq("owner_id", ownerId).is("revoked_at", null);
    },
    async setFeatures(ownerId, keyId, features) {
      await admin.from("vertal_ai_api_keys").update({ features }).eq("id", keyId).eq("owner_id", ownerId);
    },
    async putSecret(ownerId, s) {
      const enc = await encryptSecret(s.value);
      const now = new Date().toISOString();
      const { data: prev } = await admin.from("kubo_secrets").select("id").eq("owner_id", ownerId).eq("env_key", s.envKey).maybeSingle();
      const row = {
        name: s.name.slice(0, 80),
        group_name: VERTAL_AI_VAULT_GROUP,
        description: s.description.slice(0, 300),
        bound_to: s.boundTo,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        tag: enc.tag,
        masked_hint: maskSecret(s.value),
        rotated_at: now,
        updated_at: now,
      };
      const res = prev?.id
        ? await admin.from("kubo_secrets").update(row).eq("id", prev.id).select("id").single()
        : await admin.from("kubo_secrets").insert({ owner_id: ownerId, env_key: s.envKey, ...row }).select("id").single();
      if (res.error || !res.data) throw new Error("vault_write_failed");
      await audit(admin, { secretId: res.data.id, ownerId, actorId, action: prev?.id ? "rotate" : "create", envKey: s.envKey, meta: { source: "vertal_ai_connector" } });
    },
    async hasSecret(ownerId, envKey) {
      const { data } = await admin.from("kubo_secrets").select("id").eq("owner_id", ownerId).eq("env_key", envKey).maybeSingle();
      return !!data?.id;
    },
    async deleteSecret(ownerId, envKey) {
      const { data } = await admin.from("kubo_secrets").delete().eq("owner_id", ownerId).eq("env_key", envKey).select("id");
      for (const r of data ?? []) await audit(admin, { secretId: r.id, ownerId, actorId, action: "delete", envKey, meta: { source: "vertal_ai_connector" } });
    },
    newRef: generateConnectorRef,
  };
}

/** Conector ativo do projeto (sem chave). Usado pelo vibe-code-agent para montar prompt e arquivos. */
export async function loadActiveConnector(admin: any, cfg: ConnectorConfig, ownerId: string, projectId: unknown): Promise<ActiveConnector | null> {
  const scope = connectorScope(projectId);
  try {
    const rows = await makeConnectorDeps(admin, ownerId).findActiveKeys(ownerId, scope);
    const row = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const c = row ? connectorOf(row.features) : null;
    if (!row || !c) return null;
    const { data: sec } = await admin.from("kubo_secrets").select("id").eq("owner_id", ownerId).eq("env_key", vaultNamesFor(scope).apiKey).maybeSingle();
    if (!sec?.id) return null;
    return { keyId: row.id, ref: c.ref, proxyUrl: proxyUrlFor(cfg.baseUrl, c.ref), video: (row.features as ConnectorFeatures)?.video === true };
  } catch {
    return null;
  }
}

export interface ProxyKey {
  keyId: string;
  ownerId: string;
  scope: string;
  key: string;
}

// Cache curto por isolate: evita decifrar e auditar a cada pedido do app (5 min).
const cache = new Map<string, { at: number; v: ProxyKey }>();
const CACHE_MS = 5 * 60_000;

/** Ref público → chave do projeto (decifrada só aqui, no servidor). Revogada/expirada/sem segredo → null. */
export async function resolveProxyKey(admin: any, ref: string): Promise<ProxyKey | null> {
  const hit = cache.get(ref);
  const { data: row } = await admin
    .from("vertal_ai_api_keys")
    .select("id, owner_id, revoked_at, expires_at, features")
    .eq("features->connector->>ref", ref)
    .is("revoked_at", null)
    .maybeSingle()
    .then((r: any) => r, () => ({ data: null }));
  const c = row ? connectorOf(row.features) : null;
  if (!row || !c || c.ref !== ref || !notExpired(row)) {
    cache.delete(ref);
    return null;
  }
  // A linha é relida sempre (revogação vale na hora); só o segredo decifrado fica em cache.
  if (hit && hit.v.keyId === row.id && Date.now() - hit.at < CACHE_MS) return hit.v;
  const envKey = vaultNamesFor(c.project).apiKey;
  const { data: sec } = await admin.from("kubo_secrets").select("id, owner_id, ciphertext, iv, tag").eq("owner_id", row.owner_id).eq("env_key", envKey).maybeSingle();
  if (!sec) return null;
  const key = await decryptSecret({ ciphertext: sec.ciphertext, iv: sec.iv, tag: sec.tag });
  await admin.from("kubo_secrets").update({ last_used_at: new Date().toISOString() }).eq("id", sec.id);
  await audit(admin, { secretId: sec.id, ownerId: row.owner_id, actorId: row.owner_id, action: "inject", envKey, meta: { target: "vertal_ai_proxy", run_id: null } });
  const v = { keyId: row.id, ownerId: row.owner_id, scope: c.project, key };
  cache.set(ref, { at: Date.now(), v });
  return v;
}

/**
 * Estado do conector para um pedido do Vibe Code. Flag desligada → {mode:"off"} SEM tocar no
 * banco (o motor segue byte a byte igual). Com body.vertalAi.enabled (o Dev aceitou no Vertal Chat
 * ou clicou no cartão), ativa de forma idempotente antes de montar o prompt.
 */
export async function vertalAiForRequest(
  admin: any,
  env: Record<string, string | undefined>,
  input: { userId: string; projectId: string | null; prompt: string; request: unknown },
): Promise<{ state: VertalAiState; created?: boolean; error?: string }> {
  const cfg = loadConnectorConfig(env);
  if (!connectorAllowed(cfg, input.userId)) return { state: { mode: "off" } };
  let active = await loadActiveConnector(admin, cfg, input.userId, input.projectId);
  let created: boolean | undefined;
  let error: string | undefined;
  const needs = detectAiNeeds(input.prompt);
  if (parseVertalAiRequest(input.request).enabled && (!active || (needs.video && !active.video))) {
    const r = await ensureProjectConnector(makeConnectorDeps(admin, input.userId), { cfg, ownerId: input.userId, projectId: input.projectId, needsVideo: needs.video });
    if (r.ok === false) error = r.message;
    else {
      created = r.created;
      active = { keyId: r.keyId, ref: r.ref, proxyUrl: r.proxyUrl, video: r.video };
    }
  }
  return { state: resolveVertalAiState({ cfg, userId: input.userId, prompt: input.prompt, active }), created, error };
}
