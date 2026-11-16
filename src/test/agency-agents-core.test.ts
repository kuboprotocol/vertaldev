import { describe, it, expect } from 'vitest'
import {
  AGENCY_AGENTS, AGENCY_CATALOG, AGENCY_DIVISIONS, HIRE_PREAMBLE, buildHireInstructions, filterAgencyAgents,
  loadAgencyBody, normalizeSearch, stripFrontmatter, type AgencyAgent,
} from '@/lib/agencyAgents'
import { VIBE_AGENT_LIMITS } from '@/config/vibeAgents'

const agent = (over: Partial<AgencyAgent> = {}): AgencyAgent => ({
  id: 'engineering/engineering-frontend-developer',
  division: 'engineering',
  file: 'engineering/engineering-frontend-developer.md',
  slug: 'engineering-frontend-developer',
  name: 'Frontend Developer',
  description: 'Expert frontend developer',
  emoji: '🖥️',
  color: 'cyan',
  vibe: 'Builds responsive apps.',
  ...over,
})

describe('Agency Agents catalog', () => {
  it('ships every agent of the upstream divisions, once each', () => {
    expect(AGENCY_AGENTS).toHaveLength(283)
    expect(new Set(AGENCY_AGENTS.map((a) => a.id)).size).toBe(283)
    expect(AGENCY_DIVISIONS).toHaveLength(18)
    expect(AGENCY_DIVISIONS.reduce((n, d) => n + d.count, 0)).toBe(283)
  })

  it('links every agent to a division that exists in the catalog', () => {
    for (const a of AGENCY_AGENTS) expect(AGENCY_CATALOG.divisions[a.division]).toBeDefined()
  })

  it('loads every persona as Markdown without its frontmatter', async () => {
    const bodies = await Promise.all(AGENCY_AGENTS.map((a) => loadAgencyBody(a)))
    bodies.forEach((body) => {
      expect(body.startsWith('---')).toBe(false)
      expect(body.length).toBeGreaterThan(100)
    })
  })

  it('fails loudly for an agent that is not in the bundle', async () => {
    await expect(loadAgencyBody(agent({ file: 'nope/missing.md' }))).rejects.toThrow('agente não encontrado')
  })
})

describe('hiring instructions', () => {
  it('puts the Portuguese preamble before the persona', () => {
    const text = buildHireInstructions(agent(), '# Persona\n\nYou are a frontend expert.')
    expect(text.startsWith(HIRE_PREAMBLE)).toBe(true)
    expect(text).toContain('You are a frontend expert.')
  })

  it('never exceeds the server limit, even for the largest persona', () => {
    const huge = 'x'.repeat(VIBE_AGENT_LIMITS.maxInstructionsChars * 2)
    expect(buildHireInstructions(agent(), huge).length).toBeLessThanOrEqual(VIBE_AGENT_LIMITS.maxInstructionsChars)
  })

  it('falls back to the description when the persona is empty', () => {
    expect(buildHireInstructions(agent(), '   ')).toContain('Expert frontend developer')
  })
})

describe('search and filters', () => {
  it('ignores accents and case', () => {
    expect(normalizeSearch('Saúde Ç')).toBe('saude c')
  })

  it('matches every word, across name, description, vibe and division label', () => {
    const list = [agent(), agent({ id: 'x/seo', name: 'SEO Specialist', description: 'Ranks sites', division: 'marketing', vibe: 'Organic growth' })]
    expect(filterAgencyAgents(list, { query: 'seo ranks', division: null }).map((a) => a.name)).toEqual(['SEO Specialist'])
    expect(filterAgencyAgents(list, { query: 'organic', division: null }).map((a) => a.name)).toEqual(['SEO Specialist'])
    expect(filterAgencyAgents(list, { query: 'engineering', division: null }).map((a) => a.name)).toEqual(['Frontend Developer'])
  })

  it('narrows by division and combines with the query', () => {
    expect(filterAgencyAgents(AGENCY_AGENTS, { query: '', division: 'research' })).toHaveLength(AGENCY_CATALOG.divisions.research.count)
    expect(filterAgencyAgents(AGENCY_AGENTS, { query: 'zzz-nao-existe', division: null })).toHaveLength(0)
    expect(filterAgencyAgents(AGENCY_AGENTS, { query: 'frontend', division: 'marketing' })).toHaveLength(0)
  })
})

describe('stripFrontmatter', () => {
  it('removes the YAML block and leading blank lines', () => {
    expect(stripFrontmatter('---\nname: X\ndescription: "a: b"\n---\n\n# Title')).toBe('# Title')
  })

  it('leaves text without frontmatter untouched', () => {
    expect(stripFrontmatter('# Plain')).toBe('# Plain')
  })
})
