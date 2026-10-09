import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Grid3X3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface GameRetroConfig {
  pixelSize?: number
  resolution?: string
  style?: string
  fps?: number
  chiptune?: boolean
  selectedColor?: string
  palette?: string[]
}

interface Game {
  id: string
  title: string
  description?: string
  game_type: 'retro'
  engine: string
  cover_image_url?: string
  config: GameRetroConfig
}

interface GameRetroBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function GameRetroBuilder({ game, onBack, onSave }: GameRetroBuilderProps) {
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
            <p className="text-xs text-muted-foreground">Editor Retro • Pixel Art</p>
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
        {/* Left Panel - Sprites & Tiles */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2">Paleta de Cores</h3>
              <div className="grid grid-cols-4 gap-2">
                {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'].map(color => (
                  <div
                    key={color}
                    className="w-10 h-10 rounded cursor-pointer hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2">Tamanho do Pixel</h3>
              <input
                type="range"
                min="1"
                max="32"
                value={config.pixelSize || 16}
                onChange={e => setConfig({ ...config, pixelSize: parseInt(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">{config.pixelSize || 16}px</p>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2">Sprites Disponíveis</h3>
              <div className="space-y-2">
                {['Player', 'Enemy', 'Item', 'Tile'].map(sprite => (
                  <div
                    key={sprite}
                    className="p-2 bg-muted border border-border rounded cursor-move hover:border-primary transition-colors text-sm"
                  >
                    👾 {sprite}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">👾</div>
              <h2 className="text-2xl font-bold text-white mb-2">Editor Pixel Art</h2>
              <p className="text-gray-400 mb-4">Grade de pixels {config.pixelSize || 16}x{config.pixelSize || 16}</p>
              <div className="inline-block border-2 border-gray-400 p-4 rounded">
                <div
                  className="grid gap-0"
                  style={{
                    gridTemplateColumns: `repeat(16, ${config.pixelSize || 16}px)`,
                  }}
                >
                  {Array.from({ length: 256 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-gray-700 border border-gray-600 cursor-pointer hover:bg-gray-500 transition-colors"
                      style={{
                        width: `${config.pixelSize || 16}px`,
                        height: `${config.pixelSize || 16}px`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Game Properties */}
            <div>
              <h3 className="font-semibold mb-3">Propriedades Retro</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Resolução</label>
                  <select
                    value={config.resolution || '320x240'}
                    onChange={e => setConfig({ ...config, resolution: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  >
                    <option value="160x144">160x144 (GB)</option>
                    <option value="256x224">256x224 (SNES)</option>
                    <option value="320x240">320x240 (NES)</option>
                    <option value="512x384">512x384 (Arcade)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Palette */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Estilo</h3>
              <div className="space-y-2">
                {['CRT', 'Scanlines', 'Pixelated'].map(style => (
                  <label key={style} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="style"
                      checked={config.style === style}
                      onChange={() => setConfig({ ...config, style })}
                    />
                    <span className="text-sm">{style}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Animation */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Animação</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">FPS</label>
                  <input
                    type="number"
                    value={config.fps || 60}
                    onChange={e => setConfig({ ...config, fps: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Sound */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Áudio Chiptune</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.chiptuneEnabled || true}
                    onChange={e => setConfig({ ...config, chiptuneEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Som 8-bit</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
