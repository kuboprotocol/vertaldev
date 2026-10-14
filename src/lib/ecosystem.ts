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

// Link de indicação do Vertal Dev usado em todos os links do ecossistema que levam ao vertal.dev.
// O vertal.dev só lê o ?ref= na página /auth (não guarda para depois), então o link aponta para lá.
export const VERTAL_DEV_REFERRAL_URL = 'https://vertal.dev/auth?ref=5fe61d6f'

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
    role: 'Criar',
    domain: 'vertal.dev',
    url: VERTAL_DEV_REFERRAL_URL,
    embedUrl: VERTAL_DEV_REFERRAL_URL,
    tagline: 'Descreva a ideia. A IA entrega o produto.',
    description:
      'Plataforma de criação com IA: SaaS, sites, jogos, apps Web3 e conteúdo criativo a partir de um prompt, com conectores, créditos e publicação em 1 clique.',
    color: '#D4AF37',
    strengths: [
      'Agentes de IA que planejam, codam e narram cada passo',
      'Web3 nativo: carteiras, RPCs (Alchemy, Infura) e contratos',
      'Conectores prontos: GitHub, Stripe, Supabase, Slack, Gmail',
      'Publicação em 1 clique na Cloudflare ou na Vertal Cloud',
    ],
    replaces: ['Lovable', 'Bolt', 'Replit', 'v0'],
    mcp: {
      transport: 'http',
      url: VERTAL_DEV_MCP_URL,
      config: mcpHttpConfig('vertal-dev', VERTAL_DEV_MCP_URL),
      cli: `claude mcp add --transport http vertal-dev ${VERTAL_DEV_MCP_URL}`,
      tools: ['list_projects', 'get_project', 'create_project', 'list_agent_jobs', 'credit_summary'],
      auth: 'OAuth com a sua conta Vertal Dev (o cliente abre o login sozinho).',
      docsUrl: 'https://vertal.dev/docs/mcp',
    },
  },
  {
    id: 'vertal-run',
    name: 'Vertal Run',
    role: 'Executar',
    domain: 'vertalrun.com',
    url: 'https://vertalrun.com',
    embedUrl: 'https://vertalrun.com/',
    tagline: 'Código de IA rodando com segurança, fora dos seus servidores.',
    description:
      'Sandboxes isoladas para agentes de IA executarem código: sem rede, sistema de arquivos somente leitura, limites de recursos e medição por execução.',
    color: '#22D3EE',
    strengths: [
      'Sandbox limpa a cada execução: código não confiável nunca toca seu servidor',
      'Python, JavaScript e Bash, com timeout e cota por plano',
      'API key, rate limit e trilha de auditoria por execução',
      'Plataforma própria da KUBO, sem depender de terceiros',
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
      auth: 'Chave de API kubo_sk_… criada no painel do Vertal Run.',
      docsUrl: 'https://vertalrun.com/blog/como-conectar-agentes-de-ia-ao-vertal-run-com-mcp/',
    },
  },
  {
    id: 'vertal-app',
    name: 'Vertal.app',
    role: 'Publicar',
    domain: 'vertal.app',
    url: 'https://vertal.app',
    embedUrl: 'https://vertal.app/',
    tagline: 'Do repositório ao ar, com a IA cuidando do deploy.',
    description:
      'Deploy orquestrado: conecte um repositório GitHub, a IA detecta stack, build e variáveis de ambiente e sobe a aplicação real, com logs e status ao vivo.',
    color: '#8B5CF6',
    strengths: [
      'IA detecta framework, comandos de build/start e env vars',
      'Variáveis de ambiente cifradas com AES-256-GCM',
      'Dashboard em tempo real com status e logs de build',
      'Multi-projeto e multi-usuário com isolamento por conta',
    ],
    replaces: ['Vercel', 'Railway', 'Render', 'Netlify'],
    mcp: {
      transport: 'http',
      url: 'https://vertal.app/mcp',
      config: mcpHttpConfig('vertal-app', 'https://vertal.app/mcp'),
      cli: 'claude mcp add --transport http vertal-app https://vertal.app/mcp',
      tools: ['list_projects', 'get_project', 'create_project', 'create_deployment', 'get_deployment', 'get_logs'],
      auth: 'OAuth com a sua conta Vertal.app (o cliente abre o login sozinho).',
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
    title: 'Um fluxo, não três contas',
    description:
      'Crie no Vertal Dev, teste o código com segurança no Vertal Run e publique no Vertal.app. Sem colar tokens entre fornecedores diferentes.',
  },
  {
    title: 'Pronto para agentes de IA',
    description:
      'Os três produtos falam MCP. Claude, ChatGPT, Cursor ou a KUBO IA operam o ciclo inteiro: criar, executar e publicar.',
  },
  {
    title: 'Segurança por padrão',
    description:
      'Código gerado por IA roda em sandbox isolada, segredos ficam cifrados e cada conta só enxerga os próprios dados.',
  },
  {
    title: 'Tecnologia própria, foco no Brasil e no mundo',
    description:
      'Infraestrutura construída pela KUBO Protocol, interface e suporte em português, Web3 nativo e pronta para escalar globalmente.',
  },
]

/** Linhas da comparação "Ecossistema Vertal" × "juntar ferramentas avulsas". */
export const ECOSYSTEM_COMPARISON: { feature: string; vertal: string; others: string }[] = [
  { feature: 'Criar app com IA', vertal: 'Vertal Dev', others: 'Lovable, Bolt ou Replit' },
  { feature: 'Executar código de agentes em sandbox', vertal: 'Vertal Run', others: 'E2B, Modal ou Daytona' },
  { feature: 'Deploy orquestrado com IA', vertal: 'Vertal.app', others: 'Vercel, Railway ou Render' },
  { feature: 'MCP em todas as etapas', vertal: 'Nos três produtos', others: 'Depende de cada fornecedor' },
  { feature: 'Contas e faturas', vertal: 'Um ecossistema KUBO', others: 'Uma por fornecedor' },
  { feature: 'Web3 e interface em português', vertal: 'Nativos', others: 'Raramente juntos' },
]
