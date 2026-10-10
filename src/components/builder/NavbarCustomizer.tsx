import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutTemplate, Palette, Settings, Plus, Trash2, Eye, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
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
  created_at: string
  updated_at: string
}

interface NavbarCustomizerProps {
  appId: string
  appName?: string
}

const POSITION_OPTIONS = [
  { value: 'sticky', label: 'Sticky (segue ao rolar)' },
  { value: 'fixed', label: 'Fixed (sempre visível)' },
  { value: 'static', label: 'Static (normal)' },
]

const ROUNDED_OPTIONS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'sm', label: 'Pequeno' },
  { value: 'md', label: 'Médio' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Extra grande' },
]

export default function NavbarCustomizer({ appId, appName = 'Seu App' }: NavbarCustomizerProps) {
  const [config, setConfig] = useState<NavbarConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [newMenuLabel, setNewMenuLabel] = useState('')
  const [newMenuHref, setNewMenuHref] = useState('')

  useEffect(() => {
    fetchNavbarConfig()
  }, [appId])

  const fetchNavbarConfig = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/navbar-config?action=get&app_id=${appId}`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          // Create default config
          setConfig({
            id: '',
            app_id: appId,
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          return
        }
        throw new Error('Failed to fetch navbar config')
      }

      const result = await response.json()
      setConfig(result.config)
    } catch (err) {
      console.error('Error fetching navbar config:', err)
      toast.error('Erro ao carregar configuração do navbar')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return

    try {
      setSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/navbar-config?action=save`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_id: appId,
            ...config,
          }),
        }
      )

      if (!response.ok) throw new Error('Failed to save navbar config')

      const result = await response.json()
      setConfig(result.config)
      toast.success('Navbar customizado com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar navbar')
    } finally {
      setSaving(false)
    }
  }

  const addMenuItem = () => {
    if (!newMenuLabel.trim() || !newMenuHref.trim()) {
      toast.error('Preencha o rótulo e a URL')
      return
    }

    if (!config) return

    setConfig({
      ...config,
      menu_items: [
        ...config.menu_items,
        { label: newMenuLabel, href: newMenuHref },
      ],
    })

    setNewMenuLabel('')
    setNewMenuHref('')
  }

  const removeMenuItem = (index: number) => {
    if (!config) return
    setConfig({
      ...config,
      menu_items: config.menu_items.filter((_, i) => i !== index),
    })
  }

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg">
            <LayoutTemplate className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-display">Customizar Navbar</h3>
            <p className="text-sm text-muted-foreground">
              Personalize a barra de navegação do seu aplicativo
            </p>
          </div>
        </div>
      </motion.div>

      {/* Preview Button */}
      <Button
        onClick={() => setShowPreview(!showPreview)}
        variant="outline"
        className="w-full justify-center gap-2"
      >
        <Eye className="h-4 w-4" />
        {showPreview ? 'Fechar' : 'Visualizar'} Prévia
      </Button>

      {/* Live Preview */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className={`${config.position} ${config.sticky_top} ${config.z_index} ${config.padding} flex items-center justify-between border-b border-border`}
              style={{
                backgroundColor: config.bg_color,
                color: config.text_color,
                borderRadius: config.rounded !== 'none' ? `var(--radius)` : '0',
                boxShadow: config.shadow ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                {config.logo_url && (
                  <img
                    src={config.logo_url}
                    alt="Logo"
                    style={{ height: `${config.logo_height}px` }}
                    className="object-contain"
                  />
                )}
                <span className="font-bold">{appName}</span>
              </div>

              <div className="hidden md:flex items-center gap-1">
                {config.menu_items.map((item) => (
                  <Button
                    key={item.href}
                    variant="ghost"
                    size="sm"
                    style={{ color: config.accent_color }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {config.show_auth_buttons && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">
                    Entrar
                  </Button>
                  <Button size="sm" style={{ backgroundColor: config.accent_color }}>
                    Começar
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Style Settings */}
      <div className="grid md:grid-cols-2 gap-4 border-t border-border pt-6">
        <div className="space-y-4">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Cores
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-2 block">Cor de Fundo</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={config.bg_color}
                  onChange={(e) => setConfig({ ...config, bg_color: e.target.value })}
                  className="h-10 w-14 rounded cursor-pointer border border-border"
                />
                <Input
                  value={config.bg_color}
                  onChange={(e) => setConfig({ ...config, bg_color: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block">Cor do Texto</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={config.text_color}
                  onChange={(e) => setConfig({ ...config, text_color: e.target.value })}
                  className="h-10 w-14 rounded cursor-pointer border border-border"
                />
                <Input
                  value={config.text_color}
                  onChange={(e) => setConfig({ ...config, text_color: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block">Cor de Acento</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={config.accent_color}
                  onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                  className="h-10 w-14 rounded cursor-pointer border border-border"
                />
                <Input
                  value={config.accent_color}
                  onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </h4>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-2 block">Posição</label>
              <select
                value={config.position}
                onChange={(e) => setConfig({ ...config, position: e.target.value as any })}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block">Cantos Arredondados</label>
              <select
                value={config.rounded}
                onChange={(e) => setConfig({ ...config, rounded: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              >
                {ROUNDED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.shadow}
                onChange={(e) => setConfig({ ...config, shadow: e.target.checked })}
                className="rounded border border-border"
              />
              <span className="text-xs font-medium">Adicionar Sombra</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.show_auth_buttons}
                onChange={(e) => setConfig({ ...config, show_auth_buttons: e.target.checked })}
                className="rounded border border-border"
              />
              <span className="text-xs font-medium">Mostrar Botões de Auth</span>
            </label>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="border-t border-border pt-6 space-y-4">
        <h4 className="font-semibold text-sm">Items do Menu</h4>

        <div className="space-y-2">
          {config.menu_items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
              <div className="flex-1">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.href}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMenuItem(idx)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="bg-secondary/30 rounded-lg p-4 space-y-3 border border-border">
          <h5 className="text-sm font-medium">Adicionar Item do Menu</h5>
          <div className="flex gap-2">
            <Input
              placeholder="Rótulo (ex: Home)"
              value={newMenuLabel}
              onChange={(e) => setNewMenuLabel(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="URL (ex: /)"
              value={newMenuHref}
              onChange={(e) => setNewMenuHref(e.target.value)}
              className="text-sm"
            />
            <Button onClick={addMenuItem} size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>
      </div>

      {/* Code Export */}
      <div className="border-t border-border pt-6 space-y-4">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Code className="h-4 w-4" />
          Integrar em seu App
        </h4>

        <div className="bg-muted p-4 rounded-lg border border-border overflow-x-auto">
          <pre className="text-xs font-mono">
            {`<AppNavbar
  appId="${appId}"
  theme="custom"
/>`}
          </pre>
        </div>

        <p className="text-xs text-muted-foreground">
          Use o componente AppNavbar no seu aplicativo para renderizar o navbar customizado
        </p>
      </div>

      {/* Save Button */}
      <Button
        onClick={saveConfig}
        disabled={saving}
        size="lg"
        className="w-full"
      >
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  )
}
