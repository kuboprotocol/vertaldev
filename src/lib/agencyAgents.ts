import catalog from '@/data/agency-agents/catalog.json'
import { VIBE_AGENT_LIMITS } from '@/config/vibeAgents'

/**
 * Catálogo "The Agency" (msitarzewski/agency-agents, MIT), copiado para src/data/agency-agents.
 * Regenerado com `node scripts/sync-agency-agents.mjs <clone>`; não edite os arquivos à mão.
 */
export interface AgencyDivision { id: string; label: string; icon: string; color: string; count: number }
export interface AgencyAgent {
  id: string
  division: string
  /** Path inside src/data/agency-agents, e.g. "engineering/engineering-frontend-developer.md". */
  file: string
  slug: string
  name: string
  description: string
  emoji: string
  color: string
  vibe: string
}
export interface AgencyCatalog {
  source: { name: string; url: string; license: string; commit: string }
  divisions: Record<string, AgencyDivision>
  agents: AgencyAgent[]
}

export const AGENCY_CATALOG = catalog as AgencyCatalog
export const AGENCY_AGENTS = AGENCY_CATALOG.agents
export const AGENCY_DIVISIONS = Object.values(AGENCY_CATALOG.divisions)

// Each persona is a separate chunk, read only when someone opens its profile.
const bodyLoaders = import.meta.glob('../data/agency-agents/**/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

/** Removes the YAML frontmatter, leaving the persona as Markdown. */
export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart()
}

export async function loadAgencyBody(agent: AgencyAgent): Promise<string> {
  const load = bodyLoaders[`../data/agency-agents/${agent.file}`]
  if (!load) throw new Error(`agente não encontrado: ${agent.id}`)
  return stripFrontmatter(await load())
}

/** Lowercase and without accents, so "saude" finds "Saúde" and "Ç" matches "c". */
export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filterAgencyAgents(agents: AgencyAgent[], { query, division }: { query: string; division: string | null }): AgencyAgent[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  return agents.filter((a) => {
    if (division && a.division !== division) return false
    if (terms.length === 0) return true
    const haystack = normalizeSearch(`${a.name} ${a.description} ${a.vibe} ${AGENCY_CATALOG.divisions[a.division]?.label ?? ''}`)
    return terms.every((t) => haystack.includes(t))
  })
}

/** Written in front of every hired persona: the team works in Brazilian Portuguese, whatever the persona's language. */
export const HIRE_PREAMBLE =
  'Você é um especialista contratado pelo cliente. Responda sempre em português do Brasil, a menos que o cliente peça outro idioma. Entregue resultados concretos, em etapas claras, e diga quando faltar informação.'

/** Instructions saved for a hired agent: the preamble plus the full persona, within the server's limit. */
export function buildHireInstructions(agent: AgencyAgent, persona: string): string {
  const head = `${HIRE_PREAMBLE}\n\n`
  const room = VIBE_AGENT_LIMITS.maxInstructionsChars - head.length
  const text = persona.trim() || agent.description
  return head + text.slice(0, room)
}
