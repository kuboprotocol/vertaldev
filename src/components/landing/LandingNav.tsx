/**
 * Navigation bar of the public landing page ("/") only.
 * The shared `Navbar` (used by /pricing, /download, /alternativas, ...) is not changed.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { APP_NAME } from '@/config/brand'
import { cn } from '@/lib/utils'
import { focusRing } from './landingUi'

/** Same destinations as the old landing navbar ("Home" is the logo, the rest is in the footer). */
const LINKS = [
  { label: 'Ecosystem', to: '/ecossistema' },
  { label: 'Vibe Pay', to: '/vibe-pay' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Docs', to: '/docs' },
  { label: 'Download', to: '/download' },
  { label: 'Support', to: '/support' },
] as const

const linkCls = cn('rounded-md px-3 py-2 text-[13px] text-foreground/75 transition-colors hover:text-foreground', focusRing)

export default function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
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

        <ul className="hidden items-center md:flex">
          {LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className={linkCls}>
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
            className={cn('ml-1 rounded-md p-2 text-foreground/80 md:hidden', focusRing)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="landing-mobile-menu" className="border-t border-white/[0.06] md:hidden">
          <ul className="mx-auto max-w-5xl px-6 py-3">
            {[...LINKS, { label: 'Log in', to: '/auth' }].map((l) => (
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
