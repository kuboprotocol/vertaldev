// Ponte Huginn ↔ Automatisch no Vertal Chat.
//
// Módulo puro: usa o executor do Huginn (huginnCore) e o do Automatisch
// (automatischCore, já em produção) com fetch injetado. Executado pela edge
// function `creative-router` (tool "huginn", ops connect_*), testado no Vitest.
//
// O que é ligado de verdade (e nada além disso):
// - connect_to_automatisch: lê o fluxo no Automatisch, pega a URL do gatilho
//   Webhook (app "webhook" → "catchRawWebhook"; a URL é /webhooks/flows/:id ou
//   /webhooks/flows/:id/sync) e cria no Huginn um PostAgent que recebe os
//   eventos do agente de origem e faz POST JSON nessa URL (no_merge: false,
//   então o payload do evento vai inteiro). Com o fluxo em rascunho, o
//   Automatisch só registra o pedido como teste; publicado, roda as ações.
// - connect_from_automatisch: cria no Huginn um WebhookAgent (segredo
//   aleatório) ou reusa um existente, e configura o passo de ação do
//   Automatisch como HTTP Request → Custom request (POST JSON) para a URL dele.
//   O passo fica incompleto até ser testado (test_step) e o fluxo publicado.
// A URL do WebhookAgent leva o segredo: vai só para o Automatisch e volta ao
// chat mascarada.

import {
  type AutomatischCreds, type AutomatischFetch, type AutomatischOp, runAutomatischOp,
} from "./automatischCore.ts";
import {
  agentView, createAgent, type HuginnCreds, type HuginnFetch, huginnFailure, HuginnHttpError, looksLikeWebhookAgent, type HuginnOp,
  type HuginnResult, type HuginnSession, maskedWebhookUrl, openHuginnSession, randomHex, readAgentRaw,
  scrubSecrets, summarizeHuginnResult, webhookUrl,
} from "./huginnCore.ts";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

export type BridgeOp = Extract<HuginnOp, { op: "connect_to_automatisch" | "connect_from_automatisch" }>;

export interface BridgeDeps {
  huginnFetch: HuginnFetch;
  automatischFetch: AutomatischFetch;
}

/** A URL do gatilho Webhook precisa ser https e apontar para este fluxo. */
export function isFlowWebhookUrl(url: unknown, flowId: string): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password &&
      new RegExp(`^/webhooks/flows/${flowId}(/sync)?/?$`, "i").test(u.pathname);
  } catch {
    return false;
  }
}

/** Opções do PostAgent que repassa cada evento do Huginn para o webhook do Automatisch. */
export function postAgentOptions(url: string): Rec {
  return {
    post_url: url,
    expected_receive_period_in_days: 2,
    content_type: "json",
    method: "post",
    payload: { origem: "huginn" },
    headers: {},
    emit_events: true,
    no_merge: false,
    output_mode: "clean",
  };
}

/** Parâmetros do passo HTTP Request → Custom request do Automatisch. */
export function httpRequestParameters(url: string, data?: string): Rec {
  return {
    method: "POST",
    url,
    data: data && data.trim() ? data : JSON.stringify({ origem: "automatisch" }),
    headers: [{ key: "Content-Type", value: "application/json" }],
  };
}

async function automatisch(op: AutomatischOp, creds: AutomatischCreds, fetch: AutomatischFetch): Promise<Rec> {
  const r = await runAutomatischOp(op, creds, { fetch });
  if (!r.ok) throw new HuginnHttpError("automatisch_failed", r.status, r.message);
  return rec(r.data);
}

async function toAutomatisch(op: Extract<BridgeOp, { op: "connect_to_automatisch" }>, s: HuginnSession, acreds: AutomatischCreds, deps: BridgeDeps): Promise<Rec> {
  // Confere a origem antes de mexer em qualquer coisa.
  const source = await readAgentRaw(s, op.source_agent_id);
  const flow = rec((await automatisch({ op: "get_flow", flow_id: op.flow_id }, acreds, deps.automatischFetch)).flow);
  const steps = Array.isArray(flow.steps) ? flow.steps.map(rec) : [];
  const trigger = steps.find((st) => st.type === "trigger");
  const url = trigger?.webhookUrl;
  if (!trigger || trigger.appKey !== "webhook" || !isFlowWebhookUrl(url, op.flow_id)) throw new HuginnHttpError("flow_without_webhook");
  const name = op.name ?? `Vertal Agentes → Vertal Fluxos: ${String(flow.name ?? op.flow_id.slice(0, 8))}`.slice(0, 120);
  const created = await createAgent(s, {
    op: "create_agent", type: "Agents::PostAgent", name, options: postAgentOptions(url),
    schedule: "never", source_ids: [op.source_agent_id], propagate_immediately: true,
  });
  return {
    post_agent: agentView(created),
    source_agent: agentView(source),
    automatisch_flow: { id: flow.id, name: flow.name, published: flow.active === true },
    webhook_url: url,
    wired: `Cada evento novo do agente ${String(source.name ?? op.source_agent_id)} vira um POST JSON no gatilho Webhook do fluxo.`,
    next: flow.active === true
      ? "O fluxo está publicado: a próxima vez que o agente emitir um evento, o fluxo roda."
      : "O fluxo ainda é rascunho: o Vertal Fluxos só registra o pedido como teste. Teste o gatilho (test_step) e publique (set_flow_status active:true) para rodar de verdade.",
  };
}

async function fromAutomatisch(op: Extract<BridgeOp, { op: "connect_from_automatisch" }>, s: HuginnSession, acreds: AutomatischCreds, deps: BridgeDeps, hide: string[]): Promise<Rec> {
  let agent: Rec;
  if (op.webhook_agent_id) {
    agent = await readAgentRaw(s, op.webhook_agent_id);
    if (!looksLikeWebhookAgent(agent)) {
      throw new HuginnHttpError("not_webhook_agent");
    }
    const verbs = String(rec(agent.options).verbs ?? "post").toLowerCase();
    if (!verbs.includes("post")) throw new HuginnHttpError("webhook_rejected");
  } else {
    agent = await createAgent(s, {
      op: "create_agent", type: "Agents::WebhookAgent", name: op.name ?? "Vertal Agentes ← Vertal Fluxos",
      options: { secret: randomHex(24), expected_receive_period_in_days: 2, payload_path: "$", verbs: "post" },
    });
  }
  const secret = String(rec(agent.options).secret ?? "");
  if (!secret || agent.user_id === undefined || agent.id === undefined) throw new HuginnHttpError("bad_response");
  hide.push(secret);
  const url = webhookUrl(s.base, agent.user_id, agent.id, secret);
  const step = rec((await automatisch({
    op: "update_step", step_id: op.step_id, app_key: "http-request", key: "customRequest",
    parameters: httpRequestParameters(url, op.data),
  }, acreds, deps.automatischFetch)).step);
  if (step.type && step.type !== "action") throw new HuginnHttpError("step_not_action");
  return {
    webhook_agent: { ...agentView(agent), created: !op.webhook_agent_id },
    webhook_url: maskedWebhookUrl(s.base, agent.user_id, agent.id),
    automatisch_step: { id: step.id, appKey: step.appKey, key: step.key, status: step.status },
    wired: "O passo do Vertal Fluxos faz POST JSON no WebhookAgent; cada chamada vira um evento no Vertal Agentes, que pode alimentar outros agentes.",
    next: "Teste o passo no Vertal Fluxos (test_step, executa de verdade) e publique o fluxo (set_flow_status active:true).",
  };
}

/**
 * Executa uma operação da ponte: login no Huginn → chamadas no Automatisch e no
 * Huginn. Nunca lança. Nada de senha, cookie, token ou segredo de webhook no resultado.
 */
export async function runHuginnBridge(op: BridgeOp, creds: { huginn: HuginnCreds; automatisch: AutomatischCreds }, deps: BridgeDeps): Promise<HuginnResult> {
  let session: HuginnSession | undefined;
  const hide: string[] = [];
  const secrets = () => [
    creds.huginn.password, creds.huginn.username, creds.automatisch.password, creds.automatisch.email,
    ...(session?.sensitive() ?? []), ...hide,
  ];
  try {
    session = await openHuginnSession(creds.huginn, deps.huginnFetch);
    const raw = op.op === "connect_to_automatisch"
      ? await toAutomatisch(op, session, creds.automatisch, deps)
      : await fromAutomatisch(op, session, creds.automatisch, deps, hide);
    const data = scrubSecrets(raw, secrets());
    return { ok: true, op: op.op, data, summary: summarizeHuginnResult(op, data) };
  } catch (e) {
    return huginnFailure(op, e, secrets());
  }
}
