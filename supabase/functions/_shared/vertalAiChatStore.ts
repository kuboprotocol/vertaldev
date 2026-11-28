// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions */
// Conector Vertal AI no Vertal Chat e consciência de conectores: acesso a dados (só leitura).
// Flag desligada ou usuário fora da allowlist → null SEM tocar no banco (prompt e ações idênticos).
// Lê só NOMES e STATUS (Vertal AI, Cofre, Fluxos, MetaMask), nunca valores de segredos.
import { connectorAllowed, loadConnectorConfig } from "./vertalAiConnector.ts";
import { loadActiveConnector } from "./vertalAiConnectorStore.ts";
import {
  type DevConnectorsSnapshot,
  formatDevConnectorsBlock,
  type VertalAiChatContext,
  vertalAiChatDecision,
} from "./vertalAiChat.ts";

type Env = Record<string, string | undefined>;

export async function loadDevConnectorsSnapshot(
  admin: any,
  env: Env,
  userId: string,
  opts: { projectId?: string | null; secretNames?: string[]; catalog?: string[] } = {},
): Promise<DevConnectorsSnapshot | null> {
  const cfg = loadConnectorConfig(env);
  if (!connectorAllowed(cfg, userId)) return null;
  const [active, fluxos, wallet] = await Promise.all([
    loadActiveConnector(admin, cfg, userId, opts.projectId ?? null),
    admin.from("fluxos_connections").select("app_key").eq("user_id", userId).eq("status", "connected")
      .then((r: any) => ((r?.data ?? []) as Array<{ app_key: string }>).map((x) => String(x.app_key)), () => [] as string[]),
    admin.from("vertal_wallet_connections").select("chain_id").eq("user_id", userId).maybeSingle()
      .then((r: any) => r?.data ?? null, () => null),
  ]);
  let secretNames = opts.secretNames;
  if (!secretNames) {
    const { data } = await admin.from("kubo_secrets").select("env_key").eq("owner_id", userId).then((r: any) => r, () => ({ data: [] }));
    secretNames = ((data ?? []) as Array<{ env_key: string }>).map((x) => x.env_key);
  }
  return {
    vertalAi: { active: !!active, video: !!active?.video, scope: opts.projectId ? "projeto" : "default" },
    secretNames,
    fluxos,
    metamask: { connected: !!wallet, chainId: wallet?.chain_id ?? null },
    ...(opts.catalog?.length ? { catalog: opts.catalog } : {}),
  };
}

/** Vertal Chat: snapshot + decisão desta rodada + bloco do prompt. null = flag off (nada muda). */
export async function loadVertalAiChat(
  admin: any,
  env: Env,
  userId: string,
  input: { userTexts: string[]; assistantTexts: string[]; secretNames: string[]; firstRound?: boolean },
): Promise<{ ctx: VertalAiChatContext; block: string } | null> {
  const snap = await loadDevConnectorsSnapshot(admin, env, userId, { secretNames: input.secretNames });
  if (!snap) return null;
  const ctx = vertalAiChatDecision({ userTexts: input.userTexts, assistantTexts: input.assistantTexts, active: snap.vertalAi.active, firstRound: input.firstRound });
  return { ctx, block: formatDevConnectorsBlock(snap, "chat") };
}

/** Vibe Code: bloco de consciência de conectores. "" = flag off (prompt idêntico). */
export async function vertalAiAwarenessFor(admin: any, env: Env, userId: string, projectId: string | null, catalog: string[]): Promise<string> {
  const snap = await loadDevConnectorsSnapshot(admin, env, userId, { projectId, catalog });
  return snap ? `\n\n${formatDevConnectorsBlock(snap, "vibe")}` : "";
}
