import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface GameRealisticConfig {
  rayTracingEnabled?: boolean
  bloomEnabled?: boolean
  depthOfFieldEnabled?: boolean
  giQuality?: string
  bounces?: number
  resolution?: string
  targetFps?: number
  selectedMaterial?: string
}

interface Game {
  id: string
  title: string
  description?: string
  game_type: 'realistic'
  engine: string
  cover_image_url?: string
  config: GameRealisticConfig
}

interface GameRealisticBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function GameRealisticBuilder({ game, onBack, onSave }: GameRealisticBuilderProps) {
  const [config, setConfig] = useState(game.config)
  const [saving, setSaving] = useState(false)
  const [sessionToken, setSessionToken] = useState('')

  useEffect(() => {
    getSession()
  }, [])

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      setSessionToken(session.access_token)
    }
  }

  const handleSaveGame = async () => {
    try {
      setSaving(true)
      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/update-game`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            game_id: game.id,
            config: config,
          }),
        }
      )

      if (response.ok) {
        onSave()
      }
    } catch (err) {
      console.error('Error saving game:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{game.title}</h1>
            <p className="text-xs text-muted-foreground">Editor Realista • Alta Fidelidade</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Play className="h-4 w-4" />
            Preview
          </Button>
          <Button size="sm" className="gap-2" onClick={handleSaveGame} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Materials & Textures */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Materiais PBR
              </h3>
              <div className="space-y-2">
                {['Metal', 'Wood', 'Ceramic', 'Leather', 'Concrete', 'Glass'].map(material => (
                  <div
                    key={material}
                    className="p-2 bg-muted border border-border rounded cursor-pointer hover:border-primary transition-colors text-sm"
                  >
                    🎨 {material}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2">Objetos 3D Premium</h3>
              <div className="space-y-2">
                {['Characters', 'Props', 'Vehicles', 'Buildings'].map(obj => (
                  <div
                    key={obj}
                    className="p-2 bg-muted border border-border rounded cursor-move hover:border-primary transition-colors text-sm"
                  >
                    📦 {obj}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🌟</div>
              <h2 className="text-2xl font-bold text-white mb-2">Renderizador Realista</h2>
              <p className="text-gray-400 mb-4">Ray Tracing • PBR • High Poly</p>
              <p className="text-gray-500 text-sm">Engine: {game.engine}</p>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Advanced Properties */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Rendering Settings */}
            <div>
              <h3 className="font-semibold mb-3">Configurações de Renderização</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.rayTracingEnabled || true}
                    onChange={e => setConfig({ ...config, rayTracingEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Ray Tracing</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.bloomEnabled || true}
                    onChange={e => setConfig({ ...config, bloomEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Bloom/Glow</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.dofEnabled || true}
                    onChange={e => setConfig({ ...config, dofEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Depth of Field</span>
                </label>
              </div>
            </div>

            {/* Lighting */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Iluminação Global</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">GI Quality</label>
                  <select
                    value={config.giQuality || 'high'}
                    onChange={e => setConfig({ ...config, giQuality: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Bounces</label>
                  <input
                    type="number"
                    value={config.bounces || 4}
                    onChange={e => setConfig({ ...config, bounces: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Resolution */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Resolução</h3>
              <div className="space-y-2">
                {['1080p', '1440p', '4K', '8K'].map(res => (
                  <label key={res} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      checked={config.resolution === res}
                      onChange={() => setConfig({ ...config, resolution: res })}
                    />
                    <span className="text-sm">{res}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Performance */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Desempenho</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Target FPS</label>
                  <input
                    type="number"
                    value={config.targetFps || 60}
                    onChange={e => setConfig({ ...config, targetFps: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
