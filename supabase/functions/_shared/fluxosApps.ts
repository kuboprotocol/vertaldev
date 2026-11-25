// Vertal Fluxos: conectar os apps do catálogo por usuário e rodar as ações deles
// pelo Vertal Chat. Tudo passa pelo servidor (creative-router):
//   - o motor do Vertal Fluxos guarda as credenciais (criptografadas) e fala com o provedor;
//   - a tabela fluxos_connections diz qual conexão é de qual usuário do Vertal Dev;
//   - client id/secret dos provedores OAuth vêm dos segredos FLUXOS_OAUTH_<APP>_ID/_SECRET.
// Nada de segredo volta para o navegador.

export const FLUXOS_ACTION_COST = 2;
export const FLUXOS_OAUTH_REDIRECT_BASE = "https://vertal.dev/fluxos/oauth/";
/** Conexão OAuth começada há mais que isso não pode ser concluída (evita retorno antigo/forjado). */
export const FLUXOS_PENDING_TTL_MS = 20 * 60 * 1000;

export type FluxosOp =
  | { op: "status" }
  | { op: "describe"; app: string }
  | { op: "start"; app: string; fields?: Record<string, string> }
  | { op: "complete"; app: string; params: Record<string, string> }
  | { op: "disconnect"; app: string }
  | { op: "run"; app: string; kind: "action" | "trigger"; key: string; parameters: Record<string, unknown>; chatCharge?: string }
  | { op: "options"; app: string; key: string; parameters: Record<string, unknown> };

const APP_RE = /^[a-z0-9-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
const CHARGE_RE = /^[0-9a-f-]{36}$/i;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function plainRecord(v: unknown, maxKeys: number, maxLen: number): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, maxKeys)) {
    if (!KEY_RE.test(k)) continue;
    if (typeof val === "string") out[k] = val.slice(0, maxLen);
    else if (typeof val === "number" || typeof val === "boolean") out[k] = String(val);
  }
  return out;
}

function jsonParams(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const text = JSON.stringify(v);
  if (text.length > 20_000) return {};
  return v as Record<string, unknown>;
}

export function parseFluxosOp(raw: unknown): FluxosOp | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const app = str(a.app, 64).replace(/^fluxos-/, "");
  const needApp = () => APP_RE.test(app);
  switch (a.op) {
    case "status":
      return { op: "status" };
    case "describe":
      return needApp() ? { op: "describe", app } : null;
    case "start": {
      if (!needApp()) return null;
      const fields = a.fields === undefined ? undefined : plainRecord(a.fields, 20, 4000);
      if (a.fields !== undefined && !fields) return null;
      return { op: "start", app, ...(fields ? { fields } : {}) };
    }
    case "complete": {
      const params = plainRecord(a.params, 30, 4000);
      return needApp() && params ? { op: "complete", app, params } : null;
    }
    case "disconnect":
      return needApp() ? { op: "disconnect", app } : null;
    case "run": {
      const kind = a.kind === "trigger" || a.kind === "search" ? "trigger" : "action";
      const key = str(a.key ?? a.action ?? a.search, 80);
      const chatCharge = str(a.chatCharge, 36);
      if (!needApp() || !KEY_RE.test(key)) return null;
      if (chatCharge && !CHARGE_RE.test(chatCharge)) return null;
      return { op: "run", app, kind, key, parameters: jsonParams(a.parameters), ...(chatCharge ? { chatCharge } : {}) };
    }
    case "options": {
      const key = str(a.key, 80);
      return needApp() && KEY_RE.test(key) ? { op: "options", app, key, parameters: jsonParams(a.parameters) } : null;
    }
    default:
      return null;
  }
}

/** Facebook, Instagram, WhatsApp e Meta Ads usam um app só da Meta ("Vertal Dev"). */
export const META_APPS = new Set(["facebook", "instagram", "whatsapp", "meta-ads"]);

/** Nome do grupo de segredos OAuth do app (apps Google usam um cliente só). */
export function oauthSecretGroup(app: string): string {
  if (app === "gmail" || app === "youtube" || app.startsWith("google-")) return "GOOGLE";
  if (META_APPS.has(app)) return "META";
  // Outlook, Microsoft 365 (OneDrive e To Do) e Teams usam um app só do Microsoft Entra ("Vertal Dev").
  if (app.startsWith("microsoft-")) return "MICROSOFT";
  return app.toUpperCase().replace(/-/g, "_");
}

/** Campos de cliente OAuth de cada app no motor (id, secret). */
export function oauthClientFields(app: string): { id: string; secret?: string } {
  switch (app) {
    case "github":
    case "slack":
    case "twitter":
    case "salesforce":
    case "flickr":
    case "frappe":
    case "discord":
      return { id: "consumerKey", secret: "consumerSecret" };
    case "trello":
      return { id: "apiKey" };
    case "disqus":
      return { id: "apiKey", secret: "apiSecret" };
    default:
      return { id: "clientId", secret: "clientSecret" };
  }
}

/**
 * Credenciais do cliente OAuth do Vertal para o app (segredos FLUXOS_OAUTH_*),
 * já com os nomes de campo do motor. null quando o Vertal não tem cliente registrado.
 */
export function platformOAuthData(app: string, env: (k: string) => string | undefined): Record<string, string> | null {
  if (app === "ebay") return ebayOAuthData(env);
  const g = oauthSecretGroup(app);
  const id = env(`FLUXOS_OAUTH_${g}_ID`);
  const secret = env(`FLUXOS_OAUTH_${g}_SECRET`);
  const f = oauthClientFields(app);
  if (!id || (f.secret && !secret)) return null;
  const out: Record<string, string> = { [f.id]: id };
  if (f.secret && secret) out[f.secret] = secret;
  if (app === "discord") {
    const bot = env("FLUXOS_OAUTH_DISCORD_BOT");
    if (!bot) return null;
    out.botToken = bot;
  }
  if (app === "google-ads") {
    // Opcional: o Google aposentou o developer token (09/09/2026); o acesso segue o projeto do cliente OAuth.
    const devToken = env("FLUXOS_OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN");
    if (devToken) out.developerToken = devToken;
    const login = env("FLUXOS_OAUTH_GOOGLE_ADS_LOGIN_CUSTOMER_ID");
    if (login) out.loginCustomerId = login;
  }
  if (META_APPS.has(app)) {
    // Facebook Login for Business: configuração por conector (opcional).
    const config = env(`FLUXOS_OAUTH_${app.toUpperCase().replace(/-/g, "_")}_CONFIG`);
    if (config) out.configId = config;
  }
  return out;
}

/**
 * eBay: o retorno do OAuth é o RuName (não a URL). Produção quando há
 * FLUXOS_OAUTH_EBAY_ID/_SECRET/_RUNAME; senão sandbox (FLUXOS_OAUTH_EBAY_SANDBOX_*).
 */
export function ebayOAuthData(env: (k: string) => string | undefined): Record<string, string> | null {
  for (const [prefix, environment] of [["FLUXOS_OAUTH_EBAY", "production"], ["FLUXOS_OAUTH_EBAY_SANDBOX", "sandbox"]] as const) {
    const clientId = env(`${prefix}_ID`);
    const clientSecret = env(`${prefix}_SECRET`);
    const ruName = env(`${prefix}_RUNAME`);
    if (clientId && clientSecret && ruName) return { clientId, clientSecret, ruName, environment };
  }
  return null;
}

export interface FluxosArg {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  description?: string;
  options?: Array<{ label?: string; value?: unknown }>;
  dynamicData?: string;
  fields?: FluxosArg[];
}

export interface FluxosAppDef {
  key: string;
  name: string;
  supportsConnections: boolean;
  oauth: boolean;
  authFields: Array<{ key: string; label?: string; type?: string; required?: boolean; description?: string; placeholder?: string; value?: unknown; options?: unknown }>;
  actions: Array<{ key: string; name: string; description?: string; arguments: FluxosArg[] }>;
  searches: Array<{ key: string; name: string; description?: string; arguments: FluxosArg[] }>;
}

/** Campos que o usuário precisa preencher, tirando os que o Vertal já fornece (cliente OAuth). */
export function userAuthFields(def: FluxosAppDef, platform: Record<string, string> | null) {
  const provided = new Set(Object.keys(platform ?? {}));
  return def.authFields.filter((f) => !provided.has(f.key));
}

/** Texto curto (DADOS) com ações e buscas de um app para o agente. */
export function describeForAgent(def: FluxosAppDef): string {
  const arg = (a: FluxosArg) => {
    const extra = [
      a.required ? "obrigatório" : "",
      a.dynamicData ? `opções: options key=${a.dynamicData}` : "",
      a.options?.length ? `valores: ${a.options.slice(0, 8).map((o) => String(o.value)).join("|")}` : "",
    ].filter(Boolean).join(", ");
    return `${a.key}${extra ? ` (${extra})` : ""}`;
  };
  const lines = [`${def.name} (app=${def.key})`];
  for (const a of def.actions) lines.push(`- ação ${a.key}: ${a.name}. Campos: ${a.arguments.map(arg).join("; ") || "nenhum"}`);
  for (const s of def.searches) lines.push(`- busca ${s.key}: ${s.name}. Campos: ${s.arguments.map(arg).join("; ") || "nenhum"}`);
  return lines.join("\n").slice(0, 6000);
}

/** Tira o nome do motor de mensagens que vão para o usuário (white-label). */
export function whiteLabel(text: string): string {
  return text.replace(/automatisch/gi, "Vertal Fluxos").replace(/huginn/gi, "Vertal Agentes");
}

/** Resultado de ação/busca enxuto para o chat (DADOS). */
export function compactResult(data: unknown, max = 6000): string {
  let text: string;
  try {
    text = JSON.stringify(data);
  } catch {
    text = String(data);
  }
  if (!text) return "(sem dados)";
  return whiteLabel(text.length > max ? `${text.slice(0, max)}… (cortado)` : text);
}

export interface FluxosEngine {
  call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; data: any }>;
}

export function makeEngine(baseUrl: string, key: string, fetchImpl: typeof fetch = fetch): FluxosEngine {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async call(method, path, body) {
      const res = await fetchImpl(`${base}/internal/vertal${path}`, {
        method,
        headers: { "Content-Type": "application/json", "x-vertal-internal-key": key },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(55_000),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { error: "bad_response" };
      }
      return { status: res.status, data };
    },
  };
}
