import { describe, expect, it } from 'vitest'
import {
  MCP_KEY_PLACEHOLDER,
  accessLevelLabel,
  claudeCodeCommand,
  claudeDesktopJson,
  codexToml,
  configFor,
  cursorJson,
  scopesForLevel,
  toolsForLevel,
} from './mcpClientConfig'

const URL = 'https://abc.supabase.co/functions/v1/mcp'
const KEY = 'vtl_mcp_' + 'A'.repeat(43)

describe('configurações de clientes MCP', () => {
  it('Claude Code usa o comando http com o cabeçalho Authorization', () => {
    expect(claudeCodeCommand(URL, KEY)).toBe(
      `claude mcp add --transport http vertal ${URL} --header "Authorization: Bearer ${KEY}"`,
    )
  })

  it('sem chave, mostra o placeholder em vez de vazar nada', () => {
    expect(claudeCodeCommand(URL, null)).toContain(`Bearer ${MCP_KEY_PLACEHOLDER}`)
    expect(cursorJson(URL, null)).toContain(MCP_KEY_PLACEHOLDER)
  })

  it('Claude Desktop passa pelo mcp-remote com o cabeçalho', () => {
    const cfg = JSON.parse(claudeDesktopJson(URL, KEY))
    expect(cfg.mcpServers.vertal.command).toBe('npx')
    expect(cfg.mcpServers.vertal.args).toEqual(['-y', 'mcp-remote', URL, '--header', `Authorization: Bearer ${KEY}`])
  })

  it('Cursor gera JSON válido com url e headers', () => {
    const cfg = JSON.parse(cursorJson(URL, KEY))
    expect(cfg.mcpServers.vertal).toEqual({ url: URL, headers: { Authorization: `Bearer ${KEY}` } })
  })

  it('Codex gera TOML com url e http_headers', () => {
    const toml = codexToml(URL, KEY)
    expect(toml).toContain('[mcp_servers.vertal]')
    expect(toml).toContain(`url = "${URL}"`)
    expect(toml).toContain(`http_headers = { Authorization = "Bearer ${KEY}" }`)
  })

  it('configFor despacha para o cliente certo', () => {
    expect(configFor('codex', URL, KEY)).toBe(codexToml(URL, KEY))
    expect(configFor('generic', URL, KEY)).toBe(cursorJson(URL, KEY))
  })
})

describe('níveis de acesso', () => {
  it('escrita inclui leitura; leitura não inclui escrita', () => {
    expect(scopesForLevel('write')).toEqual(['read', 'write'])
    expect(scopesForLevel('read')).toEqual(['read'])
  })

  it('rótulo reflete os escopos da chave', () => {
    expect(accessLevelLabel(['read'])).toBe('Somente leitura')
    expect(accessLevelLabel(['read', 'write'])).toBe('Leitura e escrita')
  })

  it('só leitura não lista ferramentas de escrita', () => {
    const names = toolsForLevel('read').map((t) => t.name)
    expect(names).not.toContain('create_project')
    expect(names).not.toContain('update_project')
    expect(toolsForLevel('write').map((t) => t.name)).toContain('update_project')
  })
})
