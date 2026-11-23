// Automatisch no Vertal Chat: operações que o agente pode pedir na instância
// Automatisch (edição comunitária) do próprio cliente.
//
// Módulo puro (sem Deno/DOM): validado aqui, executado pela edge function
// `creative-router` (tool "automatisch") e testado pelo Vitest com fetch falso.
//
// Segurança:
// - A URL, o e-mail e a senha da instância ficam no Cofre de segredos
//   (AUTOMATISCH_URL, AUTOMATISCH_EMAIL, AUTOMATISCH_PASSWORD). Só o servidor lê.
// - O servidor faz o login (POST /internal/api/v1/access-tokens), usa o token
//   só dentro da requisição e o revoga no fim. Token, senha e e-mail nunca
//   voltam ao navegador nem ao modelo: a resposta leva só dados de fluxos,
//   passos e execuções, com qualquer ocorrência dessas credenciais apagada.
// - Usa só /internal/api/v1 (rotas comunitárias). /api/v1 é Enterprise e não
//   é chamado aqui.

export const AUTOMATISCH_SECRETS = ["AUTOMATISCH_URL", "AUTOMATISCH_EMAIL", "AUTOMATISCH_PASSWORD"] as const;

export const AUTOMATISCH_OPS = [
  "list_flows", "get_flow", "create_flow", "add_step", "update_step", "test_step", "set_flow_status",
  "list_executions", "get_execution", "list_apps", "app_steps", "app_fields", "list_connections",
  "sync_connection",
] as const;
export type AutomatischOpName = (typeof AUTOMATISCH_OPS)[number];

export const AUTOMATISCH_WRITE_OPS: ReadonlySet<AutomatischOpName> = new Set([
  "create_flow", "add_step", "update_step", "test_step", "set_flow_status", "sync_connection",
]);

export const AUTOMATISCH_LIMITS = {
  maxName: 200,
  maxParametersChars: 20_000,
  maxResponseBytes: 300_000,
  maxDataChars: 1_500,
  maxSummaryChars: 5_500,
  maxPage: 1_000,
  timeoutMs: 20_000,
} as const;

export type AutomatischStepKind = "triggers" | "actions";

export type AutomatischOp =
  | { op: "list_flows"; page?: number; name?: string; status?: "published" | "draft" }
  | { op: "get_flow"; flow_id: string }
  | { op: "create_flow"; name?: string }
  | { op: "add_step"; flow_id: string; previous_step_id: string }
  | {
    op: "update_step"; step_id: string; app_key?: string; key?: string; name?: string;
    connection_id?: string; parameters?: Record<string, unknown>;
  }
  | { op: "test_step"; step_id: string }
  | { op: "set_flow_status"; flow_id: string; active: boolean }
  | { op: "list_executions"; page?: number; name?: string; status?: "success" | "failure" }
  | { op: "get_execution"; execution_id: string }
  | { op: "list_apps"; name?: string }
  | { op: "app_steps"; app_key: string; kind: AutomatischStepKind }
  | { op: "app_fields"; app_key: string; kind: AutomatischStepKind; key: string }
  | { op: "list_connections"; app_key: string }
  // "Conta do Vertal": cria/atualiza a conexão do app compartilhado (e a do app Vertal).
  | { op: "sync_connection"; app_key: string };

/** Apps que podem usar a "Conta do Vertal" no Fluxos (o app "vertal" é o dos conectores só do Vertal). */
export const FLUXOS_SYNC_APPS: ReadonlySet<string> = new Set(["gmail", "spotify", "slack", "github", "stripe", "discord", "vertal"]);
export const FLUXOS_SCREEN_NAME = "Conta do Vertal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STEP_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const uuid = (v: unknown): string | null => {
  const s = text(v, 36);
  return UUID_RE.test(s) ? s.toLowerCase() : null;
};
const pick = (a: Record<string, unknown>, ...names: string[]): unknown => {
  for (const n of names) if (a[n] !== undefined && a[n] !== null && a[n] !== "") return a[n];
  return undefined;
};
const page = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.round(n), AUTOMATISCH_LIMITS.maxPage)) : undefined;
};
const kind = (v: unknown): AutomatischStepKind | null => {
  if (v === "triggers" || v === "trigger") return "triggers";
  if (v === "actions" || v === "action") return "actions";
  return null;
};
const bool = (v: unknown): boolean | null => {
  if (v === true || v === "true" || v === 1) return true;
  if (v === false || v === "false" || v === 0) return false;
  return null;
};

/** Valida um pedido do agente. null = não executa. Aceita snake_case e camelCase nos campos. */
export function parseAutomatischOp(raw: unknown): AutomatischOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.op) {
    case "list_flows": {
      const name = text(a.name, AUTOMATISCH_LIMITS.maxName);
      const status = a.status === "published" || a.status === "draft" ? a.status : undefined;
      const p = page(a.page);
      return { op: "list_flows", ...(p ? { page: p } : {}), ...(name ? { name } : {}), ...(status ? { status } : {}) };
    }
    case "get_flow": {
      const flow_id = uuid(pick(a, "flow_id", "flowId"));
      return flow_id ? { op: "get_flow", flow_id } : null;
    }
    case "create_flow": {
      const name = text(a.name, AUTOMATISCH_LIMITS.maxName).replace(/[\r\n]+/g, " ");
      return name ? { op: "create_flow", name } : { op: "create_flow" };
    }
    case "add_step": {
      const flow_id = uuid(pick(a, "flow_id", "flowId"));
      const previous_step_id = uuid(pick(a, "previous_step_id", "previousStepId"));
      return flow_id && previous_step_id ? { op: "add_step", flow_id, previous_step_id } : null;
    }
    case "update_step": {
      const step_id = uuid(pick(a, "step_id", "stepId"));
      if (!step_id) return null;
      const out: Extract<AutomatischOp, { op: "update_step" }> = { op: "update_step", step_id };
      const appKey = pick(a, "app_key", "appKey");
      if (appKey !== undefined) {
        if (typeof appKey !== "string" || !APP_KEY_RE.test(appKey)) return null;
        out.app_key = appKey;
      }
      const key = a.key;
      if (key !== undefined && key !== null && key !== "") {
        if (typeof key !== "string" || !STEP_KEY_RE.test(key)) return null;
        out.key = key;
      }
      const name = text(a.name, AUTOMATISCH_LIMITS.maxName).replace(/[\r\n]+/g, " ");
      if (name) out.name = name;
      const conn = pick(a, "connection_id", "connectionId");
      if (conn !== undefined) {
        const id = uuid(conn);
        if (!id) return null;
        out.connection_id = id;
      }
      const params = a.parameters;
      if (params !== undefined && params !== null) {
        if (typeof params !== "object" || Array.isArray(params)) return null;
        if (JSON.stringify(params).length > AUTOMATISCH_LIMITS.maxParametersChars) return null;
        out.parameters = params as Record<string, unknown>;
      }
      // Precisa mudar alguma coisa.
      return out.app_key || out.key || out.name || out.connection_id || out.parameters ? out : null;
    }
    case "test_step": {
      const step_id = uuid(pick(a, "step_id", "stepId"));
      return step_id ? { op: "test_step", step_id } : null;
    }
    case "set_flow_status": {
      const flow_id = uuid(pick(a, "flow_id", "flowId"));
      const active = bool(a.active);
      return flow_id && active !== null ? { op: "set_flow_status", flow_id, active } : null;
    }
    case "list_executions": {
      const name = text(a.name, AUTOMATISCH_LIMITS.maxName);
      const status = a.status === "success" || a.status === "failure" ? a.status : undefined;
      const p = page(a.page);
      return { op: "list_executions", ...(p ? { page: p } : {}), ...(name ? { name } : {}), ...(status ? { status } : {}) };
    }
    case "get_execution": {
      const execution_id = uuid(pick(a, "execution_id", "executionId"));
      return execution_id ? { op: "get_execution", execution_id } : null;
    }
    case "list_apps": {
      const name = text(a.name, 80);
      return name ? { op: "list_apps", name } : { op: "list_apps" };
    }
    case "app_steps": {
      const app_key = text(pick(a, "app_key", "appKey"), 64);
      const k = kind(a.kind);
      return APP_KEY_RE.test(app_key) && k ? { op: "app_steps", app_key, kind: k } : null;
    }
    case "app_fields": {
      const app_key = text(pick(a, "app_key", "appKey"), 64);
      const k = kind(a.kind);
      const key = text(a.key, 80);
      return APP_KEY_RE.test(app_key) && k && STEP_KEY_RE.test(key) ? { op: "app_fields", app_key, kind: k, key } : null;
    }
    case "list_connections": {
      const app_key = text(pick(a, "app_key", "appKey"), 64);
      return APP_KEY_RE.test(app_key) ? { op: "list_connections", app_key } : null;
    }
    case "sync_connection": {
      const app_key = text(pick(a, "app_key", "appKey"), 64);
      return FLUXOS_SYNC_APPS.has(app_key) ? { op: "sync_connection", app_key } : null;
    }
    default:
      return null;
  }
}

export const isAutomatischWrite = (op: AutomatischOp): boolean => AUTOMATISCH_WRITE_OPS.has(op.op);

const short = (id: string) => id.slice(0, 8);

/** Texto do cartão de permissão (o que vai acontecer no Automatisch). */
export function describeAutomatischOp(op: AutomatischOp): string {
  switch (op.op) {
    case "list_flows": return `Listar seus fluxos${op.name ? ` com "${op.name}"` : ""}${op.page ? ` (página ${op.page})` : ""}`;
    case "get_flow": return `Ler o fluxo ${short(op.flow_id)}… e os passos dele`;
    case "create_flow": return `Criar o fluxo "${op.name ?? "Sem nome"}" (gatilho e ação vazios)`;
    case "add_step": return `Adicionar um passo de ação no fluxo ${short(op.flow_id)}…`;
    case "update_step": {
      const what = [op.app_key && op.key ? `${op.app_key} → ${op.key}` : op.app_key ?? op.key, op.parameters ? "parâmetros" : "", op.connection_id ? "conexão" : ""]
        .filter(Boolean).join(", ");
      return `Configurar o passo ${short(op.step_id)}…${what ? ` (${what})` : ""}`;
    }
    case "test_step": return `RODAR em teste o fluxo até o passo ${short(op.step_id)}… (executa as ações de verdade)`;
    case "set_flow_status": return op.active
      ? `PUBLICAR o fluxo ${short(op.flow_id)}… (passa a rodar sozinho)`
      : `Pausar o fluxo ${short(op.flow_id)}…`;
    case "list_executions": return `Listar as execuções${op.status ? ` com status ${op.status}` : ""}${op.page ? ` (página ${op.page})` : ""}`;
    case "get_execution": return `Ler a execução ${short(op.execution_id)}… e o resultado de cada passo`;
    case "list_apps": return `Listar os apps do Vertal Fluxos${op.name ? ` com "${op.name}"` : ""}`;
    case "app_steps": return `Listar os ${op.kind === "triggers" ? "gatilhos" : "ações"} do app ${op.app_key}`;
    case "app_fields": return `Ler os campos de ${op.app_key} → ${op.key}`;
    case "list_connections": return `Listar suas conexões do app ${op.app_key}`;
    case "sync_connection": return `Usar sua conta ${op.app_key} do Vertal no Vertal Fluxos`;
  }
}

/** Mensagens das respostas (pt-BR), por código. */
export const AUTOMATISCH_ERROR_MESSAGES: Record<string, string> = {
  missing_secrets: "Faltam segredos do Vertal Fluxos no Cofre (AUTOMATISCH_URL, AUTOMATISCH_EMAIL, AUTOMATISCH_PASSWORD).",
  bad_url: "AUTOMATISCH_URL no Cofre não é um endereço https válido (ex.: https://fluxos.suaempresa.com.br).",
  url_not_allowed: "Esse endereço do Vertal Fluxos não pode ser chamado (só endereços públicos em https).",
  auth_failed: "O Vertal Fluxos recusou o login. Confira AUTOMATISCH_EMAIL e AUTOMATISCH_PASSWORD no Cofre.",
  forbidden: "Seu usuário do Vertal Fluxos não tem permissão para isso.",
  not_found: "Não encontrado no Vertal Fluxos (fluxo, passo, execução ou app).",
  invalid: "O Vertal Fluxos recusou os dados enviados.",
  incomplete_flow: "O fluxo ainda tem passos incompletos: configure e teste cada passo antes de publicar.",
  rate_limited: "Muitos pedidos ao Vertal Fluxos em pouco tempo. Aguarde um minuto.",
  redirect_blocked: "O Vertal Fluxos respondeu com um redirecionamento, que não é seguido por segurança. Confira AUTOMATISCH_URL.",
  timeout: "O Vertal Fluxos não respondeu a tempo.",
  network_error: "Não foi possível falar com o Vertal Fluxos (rede).",
  bad_response: "O Vertal Fluxos respondeu num formato inesperado.",
  automatisch_error: "O Vertal Fluxos não respondeu como esperado.",
  invalid_input: "Pedido inválido para o Vertal Fluxos.",
  confirmation_required: "Esta chamada precisa da sua permissão.",
};

/** Classifica a resposta HTTP do Automatisch. */
export function automatischErrorCode(status: number): string {
  if (status === 401) return "auth_failed";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "invalid";
  if (status === 429) return "rate_limited";
  if (status >= 300 && status < 400) return "redirect_blocked";
  return "automatisch_error";
}

/**
 * Normaliza AUTOMATISCH_URL: só https, sem usuário/senha na URL, sem query nem
 * âncora; tira barra final e um sufixo /internal/api/v1 ou /api/v1 colado por engano.
 * Devolve a base (origem + caminho) ou null.
 */
export function normalizeAutomatischUrl(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  let path = u.pathname.replace(/\/+$/, "");
  path = path.replace(/\/(internal\/)?api\/v1$/i, "").replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

// ─── Execução (com fetch injetado) ───────────────────────────────────────

export interface AutomatischCreds {
  url: string;
  email: string;
  password: string;
  /** Chave VERTAL_FLUXOS_KEY do usuário (só para sync_connection; nunca volta na resposta). */
  vertalKey?: string;
}

/** Subconjunto do fetch que o executor usa (o servidor injeta o fetch real com timeout e sem redirect). */
export type AutomatischFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; text: () => Promise<string> }>;

export type AutomatischResult =
  | { ok: true; op: AutomatischOpName; data: unknown; summary: string }
  | { ok: false; op: AutomatischOpName; code: string; message: string; status?: number; detail?: string };

interface Call {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

class AutomatischHttpError extends Error {
  constructor(public code: string, public status?: number, public detail?: string) {
    super(code);
  }
}

const API = "/internal/api/v1";

function buildUrl(base: string, call: Call): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(call.query ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const qs = q.toString();
  return `${base}${API}${call.path}${qs ? `?${qs}` : ""}`;
}

/** Erros de validação do Automatisch ({errors:{campo:[msg]}}) em uma linha curta. */
function validationDetail(body: unknown): string | undefined {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!errors || typeof errors !== "object") return undefined;
  const parts = Object.entries(errors as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map(String).join(", ") : String(v)}`);
  return parts.length ? parts.join("; ").slice(0, 300) : undefined;
}

async function send(fetchFn: AutomatischFetch, base: string, call: Call, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = token; // o Automatisch lê o token cru, sem "Bearer"
  if (call.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Awaited<ReturnType<AutomatischFetch>>;
  try {
    res = await fetchFn(buildUrl(base, call), {
      method: call.method, headers, ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
    });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    throw new AutomatischHttpError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error");
  }
  const raw = await res.text().catch(() => "");
  if (raw.length > AUTOMATISCH_LIMITS.maxResponseBytes) throw new AutomatischHttpError("bad_response", res.status);
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    let code = automatischErrorCode(res.status);
    const detail = validationDetail(body);
    const type = (rec(body).meta as { type?: unknown } | undefined)?.type;
    if (code === "invalid" && (type === "incompleteStepsError" || /should be completed/i.test(detail ?? ""))) code = "incomplete_flow";
    throw new AutomatischHttpError(code, res.status, detail);
  }
  if (res.status === 204) return null;
  if (!body || typeof body !== "object" || !("data" in (body as object))) throw new AutomatischHttpError("bad_response", res.status);
  return body;
}

async function login(fetchFn: AutomatischFetch, creds: AutomatischCreds): Promise<string> {
  try {
    const body = await send(fetchFn, creds.url, { method: "POST", path: "/access-tokens", body: { email: creds.email, password: creds.password } });
    const token = (body as { data?: { token?: unknown } }).data?.token;
    if (typeof token !== "string" || !token) throw new AutomatischHttpError("bad_response");
    return token;
  } catch (e) {
    // 422 no login = e-mail ou senha errados.
    if (e instanceof AutomatischHttpError && e.code === "invalid") throw new AutomatischHttpError("auth_failed", e.status);
    throw e;
  }
}

// ─── Formatação dos dados (só o que interessa, nunca credenciais) ─────────

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const iso = (v: unknown): string | undefined => (typeof v === "number" && Number.isFinite(v) ? new Date(v).toISOString() : undefined);

/** Dados de execução podem ser grandes: corta para caber no contexto do modelo. */
export function clipData(v: unknown, max: number = AUTOMATISCH_LIMITS.maxDataChars): unknown {
  if (v === undefined || v === null) return v;
  const s = JSON.stringify(v);
  if (s === undefined || s.length <= max) return v;
  return `${s.slice(0, max)}… (cortado)`;
}

function compact<T extends Rec>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === "") delete o[k];
  return o;
}

function stepView(s: Rec): Rec {
  const last = rec(s.lastExecutionStep);
  return compact({
    id: s.id, type: s.type, position: s.position, appKey: s.appKey, key: s.key, name: s.name, status: s.status,
    webhookUrl: s.webhookUrl, parameters: clipData(s.parameters, 800),
    ...(s.lastExecutionStep ? {
      lastRun: compact({ status: last.status, dataOut: clipData(last.dataOut), errorDetails: clipData(last.errorDetails, 600) }),
    } : {}),
  });
}

function flowView(f: Rec): Rec {
  return compact({
    id: f.id, name: f.name, active: f.active, status: f.status, updatedAt: iso(f.updatedAt),
    ...(Array.isArray(f.steps) ? { steps: arr(f.steps).map(stepView) } : {}),
  });
}

function pageInfo(body: Rec): Rec {
  const meta = rec(body.meta);
  return compact({ count: meta.count, currentPage: meta.currentPage, totalPages: meta.totalPages });
}

function executionView(e: Rec): Rec {
  const flow = rec(e.flow);
  return compact({
    id: e.id, status: e.status, testRun: e.testRun, createdAt: iso(e.createdAt),
    ...(e.flow ? { flow: compact({ id: flow.id, name: flow.name }) } : {}),
  });
}

function executionStepView(x: Rec): Rec {
  const step = rec(x.step);
  return compact({
    id: x.id, status: x.status, stepId: step.id, appKey: step.appKey, key: step.key, position: step.position,
    dataIn: clipData(x.dataIn, 600), dataOut: clipData(x.dataOut), errorDetails: clipData(x.errorDetails, 600),
  });
}

function argumentView(a: Rec): Rec {
  return compact({
    key: a.key, label: a.label, type: a.type, required: a.required === true ? true : undefined,
    description: typeof a.description === "string" ? a.description.slice(0, 200) : undefined,
    options: Array.isArray(a.options) ? arr(a.options).slice(0, 15).map((o) => compact({ label: o.label, value: o.value })) : undefined,
  });
}

/** Troca qualquer ocorrência das credenciais (e do token) por [segredo] em todo o texto/objeto. */
export function scrubSecrets<T>(value: T, secrets: string[]): T {
  const list = secrets.filter((s) => typeof s === "string" && s.length >= 4);
  if (list.length === 0) return value;
  let s = JSON.stringify(value);
  if (s === undefined) return value;
  for (const secret of list) {
    const enc = JSON.stringify(secret).slice(1, -1); // como aparece dentro de uma string JSON
    s = s.split(enc).join("[segredo]");
  }
  return JSON.parse(s) as T;
}

/** Resumo em texto para o agente (DADOS) e para o usuário. */
export function summarizeAutomatischResult(op: AutomatischOp, data: unknown): string {
  const d = rec(data);
  const json = (v: unknown) => JSON.stringify(v);
  let head: string;
  switch (op.op) {
    case "list_flows": {
      const items = arr(d.flows);
      head = items.length ? `${items.length} fluxo(s) (página ${String(rec(d.page).currentPage ?? 1)} de ${String(rec(d.page).totalPages ?? 1)}):` : "Nenhum fluxo encontrado.";
      break;
    }
    case "get_flow": head = `Fluxo "${String(rec(d.flow).name ?? "")}" (${rec(d.flow).active ? "publicado" : "rascunho"}):`; break;
    case "create_flow": head = `Fluxo criado: "${String(rec(d.flow).name ?? "")}" (id ${String(rec(d.flow).id ?? "?")}). Configure o gatilho e a ação com update_step:`; break;
    case "add_step": head = `Passo de ação adicionado (id ${String(rec(d.step).id ?? "?")}):`; break;
    case "update_step": head = "Passo configurado (fica incompleto até ser testado com test_step):"; break;
    case "test_step": {
      const last = rec(rec(d.step).lastRun);
      head = `Teste executado até o passo; resultado: ${String(last.status ?? rec(d.step).status ?? "?")}.`;
      break;
    }
    case "set_flow_status": head = rec(d.flow).active ? "Fluxo publicado: agora roda sozinho." : "Fluxo pausado."; break;
    case "list_executions": {
      const items = arr(d.executions);
      head = items.length ? `${items.length} execução(ões):` : "Nenhuma execução encontrada.";
      break;
    }
    case "get_execution": head = `Execução ${String(rec(d.execution).status ?? "")}${rec(d.execution).testRun ? " (teste)" : ""}:`; break;
    case "list_apps": head = `${arr(d.apps).length} app(s):`; break;
    case "app_steps": head = `${op.kind === "triggers" ? "Gatilhos" : "Ações"} de ${op.app_key}:`; break;
    case "app_fields": head = `Campos de ${op.app_key} → ${op.key} (use as chaves em "parameters"):`; break;
    case "sync_connection": head = `Conexões "${FLUXOS_SCREEN_NAME}" no Vertal Fluxos:`; break;
    case "list_connections": head = arr(d.connections).length ? `Conexões de ${op.app_key}:` : `Nenhuma conexão de ${op.app_key}: o cliente cria no próprio Vertal Fluxos.`; break;
  }
  return `${head}\n${json(data)}`.slice(0, AUTOMATISCH_LIMITS.maxSummaryChars);
}

/** Faz a(s) chamada(s) de uma operação, já autenticado. Devolve os dados filtrados. */
async function perform(op: AutomatischOp, call: (c: Call) => Promise<unknown>, vertalKey?: string): Promise<unknown> {
  const data = (body: unknown) => rec(body).data;
  switch (op.op) {
    case "list_flows": {
      const body = rec(await call({ method: "GET", path: "/flows", query: { page: op.page, name: op.name, status: op.status } }));
      return { flows: arr(body.data).map(flowView), page: pageInfo(body) };
    }
    case "get_flow":
      return { flow: flowView(rec(data(await call({ method: "GET", path: `/flows/${op.flow_id}` })))) };
    case "create_flow": {
      const created = rec(data(await call({ method: "POST", path: "/flows" })));
      const id = typeof created.id === "string" ? created.id : "";
      if (!UUID_RE.test(id)) throw new AutomatischHttpError("bad_response");
      if (op.name) await call({ method: "PATCH", path: `/flows/${id}`, body: { name: op.name } });
      return { flow: flowView(rec(data(await call({ method: "GET", path: `/flows/${id}` })))) };
    }
    case "add_step":
      return { step: stepView(rec(data(await call({ method: "POST", path: `/flows/${op.flow_id}/steps`, body: { previousStepId: op.previous_step_id } })))) };
    case "update_step": {
      const body = compact({
        appKey: op.app_key, key: op.key, name: op.name, connectionId: op.connection_id, parameters: op.parameters,
      } as Rec);
      return { step: stepView(rec(data(await call({ method: "PATCH", path: `/steps/${op.step_id}`, body })))) };
    }
    case "test_step":
      return { step: stepView(rec(data(await call({ method: "POST", path: `/steps/${op.step_id}/test-and-continue` })))) };
    case "set_flow_status":
      return { flow: flowView(rec(data(await call({ method: "PATCH", path: `/flows/${op.flow_id}/status`, body: { active: op.active } })))) };
    case "list_executions": {
      const body = rec(await call({ method: "GET", path: "/executions", query: { page: op.page, name: op.name, status: op.status } }));
      return { executions: arr(body.data).map(executionView), page: pageInfo(body) };
    }
    case "get_execution": {
      const execution = executionView(rec(data(await call({ method: "GET", path: `/executions/${op.execution_id}` }))));
      const steps = arr(data(await call({ method: "GET", path: `/executions/${op.execution_id}/execution-steps` })));
      return { execution, steps: steps.map(executionStepView) };
    }
    case "list_apps": {
      const apps = arr(data(await call({ method: "GET", path: "/apps", query: { name: op.name } })));
      return { apps: apps.slice(0, 80).map((a) => compact({ key: a.key, name: a.name, supportsConnections: a.supportsConnections })) };
    }
    case "app_steps": {
      const items = arr(data(await call({ method: "GET", path: `/apps/${op.app_key}/${op.kind}` })));
      return { [op.kind]: items.slice(0, 60).map((t) => compact({ key: t.key, name: t.name, description: typeof t.description === "string" ? t.description.slice(0, 200) : undefined })) };
    }
    case "app_fields": {
      const substeps = arr(data(await call({ method: "GET", path: `/apps/${op.app_key}/${op.kind}/${op.key}/substeps` })));
      return { substeps: substeps.map((s) => compact({ key: s.key, name: s.name, arguments: arr(s.arguments).slice(0, 30).map(argumentView) })) };
    }
    case "list_connections": {
      const items = arr(data(await call({ method: "GET", path: `/apps/${op.app_key}/connections` })));
      return { connections: items.map((c) => compact({ id: c.id, screenName: rec(c.formattedData).screenName, verified: c.verified })) };
    }
    case "sync_connection": {
      if (!vertalKey) throw new AutomatischHttpError("invalid_input");
      const out: Rec[] = [];
      for (const app of [...new Set([op.app_key, "vertal"])]) {
        const items = arr(data(await call({ method: "GET", path: `/apps/${app}/connections` })));
        const found = items.find((c) => rec(c.formattedData).screenName === FLUXOS_SCREEN_NAME && typeof c.id === "string");
        // Só a chave do usuário vai para o Fluxos, nunca o token do provedor.
        const formattedData = app === "vertal"
          ? { screenName: FLUXOS_SCREEN_NAME, vertalKey }
          : { screenName: FLUXOS_SCREEN_NAME, vertalBroker: true, vertalKey };
        let id: string;
        if (found) {
          id = String(found.id);
          await call({ method: "PATCH", path: `/connections/${id}`, body: { formattedData } });
        } else {
          id = String(rec(data(await call({ method: "POST", path: `/apps/${app}/connections`, body: { formattedData } }))).id ?? "");
          if (!UUID_RE.test(id)) throw new AutomatischHttpError("bad_response");
        }
        let verified = false;
        try {
          verified = rec(data(await call({ method: "POST", path: `/connections/${id}/verify` }))).verified === true;
        } catch {
          verified = false; // provedor ainda não conectado no Vertal: a conexão fica pendente
        }
        out.push({ app, id, created: !found, verified });
      }
      return { connections: out };
    }
  }
}

/**
 * Executa uma operação na instância do cliente: login → chamada(s) → revoga o
 * token. Nunca lança. O resultado nunca contém o token, a senha nem o e-mail.
 */
export async function runAutomatischOp(
  op: AutomatischOp,
  creds: AutomatischCreds,
  deps: { fetch: AutomatischFetch },
): Promise<AutomatischResult> {
  const base = normalizeAutomatischUrl(creds.url);
  if (!base) return { ok: false, op: op.op, code: "bad_url", message: AUTOMATISCH_ERROR_MESSAGES.bad_url };
  const c = { ...creds, url: base };
  let token: string | undefined;
  try {
    token = await login(deps.fetch, c);
    const t = token;
    const raw = await perform(op, (callSpec) => send(deps.fetch, base, callSpec, t), c.vertalKey);
    const data = scrubSecrets(raw, [t, c.password, c.email, c.vertalKey ?? ""]);
    return { ok: true, op: op.op, data, summary: summarizeAutomatischResult(op, data) };
  } catch (e) {
    const err = e instanceof AutomatischHttpError ? e : new AutomatischHttpError("automatisch_error");
    const detail = err.detail ? scrubSecrets(err.detail, [token ?? "", c.password, c.email, c.vertalKey ?? ""]) : undefined;
    return {
      ok: false, op: op.op, code: err.code,
      message: `${AUTOMATISCH_ERROR_MESSAGES[err.code] ?? AUTOMATISCH_ERROR_MESSAGES.automatisch_error}${detail ? ` (${detail})` : ""}`,
      ...(err.status ? { status: err.status } : {}),
      ...(detail ? { detail } : {}),
    };
  } finally {
    if (token) {
      // Token de uso único: revogado no fim (falha aqui não muda o resultado).
      await send(deps.fetch, base, { method: "DELETE", path: `/access-tokens/${encodeURIComponent(token)}` }, token).catch(() => undefined);
    }
  }
}

// ─── Quando ligar a ferramenta no prompt ─────────────────────────────────

const AUTOMATISCH_HINTS = /\b(automatisch|vertal\s+fluxos|automa[çc](?:[aã]o|[oõ]es)|automatiz\w*|workflows?|flows?)\b/i;
const FLUXO_HINT = /\bfluxos?\b(?!\s+de\s+caixa)/i;

/** A conversa recente fala de Automatisch/automação/fluxo? (liga a ferramenta automatisch no prompt) */
export function wantsAutomatisch(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 8): boolean {
  const hit = (s: string) => AUTOMATISCH_HINTS.test(s) || FLUXO_HINT.test(s);
  return recent.slice(-lookback).some((m) => {
    if (typeof m === "string") return hit(m);
    if (m && typeof m === "object") {
      if (m.tool === "automatisch") return true;
      return hit(String(m.content ?? "")) || hit(String(m.summary ?? ""));
    }
    return false;
  });
}
