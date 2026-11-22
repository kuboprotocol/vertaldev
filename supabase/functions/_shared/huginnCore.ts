// Huginn no Vertal Chat: operações que o agente pode pedir na instância
// Huginn (https://github.com/huginn/huginn, MIT) do próprio cliente.
//
// Módulo puro (sem Deno/DOM): validado aqui, executado pela edge function
// `creative-router` (tool "huginn") e testado pelo Vitest com fetch falso.
//
// O Huginn não tem API REST formal. O que existe (conferido no código-fonte,
// config/routes.rb e app/controllers/*, Rails 8.1 + Devise 5):
// - Login por sessão (Devise): GET /users/sign_in dá o cookie `_rails_session`
//   e o token CSRF (<meta name="csrf-token">); POST /users/sign_in com
//   user[login] (usuário ou e-mail), user[password] e authenticity_token →
//   302 com o cookie da sessão logada. O Devise troca o token CSRF ao logar
//   (clean_up_csrf_token_on_authentication), então um novo é lido de uma
//   página HTML antes de qualquer escrita.
// - JSON nas rotas do próprio app (respond_to format.json):
//   GET /agents.json (?page, ?scenario_id), GET /agents/:id.json,
//   GET /agents/:id/events.json, GET /events.json, GET /scenarios.json,
//   GET /worker_status, POST /agents.json {agent:{type,name,options,…}},
//   PUT /agents/:id.json {agent:{disabled}}, POST /agents/:id/run.json
//   (enfileira AgentCheckJob). Escrita exige o cabeçalho X-CSRF-Token.
// - Importar cenário: POST /scenarios/scenario_imports (só HTML) com
//   scenario_import[data] (JSON) e scenario_import[do_import]=1 → 302 para
//   /scenarios/:id quando dá certo.
// - WebhookAgent recebe em /users/:user_id/web_requests/:agent_id/:secret
//   (sem login; o segredo fica nas opções do agente; verbo padrão POST).
//
// Segurança:
// - HUGINN_URL, HUGINN_USERNAME e HUGINN_PASSWORD ficam no Cofre de segredos.
//   Só o servidor lê. O cookie da sessão vive só dentro da requisição (sem
//   "lembrar de mim") e é descartado no fim.
// - Senha, usuário, cookie e token CSRF nunca voltam ao navegador nem ao
//   modelo. Opções de agentes com nome de segredo (secret, password, token,
//   api_key…) saem como "[oculto]"; o segredo do WebhookAgent também.
// - ShellCommandAgent (executa comandos no servidor) é recusado ao criar e ao importar.

export const HUGINN_SECRETS = ["HUGINN_URL", "HUGINN_USERNAME", "HUGINN_PASSWORD"] as const;

export const HUGINN_OPS = [
  "status", "list_agents", "get_agent", "list_events", "list_scenarios",
  "create_agent", "import_scenario", "run_agent", "set_agent_enabled", "send_webhook_event",
  "connect_to_automatisch", "connect_from_automatisch",
] as const;
export type HuginnOpName = (typeof HUGINN_OPS)[number];

export const HUGINN_WRITE_OPS: ReadonlySet<HuginnOpName> = new Set([
  "create_agent", "import_scenario", "run_agent", "set_agent_enabled", "send_webhook_event",
  "connect_to_automatisch", "connect_from_automatisch",
]);

/** Operações da ponte Huginn ↔ Automatisch (precisam também dos segredos do Automatisch). */
export const HUGINN_BRIDGE_OPS: ReadonlySet<HuginnOpName> = new Set(["connect_to_automatisch", "connect_from_automatisch"]);

export const HUGINN_LIMITS = {
  maxName: 120,
  maxOptionsChars: 20_000,
  maxScenarioChars: 60_000,
  maxPayloadChars: 10_000,
  maxDataTemplateChars: 5_000,
  maxResponseBytes: 400_000,
  maxDataChars: 1_200,
  maxSummaryChars: 5_500,
  maxPage: 1_000,
  maxIds: 20,
  recentEvents: 5,
  timeoutMs: 20_000,
} as const;

/** Agendas aceitas pelo Huginn (Agent::SCHEDULES). */
export const HUGINN_SCHEDULES = [
  "every_1m", "every_2m", "every_5m", "every_10m", "every_30m",
  "every_1h", "every_2h", "every_5h", "every_12h",
  "every_1d", "every_2d", "every_7d",
  "midnight", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", "11am",
  "noon", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm",
  "never",
] as const;

/** Retenção de eventos aceita pelo Huginn (Agent::EVENT_RETENTION_SCHEDULES), em segundos. */
export const HUGINN_KEEP_EVENTS_FOR: readonly number[] = [
  0, 3_600, 21_600, 86_400,
  ...[2, 3, 4, 5, 7, 14, 21, 30, 45, 90, 180, 365].map((n) => n * 86_400),
];

/** Tipos que nunca são criados pelo chat (rodam comandos no servidor do Huginn). */
export const HUGINN_BLOCKED_TYPES: ReadonlySet<string> = new Set(["Agents::ShellCommandAgent"]);

export type HuginnOp =
  | { op: "status" }
  | { op: "list_agents"; page?: number; scenario_id?: number }
  | { op: "get_agent"; agent_id: number }
  | { op: "list_events"; agent_id?: number; page?: number }
  | { op: "list_scenarios"; page?: number }
  | {
    op: "create_agent"; type: string; name: string; options: Record<string, unknown>;
    schedule?: string; source_ids?: number[]; receiver_ids?: number[]; scenario_ids?: number[];
    keep_events_for?: number; propagate_immediately?: boolean; disabled?: boolean;
  }
  | { op: "import_scenario"; scenario: Record<string, unknown> }
  | { op: "run_agent"; agent_id: number }
  | { op: "set_agent_enabled"; agent_id: number; enabled: boolean }
  | { op: "send_webhook_event"; agent_id: number; payload: Record<string, unknown> }
  /** Quando o agente Huginn `source_agent_id` emitir um evento, dispara o fluxo `flow_id` do Automatisch (gatilho Webhook). */
  | { op: "connect_to_automatisch"; source_agent_id: number; flow_id: string; name?: string }
  /** Faz o passo de ação `step_id` do Automatisch mandar um evento para um WebhookAgent do Huginn (novo ou `webhook_agent_id`). */
  | { op: "connect_from_automatisch"; step_id: string; webhook_agent_id?: number; name?: string; data?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^(?:Agents::)?([A-Z][A-Za-z0-9]{1,60}Agent)$/;

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneLine = (v: unknown, max: number): string => text(v, max).replace(/[\r\n]+/g, " ");
const pick = (a: Record<string, unknown>, ...names: string[]): unknown => {
  for (const n of names) if (a[n] !== undefined && a[n] !== null && a[n] !== "") return a[n];
  return undefined;
};
/** Id numérico do Huginn (inteiro positivo). */
const id = (v: unknown): number | null => {
  if (typeof v === "string" && !/^\d{1,12}$/.test(v.trim())) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
};
const page = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.round(n), HUGINN_LIMITS.maxPage)) : undefined;
};
const bool = (v: unknown): boolean | null => {
  if (v === true || v === "true" || v === 1) return true;
  if (v === false || v === "false" || v === 0) return false;
  return null;
};
const uuid = (v: unknown): string | null => {
  const s = text(v, 36);
  return UUID_RE.test(s) ? s.toLowerCase() : null;
};
/** Lista de ids; null = inválida (um id ruim invalida tudo). */
const ids = (v: unknown): number[] | null | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > HUGINN_LIMITS.maxIds) return null;
  const out: number[] = [];
  for (const x of v) {
    const n = id(x);
    if (n === null) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out;
};
const plainObject = (v: unknown, maxChars: number): Record<string, unknown> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = JSON.stringify(v);
  return s !== undefined && s.length <= maxChars ? (v as Record<string, unknown>) : null;
};

/** "WebsiteAgent" ou "Agents::WebsiteAgent" → "Agents::WebsiteAgent". null = inválido. */
export function normalizeHuginnType(v: unknown): string | null {
  const m = TYPE_RE.exec(text(v, 80));
  return m ? `Agents::${m[1]}` : null;
}

/** Valida um pedido do agente. null = não executa. Aceita snake_case e camelCase nos campos. */
export function parseHuginnOp(raw: unknown): HuginnOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.op) {
    case "status":
      return { op: "status" };
    case "list_agents": {
      const p = page(a.page);
      const sc = pick(a, "scenario_id", "scenarioId");
      const scenario_id = sc === undefined ? undefined : id(sc);
      if (scenario_id === null) return null;
      return { op: "list_agents", ...(p ? { page: p } : {}), ...(scenario_id ? { scenario_id } : {}) };
    }
    case "get_agent":
    case "run_agent": {
      const agent_id = id(pick(a, "agent_id", "agentId", "id"));
      return agent_id ? { op: a.op, agent_id } : null;
    }
    case "list_events": {
      const p = page(a.page);
      const ag = pick(a, "agent_id", "agentId");
      const agent_id = ag === undefined ? undefined : id(ag);
      if (agent_id === null) return null;
      return { op: "list_events", ...(agent_id ? { agent_id } : {}), ...(p ? { page: p } : {}) };
    }
    case "list_scenarios": {
      const p = page(a.page);
      return { op: "list_scenarios", ...(p ? { page: p } : {}) };
    }
    case "create_agent": {
      const type = normalizeHuginnType(a.type);
      if (!type || HUGINN_BLOCKED_TYPES.has(type)) return null;
      const name = oneLine(a.name, HUGINN_LIMITS.maxName);
      if (!name) return null;
      const options = plainObject(a.options ?? {}, HUGINN_LIMITS.maxOptionsChars);
      if (!options) return null;
      const out: Extract<HuginnOp, { op: "create_agent" }> = { op: "create_agent", type, name, options };
      if (a.schedule !== undefined && a.schedule !== null && a.schedule !== "") {
        if (typeof a.schedule !== "string" || !(HUGINN_SCHEDULES as readonly string[]).includes(a.schedule)) return null;
        out.schedule = a.schedule;
      }
      for (const [field, ...aliases] of [
        ["source_ids", "sourceIds"], ["receiver_ids", "receiverIds"], ["scenario_ids", "scenarioIds"],
      ] as const) {
        const list = ids(pick(a, field, ...aliases));
        if (list === null) return null;
        if (list && list.length) out[field] = list;
      }
      const keep = pick(a, "keep_events_for", "keepEventsFor");
      if (keep !== undefined) {
        const n = Number(keep);
        if (!HUGINN_KEEP_EVENTS_FOR.includes(n)) return null;
        out.keep_events_for = n;
      }
      const prop = pick(a, "propagate_immediately", "propagateImmediately");
      if (prop !== undefined) {
        const b = bool(prop);
        if (b === null) return null;
        out.propagate_immediately = b;
      }
      if (a.disabled !== undefined) {
        const b = bool(a.disabled);
        if (b === null) return null;
        out.disabled = b;
      }
      return out;
    }
    case "import_scenario": {
      let s: unknown = a.scenario;
      if (typeof s === "string") {
        try {
          s = JSON.parse(s);
        } catch {
          return null;
        }
      }
      const scenario = plainObject(s, HUGINN_LIMITS.maxScenarioChars);
      if (!scenario) return null;
      if (!oneLine(scenario.name, 200) || !Array.isArray(scenario.agents) || scenario.agents.length === 0) return null;
      for (const ag of scenario.agents as unknown[]) {
        const t = normalizeHuginnType((ag as { type?: unknown } | null)?.type);
        if (!t || HUGINN_BLOCKED_TYPES.has(t)) return null;
      }
      return { op: "import_scenario", scenario };
    }
    case "set_agent_enabled": {
      const agent_id = id(pick(a, "agent_id", "agentId", "id"));
      const enabled = bool(a.enabled);
      return agent_id && enabled !== null ? { op: "set_agent_enabled", agent_id, enabled } : null;
    }
    case "send_webhook_event": {
      const agent_id = id(pick(a, "agent_id", "agentId", "id"));
      const payload = plainObject(a.payload ?? {}, HUGINN_LIMITS.maxPayloadChars);
      return agent_id && payload ? { op: "send_webhook_event", agent_id, payload } : null;
    }
    case "connect_to_automatisch": {
      const source_agent_id = id(pick(a, "source_agent_id", "sourceAgentId", "agent_id", "agentId"));
      const flow_id = uuid(pick(a, "flow_id", "flowId"));
      if (!source_agent_id || !flow_id) return null;
      const name = oneLine(a.name, HUGINN_LIMITS.maxName);
      return { op: "connect_to_automatisch", source_agent_id, flow_id, ...(name ? { name } : {}) };
    }
    case "connect_from_automatisch": {
      const step_id = uuid(pick(a, "step_id", "stepId"));
      if (!step_id) return null;
      const w = pick(a, "webhook_agent_id", "webhookAgentId");
      const webhook_agent_id = w === undefined ? undefined : id(w);
      if (webhook_agent_id === null) return null;
      const name = oneLine(a.name, HUGINN_LIMITS.maxName);
      const data = typeof a.data === "string" ? a.data.slice(0, HUGINN_LIMITS.maxDataTemplateChars) : a.data && typeof a.data === "object" ? JSON.stringify(a.data).slice(0, HUGINN_LIMITS.maxDataTemplateChars) : "";
      return {
        op: "connect_from_automatisch", step_id,
        ...(webhook_agent_id ? { webhook_agent_id } : {}), ...(name ? { name } : {}), ...(data.trim() ? { data } : {}),
      };
    }
    default:
      return null;
  }
}

export const isHuginnWrite = (op: HuginnOp): boolean => HUGINN_WRITE_OPS.has(op.op);
export const isHuginnBridge = (op: HuginnOp): boolean => HUGINN_BRIDGE_OPS.has(op.op);

const shortType = (t: string) => t.replace(/^Agents::/, "");

/** Texto do cartão de permissão (o que vai acontecer no Huginn). */
export function describeHuginnOp(op: HuginnOp): string {
  switch (op.op) {
    case "status": return "Ver se o seu Vertal Agentes está no ar (fila de tarefas e eventos)";
    case "list_agents": return `Listar seus agentes do Vertal Agentes${op.scenario_id ? ` do cenário ${op.scenario_id}` : ""}${op.page ? ` (página ${op.page})` : ""}`;
    case "get_agent": return `Ler o agente ${op.agent_id} do Vertal Agentes e os eventos recentes dele`;
    case "list_events": return `Listar eventos${op.agent_id ? ` do agente ${op.agent_id}` : ""} do Vertal Agentes${op.page ? ` (página ${op.page})` : ""}`;
    case "list_scenarios": return "Listar seus cenários do Vertal Agentes";
    case "create_agent": return `Criar o agente "${op.name}" (${shortType(op.type)}) no Vertal Agentes${op.schedule && op.schedule !== "never" ? `, rodando ${op.schedule}` : ""}`;
    case "import_scenario": return `Importar o cenário "${String(op.scenario.name ?? "")}" (${Array.isArray(op.scenario.agents) ? op.scenario.agents.length : 0} agente(s)) no Vertal Agentes`;
    case "run_agent": return `RODAR agora o agente ${op.agent_id} do Vertal Agentes (executa de verdade)`;
    case "set_agent_enabled": return op.enabled ? `Ativar o agente ${op.agent_id} do Vertal Agentes` : `Desativar o agente ${op.agent_id} do Vertal Agentes`;
    case "send_webhook_event": return `Enviar um evento para o WebhookAgent ${op.agent_id} do Vertal Agentes`;
    case "connect_to_automatisch": return `LIGAR: quando o agente ${op.source_agent_id} do Vertal Agentes emitir um evento, chamar o fluxo ${op.flow_id.slice(0, 8)}… do Vertal Fluxos (cria um PostAgent no Vertal Agentes)`;
    case "connect_from_automatisch": return `LIGAR: o passo ${op.step_id.slice(0, 8)}… do Vertal Fluxos passa a mandar um evento para ${op.webhook_agent_id ? `o WebhookAgent ${op.webhook_agent_id}` : "um novo WebhookAgent"} do Vertal Agentes`;
  }
}

/** Mensagens das respostas (pt-BR), por código. */
export const HUGINN_ERROR_MESSAGES: Record<string, string> = {
  missing_secrets: "Faltam segredos do Vertal Agentes no Cofre (HUGINN_URL, HUGINN_USERNAME, HUGINN_PASSWORD).",
  bad_url: "HUGINN_URL no Cofre não é um endereço https válido (ex.: https://agentes.suaempresa.com.br).",
  url_not_allowed: "Esse endereço do Vertal Agentes não pode ser chamado (só endereços públicos em https).",
  auth_failed: "O Vertal Agentes recusou o login. Confira HUGINN_USERNAME e HUGINN_PASSWORD no Cofre.",
  csrf_missing: "O Vertal Agentes não devolveu o token de segurança (CSRF) da página. Confira se HUGINN_URL aponta para o Vertal Agentes.",
  forbidden: "O Vertal Agentes recusou a ação (permissão ou token de segurança).",
  not_found: "Não encontrado no Vertal Agentes (agente, evento ou cenário).",
  invalid: "O Vertal Agentes recusou os dados enviados.",
  not_webhook_agent: "Esse agente não é um WebhookAgent do Vertal Agentes (só ele recebe eventos por URL).",
  webhook_rejected: "O WebhookAgent recusou o evento (confira o verbo e o segredo do agente).",
  import_failed: "O Vertal Agentes não aceitou o cenário (precisa de name, guid e agents válidos).",
  flow_without_webhook: "O fluxo do Vertal Fluxos ainda não tem gatilho Webhook. Configure o gatilho com o app webhook → catchRawWebhook e teste o passo antes de ligar ao Vertal Agentes.",
  step_not_action: "O passo do Vertal Fluxos não é uma ação (use o id de um passo de ação, não do gatilho).",
  automatisch_failed: "O Vertal Fluxos não respondeu como esperado.",
  rate_limited: "Muitos pedidos ao Vertal Agentes em pouco tempo. Aguarde um minuto.",
  redirect_blocked: "O Vertal Agentes respondeu com um redirecionamento inesperado (não é seguido por segurança). Confira HUGINN_URL.",
  timeout: "O Vertal Agentes não respondeu a tempo.",
  network_error: "Não foi possível falar com o Vertal Agentes (rede).",
  bad_response: "O Vertal Agentes respondeu num formato inesperado.",
  huginn_error: "O Vertal Agentes não respondeu como esperado.",
  invalid_input: "Pedido inválido para o Vertal Agentes.",
  confirmation_required: "Esta chamada precisa da sua permissão.",
};

/** Classifica a resposta HTTP do Huginn. */
export function huginnErrorCode(status: number): string {
  if (status === 401) return "auth_failed";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "invalid";
  if (status === 429) return "rate_limited";
  if (status >= 300 && status < 400) return "redirect_blocked";
  return "huginn_error";
}

/**
 * Normaliza HUGINN_URL: só https, sem usuário/senha na URL, sem query nem
 * âncora; tira a barra final e um /users/sign_in ou /agents colado por engano.
 */
export function normalizeHuginnUrl(raw: unknown): string | null {
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
  path = path.replace(/\/(users\/sign_in|agents|scenarios|events)$/i, "").replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

// ─── HTTP (fetch injetado) ───────────────────────────────────────────────

export interface HuginnCreds {
  url: string;
  username: string;
  password: string;
}

export interface HuginnResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null; getSetCookie?: () => string[] };
  text: () => Promise<string>;
}

/** Subconjunto do fetch que o executor usa (o servidor injeta o fetch real com timeout e redirect: "manual"). */
export type HuginnFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<HuginnResponse>;

export class HuginnHttpError extends Error {
  constructor(public code: string, public status?: number, public detail?: string) {
    super(code);
  }
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);

/** Lê os Set-Cookie de uma resposta (Deno tem getSetCookie; fallback junta por vírgula). */
function setCookies(res: HuginnResponse): string[] {
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_.-]+=)/) : [];
}

/** <meta name="csrf-token" content="…"> ou <input name="authenticity_token" value="…">. */
export function extractCsrfToken(html: string): string | null {
  const meta = /<meta[^>]+name=["']csrf-token["'][^>]*>/i.exec(html)?.[0];
  const fromMeta = meta ? /content=["']([^"']+)["']/i.exec(meta)?.[1] : undefined;
  if (fromMeta) return decodeHtml(fromMeta);
  const input = /<input[^>]+name=["']authenticity_token["'][^>]*>/i.exec(html)?.[0];
  const fromInput = input ? /value=["']([^"']+)["']/i.exec(input)?.[1] : undefined;
  return fromInput ? decodeHtml(fromInput) : null;
}
const decodeHtml = (s: string) => s.replace(/&#x2F;/gi, "/").replace(/&#43;/g, "+").replace(/&#x3D;/gi, "=").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

const form = (fields: Record<string, string>) =>
  Object.entries(fields).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

/**
 * Sessão logada no Huginn, viva só dentro de uma requisição do servidor.
 * Guarda os cookies (o Rails renova o `_rails_session` a cada resposta) e o
 * token CSRF da sessão logada.
 */
export class HuginnSession {
  private cookies = new Map<string, string>();
  private csrf: string | null = null;
  constructor(private fetchFn: HuginnFetch, readonly base: string) {}

  /** Valores que nunca podem aparecer na resposta (cookie e token). */
  sensitive(): string[] {
    return [...this.cookies.values(), this.csrf ?? ""].filter((s) => s.length >= 8);
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private keepCookies(res: HuginnResponse) {
    for (const c of setCookies(res)) {
      const pair = c.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** Requisição crua no host do Huginn (com os cookies da sessão). */
  async raw(method: string, path: string, opts: { accept?: string; body?: string; contentType?: string; csrf?: boolean; cookies?: boolean } = {}): Promise<{ res: HuginnResponse; body: string }> {
    // O token CSRF vem antes do cookie: ler a página renova o cookie da sessão.
    if (opts.csrf && !this.csrf) await this.refreshCsrf();
    const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
    if (opts.cookies !== false && this.cookies.size) headers.Cookie = this.cookieHeader();
    if (opts.body !== undefined) headers["Content-Type"] = opts.contentType ?? "application/json";
    if (opts.csrf) headers["X-CSRF-Token"] = this.csrf!;
    let res: HuginnResponse;
    try {
      res = await this.fetchFn(`${this.base}${path}`, { method, headers, ...(opts.body !== undefined ? { body: opts.body } : {}) });
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      throw new HuginnHttpError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error");
    }
    if (opts.cookies !== false) this.keepCookies(res);
    const body = await res.text().catch(() => "");
    if (body.length > HUGINN_LIMITS.maxResponseBytes) throw new HuginnHttpError("bad_response", res.status);
    return { res, body };
  }

  /** Lê o token CSRF da sessão atual numa página HTML leve (a home). */
  async refreshCsrf(): Promise<void> {
    const { res, body } = await this.raw("GET", "/", { accept: "text/html" });
    if (res.status === 401) throw new HuginnHttpError("auth_failed", res.status);
    const t = extractCsrfToken(body);
    if (!t) throw new HuginnHttpError("csrf_missing", res.status);
    this.csrf = t;
  }

  async login(username: string, password: string): Promise<void> {
    const page = await this.raw("GET", "/users/sign_in", { accept: "text/html" });
    if (!page.res.ok) throw new HuginnHttpError(page.res.status >= 300 && page.res.status < 400 ? "redirect_blocked" : huginnErrorCode(page.res.status), page.res.status);
    const token = extractCsrfToken(page.body);
    if (!token) throw new HuginnHttpError("csrf_missing", page.res.status);
    const { res } = await this.raw("POST", "/users/sign_in", {
      accept: "text/html",
      contentType: "application/x-www-form-urlencoded",
      body: form({ authenticity_token: token, "user[login]": username, "user[password]": password, "user[remember_me]": "0" }),
    });
    const loc = res.headers.get("location") ?? "";
    // Sucesso = redirecionamento para fora do formulário de login. Senha errada
    // volta o formulário (200/401/422) ou redireciona de novo para /users/sign_in.
    if (!(res.status >= 300 && res.status < 400) || /\/users\/sign_in/.test(loc)) throw new HuginnHttpError("auth_failed", res.status);
    this.csrf = null; // o Devise troca o token CSRF ao logar
  }

  /** Chamada JSON numa rota do app. Escritas mandam X-CSRF-Token. */
  async json(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<unknown> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
    const qs = q.toString();
    const write = method !== "GET";
    const { res, body } = await this.raw(method, `${path}${qs ? `?${qs}` : ""}`, {
      csrf: write, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    let parsed: unknown = null;
    if (body) {
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      const code = res.status === 422 && !parsed ? "forbidden" : huginnErrorCode(res.status); // 422 em HTML = CSRF recusado
      throw new HuginnHttpError(code, res.status, validationDetail(parsed));
    }
    if (!body || res.status === 204) return null;
    if (parsed === null) throw new HuginnHttpError("bad_response", res.status);
    return parsed;
  }
}

/** Erros de validação do Rails ({campo:[msg]} ou {base:[msg]}) em uma linha curta. */
function validationDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const parts = Object.entries(body as Rec)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}: ${(v as unknown[]).map(String).join(", ")}`);
  return parts.length ? parts.join("; ").slice(0, 300) : undefined;
}

// ─── Formatação (só o que interessa; nada de segredo) ───────────────────

const SECRET_KEY_RE = /(secret|password|passwd|token|api[_-]?key|access[_-]?key|private|credential|authorization|auth_?header|cookie)/i;

/** Oculta, em qualquer profundidade, valores de chaves com nome de segredo. */
export function redactOptions(v: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (Array.isArray(v)) return v.map((x) => redactOptions(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Rec = {};
    for (const [k, x] of Object.entries(v as Rec)) out[k] = SECRET_KEY_RE.test(k) && x !== "" && x !== null ? "[oculto]" : redactOptions(x, depth + 1);
    return out;
  }
  return v;
}

/** Dados grandes: corta para caber no contexto do modelo. */
export function clipData(v: unknown, max: number = HUGINN_LIMITS.maxDataChars): unknown {
  if (v === undefined || v === null) return v;
  const s = JSON.stringify(v);
  if (s === undefined || s.length <= max) return v;
  return `${s.slice(0, max)}… (cortado)`;
}

function compact<T extends Rec>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || o[k] === "") delete o[k];
  return o;
}

export function agentView(a: Rec, withOptions = false): Rec {
  return compact({
    id: a.id, name: a.name, type: typeof a.type === "string" ? shortType(a.type) : undefined,
    enabled: a.disabled === true ? false : true,
    deactivated: a.deactivated === true ? true : undefined,
    schedule: a.schedule, events: a.events_count,
    lastCheckAt: a.last_check_at, lastEventAt: a.last_event_at, lastReceiveAt: a.last_receive_at,
    lastErrorAt: a.last_error_log_at,
    ...(withOptions ? { options: clipData(redactOptions(a.options), 1_000) } : {}),
  });
}

function eventView(e: Rec): Rec {
  return compact({ id: e.id, agentId: e.agent_id, createdAt: e.created_at, payload: clipData(e.payload, 700) });
}

function scenarioView(s: Rec): Rec {
  return compact({ id: s.id, name: s.name, description: typeof s.description === "string" ? s.description.slice(0, 200) : undefined, public: s.public === true ? true : undefined });
}

/** Troca qualquer ocorrência dos valores sensíveis por [segredo] em todo o objeto. */
export function scrubSecrets<T>(value: T, secrets: string[]): T {
  const list = secrets.filter((s) => typeof s === "string" && s.length >= 4);
  if (list.length === 0) return value;
  let s = JSON.stringify(value);
  if (s === undefined) return value;
  for (const secret of list) {
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      const enc = JSON.stringify(form).slice(1, -1);
      s = s.split(enc).join("[segredo]");
    }
  }
  return JSON.parse(s) as T;
}

/** URL do WebhookAgent (tem o segredo dentro: nunca vai para o chat). */
export function webhookUrl(base: string, userId: unknown, agentId: unknown, secret: string): string {
  return `${base}/users/${encodeURIComponent(String(userId))}/web_requests/${encodeURIComponent(String(agentId))}/${encodeURIComponent(secret)}`;
}

/** Versão para mostrar: o segredo vira [segredo]. */
export const maskedWebhookUrl = (base: string, userId: unknown, agentId: unknown) =>
  `${base}/users/${String(userId)}/web_requests/${String(agentId)}/[segredo]`;

/**
 * O JSON do Huginn não traz o tipo do agente (a coluna STI "type" fica de fora
 * do render json). Um WebhookAgent se reconhece pelas opções: "secret" em texto
 * e as chaves próprias dele (payload_path, verbs, event_headers_key, code, response).
 * Quando a heurística erra, o próprio Huginn recusa o POST (401/404).
 */
export function looksLikeWebhookAgent(agent: Rec): boolean {
  if (typeof agent.type === "string") return agent.type === "Agents::WebhookAgent";
  const o = rec(agent.options);
  return typeof o.secret === "string" && o.secret.length > 0 &&
    ["payload_path", "verbs", "event_headers_key", "code", "response", "score_threshold"].some((k) => k in o) &&
    !("post_url" in o) && !("url" in o);
}

/** Lê um agente cru (com opções) — uso interno do servidor, nunca devolvido assim. */
export async function readAgentRaw(s: HuginnSession, agentId: number): Promise<Rec> {
  return rec(await s.json("GET", `/agents/${agentId}.json`));
}

/** Corpo de criação de agente no formato do formulário do Huginn (options vai como JSON em texto). */
export function agentCreateBody(op: Extract<HuginnOp, { op: "create_agent" }>): Rec {
  return {
    agent: compact({
      type: op.type, name: op.name, options: JSON.stringify(op.options),
      schedule: op.schedule, keep_events_for: op.keep_events_for,
      propagate_immediately: op.propagate_immediately, disabled: op.disabled,
      source_ids: op.source_ids, receiver_ids: op.receiver_ids, scenario_ids: op.scenario_ids,
    } as Rec),
  };
}

export async function createAgent(s: HuginnSession, op: Extract<HuginnOp, { op: "create_agent" }>): Promise<Rec> {
  return rec(await s.json("POST", "/agents.json", { body: agentCreateBody(op) }));
}

/** Resumo em texto para o agente (DADOS) e para o usuário. */
export function summarizeHuginnResult(op: HuginnOp, data: unknown): string {
  const d = rec(data);
  let head: string;
  switch (op.op) {
    case "status": head = `Vertal Agentes no ar. Fila: ${String(d.pending ?? 0)} pendente(s), ${String(d.recent_failures ?? 0)} falha(s) recente(s).`; break;
    case "list_agents": head = arr(d.agents).length ? `${arr(d.agents).length} agente(s) do Vertal Agentes (página ${String(d.page ?? 1)}):` : "Nenhum agente nessa página do Vertal Agentes."; break;
    case "get_agent": head = `Agente "${String(rec(d.agent).name ?? "")}" (${rec(d.agent).type ? `${String(rec(d.agent).type)}, ` : ""}${rec(d.agent).enabled === false ? "desativado" : "ativo"}):`; break;
    case "list_events": head = arr(d.events).length ? `${arr(d.events).length} evento(s):` : "Nenhum evento encontrado."; break;
    case "list_scenarios": head = arr(d.scenarios).length ? `${arr(d.scenarios).length} cenário(s):` : "Nenhum cenário no Vertal Agentes."; break;
    case "create_agent": head = `Agente criado no Vertal Agentes: "${String(rec(d.agent).name ?? "")}" (id ${String(rec(d.agent).id ?? "?")}).`; break;
    case "import_scenario": head = `Cenário importado no Vertal Agentes${d.scenario_id ? ` (id ${String(d.scenario_id)})` : ""}.`; break;
    case "run_agent": head = `Execução do agente ${op.agent_id} enfileirada no Vertal Agentes (roda em segundos; veja os eventos com get_agent).`; break;
    case "set_agent_enabled": head = op.enabled ? `Agente ${op.agent_id} ativado.` : `Agente ${op.agent_id} desativado.`; break;
    case "send_webhook_event": head = `Evento entregue ao WebhookAgent ${op.agent_id} (HTTP ${String(d.http_status ?? "?")}).`; break;
    case "connect_to_automatisch": head = `Ligado: eventos do agente ${op.source_agent_id} do Vertal Agentes vão para o fluxo do Vertal Fluxos.`; break;
    case "connect_from_automatisch": head = "Ligado: o passo do Vertal Fluxos vai mandar um evento para o Vertal Agentes.";
  }
  // O endereço da instância fica fora do texto que vai ao modelo (marca branca).
  return `${head}\n${JSON.stringify(data, (k, v) => (k === "instance_url" ? undefined : v))}`.slice(0, HUGINN_LIMITS.maxSummaryChars);
}

/** Faz a(s) chamada(s) de uma operação comum (não ponte), já logado. */
async function perform(op: HuginnOp, s: HuginnSession): Promise<unknown> {
  switch (op.op) {
    case "status": {
      const st = rec(await s.json("GET", "/worker_status"));
      return compact({ instance_url: s.base, pending: st.pending, awaiting_retry: st.awaiting_retry, recent_failures: st.recent_failures, event_count: st.event_count });
    }
    case "list_agents": {
      const items = arr(await s.json("GET", "/agents.json", { query: { page: op.page, scenario_id: op.scenario_id } }));
      return { agents: items.map((a) => agentView(a)), page: op.page ?? 1, instance_url: s.base };
    }
    case "get_agent": {
      const agent = await readAgentRaw(s, op.agent_id);
      const events = arr(await s.json("GET", `/agents/${op.agent_id}/events.json`)).slice(0, HUGINN_LIMITS.recentEvents);
      return { agent: agentView(agent, true), recent_events: events.map(eventView) };
    }
    case "list_events": {
      const path = op.agent_id ? `/agents/${op.agent_id}/events.json` : "/events.json";
      const items = arr(await s.json("GET", path, { query: { page: op.page } }));
      return { events: items.slice(0, 25).map(eventView), page: op.page ?? 1 };
    }
    case "list_scenarios": {
      const items = arr(await s.json("GET", "/scenarios.json", { query: { page: op.page } }));
      return { scenarios: items.map(scenarioView) };
    }
    case "create_agent":
      return { agent: { ...agentView(await createAgent(s, op), true), type: shortType(op.type) } };
    case "import_scenario": {
      const scenario = normalizeScenario(op.scenario);
      const { res } = await s.raw("POST", "/scenarios/scenario_imports", {
        accept: "text/html", csrf: true, contentType: "application/x-www-form-urlencoded",
        body: form({ "scenario_import[data]": JSON.stringify(scenario), "scenario_import[do_import]": "1" }),
      });
      const loc = res.headers.get("location") ?? "";
      const m = /\/scenarios\/(\d+)(?:[/?#]|$)/.exec(loc);
      if (res.status >= 300 && res.status < 400 && m) return { scenario_id: Number(m[1]), name: scenario.name };
      if (res.status === 401) throw new HuginnHttpError("auth_failed", res.status);
      throw new HuginnHttpError(res.status === 422 ? "forbidden" : "import_failed", res.status);
    }
    case "run_agent":
      await s.json("POST", `/agents/${op.agent_id}/run.json`);
      return { agent_id: op.agent_id, queued: true };
    case "set_agent_enabled": {
      const updated = rec(await s.json("PUT", `/agents/${op.agent_id}.json`, { body: { agent: { disabled: !op.enabled } } }));
      return { agent: agentView(updated) };
    }
    case "send_webhook_event": {
      const agent = await readAgentRaw(s, op.agent_id);
      if (!looksLikeWebhookAgent(agent)) throw new HuginnHttpError("not_webhook_agent");
      const opts = rec(agent.options);
      const secret = typeof opts.secret === "string" ? opts.secret : "";
      if (!secret) throw new HuginnHttpError("not_webhook_agent");
      const verbs = String(opts.verbs ?? "post").toLowerCase();
      const method = verbs.includes("post") ? "POST" : verbs.includes("put") ? "PUT" : "GET";
      const url = webhookUrl("", agent.user_id, agent.id, secret);
      const { res, body } = await s.raw(method, method === "GET" ? `${url}?${new URLSearchParams(Object.entries(op.payload).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString()}` : url, {
        cookies: false, ...(method === "GET" ? {} : { body: JSON.stringify(op.payload) }),
      });
      if (!res.ok) throw new HuginnHttpError(res.status === 401 ? "webhook_rejected" : huginnErrorCode(res.status), res.status);
      return { http_status: res.status, response: clipData(body.slice(0, 500), 300) };
    }
    case "connect_to_automatisch":
    case "connect_from_automatisch":
      throw new HuginnHttpError("invalid_input"); // tratadas em huginnBridge.ts
  }
}

/**
 * Completa um cenário no formato de exportação do Huginn: o importador
 * (app/importers/scenario_import.rb) exige guid no cenário e, em cada agente,
 * guid e disabled (sem eles dá erro 500). schema_version 1 = keep_events_for em segundos.
 */
export function normalizeScenario(input: Record<string, unknown>): Record<string, unknown> {
  const agents = (Array.isArray(input.agents) ? input.agents : []).map((raw) => {
    const a = { ...rec(raw) };
    a.type = normalizeHuginnType(a.type) ?? a.type;
    if (!a.guid) a.guid = randomHex(16);
    if (typeof a.disabled !== "boolean") a.disabled = bool(a.disabled) ?? false;
    if (!a.options || typeof a.options !== "object") a.options = {};
    if (!a.name) a.name = String(a.type ?? "Agente").replace(/^Agents::/, "");
    return a;
  });
  return {
    schema_version: 1,
    ...input,
    guid: input.guid || randomHex(16),
    links: Array.isArray(input.links) ? input.links : [],
    control_links: Array.isArray(input.control_links) ? input.control_links : [],
    agents,
  };
}

export function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type HuginnResult =
  | { ok: true; op: HuginnOpName; data: unknown; summary: string }
  | { ok: false; op: HuginnOpName; code: string; message: string; status?: number; detail?: string };

/** Converte qualquer erro em resultado (com detalhe já sem segredos). */
export function huginnFailure(op: HuginnOp, e: unknown, secrets: string[]): HuginnResult {
  const err = e instanceof HuginnHttpError ? e : new HuginnHttpError("huginn_error");
  const detail = err.detail ? scrubSecrets(err.detail, secrets) : undefined;
  return {
    ok: false, op: op.op, code: err.code,
    message: `${HUGINN_ERROR_MESSAGES[err.code] ?? HUGINN_ERROR_MESSAGES.huginn_error}${detail ? ` (${detail})` : ""}`,
    ...(err.status ? { status: err.status } : {}),
    ...(detail ? { detail } : {}),
  };
}

/** Abre uma sessão logada (lança HuginnHttpError). */
export async function openHuginnSession(creds: HuginnCreds, fetchFn: HuginnFetch): Promise<HuginnSession> {
  const base = normalizeHuginnUrl(creds.url);
  if (!base) throw new HuginnHttpError("bad_url");
  const s = new HuginnSession(fetchFn, base);
  await s.login(creds.username, creds.password);
  return s;
}

/**
 * Executa uma operação comum: login → chamada(s). Nunca lança. O resultado
 * nunca contém a senha, o usuário, o cookie nem o token CSRF.
 */
export async function runHuginnOp(op: HuginnOp, creds: HuginnCreds, deps: { fetch: HuginnFetch }): Promise<HuginnResult> {
  if (isHuginnBridge(op)) return { ok: false, op: op.op, code: "invalid_input", message: HUGINN_ERROR_MESSAGES.invalid_input };
  if (!normalizeHuginnUrl(creds.url)) return { ok: false, op: op.op, code: "bad_url", message: HUGINN_ERROR_MESSAGES.bad_url };
  let session: HuginnSession | undefined;
  const secrets = () => [creds.password, creds.username, ...(session?.sensitive() ?? [])];
  try {
    session = await openHuginnSession(creds, deps.fetch);
    const data = scrubSecrets(await perform(op, session), secrets());
    return { ok: true, op: op.op, data, summary: summarizeHuginnResult(op, data) };
  } catch (e) {
    return huginnFailure(op, e, secrets());
  }
}

// ─── Quando ligar a ferramenta no prompt ─────────────────────────────────

const HUGINN_HINTS = /\b(huginn|vertal\s+agentes|webhook\s*agent|post\s*agent|website\s*agent)\b/i;

/** A conversa recente fala de Huginn? (liga a ferramenta huginn no prompt) */
export function wantsHuginn(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 8): boolean {
  return recent.slice(-lookback).some((m) => {
    if (typeof m === "string") return HUGINN_HINTS.test(m);
    if (m && typeof m === "object") {
      if (m.tool === "huginn") return true;
      return HUGINN_HINTS.test(String(m.content ?? "")) || HUGINN_HINTS.test(String(m.summary ?? ""));
    }
    return false;
  });
}
