import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { APP_NAME } from '@/config/brand'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'Download', to: '/download' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Alternativas', to: '/alternativas' },
  { label: 'Docs', to: '/docs' },
  { label: 'Shortlinks', to: '/shortlinks' },
  { label: 'Support', to: '/support' },
] as const

/**
 * Medidas do navbar por breakpoint, num lugar só. Conferidas sem rolagem
 * horizontal de 320px (iPhone SE) a 1920px; abaixo de `lg` (1024px) os links
 * vão para o menu.
 */
const LAYOUT = {
  bar: 'h-14 gap-2 px-3 min-[360px]:h-16 min-[360px]:gap-3 min-[360px]:px-4 sm:px-6 lg:h-[72px] lg:gap-4 lg:px-8',
  logo: 'h-7 min-[360px]:h-8 sm:h-9 xl:h-10',
  link: 'px-2.5 py-1.5 text-sm xl:px-4',
  cta: 'h-8 px-3 text-[13px] min-[360px]:h-9 min-[360px]:px-4 min-[360px]:text-sm sm:px-5',
  login: 'hidden h-9 px-4 sm:inline-flex',
  menuButton: 'h-8 w-8 min-[360px]:h-9 min-[360px]:w-9',
} as const

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
}

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Fecha o menu mobile ao trocar de página.
  useEffect(() => setOpen(false), [pathname])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors duration-300 ${
        scrolled || open
          ? 'border-white/10 bg-background/80 backdrop-blur-xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]'
          : 'border-transparent bg-background/40 backdrop-blur-md'
      }`}
    >
      <nav className={`mx-auto flex max-w-7xl items-center ${LAYOUT.bar}`}>
        <Link
          to="/"
          aria-label={APP_NAME}
          className="flex h-full shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <AnimatedLogo responsive className={`${LAYOUT.logo} transition-opacity hover:opacity-90`} />
        </Link>

        <ul className="mx-auto hidden min-w-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`block whitespace-nowrap rounded-full font-medium transition-colors ${LAYOUT.link} ${
                    active
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[360px]:gap-2 lg:ml-0">
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-full font-medium text-muted-foreground hover:text-foreground ${LAYOUT.login}`}
            onClick={() => go('/auth')}
          >
            Log in
          </Button>
          <Button variant="hero" size="sm" className={`shrink-0 rounded-full ${LAYOUT.cta}`} onClick={() => go('/auth')}>
            Get started
          </Button>
          <button
            type="button"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex shrink-0 items-center justify-center rounded-full ${LAYOUT.menuButton} border border-white/10 bg-white/[0.04] text-foreground transition-colors hover:bg-white/10 lg:hidden`}
          >
            {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-white/10 lg:hidden"
          >
            <ul className="mx-auto max-h-[calc(100dvh-4rem)] max-w-7xl space-y-1 overflow-y-auto px-3 py-3 min-[360px]:px-4 sm:px-6">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.to)
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                        active
                          ? 'bg-white/10 text-foreground'
                          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
              <li className="pt-2 sm:hidden">
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-white/15 bg-transparent"
                  onClick={() => go('/auth')}
                >
                  Log in
                </Button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
