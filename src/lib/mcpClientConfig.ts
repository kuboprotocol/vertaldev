// Configurações prontas para colar nos clientes de IA que falam MCP.
// Puro (sem React): a página /mcp usa estas funções e os testes cobrem o texto gerado.

export const MCP_SERVER_NAME = 'vertal'
export const MCP_KEY_PLACEHOLDER = 'SUA_CHAVE_AQUI'

export type McpAccessLevel = 'read' | 'write'

export interface McpKeyRecord {
  id: string
  name: string
  key_prefix: string
  scopes: McpAccessLevel[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export type McpClientId = 'claude-code' | 'claude-desktop' | 'cursor' | 'codex' | 'generic'

export const MCP_CLIENTS: { id: McpClientId; label: string; where: string }[] = [
  { id: 'claude-code', label: 'Claude Code', where: 'Rode no terminal' },
  { id: 'claude-desktop', label: 'Claude Desktop', where: 'Arquivo claude_desktop_config.json' },
  { id: 'cursor', label: 'Cursor', where: 'Arquivo ~/.cursor/mcp.json (ou .cursor/mcp.json no projeto)' },
  { id: 'codex', label: 'Codex', where: 'Arquivo ~/.codex/config.toml' },
  { id: 'generic', label: 'Outros clientes', where: 'Qualquer cliente com suporte a MCP por HTTP' },
]

/** Cabeçalho de autorização com a chave (ou o placeholder). */
export function bearer(key: string | null): string {
  return `Bearer ${key ?? MCP_KEY_PLACEHOLDER}`
}

export function claudeCodeCommand(url: string, key: string | null): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: ${bearer(key)}"`
}

/** Claude Desktop não fala HTTP com cabeçalho direto: usa o mcp-remote como ponte. */
export function claudeDesktopJson(url: string, key: string | null): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', url, '--header', `Authorization: ${bearer(key)}`],
        },
      },
    },
    null,
    2,
  )
}

export function cursorJson(url: string, key: string | null): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          url,
          headers: { Authorization: bearer(key) },
        },
      },
    },
    null,
    2,
  )
}

export function codexToml(url: string, key: string | null): string {
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `url = ${JSON.stringify(url)}`,
    `http_headers = { Authorization = ${JSON.stringify(bearer(key))} }`,
  ].join('\n')
}

/** Mesmo formato do Cursor: é o que a maioria dos clientes genéricos aceita. */
export function genericJson(url: string, key: string | null): string {
  return cursorJson(url, key)
}

export function configFor(client: McpClientId, url: string, key: string | null): string {
  switch (client) {
    case 'claude-code':
      return claudeCodeCommand(url, key)
    case 'claude-desktop':
      return claudeDesktopJson(url, key)
    case 'cursor':
      return cursorJson(url, key)
    case 'codex':
      return codexToml(url, key)
    case 'generic':
      return genericJson(url, key)
  }
}

export function accessLevelLabel(scopes: readonly string[]): string {
  return scopes.includes('write') ? 'Leitura e escrita' : 'Somente leitura'
}

/** Escopos enviados à API a partir do nível escolhido na tela. */
export function scopesForLevel(level: McpAccessLevel): McpAccessLevel[] {
  return level === 'write' ? ['read', 'write'] : ['read']
}

/** Ferramentas expostas, com o escopo que cada uma exige. Espelha supabase/functions/mcp/server.ts. */
export const MCP_TOOLS: { name: string; description: string; access: McpAccessLevel }[] = [
  { name: 'list_projects', description: 'Listar seus projetos', access: 'read' },
  { name: 'get_project', description: 'Ver um projeto e, se pedir, o código gerado', access: 'read' },
  { name: 'list_agent_jobs', description: 'Ver execuções dos agentes de IA', access: 'read' },
  { name: 'credit_summary', description: 'Ver saldo e transações de créditos', access: 'read' },
  { name: 'create_project', description: 'Criar um projeto', access: 'write' },
  { name: 'update_project', description: 'Renomear ou alterar a descrição de um projeto', access: 'write' },
]

export function toolsForLevel(level: McpAccessLevel) {
  return MCP_TOOLS.filter((t) => t.access === 'read' || level === 'write')
}
