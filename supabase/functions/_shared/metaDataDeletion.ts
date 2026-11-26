// App da Meta "Vertal Dev": "Remover app" (Deauthorize callback) e "Exclusão de dados"
// (Data deletion request callback). A Meta manda um POST com `signed_request`
// (assinatura HMAC-SHA256 com o App Secret) e o ID do usuário no app (`user_id`).
//
// O ID da Meta não fica no Supabase: o motor do Vertal Fluxos guarda no login de cada
// conexão (formattedData.userId = /me). A rota interna /connections/find devolve as
// conexões dos apps da Meta desse usuário; aqui elas são apagadas no motor e em
// fluxos_connections (o mesmo que "Desconectar"). O pedido fica em meta_data_requests
// (só o hash do ID) para a página pública https://vertal.dev/data-deletion?code=…
//
// Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
//       https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow#deauth-callback
import { type FluxosEngine, META_APPS } from "./fluxosApps.ts";

export const META_DELETION_STATUS_URL = "https://vertal.dev/data-deletion";
export const CONFIRMATION_CODE_RE = /^[A-Z2-7]{16}$/;

export interface MetaSignedPayload {
  algorithm: string;
  user_id: string;
  issued_at?: number;
  expires?: number;
  [k: string]: unknown;
}

function b64urlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Confere a assinatura do signed_request e devolve o conteúdo; null se inválido. */
export async function parseSignedRequest(signed: string, secret: string): Promise<MetaSignedPayload | null> {
  if (typeof signed !== "string" || !secret || signed.length > 8000) return null;
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedSig, encodedPayload] = parts;
  const sig = b64urlToBytes(encodedSig);
  const payloadBytes = b64urlToBytes(encodedPayload);
  if (!sig || !payloadBytes) return null;
  const expected = await hmacSha256(secret, encodedPayload);
  if (!sameBytes(sig, expected)) return null;
  let payload: MetaSignedPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (String(payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return null;
  const userId = payload.user_id === undefined || payload.user_id === null ? "" : String(payload.user_id);
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(userId)) return null;
  return { ...payload, user_id: userId };
}

/** Monta um signed_request (testes e checagem ao vivo). */
export async function makeSignedRequest(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encodedPayload = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${bytesToB64url(await hmacSha256(secret, encodedPayload))}.${encodedPayload}`;
}

/** Hash do ID da Meta (HMAC com o App Secret): nada de ID em texto no banco. */
export async function metaUserHash(userId: string, secret: string): Promise<string> {
  return Array.from(await hmacSha256(secret, `meta-user:${userId}`)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newConfirmationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => B32[b & 31]).join("");
}

export type MetaRequestKind = "deauthorize" | "data_deletion";
export type MetaRequestStatus = "received" | "completed" | "pending_review";

export interface MetaRequestRow {
  kind: MetaRequestKind;
  confirmation_code: string | null;
  meta_user_hash: string;
  status: MetaRequestStatus;
  removed_connections: number;
  created_at?: string;
  completed_at?: string | null;
}

export interface FluxosLinkRow { id: string; user_id: string; app_key: string }

/** Acesso ao banco (service role) — trocado por um falso nos testes. */
export interface MetaDeletionStore {
  rowsForEngineConnection(engineConnectionId: string): Promise<FluxosLinkRow[]>;
  deleteLinkRow(id: string): Promise<void>;
  logDisconnect(row: FluxosLinkRow, kind: MetaRequestKind): Promise<void>;
  insertRequest(row: MetaRequestRow): Promise<void>;
  getRequest(code: string): Promise<MetaRequestRow | null>;
}

export interface RemovalResult { removed: number; lookup: "ok" | "unavailable" }

/** Apaga as conexões dos apps da Meta desse usuário (motor + fluxos_connections). Nada mais. */
export async function removeMetaConnections(
  engine: FluxosEngine | null,
  store: MetaDeletionStore,
  metaUserId: string,
  kind: MetaRequestKind,
): Promise<RemovalResult> {
  if (!engine) return { removed: 0, lookup: "unavailable" };
  let found: Array<{ id: string; appKey: string }>;
  try {
    const r = await engine.call("POST", "/connections/find", { appKeys: [...META_APPS], userId: metaUserId });
    if (r.status !== 200 || !Array.isArray(r.data?.connections)) return { removed: 0, lookup: "unavailable" };
    found = (r.data.connections as Array<{ id?: unknown; appKey?: unknown }>)
      .filter((c) => typeof c?.id === "string" && /^[0-9a-f-]{36}$/i.test(c.id) && META_APPS.has(String(c.appKey)))
      .map((c) => ({ id: c.id as string, appKey: String(c.appKey) }));
  } catch {
    return { removed: 0, lookup: "unavailable" };
  }
  let removed = 0;
  for (const c of found) {
    const rows = await store.rowsForEngineConnection(c.id);
    const del = await engine.call("DELETE", `/connections/${c.id}`);
    if (del.status !== 200 && del.status !== 204) continue;
    removed++;
    for (const row of rows) {
      // Só a ligação dessa conexão (mesmo efeito de "Desconectar").
      if (!META_APPS.has(row.app_key)) continue;
      await store.deleteLinkRow(row.id);
      await store.logDisconnect(row, kind);
    }
  }
  return { removed, lookup: "ok" };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function readSignedRequest(req: Request): Promise<string> {
  const text = (await req.text()).slice(0, 10_000);
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const v = JSON.parse(text)?.signed_request;
      return typeof v === "string" ? v : "";
    } catch {
      return "";
    }
  }
  return new URLSearchParams(text).get("signed_request") ?? "";
}

export interface MetaDeletionDeps {
  env: (k: string) => string | undefined;
  engine: FluxosEngine | null;
  store: MetaDeletionStore;
  newCode?: () => string;
}

/**
 *   POST /meta-data-deletion              signed_request → {url, confirmation_code} (Exclusão de dados)
 *   POST /meta-data-deletion/deauthorize  signed_request → {ok} (Remover app / Deauthorize callback)
 *   GET  /meta-data-deletion?code=XXXX    → status para a página pública
 */
export async function handleMetaDeletion(req: Request, deps: MetaDeletionDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: PUBLIC_CORS });
  const url = new URL(req.url);
  const deauthorize = /\/deauthorize\/?$/.test(url.pathname) || url.searchParams.get("type") === "deauthorize";

  if (req.method === "GET") {
    const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
    if (!CONFIRMATION_CODE_RE.test(code)) return json({ error: "invalid_code" }, 400, PUBLIC_CORS);
    const row = await deps.store.getRequest(code);
    if (!row || row.kind !== "data_deletion") return json({ error: "not_found" }, 404, PUBLIC_CORS);
    return json({
      code,
      status: row.status,
      requested_at: row.created_at ?? null,
      completed_at: row.completed_at ?? null,
      removed_connections: row.removed_connections,
    }, 200, PUBLIC_CORS);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = deps.env("FLUXOS_OAUTH_META_SECRET");
  if (!secret) return json({ error: "not_configured" }, 503);
  const payload = await parseSignedRequest(await readSignedRequest(req), secret);
  if (!payload) return json({ error: "invalid_signed_request" }, 400);

  const kind: MetaRequestKind = deauthorize ? "deauthorize" : "data_deletion";
  const result = await removeMetaConnections(deps.engine, deps.store, payload.user_id, kind);
  const code = kind === "data_deletion" ? (deps.newCode ?? newConfirmationCode)() : null;
  const status: MetaRequestStatus = result.lookup === "ok" ? "completed" : "pending_review";
  await deps.store.insertRequest({
    kind,
    confirmation_code: code,
    meta_user_hash: await metaUserHash(payload.user_id, secret),
    status,
    removed_connections: result.removed,
    completed_at: status === "completed" ? new Date().toISOString() : null,
  });
  // Sem ID da Meta no log: só o tipo e o resultado.
  console.log(JSON.stringify({ event: "meta_" + kind, status, removed: result.removed }));

  if (kind === "deauthorize") return json({ ok: true });
  return json({ url: `${META_DELETION_STATUS_URL}?code=${code}`, confirmation_code: code });
}
