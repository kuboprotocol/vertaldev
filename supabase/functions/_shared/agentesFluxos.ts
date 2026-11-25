// Vertal Agentes ↔ Vertal Fluxos: um sistema só, por usuário.
//
// Módulo puro (sem Deno/DOM), usado pelo creative-router e testado no Vitest.
//
// 1. Agentes → apps do Fluxos: um agente do Vertal Agentes (PostAgent) chama o
//    creative-router com o cabeçalho X-Vertal-Agent-Token (vat1_<usuário>_<HMAC>)
//    e roda uma ação/busca de um app que o PRÓPRIO usuário conectou no Vertal
//    Fluxos (fluxos_connections). O token é derivado de FLUXOS_BROKER_SECRET com
//    outro prefixo (separação de domínio da chave vfk1 do Fluxos) e só serve
//    para as ops desta ponte (status/describe/run): nada de Cofre, nada de token
//    de provedor. Cada execução cobra FLUXOS_ACTION_COST créditos (devolvidos se
//    falhar), igual ao Vertal Chat.
// 2. Fluxos → Agentes: o app "Vertal" do motor (chave vfk1) pede ao corretor as
//    ops agentes_list / agentes_events / agentes_event / agentes_run, que usam o
//    Vertal Agentes do mesmo usuário (segredos HUGINN_* do Cofre dele).
//
// Escopo: o usuário vem sempre do token/chave assinados; a conexão usada é a
// linha (user_id, app_key) de fluxos_connections. Nunca há id de usuário no corpo.

export const AGENT_TOKEN_HEADER = "X-Vertal-Agent-Token";
export const AGENT_TOKEN_PREFIX = "vat1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_RE = /^[a-z0-9-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token dos agentes do usuário: vat1_<userId>_<HMAC>. Trocar FLUXOS_BROKER_SECRET revoga todos. */
export async function makeAgentToken(userId: string, secret: string): Promise<string> {
  if (!UUID_RE.test(userId) || secret.length < 32) throw new Error("agent_token_config");
  return `${AGENT_TOKEN_PREFIX}_${userId.toLowerCase()}_${await hmac(secret, `${AGENT_TOKEN_PREFIX}:${userId.toLowerCase()}`)}`;
}

/** Devolve o id do usuário dono do token, ou null. */
export async function verifyAgentToken(token: unknown, secret: string | undefined): Promise<string | null> {
  if (typeof token !== "string" || !secret || secret.length < 32 || token.length > 200) return null;
  const m = /^vat1_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/i.exec(token.trim());
  if (!m || !UUID_RE.test(m[1])) return null;
  const uid = m[1].toLowerCase();
  return safeEqual(m[2], await hmac(secret, `${AGENT_TOKEN_PREFIX}:${uid}`)) ? uid : null;
}

// ─── Ops que um agente pode pedir (cabeçalho X-Vertal-Agent-Token) ─────────

export type AgentBridgeOp =
  | { op: "status" }
  | { op: "describe"; app: string }
  | { op: "run"; app: string; kind: "action" | "trigger"; key: string; parameters: Record<string, unknown> };

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Parâmetros: objeto JSON até 20 mil caracteres. Texto JSON também vale (o PostAgent manda strings). */
export function bridgeParams(v: unknown): Record<string, unknown> | null {
  let x = v;
  if (x === undefined || x === null || x === "") return {};
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const text = JSON.stringify(x);
  return text.length <= 20_000 ? (x as Record<string, unknown>) : null;
}

export function parseAgentBridgeOp(raw: unknown): AgentBridgeOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const app = str(a.app, 70).replace(/^fluxos-/, "");
  if (a.op === "status") return { op: "status" };
  if (!APP_RE.test(app)) return null;
  if (a.op === "describe") return { op: "describe", app };
  if (a.op === "run") {
    const kind = a.kind === "trigger" || a.kind === "search" ? "trigger" : "action";
    const key = str(a.key ?? a.action ?? a.search, 80);
    const parameters = bridgeParams(a.parameters);
    if (!KEY_RE.test(key) || !parameters) return null;
    return { op: "run", app, kind, key, parameters };
  }
  return null;
}

// ─── Agente do Vertal Agentes que usa um app do Vertal Fluxos ─────────────

export interface FluxosAgentSpec {
  app: string;
  appName?: string;
  kind: "action" | "trigger";
  key: string;
  keyName?: string;
  /** Pode ter Liquid ({{ campo }}) com dados do evento que chega ao agente. */
  parameters: Record<string, unknown>;
}

/** Nome padrão do agente criado (aparece no Vertal Agentes e no painel). */
export function fluxosAgentName(spec: FluxosAgentSpec): string {
  const app = spec.appName || spec.app;
  const what = spec.keyName || spec.key;
  return `Vertal Fluxos · ${app}: ${what}`.slice(0, 120);
}

/**
 * Opções do PostAgent que roda a ação/busca do Fluxos a cada evento recebido
 * (ou na agenda). A resposta (JSON) vira um evento do agente (`emit_events`,
 * `parse_body`), que alimenta outros agentes ou um fluxo. `no_merge: true`: só
 * o payload (com Liquid já interpolado) é enviado, nunca o evento inteiro.
 */
export function fluxosPostAgentOptions(input: { routerUrl: string; anonKey: string; token: string; spec: FluxosAgentSpec }): Record<string, unknown> {
  const { routerUrl, anonKey, token, spec } = input;
  return {
    post_url: routerUrl,
    expected_receive_period_in_days: 7,
    content_type: "json",
    method: "post",
    payload: {
      op: "run",
      app: spec.app,
      kind: spec.kind,
      key: spec.key,
      parameters: spec.parameters,
    },
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      [AGENT_TOKEN_HEADER]: token,
    },
    emit_events: true,
    parse_body: true,
    no_merge: true,
    output_mode: "clean",
  };
}

/** O agente parece ser um agente "Vertal Fluxos" (pelas opções cruas). */
export function isFluxosAgentOptions(options: unknown): boolean {
  if (!options || typeof options !== "object") return false;
  const o = options as Record<string, unknown>;
  const h = o.headers && typeof o.headers === "object" ? (o.headers as Record<string, unknown>) : {};
  return typeof o.post_url === "string" && Object.keys(h).some((k) => k.toLowerCase() === AGENT_TOKEN_HEADER.toLowerCase());
}

// ─── Ops do corretor (chave vfk1, chamadas pelo app "Vertal" do Fluxos) ───

export type AgentesBrokerOp =
  | { op: "agentes_list" }
  | { op: "agentes_events"; agent_id: number }
  | { op: "agentes_event"; agent_id: number; payload: Record<string, unknown> }
  | { op: "agentes_run"; agent_id: number };

const agentId = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
};

export function parseAgentesBrokerOp(raw: unknown): AgentesBrokerOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.op === "agentes_list") return { op: "agentes_list" };
  const id = agentId(a.agent_id ?? a.agentId);
  if (!id) return null;
  if (a.op === "agentes_events") return { op: "agentes_events", agent_id: id };
  if (a.op === "agentes_run") return { op: "agentes_run", agent_id: id };
  if (a.op === "agentes_event") {
    const payload = bridgeParams(a.payload);
    if (!payload || JSON.stringify(payload).length > 10_000) return null;
    return { op: "agentes_event", agent_id: id, payload };
  }
  return null;
}

export const isAgentesBrokerOp = (v: unknown): boolean =>
  typeof v === "string" && ["agentes_list", "agentes_events", "agentes_event", "agentes_run"].includes(v);
