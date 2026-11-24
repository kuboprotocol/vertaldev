// Chamadas do navegador: edge function vertal-code-ai e, para gravar, o caminho
// "apply" que já existe no vibe-code-agent (mesmos checkpoints, mesma trava).
import { supabase } from "@/integrations/supabase/client";
import type { Attachment, CustomProvider, ProfileId, ReasoningEffort, VcaiPlan } from "./core";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface ProfileOption {
  id: ProfileId;
  label: string;
  description: string;
  cost: "free" | "self_hosted" | "paid" | "custom";
}

export interface StatusResponse {
  enabled: boolean;
  profiles: ProfileOption[];
  sandbox: boolean;
  projectSource: "github" | "vault";
  paid: boolean;
  selfHosted: boolean;
  customProviders: boolean;
  freeRequestsLeft: number | null;
  /** false: o motor grava no repositório da plataforma e este usuário não é o operador. */
  canApply?: boolean;
  /** Operador do Vertal (Laércio): libera o modo Operação. */
  operator?: boolean;
  pricing?: { plan: Record<string, number>; build: Record<string, number>; fixRound: Record<string, number>; sandboxRun: number };
}

export interface ApprovalCard {
  approvalId: string;
  token: string;
  tool: string;
  text: string;
  args: unknown;
}

export interface OpsAskResponse {
  reply: string;
  results: Array<{ tool: string; ok: boolean; result: unknown }>;
  approvals: ApprovalCard[];
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  monthly_cap_credits: number | null;
  rpm: number;
  spent_micro: number;
  spent_period: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface RouteInfo {
  cost: "free" | "self_hosted" | "paid" | "custom";
  attempts: number;
  imagesRead: boolean;
}

export interface PlanResponse {
  mode: "plan";
  plan: VcaiPlan;
  route: RouteInfo;
}

export interface ProposedFile {
  path: string;
  isNew: boolean;
  after: string;
  diff: string;
  added: number;
  removed: number;
  reason: string | null;
  baseHash: string;
  problems: string[];
}

export interface BuildResponse {
  mode: "build" | "fix";
  summary: string;
  notes: string[];
  testCommand: string | null;
  files: ProposedFile[];
  failures: Array<{ path: string; error: string }>;
  route: RouteInfo;
}

export interface PollResponse {
  done: boolean;
  exitCode: number | null;
  steps: Array<{ name: string; code: number | null }>;
  log: string;
  failure: string | null;
}

export interface RequestCommon {
  projectId?: string;
  prompt: string;
  profile: ProfileId;
  effort: ReasoningEffort;
  attachments?: Attachment[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  customProvider?: CustomProvider;
  openFiles?: string[];
}

export class VcaiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new VcaiError("Entre na sua conta para usar o VERTAL Code AI.", 401);
  return t;
}

async function call<T>(action: string, payload: Record<string, unknown>, signal?: AbortSignal, fn = "vertal-code-ai", subpath = ""): Promise<T> {
  const res = await fetch(`${BASE}/${fn}${subpath}`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await token()}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      res.status === 404 && (data?.error === "vertal_code_ai_disabled" || data?.error === "disabled")
        ? "O VERTAL Code AI ainda não foi ligado neste servidor."
        : typeof data?.error === "string"
          ? data.error
          : `Falha (${res.status}).`;
    throw new VcaiError(msg, res.status);
  }
  return data as T;
}

export interface VcaiApi {
  status(): Promise<StatusResponse>;
  plan(req: RequestCommon, signal?: AbortSignal): Promise<PlanResponse>;
  build(
    req: RequestCommon & { plan?: VcaiPlan | null; workingFiles?: Array<{ path: string; content: string }>; fix?: { log: string; files: Array<{ path: string; content: string }>; failures?: Array<{ path: string; error: string }> } },
    signal?: AbortSignal,
  ): Promise<BuildResponse>;
  sandboxStart(req: { projectId?: string; files: Array<{ path: string; content: string }>; testCommand?: string | null }): Promise<{ handle: string }>;
  sandboxUpdate(req: { handle: string; files: Array<{ path: string; content: string }>; testCommand?: string | null }): Promise<{ handle: string }>;
  sandboxPoll(handle: string): Promise<PollResponse>;
  sandboxStop(handle: string): Promise<void>;
  apply(req: { projectId?: string; files: Array<{ path: string; content: string; baseHash: string }> }): Promise<{ ok: boolean; message: string }>;
}

/** Lê o SSE do vibe-code-agent e devolve sucesso + a última mensagem relevante. */
export function readApplyStream(text: string): { ok: boolean; message: string } {
  let ok = false;
  let message = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.startsWith("data: ")) continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.kind === "error") return { ok: false, message: String(evt.detail ?? evt.title ?? "Falha ao aplicar.") };
      if (evt.kind === "done" && evt.status === "success") ok = true;
      if (evt.kind === "reply" && typeof evt.detail === "string") message = evt.detail;
    } catch {
      /* quadro parcial */
    }
  }
  return { ok, message: message || (ok ? "Alterações aplicadas." : "Não recebi confirmação do servidor.") };
}

export const vcaiApi: VcaiApi = {
  status: () => call<StatusResponse>("status", {}),
  plan: (req, signal) => call<PlanResponse>("plan", { ...req }, signal),
  build: (req, signal) => call<BuildResponse>("build", { ...req }, signal),
  sandboxStart: (req) => call<{ handle: string }>("sandbox_start", { ...req }),
  sandboxUpdate: (req) => call<{ handle: string }>("sandbox_update", { ...req }),
  sandboxPoll: (handle) => call<PollResponse>("sandbox_poll", { handle }),
  sandboxStop: async (handle) => {
    await call("sandbox_stop", { handle }).catch(() => undefined);
  },
  async apply({ projectId, files }) {
    const res = await fetch(`${BASE}/vibe-code-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ projectId: projectId || undefined, apply: files }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, message: text.slice(0, 300) || `Falha (${res.status}).` };
    return readApplyStream(text);
  },
};

/** Modo Operação (só o operador; o servidor responde 404 para qualquer outro). */
export const opsApi = {
  ask: (prompt: string, attachments?: Attachment[]) => call<OpsAskResponse>("ask", { prompt, attachments }, undefined, "vertal-code-ai-admin"),
  decide: (card: ApprovalCard, decision: "approve" | "reject") =>
    call<{ ok: boolean; status: string; result?: unknown }>("approve", { approvalId: card.approvalId, token: card.token, decision }, undefined, "vertal-code-ai-admin"),
  report: (period: "daily" | "weekly") => call<{ report: string }>("report", { period }, undefined, "vertal-code-ai-admin"),
};

/** Chaves da API VERTAL do próprio desenvolvedor. */
export const keysApi = {
  list: () => call<{ keys: ApiKeyRecord[] }>("list", {}, undefined, "vertal-ai-api", "/keys"),
  create: (name: string, monthlyCapCredits: number | null) =>
    call<{ key: string; record: ApiKeyRecord }>("create", { name, monthlyCapCredits }, undefined, "vertal-ai-api", "/keys"),
  revoke: (id: string) => call<{ ok: boolean }>("revoke", { id }, undefined, "vertal-ai-api", "/keys"),
};
