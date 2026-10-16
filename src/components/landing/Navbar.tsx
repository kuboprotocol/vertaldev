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
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link
          to="/"
          aria-label={APP_NAME}
          className="flex h-full shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <AnimatedLogo size={14} className="transition-opacity hover:opacity-90" />
        </Link>

        <ul className="mx-auto hidden items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.to)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors xl:px-4 ${
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

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            variant="ghost"
            size="sm"
            className="hidden rounded-full px-4 font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            onClick={() => go('/auth')}
          >
            Log in
          </Button>
          <Button variant="hero" size="sm" className="rounded-full px-4 sm:px-5" onClick={() => go('/auth')}>
            Get started
          </Button>
          <button
            type="button"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground transition-colors hover:bg-white/10 lg:hidden"
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
            <ul className="mx-auto max-w-7xl space-y-1 px-4 py-3 sm:px-6">
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
