#!/usr/bin/env node
// Sincroniza o catálogo "The Agency" (msitarzewski/agency-agents, MIT) para dentro do app.
//
// Uso:
//   node scripts/sync-agency-agents.mjs <caminho-do-clone-do-agency-agents>
//
// O que faz (sempre a partir do clone de origem, sem rede):
//   1. Copia cada divisão listada em divisions.json (pastas de primeiro nível) para
//      src/data/agency-agents/<divisão>/<agente>.md, sem alterar o conteúdo.
//   2. Copia LICENSE e divisions.json para src/data/agency-agents/.
//   3. Gera src/data/agency-agents/catalog.json com os metadados de cada agente
//      (nome, descrição, emoji, cor, frase de efeito) lidos do frontmatter.
//
// Arquivos que não têm frontmatter de agente (`name:`) são ignorados, por isso
// playbooks, README e exemplos não entram no catálogo.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const outRoot = join(repoRoot, 'src', 'data', 'agency-agents')

const source = process.argv[2] ? resolve(process.argv[2]) : null
if (!source || !existsSync(join(source, 'divisions.json'))) {
  console.error('Uso: node scripts/sync-agency-agents.mjs <caminho-do-clone-do-agency-agents>')
  process.exit(1)
}

/** Lê o frontmatter simples (chave: valor) do início do arquivo. */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { data: {}, body: text }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    data[kv[1]] = value
  }
  return { data, body: text.slice(match[0].length) }
}

function listMarkdown(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listMarkdown(full))
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out.sort()
}

const divisions = JSON.parse(readFileSync(join(source, 'divisions.json'), 'utf8')).divisions
let commit = 'desconhecido'
try {
  commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // Sem histórico git (ex.: download de zip): mantém "desconhecido".
}

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })
copyFileSync(join(source, 'LICENSE'), join(outRoot, 'LICENSE'))
copyFileSync(join(source, 'divisions.json'), join(outRoot, 'divisions.json'))

const agents = []
for (const division of Object.keys(divisions)) {
  const dir = join(source, division)
  if (!existsSync(dir)) {
    console.warn(`divisão "${division}" não existe no clone; pulando`)
    continue
  }
  for (const file of listMarkdown(dir)) {
    const text = readFileSync(file, 'utf8')
    const { data } = parseFrontmatter(text)
    if (!data.name) continue // não é um agente

    const rel = relative(source, file)
    const target = join(outRoot, rel)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(file, target)

    agents.push({
      id: rel.replace(/\.md$/, ''),
      division,
      file: rel,
      slug: basename(file, '.md'),
      name: data.name,
      description: data.description ?? '',
      emoji: data.emoji ?? '🤖',
      color: data.color ?? '',
      vibe: data.vibe ?? '',
    })
  }
}

agents.sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name, 'en'))

const catalog = {
  source: {
    name: 'The Agency (agency-agents)',
    url: 'https://github.com/msitarzewski/agency-agents',
    license: 'MIT',
    commit,
  },
  divisions: Object.fromEntries(
    Object.entries(divisions).map(([id, d]) => [id, { id, ...d, count: agents.filter((a) => a.division === id).length }]),
  ),
  agents,
}
writeFileSync(join(outRoot, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')

console.log(`agency-agents: ${agents.length} agentes em ${Object.keys(catalog.divisions).length} divisões (commit ${commit.slice(0, 7)})`)
