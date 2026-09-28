// Servidor MCP próprio do Vertal Vibe Dev (sem dependência do Lovable).
//
// Transporte: MCP "Streamable HTTP" sem estado, respondendo JSON (sem SSE).
// Autenticação: Bearer = access token do Supabase Auth, emitido pelo OAuth
// Server do Supabase (o cliente MCP descobre o servidor de autorização em
// /.well-known/oauth-protected-resource). Toda ferramenta roda como o
// usuário logado, com RLS.
// deno-lint-ignore-file no-explicit-any

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "vertal-vibe-dev", title: "Vertal Vibe Dev", version: "1.0.0" };
export const INSTRUCTIONS =
  "Ferramentas do Vertal Vibe Dev, plataforma de IA para criar apps web e Web3. " +
  "Use list_projects e get_project para ver os projetos do usuário, create_project para criar um, " +
  "list_agent_jobs para acompanhar execuções dos agentes e credit_summary para saldo e uso de créditos. " +
  "Todas as ferramentas agem como o usuário logado.";

type Db = { from: (table: string) => any };

export interface ToolContext {
  db: Db;
  userId: string;
}

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Record<string, any>, ctx: ToolContext) => Promise<unknown>;
}

const PROJECT_COLUMNS = "id,title,description,is_published,published_url,created_at,updated_at";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ToolInputError extends Error {}

function intArg(v: unknown, def: number, min: number, max: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new ToolInputError(`valor inteiro entre ${min} e ${max} esperado`);
  }
  return v;
}

function strArg(v: unknown, name: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (opts.required) throw new ToolInputError(`${name} é obrigatório`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolInputError(`${name} deve ser texto`);
  const t = v.trim();
  if (opts.required && !t) throw new ToolInputError(`${name} é obrigatório`);
  if (opts.max && t.length > opts.max) throw new ToolInputError(`${name} passa de ${opts.max} caracteres`);
  return t || undefined;
}

async function rows(query: any) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_projects",
    title: "Listar projetos",
    description: "Lista os projetos do usuário logado, do mais recente para o mais antigo.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "Quantos projetos retornar." },
        publishedOnly: { type: "boolean", default: false, description: "Só projetos publicados." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db }) => {
      let q = db.from("projects").select(PROJECT_COLUMNS).order("updated_at", { ascending: false })
        .limit(intArg(args.limit, 10, 1, 50));
      if (args.publishedOnly === true) q = q.eq("is_published", true);
      return { projects: (await rows(q)) ?? [] };
    },
  },
  {
    name: "get_project",
    title: "Ver projeto",
    description: "Busca um projeto do usuário pelo id, com o código gerado se pedido.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid", description: "Id do projeto." },
        includeCode: { type: "boolean", default: false, description: "Incluir o código gerado." },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db }) => {
      const id = strArg(args.projectId, "projectId", { required: true })!;
      if (!UUID_RE.test(id)) throw new ToolInputError("projectId deve ser um UUID");
      const cols = args.includeCode === true ? `${PROJECT_COLUMNS},generated_code` : PROJECT_COLUMNS;
      const project = await rows(db.from("projects").select(cols).eq("id", id).maybeSingle());
      if (!project) throw new ToolInputError("Projeto não encontrado");
      return { project };
    },
  },
  {
    name: "create_project",
    title: "Criar projeto",
    description: "Cria um novo projeto para o usuário logado.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120, description: "Título do projeto." },
        description: { type: "string", maxLength: 500, description: "Descrição curta (opcional)." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const title = strArg(args.title, "title", { required: true, max: 120 })!;
      const description = strArg(args.description, "description", { max: 500 }) ?? null;
      const project = await rows(
        db.from("projects").insert({ user_id: userId, title, description }).select("id,title,description,created_at")
          .maybeSingle(),
      );
      return { project };
    },
  },
  {
    name: "list_agent_jobs",
    title: "Listar execuções de agentes",
    description: "Execuções recentes dos agentes de IA do usuário, com status, créditos e erros.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        status: { type: "string", description: "Filtrar por status: pending, running, completed, failed." },
        agentSlug: { type: "string", description: "Filtrar pelo agente." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db }) => {
      let q = db.from("agent_jobs")
        .select("id,agent_slug,status,credits_charged,duration_ms,error_message,created_at,completed_at")
        .order("created_at", { ascending: false }).limit(intArg(args.limit, 10, 1, 50));
      const status = strArg(args.status, "status", { max: 40 });
      const agent = strArg(args.agentSlug, "agentSlug", { max: 80 });
      if (status) q = q.eq("status", status);
      if (agent) q = q.eq("agent_slug", agent);
      return { jobs: (await rows(q)) ?? [] };
    },
  },
  {
    name: "credit_summary",
    title: "Resumo de créditos",
    description: "Saldo de créditos do usuário e as transações mais recentes.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db }) => {
      const transactions = (await rows(
        db.from("credit_transactions").select("id,delta,balance_after,category,reason,created_at")
          .order("created_at", { ascending: false }).limit(intArg(args.limit, 10, 1, 50)),
      )) ?? [];
      return { balance: transactions[0]?.balance_after ?? null, transactions };
    },
  },
];

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

const err = (id: JsonRpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});
const ok = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });

/** Responde uma mensagem JSON-RPC. Notificações (sem id) devolvem null. */
export async function handleMessage(msg: JsonRpcRequest, ctx: ToolContext): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return err(msg?.id, -32600, "Invalid Request");
  }
  const isNotification = msg.id === undefined;
  if (isNotification) return null;

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return ok(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name, title, description, inputSchema, annotations,
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return err(msg.id, -32602, `Ferramenta desconhecida: ${msg.params?.name}`);
      const args = msg.params?.arguments ?? {};
      if (typeof args !== "object" || Array.isArray(args)) return err(msg.id, -32602, "arguments deve ser um objeto");
      try {
        const result = await tool.run(args, ctx);
        return ok(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (e) {
        // Erro da ferramenta vai no resultado (isError), como pede o protocolo.
        const message = e instanceof Error ? e.message : "erro interno";
        return ok(msg.id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return err(msg.id, -32601, `Método não suportado: ${msg.method}`);
  }
}
