import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectorIcon } from './ConnectorIcon'
import { connectors } from '@/lib/connectorsConfig'

describe('ConnectorIcon', () => {
  it('Slack mostra o logo oficial', () => {
    const slack = connectors.find((c) => c.slug === 'slack')!
    render(<ConnectorIcon connector={slack} className="h-6 w-6" />)
    const img = screen.getByRole('img', { name: 'Slack' }) as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/connectors/slack.png')
  })

  it('Stripe mostra o logo oficial', () => {
    const st = connectors.find((c) => c.slug === 'stripe')!
    render(<ConnectorIcon connector={st} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Stripe' }).getAttribute('src')).toBe('/connectors/stripe.png')
  })

  it('GitHub mostra o logo oficial', () => {
    const gh = connectors.find((c) => c.slug === 'github')!
    render(<ConnectorIcon connector={gh} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'GitHub' }).getAttribute('src')).toBe('/connectors/github.png')
  })

  it('Figma mostra o logo oficial', () => {
    const fg = connectors.find((c) => c.slug === 'figma')!
    render(<ConnectorIcon connector={fg} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Figma' }).getAttribute('src')).toBe('/connectors/figma.png')
  })

  it('Render mostra o logo oficial', () => {
    const rd = connectors.find((c) => c.slug === 'render')!
    render(<ConnectorIcon connector={rd} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Render' }).getAttribute('src')).toBe('/connectors/render.png')
  })

  it('Docker Hub mostra o logo oficial', () => {
    const dk = connectors.find((c) => c.slug === 'docker')!
    render(<ConnectorIcon connector={dk} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Docker Hub' }).getAttribute('src')).toBe('/connectors/docker.png')
  })

  it('Discord mostra o logo oficial', () => {
    const dc = connectors.find((c) => c.slug === 'discord')!
    render(<ConnectorIcon connector={dc} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Discord' }).getAttribute('src')).toBe('/connectors/discord.png')
  })

  it('Alchemy mostra o logo oficial', () => {
    const al = connectors.find((c) => c.slug === 'alchemy')!
    render(<ConnectorIcon connector={al} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Alchemy' }).getAttribute('src')).toBe('/connectors/alchemy.png')
  })

  it('Supabase mostra o logo oficial', () => {
    const sb = connectors.find((c) => c.slug === 'supabase')!
    render(<ConnectorIcon connector={sb} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Supabase' }).getAttribute('src')).toBe('/connectors/supabase.png')
  })

  it('Cloudflare mostra o logo oficial', () => {
    const cf = connectors.find((c) => c.slug === 'cloudflare')!
    render(<ConnectorIcon connector={cf} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Cloudflare' }).getAttribute('src')).toBe('/connectors/cloudflare.png')
  })

  it('Gmail mostra o logo oficial', () => {
    const gmail = connectors.find((c) => c.slug === 'gmail')!
    render(<ConnectorIcon connector={gmail} className="h-6 w-6" />)
    const img = screen.getByRole('img', { name: 'Gmail' }) as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/connectors/gmail.png')
  })

  it('Vertal.app mostra o logo oficial', () => {
    const app = connectors.find((c) => c.slug === 'vertal-app')!
    render(<ConnectorIcon connector={app} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Vertal.app' }).getAttribute('src')).toBe('/connectors/vertal-app.png')
  })

  it('Vertal Run mostra o logo oficial', () => {
    const run = connectors.find((c) => c.slug === 'vertal-run')!
    render(<ConnectorIcon connector={run} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Vertal Run' }).getAttribute('src')).toBe('/connectors/vertal-run.png')
  })

  it('conector sem logo continua com o ícone padrão', () => {
    const other = connectors.find((c) => !c.logoUrl)!
    const { container } = render(<ConnectorIcon connector={other} className="h-6 w-6" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('Mais Retorno mostra o logo e expõe a URL MCP com OAuth', () => {
    const mr = connectors.find((c) => c.slug === 'mais-retorno')!
    expect(mr.mcpUrl).toBe('https://data.maisretorno.com/mr-data/v4/mcp/oauth')
    expect(mr.authType).toBe('oauth')
    render(<ConnectorIcon connector={mr} className="h-6 w-6" />)
    expect(screen.getByRole('img', { name: 'Mais Retorno' }).getAttribute('src')).toBe('/connectors/mais-retorno.png')
  })
})
