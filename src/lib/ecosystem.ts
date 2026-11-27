/**
 * Ecossistema Vertal: os três produtos da KUBO Protocol que se integram entre
 * si — Vertal Dev (criar), Vertal Run (executar) e Vertal.app (publicar).
 *
 * Cada app do ecossistema mantém uma cópia deste catálogo (vertal, vertaldev e
 * Vertal2Kubo/site). Ao mudar URL, MCP ou diferenciais aqui, atualize os
 * outros dois repositórios também.
 */

export type EcosystemProductId = 'vertal-dev' | 'vertal-run' | 'vertal-app'

export interface EcosystemMcp {
  /** `http` = servidor remoto (Streamable HTTP + OAuth); `stdio` = processo local. */
  transport: 'http' | 'stdio'
  /** URL do servidor remoto (só para `http`). */
  url?: string
  /** Bloco `mcpServers` pronto para Claude Desktop, Claude Code, Cursor etc. */
  config: string
  /** Comando de uma linha para o Claude Code, quando existir. */
  cli?: string
  /** Ferramentas expostas ao agente. */
  tools: string[]
  /** Como o agente se autentica. */
  auth: string
  docsUrl: string
}

export interface EcosystemProduct {
  id: EcosystemProductId
  name: string
  /** Verbo do fluxo: Criar → Executar → Publicar. */
  role: string
  domain: string
  url: string
  /** Página aberta dentro do iframe. */
  embedUrl: string
  tagline: string
  description: string
  color: string
  strengths: string[]
  /** Com quem o produto concorre sozinho. */
  replaces: string[]
  mcp: EcosystemMcp
}

// Link de afiliado do Vertal.app, usado no "Ir para vertal.app". A janela embutida continua na home:
// o cookie de afiliado (SameSite=Lax) não é gravado dentro de um iframe de outro site, e cada abertura
// contaria um clique falso.
export const VERTAL_APP_REFERRAL_URL = 'https://vertal.app/api/public/affiliates/referral?code=6586e024cff8c775c2275e49'

// Link de afiliado do Vertal Run (5% de comissão). A página /entrar/ guarda o ?ref= até o cadastro.
export const VERTAL_RUN_REFERRAL_URL = 'https://vertalrun.com/entrar/?ref=c6104d73e1'

// Link de indicação do Vertal Dev usado em todos os links do ecossistema que levam ao vertal.dev.
// O vertal.dev só lê o ?ref= na página /auth (não guarda para depois), então o link aponta para lá.
export const VERTAL_DEV_REFERRAL_URL = 'https://vertal.dev/auth?ref=5fe61d6f'

// Embed do Vertal Dev: /embed é a única página do vertal.dev que qualquer site pode
// emoldurar (worker/embedPolicy.ts). O login abre em popup; o ?ref= segue para o /auth.
export const VERTAL_DEV_EMBED_URL = 'https://vertal.dev/embed?ref=5fe61d6f'
export const VERTAL_DEV_EMBED_SNIPPET = `<iframe src="${VERTAL_DEV_EMBED_URL}" width="100%" height="700" style="border:0" allow="clipboard-write" loading="lazy" title="Vertal Dev"></iframe>`

/** Servidor MCP do Vertal Dev (Supabase Edge Function `mcp`). */
export const VERTAL_DEV_MCP_URL = `${
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://sccizjlpwezsgaxkclot.supabase.co'
}/functions/v1/mcp`

const mcpHttpConfig = (name: string, url: string) =>
  JSON.stringify({ mcpServers: { [name]: { type: 'http', url } } }, null, 2)

export const ECOSYSTEM: EcosystemProduct[] = [
  {
    id: 'vertal-dev',
    name: 'Vertal Dev',
    role: 'Build',
    domain: 'vertal.dev',
    url: VERTAL_DEV_REFERRAL_URL,
    embedUrl: VERTAL_DEV_REFERRAL_URL,
    tagline: 'Describe your idea. AI builds the product.',
    description:
      'An AI platform to build SaaS apps, websites, games, Web3 apps and creative content from a prompt, with connectors, credits and one-click publishing.',
    color: '#D4AF37',
    strengths: [
      'AI agents that plan, write code and explain each step',
      'Web3 built in: wallets, RPCs (Alchemy, Infura) and contracts',
      'Ready connectors: GitHub, Stripe, Supabase, Slack, Gmail',
      'One-click publishing to Cloudflare or Vertal Cloud',
    ],
    replaces: ['Lovable', 'Bolt', 'Replit', 'v0'],
    mcp: {
      transport: 'http',
      url: VERTAL_DEV_MCP_URL,
      config: mcpHttpConfig('vertal-dev', VERTAL_DEV_MCP_URL),
      cli: `claude mcp add --transport http vertal-dev ${VERTAL_DEV_MCP_URL}`,
      tools: ['list_projects', 'get_project', 'create_project', 'list_agent_jobs', 'credit_summary'],
      auth: 'OAuth with your Vertal Dev account (the client opens the login for you).',
      docsUrl: 'https://vertal.dev/docs/mcp',
    },
  },
  {
    id: 'vertal-run',
    name: 'Vertal Run',
    role: 'Run',
    domain: 'vertalrun.com',
    url: VERTAL_RUN_REFERRAL_URL,
    embedUrl: VERTAL_RUN_REFERRAL_URL,
    tagline: 'Run AI code safely, away from your servers.',
    description:
      'Isolated sandboxes where AI agents run code: no network, a read-only file system, resource limits and usage measured per run.',
    color: '#22D3EE',
    strengths: [
      'A clean sandbox for every run, so untrusted code never touches your server',
      'Python, JavaScript and Bash, with a timeout and a quota per plan',
      'API key, rate limit and an audit log for every run',
      'Built and run by KUBO, with no third-party sandbox provider',
    ],
    replaces: ['E2B', 'Modal', 'Daytona'],
    mcp: {
      transport: 'stdio',
      config: JSON.stringify(
        {
          mcpServers: {
            'vertal-run': {
              command: 'python',
              args: ['-m', 'vertal2kubo.mcp'],
              env: { KUBO_API_URL: 'https://vertalrun.com/api', KUBO_API_KEY: 'kubo_sk_...' },
            },
          },
        },
        null,
        2,
      ),
      tools: ['run_code', 'get_usage'],
      auth: 'A kubo_sk_… API key that you create in the Vertal Run dashboard.',
      docsUrl: 'https://vertalrun.com/blog/como-conectar-agentes-de-ia-ao-vertal-run-com-mcp/',
    },
  },
  {
    id: 'vertal-app',
    name: 'Vertal.app',
    role: 'Publish',
    domain: 'vertal.app',
    url: VERTAL_APP_REFERRAL_URL,
    embedUrl: 'https://vertal.app/',
    tagline: 'From repository to live app. AI handles the deploy.',
    description:
      'Managed deploys: connect a GitHub repository, AI detects the stack, build and environment variables, and puts the app online with live logs and status.',
    color: '#8B5CF6',
    strengths: [
      'AI detects the framework, build and start commands, and env vars',
      'Environment variables encrypted with AES-256-GCM',
      'Live dashboard with status and build logs',
      'Many projects and users, isolated per account',
    ],
    replaces: ['Vercel', 'Railway', 'Render', 'Netlify'],
    mcp: {
      transport: 'http',
      url: 'https://vertal.app/mcp',
      config: mcpHttpConfig('vertal-app', 'https://vertal.app/mcp'),
      cli: 'claude mcp add --transport http vertal-app https://vertal.app/mcp',
      tools: ['list_projects', 'get_project', 'create_project', 'create_deployment', 'get_deployment', 'get_logs'],
      auth: 'OAuth with your Vertal.app account (the client opens the login for you).',
      docsUrl: 'https://vertal.app/connect',
    },
  },
]

export function getEcosystemProduct(id: string): EcosystemProduct | undefined {
  return ECOSYSTEM.find(p => p.id === id)
}

/** Os produtos do ecossistema, exceto o app em que o usuário já está. */
export function siblingsOf(current: EcosystemProductId): EcosystemProduct[] {
  return ECOSYSTEM.filter(p => p.id !== current)
}

/** Um único bloco `mcpServers` com os três produtos, para colar de uma vez. */
export function combinedMcpConfig(): string {
  const servers: Record<string, unknown> = {}
  for (const p of ECOSYSTEM) Object.assign(servers, JSON.parse(p.mcp.config).mcpServers)
  return JSON.stringify({ mcpServers: servers }, null, 2)
}

/** Por que escolher o ecossistema em vez de juntar ferramentas de concorrentes. */
export const ECOSYSTEM_PILLARS = [
  {
    title: 'One flow, not three accounts',
    description:
      'Build in Vertal Dev, test code safely in Vertal Run and publish with Vertal.app. No copying tokens between different vendors.',
  },
  {
    title: 'Ready for AI agents',
    description:
      'All three products support MCP. Claude, ChatGPT, Cursor or KUBO AI can run the whole cycle: build, run and publish.',
  },
  {
    title: 'Secure by default',
    description:
      'AI-generated code runs in an isolated sandbox, secrets are encrypted, and each account sees only its own data.',
  },
  {
    title: 'Our own technology',
    description:
      'Infrastructure built by KUBO Protocol in Brazil, with Web3 built in.',
  },
]

/** Linhas da comparação "Ecossistema Vertal" × "juntar ferramentas avulsas". */
export const ECOSYSTEM_COMPARISON: { feature: string; vertal: string; others: string }[] = [
  { feature: 'Build an app with AI', vertal: 'Vertal Dev', others: 'Lovable, Bolt or Replit' },
  { feature: 'Run agent code in a sandbox', vertal: 'Vertal Run', others: 'E2B, Modal or Daytona' },
  { feature: 'Managed deploys with AI', vertal: 'Vertal.app', others: 'Vercel, Railway or Render' },
  { feature: 'MCP at every step', vertal: 'In all three products', others: 'Depends on each vendor' },
  { feature: 'Accounts and invoices', vertal: 'One KUBO ecosystem', others: 'One per vendor' },
  { feature: 'Web3', vertal: 'Built in', others: 'Usually a separate tool' },
]
