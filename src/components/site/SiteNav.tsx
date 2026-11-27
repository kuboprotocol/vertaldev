/**
 * Translucent top bar shared by the landing page and the public pages.
 * Links are passed in so each surface keeps its own destinations.
 */
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { APP_NAME } from '@/config/brand'
import { cn } from '@/lib/utils'
import { focusRing, surface } from './siteUi'

export type SiteNavLink = { label: string; to: string }

/** Links of the landing page ("Home" is the logo, the rest is in the footer). */
export const LANDING_NAV_LINKS: SiteNavLink[] = [
  { label: 'Ecosystem', to: '/ecossistema' },
  { label: 'Vibe Pay', to: '/vibe-pay' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Docs', to: '/docs' },
  { label: 'Download', to: '/download' },
  { label: 'Support', to: '/support' },
]

/** Links of the public pages: same destinations as the old shared navbar. */
export const PUBLIC_NAV_LINKS: SiteNavLink[] = [
  { label: 'Ecosystem', to: '/ecossistema' },
  { label: 'Vibe Pay', to: '/vibe-pay' },
  { label: 'Download', to: '/download' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Alternatives', to: '/alternativas' },
  { label: 'Docs', to: '/docs' },
  { label: 'Rewards', to: '/recompensas' },
  { label: 'Support', to: '/support' },
]

const linkCls = cn('rounded-md px-3 py-2 text-[13px] text-foreground/75 transition-colors hover:text-foreground', focusRing)

export default function SiteNav({ links = LANDING_NAV_LINKS }: { links?: SiteNavLink[] }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const isCurrent = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  // Many links: show them inline only on wide screens.
  const inlineAt = links.length > 6 ? 'lg' : 'md'

  return (
    <header className={cn('sticky top-0 z-50 border-b', surface.bar)}>
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" aria-label={`${APP_NAME} home`} className={cn('flex shrink-0 items-center rounded-md', focusRing)}>
          <img
            src="/vertal-dev-logo-horizontal.webp"
            alt=""
            width={843}
            height={240}
            className="h-7 w-auto"
            decoding="async"
          />
        </Link>

        <ul className={cn('hidden items-center', inlineAt === 'lg' ? 'lg:flex' : 'md:flex')}>
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                aria-current={isCurrent(l.to) ? 'page' : undefined}
                className={cn(linkCls, isCurrent(l.to) && 'text-foreground')}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <Link to="/auth" className={cn(linkCls, 'hidden sm:inline-flex')}>
            Log in
          </Link>
          <Link
            to="/auth"
            className={cn(
              'rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90',
              focusRing,
            )}
          >
            Get started
          </Link>
          <button
            type="button"
            className={cn('ml-1 rounded-md p-2 text-foreground/80', inlineAt === 'lg' ? 'lg:hidden' : 'md:hidden', focusRing)}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="site-mobile-menu" className={cn('border-t border-white/[0.06]', inlineAt === 'lg' ? 'lg:hidden' : 'md:hidden')}>
          <ul className="mx-auto max-w-6xl px-6 py-3">
            {[...links, { label: 'Log in', to: '/auth' }].map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={cn('block rounded-md py-3 text-[17px] text-foreground/85 hover:text-foreground', focusRing)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
