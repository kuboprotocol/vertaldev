// Servidor MCP próprio do Vertal Vibe Dev (sem dependência do Lovable).
//
// Transporte: MCP "Streamable HTTP" sem estado, respondendo JSON (sem SSE).
// Autenticação (index.ts):
//   - Bearer vtl_mcp_… = chave de acesso gerada em /mcp, com escopos read/write.
//   - Bearer <JWT> = access token do Supabase Auth (OAuth do cliente MCP), com acesso total.
// Cada ferramenta declara o escopo que exige. Ferramentas fora do escopo da
// chave nem aparecem em tools/list e são recusadas em tools/call.
// Todas as consultas filtram pelo usuário dono da chave/sessão.
// deno-lint-ignore-file no-explicit-any
import {
  checkDesignBase64, designStoragePath, designTitleFromFileName, isFigcraftTemplate,
} from "../_shared/figcraft.ts";
import { FIGCRAFT_TEMPLATE_BYTES_B64 } from "../_shared/figcraftTemplates.generated.ts";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "vertal-vibe-dev", title: "Vertal Vibe Dev", version: "1.1.0" };
export const INSTRUCTIONS =
  "Ferramentas do Vertal Vibe Dev, plataforma de IA para criar apps web e Web3. " +
  "Use list_projects e get_project para ver os projetos do usuário, create_project para criar um " +
  "e update_project para mudar título ou descrição (exige acesso de escrita), " +
  "list_agent_jobs para acompanhar execuções dos agentes e credit_summary para saldo e uso de créditos. " +
  "Para o figCraft (editor de telas e protótipos): list_design_files, get_design_file, create_design_file " +
  "(com template ou base64) e update_design_file. Os designs aparecem no Painel Criativo e no Vertal Chat. " +
  "Todas as ferramentas agem como o usuário dono da chave.";

export type Scope = "read" | "write";

type Db = { from: (table: string) => any; storage?: { from: (bucket: string) => any } };

/** Bucket do storage. Um banco sem storage (testes) falha com mensagem clara. */
function bucket(db: Db, name: string): any {
  if (!db.storage) throw new Error("storage indisponível");
  return db.storage.from(name);
}

export interface ToolContext {
  db: Db;
  userId: string;
  scopes: readonly Scope[];
}

interface ToolDef {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Record<string, any>, ctx: ToolContext) => Promise<unknown>;
}

const PROJECT_COLUMNS = "id,title,description,is_published,published_url,created_at,updated_at";
const DESIGN_COLUMNS = "id,title,engine,size_bytes,created_at,updated_at";
const DESIGN_BUCKET = "design-files";
/** Link temporário para baixar o arquivo de um design. */
const DESIGN_LINK_SECONDS = 900;
/** Base64 de um arquivo, em caracteres: o corpo de uma chamada MCP não passa de alguns MB. */
const DESIGN_BASE64_MAX_CHARS = 6_000_000;

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

function uuidArg(v: unknown, name: string): string {
  const id = strArg(v, name, { required: true })!;
  if (!UUID_RE.test(id)) throw new ToolInputError(`${name} deve ser um UUID`);
  return id;
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
    description: "Lista os projetos do usuário dono da chave, do mais recente para o mais antigo.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "Quantos projetos retornar." },
        publishedOnly: { type: "boolean", default: false, description: "Só projetos publicados." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      let q = db.from("projects").select(PROJECT_COLUMNS).eq("user_id", userId)
        .order("updated_at", { ascending: false }).limit(intArg(args.limit, 10, 1, 50));
      if (args.publishedOnly === true) q = q.eq("is_published", true);
      return { projects: (await rows(q)) ?? [] };
    },
  },
  {
    name: "get_project",
    title: "Ver projeto",
    description: "Busca um projeto do usuário pelo id, com o código gerado se pedido.",
    scope: "read",
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
    run: async (args, { db, userId }) => {
      const id = uuidArg(args.projectId, "projectId");
      const cols = args.includeCode === true ? `${PROJECT_COLUMNS},generated_code` : PROJECT_COLUMNS;
      const project = await rows(db.from("projects").select(cols).eq("id", id).eq("user_id", userId).maybeSingle());
      if (!project) throw new ToolInputError("Projeto não encontrado");
      return { project };
    },
  },
  {
    name: "create_project",
    title: "Criar projeto",
    description: "Cria um novo projeto para o usuário dono da chave.",
    scope: "write",
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
    name: "update_project",
    title: "Editar projeto",
    description:
      "Altera o título e/ou a descrição de um projeto do usuário. Não altera o código gerado nem a publicação.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", format: "uuid", description: "Id do projeto." },
        title: { type: "string", minLength: 1, maxLength: 120, description: "Novo título (opcional)." },
        description: { type: "string", maxLength: 500, description: "Nova descrição (opcional)." },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const id = uuidArg(args.projectId, "projectId");
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = strArg(args.title, "title", { required: true, max: 120 });
      if (args.description !== undefined) patch.description = strArg(args.description, "description", { max: 500 }) ?? null;
      if (Object.keys(patch).length === 0) throw new ToolInputError("Informe title ou description");
      patch.updated_at = new Date().toISOString();
      const project = await rows(
        db.from("projects").update(patch).eq("id", id).eq("user_id", userId).select("id,title,description,updated_at")
          .maybeSingle(),
      );
      if (!project) throw new ToolInputError("Projeto não encontrado");
      return { project };
    },
  },
  {
    name: "list_agent_jobs",
    title: "Listar execuções de agentes",
    description: "Execuções recentes dos agentes de IA do usuário, com status, créditos e erros.",
    scope: "read",
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
    run: async (args, { db, userId }) => {
      let q = db.from("agent_jobs")
        .select("id,agent_slug,status,credits_charged,duration_ms,error_message,created_at,completed_at")
        .eq("user_id", userId)
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
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const transactions = (await rows(
        db.from("credit_transactions").select("id,delta,balance_after,category,reason,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(intArg(args.limit, 10, 1, 50)),
      )) ?? [];
      return { balance: transactions[0]?.balance_after ?? null, transactions };
    },
  },
  {
    name: "list_design_files",
    title: "Listar designs do figCraft",
    description: "Lista os designs do figCraft salvos na conta do usuário, do mais recente para o mais antigo.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "Quantos designs retornar." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const q = db.from("design_files").select(DESIGN_COLUMNS).eq("user_id", userId)
        .order("updated_at", { ascending: false }).limit(intArg(args.limit, 10, 1, 50));
      return { designs: (await rows(q)) ?? [] };
    },
  },
  {
    name: "get_design_file",
    title: "Ver design do figCraft",
    description:
      "Busca um design do figCraft do usuário pelo id e devolve um link temporário (15 minutos) para baixar o arquivo .figcraft.",
    scope: "read",
    inputSchema: {
      type: "object",
      properties: { designId: { type: "string", format: "uuid", description: "Id do design." } },
      required: ["designId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const id = uuidArg(args.designId, "designId");
      const design = await rows(
        db.from("design_files").select(`${DESIGN_COLUMNS},file_path`).eq("id", id).eq("user_id", userId).maybeSingle(),
      );
      if (!design) throw new ToolInputError("Design não encontrado");
      const { file_path, ...meta } = design;
      const { data, error } = await bucket(db, DESIGN_BUCKET).createSignedUrl(file_path, DESIGN_LINK_SECONDS);
      if (error || !data?.signedUrl) throw new Error("Não foi possível gerar o link do arquivo");
      return { design: meta, downloadUrl: data.signedUrl, expiresInSeconds: DESIGN_LINK_SECONDS };
    },
  },
  {
    name: "create_design_file",
    title: "Criar design no figCraft",
    description:
      "Cria um design do figCraft na conta do usuário, que aparece no Painel Criativo e no Vertal Chat. " +
      "Use `template` para começar de um modelo pronto (mobile-app, landing-page, dashboard, design-system, " +
      "wireframe-kit, social-posts, slides, icon-set), ou `base64` com um arquivo .figcraft pronto (até ~4 MB). " +
      "Informe um dos dois.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120, description: "Nome do design." },
        template: {
          type: "string",
          enum: ["mobile-app", "landing-page", "dashboard", "design-system", "wireframe-kit", "social-posts", "slides", "icon-set"],
          description: "Modelo inicial pronto.",
        },
        base64: { type: "string", description: "Conteúdo do arquivo .figcraft em base64." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const title = designTitleFromFileName(strArg(args.title, "title", { required: true, max: 120 })!, "");
      if (!title) throw new ToolInputError("title é obrigatório");
      const hasTemplate = args.template !== undefined && args.template !== null && args.template !== "";
      const hasBase64 = args.base64 !== undefined && args.base64 !== null && args.base64 !== "";
      if (hasTemplate === hasBase64) throw new ToolInputError("Informe template ou base64 (um dos dois)");
      const bytes = hasTemplate ? templateBytes(args.template) : decodeDesignBase64(args.base64);
      const id = crypto.randomUUID();
      const path = designStoragePath(userId, id);
      const upload = await bucket(db, DESIGN_BUCKET).upload(path, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (upload.error) throw new Error(`Não foi possível guardar o arquivo: ${upload.error.message}`);
      const design = await rows(
        db.from("design_files")
          .insert({ id, user_id: userId, title, engine: "figcraft", file_path: path, size_bytes: bytes.byteLength })
          .select(DESIGN_COLUMNS).maybeSingle(),
      ).catch(async (e: Error) => {
        await bucket(db, DESIGN_BUCKET).remove([path]);
        throw e;
      });
      return { design };
    },
  },
  {
    name: "update_design_file",
    title: "Editar design do figCraft",
    description:
      "Muda o título e/ou substitui o arquivo .figcraft de um design do usuário (base64, até ~4 MB). " +
      "Não altera o desenho por comandos: para isso, o usuário abre o design no Painel Criativo ou no Vertal Chat.",
    scope: "write",
    inputSchema: {
      type: "object",
      properties: {
        designId: { type: "string", format: "uuid", description: "Id do design." },
        title: { type: "string", minLength: 1, maxLength: 120, description: "Novo nome (opcional)." },
        base64: { type: "string", description: "Novo conteúdo do arquivo .figcraft em base64 (opcional)." },
      },
      required: ["designId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args, { db, userId }) => {
      const id = uuidArg(args.designId, "designId");
      const hasTitle = args.title !== undefined;
      const hasBase64 = args.base64 !== undefined && args.base64 !== null && args.base64 !== "";
      if (!hasTitle && !hasBase64) throw new ToolInputError("Informe title ou base64");
      const current = await rows(
        db.from("design_files").select(`${DESIGN_COLUMNS},file_path`).eq("id", id).eq("user_id", userId).maybeSingle(),
      );
      if (!current) throw new ToolInputError("Design não encontrado");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (hasTitle) patch.title = strArg(args.title, "title", { required: true, max: 120 });
      if (hasBase64) {
        const bytes = decodeDesignBase64(args.base64);
        const upload = await bucket(db, DESIGN_BUCKET).upload(current.file_path, bytes, {
          contentType: "application/octet-stream",
          upsert: true,
        });
        if (upload.error) throw new Error(`Não foi possível guardar o arquivo: ${upload.error.message}`);
        patch.size_bytes = bytes.byteLength;
      }
      const design = await rows(
        db.from("design_files").update(patch).eq("id", id).eq("user_id", userId).select(DESIGN_COLUMNS).maybeSingle(),
      );
      return { design };
    },
  },
];

/** Bytes de um modelo do figCraft, gerados pelo próprio engine (figcraftTemplates.generated.ts). */
function templateBytes(template: unknown): Uint8Array {
  if (!isFigcraftTemplate(template)) throw new ToolInputError("Modelo desconhecido");
  const b64 = FIGCRAFT_TEMPLATE_BYTES_B64[template];
  if (!b64) throw new Error("Modelo indisponível agora");
  return decodeBase64(b64);
}

function decodeBase64(clean: string): Uint8Array {
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decodifica base64 de um .figcraft enviado pelo cliente, com os mesmos limites do bucket. */
function decodeDesignBase64(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new ToolInputError("base64 deve ser texto");
  if (value.length > DESIGN_BASE64_MAX_CHARS) throw new ToolInputError("arquivo grande demais para o MCP (até ~4 MB)");
  const problem = checkDesignBase64(value);
  if (problem) throw new ToolInputError(problem);
  return decodeBase64(value.replace(/\s+/g, ""));
}

/** Ferramentas que a chave pode usar. */
export function toolsForScopes(scopes: readonly Scope[]): ToolDef[] {
  return TOOLS.filter((t) => scopes.includes(t.scope));
}

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
        tools: toolsForScopes(ctx.scopes).map(({ name, title, description, inputSchema, annotations }) => ({
          name, title, description, inputSchema, annotations,
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return err(msg.id, -32602, `Ferramenta desconhecida: ${msg.params?.name}`);
      if (!ctx.scopes.includes(tool.scope)) {
        // Erro de permissão vai no resultado (isError), para o modelo ver a causa.
        return ok(msg.id, {
          content: [{
            type: "text",
            text: `Esta chave não tem permissão de escrita (${tool.name}). Gere uma chave com "Leitura e escrita" em /mcp.`,
          }],
          isError: true,
        });
      }
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
