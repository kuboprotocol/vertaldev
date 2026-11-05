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

  it('conector sem logo continua com o ícone padrão', () => {
    const other = connectors.find((c) => !c.logoUrl)!
    const { container } = render(<ConnectorIcon connector={other} className="h-6 w-6" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})
