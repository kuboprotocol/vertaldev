/** Footer shared by the landing page and the public pages. Keeps every link of the old footer and navbar. */
import { Link } from 'react-router-dom'
import { APP_NAME, BRAND } from '@/config/brand'
import { cn } from '@/lib/utils'
import { focusRing } from './siteUi'

type FooterLink = { label: string; to: string; external?: boolean }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Ecosystem', to: '/ecossistema' },
      { label: 'Vertal Vibe Pay', to: '/vibe-pay' },
      { label: 'Integrations', to: '/integracoes' },
      { label: 'Download', to: '/download' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'Alternatives', to: '/alternativas' },
      { label: 'Rewards', to: '/recompensas' },
      { label: 'Support', to: '/support' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'X (Twitter)', to: 'https://x.com/KUBOPROTOCOL', external: true },
      { label: 'Telegram', to: 'https://t.me/+WoYG4tMTuJY5ZjNh', external: true },
      { label: 'GitHub', to: 'https://github.com/kuboprotocol/kubovibe', external: true },
      {
        label: 'Spotify',
        to: 'https://open.spotify.com/intl-pt/track/4T0fiAFOJU8d7fGC0DcMH0?si=ac6a7ed6a30a4c90',
        external: true,
      },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
    ],
  },
]

const linkCls = cn('rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-foreground', focusRing)

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-card/30 px-6 pb-10 pt-14">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-[13px] font-semibold text-foreground">{col.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.to} target="_blank" rel="noopener noreferrer" className={linkCls}>
                        {l.label}
                      </a>
                    ) : (
                      <Link to={l.to} className={linkCls}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/[0.06] pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/vertal-dev-logo.webp" alt="" width={480} height={446} className="h-6 w-auto" loading="lazy" />
            <p>
              <span translate="no">{APP_NAME}</span> is a product of <span translate="no">KUBO PROTOCOL</span>. CNPJ
              65.822.139/0001-66
            </p>
          </div>
          <p>
            Copyright © {new Date().getFullYear()} <span translate="no">{BRAND.company.toUpperCase()}</span>. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
