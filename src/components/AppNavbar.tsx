import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface NavbarConfig {
  id: string
  app_id: string
  logo_url?: string
  logo_height: number
  bg_color: string
  text_color: string
  accent_color: string
  position: 'sticky' | 'fixed' | 'static'
  shadow: boolean
  rounded: string
  menu_items: Array<{ label: string; href: string; icon?: string; target?: string }>
  show_search: boolean
  show_auth_buttons: boolean
  sticky_top: string
  z_index: string
  padding: string
  transparency: string
  is_active: boolean
}

interface AppNavbarProps {
  appId: string
  appName?: string
  theme?: 'light' | 'dark' | 'custom'
  onAuthClick?: () => void
  onGetStartedClick?: () => void
}

const DEFAULT_CONFIG: NavbarConfig = {
  id: '',
  app_id: '',
  logo_height: 40,
  bg_color: '#ffffff',
  text_color: '#000000',
  accent_color: '#0066ff',
  position: 'sticky',
  shadow: true,
  rounded: 'lg',
  menu_items: [
    { label: 'Home', href: '/' },
    { label: 'Sobre', href: '/about' },
    { label: 'Contato', href: '/contact' },
  ],
  show_search: false,
  show_auth_buttons: true,
  sticky_top: 'top-0',
  z_index: 'z-50',
  padding: 'px-6 h-16',
  transparency: 'opacity-100',
  is_active: true,
}

export default function AppNavbar({
  appId,
  appName = 'Seu App',
  theme = 'custom',
  onAuthClick,
  onGetStartedClick,
}: AppNavbarProps) {
  const [config, setConfig] = useState<NavbarConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (theme === 'custom') {
      fetchNavbarConfig()
    } else if (theme === 'light') {
      setConfig({
        ...DEFAULT_CONFIG,
        bg_color: '#ffffff',
        text_color: '#000000',
      })
      setLoading(false)
    } else if (theme === 'dark') {
      setConfig({
        ...DEFAULT_CONFIG,
        bg_color: '#1a1a1a',
        text_color: '#ffffff',
      })
      setLoading(false)
    }
  }, [appId, theme])

  const fetchNavbarConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/navbar-config?action=get&app_id=${appId}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          },
        }
      )

      if (response.ok) {
        const result = await response.json()
        setConfig(result.config)
      } else {
        setConfig(DEFAULT_CONFIG)
      }
    } catch (err) {
      console.error('Error fetching navbar config:', err)
      setConfig(DEFAULT_CONFIG)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <nav className="sticky top-0 z-50 h-16 bg-muted border-b border-border" />
    )
  }

  const positionClass = {
    sticky: 'sticky',
    fixed: 'fixed w-full',
    static: 'static',
  }[config.position]

  const roundedClass = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
  }[config.rounded]

  const shadowClass = config.shadow ? 'shadow-md' : ''

  return (
    <nav
      className={`${positionClass} ${config.sticky_top} ${config.z_index} ${config.padding} flex items-center justify-between border-b border-opacity-10 ${shadowClass} ${roundedClass} ${config.transparency}`}
      style={{
        backgroundColor: config.bg_color,
        color: config.text_color,
      }}
    >
      {/* Logo & Brand */}
      <div className="flex items-center gap-3 min-w-0">
        {config.logo_url && (
          <img
            src={config.logo_url}
            alt={appName}
            style={{ height: `${config.logo_height}px` }}
            className="object-contain"
          />
        )}
        <span className="font-bold text-lg truncate">{appName}</span>
      </div>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center gap-1">
        {config.menu_items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target={item.target || '_self'}
            className="px-3 py-2 text-sm font-medium rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: config.text_color }}
          >
            {item.label}
          </a>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        {config.show_search && (
          <input
            type="text"
            placeholder="Buscar..."
            className="hidden sm:block px-3 py-2 text-sm rounded-lg border opacity-50"
            style={{
              borderColor: config.text_color,
              backgroundColor: 'transparent',
              color: config.text_color,
            }}
          />
        )}

        {/* Auth Buttons */}
        {config.show_auth_buttons && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg text-xs sm:text-sm"
              style={{ color: config.text_color }}
              onClick={onAuthClick}
            >
              Entrar
            </Button>
            <Button
              size="sm"
              className="rounded-lg text-xs sm:text-sm"
              style={{ backgroundColor: config.accent_color }}
              onClick={onGetStartedClick}
            >
              Começar
            </Button>
          </>
        )}

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: config.text_color }}
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="absolute top-full left-0 right-0 md:hidden border-t border-opacity-10"
          style={{ backgroundColor: config.bg_color, borderColor: config.text_color }}
        >
          <div className="p-4 space-y-2">
            {config.menu_items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                target={item.target || '_self'}
                className="block px-3 py-2 text-sm font-medium rounded-lg hover:opacity-70 transition-opacity"
                style={{ color: config.text_color }}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
