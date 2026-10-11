// Vibe Agents: the tool catalog, limits and pricing for user-created agents.
// Pure TypeScript with no Deno/browser APIs: imported by the `vibe-agents` edge function and by the
// frontend (src/config/vibeAgents.ts re-exports it), so the tools shown in Explain Mode are exactly
// the tools the runtime can execute.

export type VibeToolId =
  | "web_fetch"
  | "slack_post"
  | "email_send"
  | "github_list_repos"
  | "github_create_issue"
  | "python_run"
  | "create_agent"
  | "run_agent";

/** Connectors a tool needs before it can run. Slugs match `src/lib/connectorsConfig.ts`. */
export type VibeConnector = "slack" | "gmail" | "github";

/** Capabilities the platform (not the user) has to enable, e.g. the Python sandbox (E2B_API_KEY). */
export type VibePlatformRequirement = "sandbox";

export interface VibeTool {
  id: VibeToolId;
  label: string;
  emoji: string;
  /** Shown to the user in Explain Mode. */
  description: string;
  connector: VibeConnector | null;
  requires?: VibePlatformRequirement;
  /** Changes something outside Vertal (sends, creates). Capped per run. */
  sideEffect: boolean;
  /** JSON Schema of the arguments, sent to the model as a function definition. */
  parameters: Record<string, unknown>;
}

/** Extra pip packages an agent may install in the sandbox (the template already ships the data-science stack). */
export const PYTHON_PACKAGES = [
  "pandas", "numpy", "scipy", "scikit-learn", "matplotlib", "seaborn", "plotly", "statsmodels",
  "openpyxl", "xlsxwriter", "python-docx", "pypdf", "beautifulsoup4", "lxml", "requests", "httpx",
  "pydantic", "tabulate", "networkx", "sympy",
] as const;

const str = (description: string, maxLength = 2000) => ({ type: "string", description, maxLength });

export const VIBE_TOOLS: Record<VibeToolId, VibeTool> = {
  web_fetch: {
    id: "web_fetch",
    label: "Ler páginas da web",
    emoji: "🌐",
    description: "Abre páginas públicas (https) e lê o texto",
    connector: null,
    sideEffect: false,
    parameters: { type: "object", properties: { url: str("URL https pública", 2048) }, required: ["url"] },
  },
  slack_post: {
    id: "slack_post",
    label: "Postar no Slack",
    emoji: "💬",
    description: "Envia mensagens para um canal do seu Slack",
    connector: "slack",
    sideEffect: true,
    parameters: {
      type: "object",
      properties: { channel: str("Canal, ex. #geral ou o ID C0123", 80), text: str("Mensagem", 4000) },
      required: ["channel", "text"],
    },
  },
  email_send: {
    id: "email_send",
    label: "Enviar e-mail",
    emoji: "✉️",
    description: "Envia e-mails pela sua conta Gmail conectada",
    connector: "gmail",
    sideEffect: true,
    parameters: {
      type: "object",
      properties: { to: str("Destinatário", 254), subject: str("Assunto", 200), body: str("Corpo do e-mail", 20000) },
      required: ["to", "subject", "body"],
    },
  },
  github_list_repos: {
    id: "github_list_repos",
    label: "Ler repositórios do GitHub",
    emoji: "🐙",
    description: "Lista seus repositórios e as issues abertas",
    connector: "github",
    sideEffect: false,
    parameters: {
      type: "object",
      properties: { repo: str("owner/repo para listar issues abertas; vazio lista os repositórios", 200) },
    },
  },
  github_create_issue: {
    id: "github_create_issue",
    label: "Criar issue no GitHub",
    emoji: "📝",
    description: "Abre issues nos seus repositórios",
    connector: "github",
    sideEffect: true,
    parameters: {
      type: "object",
      properties: { repo: str("owner/repo", 200), title: str("Título", 256), body: str("Descrição", 20000) },
      required: ["repo", "title"],
    },
  },
  python_run: {
    id: "python_run",
    label: "Executar Python",
    emoji: "🐍",
    description: "Roda código Python numa sandbox isolada (Pandas, NumPy, scikit-learn, Matplotlib) para analisar dados",
    connector: null,
    requires: "sandbox",
    sideEffect: false,
    parameters: {
      type: "object",
      properties: {
        code: str("Código Python completo; imprima com print() o que quiser ver", 20000),
        packages: {
          type: "array",
          items: { type: "string" },
          description: "Pacotes extras do pip, apenas desta lista: " + PYTHON_PACKAGES.join(", "),
        },
      },
      required: ["code"],
    },
  },
  create_agent: {
    id: "create_agent",
    label: "Criar outros agentes",
    emoji: "🧬",
    description: "Cria agentes especializados para partes da tarefa",
    connector: null,
    sideEffect: false,
    parameters: {
      type: "object",
      properties: {
        name: str("Nome do agente", 80),
        instructions: str("O que o agente faz e como", 4000),
        tools: { type: "array", items: { type: "string" }, description: "IDs das ferramentas do novo agente" },
      },
      required: ["name", "instructions", "tools"],
    },
  },
  run_agent: {
    id: "run_agent",
    label: "Executar outros agentes",
    emoji: "🤝",
    description: "Delega uma tarefa a outro agente seu e usa o resultado",
    connector: null,
    sideEffect: false,
    parameters: {
      type: "object",
      properties: { agent_id: str("ID do agente", 64), task: str("Tarefa para o agente", 4000) },
      required: ["agent_id", "task"],
    },
  },
};

export const VIBE_TOOL_IDS = Object.keys(VIBE_TOOLS) as VibeToolId[];

export const VIBE_CONNECTORS: Record<VibeConnector, { label: string; setupRoute: string }> = {
  slack: { label: "Slack", setupRoute: "/connectors/slack/setup" },
  gmail: { label: "Gmail", setupRoute: "/connectors/gmail" },
  github: { label: "GitHub", setupRoute: "/connectors/github/setup" },
};

export const VIBE_PLATFORM_REQUIREMENTS: Record<VibePlatformRequirement, { label: string }> = {
  sandbox: { label: "Sandbox Python" },
};

export const VIBE_AGENT_LIMITS = {
  maxAgentsPerUser: 50,
  maxNameChars: 80,
  maxInstructionsChars: 4000,
  maxTaskChars: 4000,
  /** Model turns per run, shared with sub-agents. */
  maxSteps: 12,
  /** Sends/creates per run (Slack, e-mail, GitHub issues), shared with sub-agents. */
  maxSideEffects: 5,
  /** create_agent / run_agent nesting depth. */
  maxDepth: 2,
  maxToolResultChars: 6000,
  /** Wall clock per python_run call, in seconds. */
  pythonTimeoutSeconds: 60,
  /** Sandbox lifetime; it is destroyed when the run ends anyway. */
  sandboxLifetimeSeconds: 300,
} as const;

/** Credits per run: a flat fee covers the model calls of a run (up to maxSteps). */
export const VIBE_AGENT_RUN_CREDITS = 3;

export function isVibeToolId(v: unknown): v is VibeToolId {
  return typeof v === "string" && v in VIBE_TOOLS;
}

/** Keeps known tool IDs, in catalog order, without duplicates. */
export function sanitizeTools(tools: unknown): VibeToolId[] {
  const wanted = new Set(Array.isArray(tools) ? tools.filter(isVibeToolId) : []);
  return VIBE_TOOL_IDS.filter((id) => wanted.has(id));
}

export function requiredPlatform(tools: VibeToolId[]): VibePlatformRequirement[] {
  const out = new Set<VibePlatformRequirement>();
  for (const id of tools) {
    const r = VIBE_TOOLS[id].requires;
    if (r) out.add(r);
  }
  return [...out];
}

/** Keeps allowed pip packages only (lowercased, deduplicated). */
export function sanitizePackages(pkgs: unknown): string[] {
  const allowed = new Set<string>(PYTHON_PACKAGES);
  const list = Array.isArray(pkgs) ? pkgs.map((p) => String(p).toLowerCase().trim()) : [];
  return [...new Set(list.filter((p) => allowed.has(p)))];
}

export function requiredConnectors(tools: VibeToolId[]): VibeConnector[] {
  const out = new Set<VibeConnector>();
  for (const id of tools) {
    const c = VIBE_TOOLS[id].connector;
    if (c) out.add(c);
  }
  return [...out];
}
