import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Cube, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface Game {
  id: string
  title: string
  description?: string
  game_type: '3d' | 'realistic' | 'metaverse' | '4d'
  engine: string
  cover_image_url?: string
  config: Record<string, any>
}

interface Game3DBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function Game3DBuilder({ game, onBack, onSave }: Game3DBuilderProps) {
  const [config, setConfig] = useState(game.config)
  const [selectedScene, setSelectedScene] = useState('main')
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
            <p className="text-xs text-muted-foreground">Editor 3D • {game.engine}</p>
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
        {/* Left Panel - Scenes & Objects */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Scenes */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Cenas</h3>
              <div className="space-y-2">
                {['main', 'menu', 'level1', 'level2'].map(scene => (
                  <button
                    key={scene}
                    onClick={() => setSelectedScene(scene)}
                    className={`w-full p-2 rounded text-left text-sm transition-colors ${
                      selectedScene === scene
                        ? 'bg-primary/20 border border-primary'
                        : 'bg-muted border border-border hover:border-primary/50'
                    }`}
                  >
                    📄 {scene}
                  </button>
                ))}
              </div>
            </div>

            {/* Object Library */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2">Objetos 3D</h3>
              <div className="space-y-2">
                {[
                  { icon: '⬜', name: 'Cube' },
                  { icon: '⚫', name: 'Sphere' },
                  { icon: '📦', name: 'Box' },
                  { icon: '🏔️', name: 'Terrain' },
                  { icon: '💡', name: 'Light' },
                  { icon: '📷', name: 'Camera' },
                ].map(obj => (
                  <div
                    key={obj.name}
                    className="p-2 bg-muted border border-border rounded cursor-move hover:border-primary/50 transition-colors text-sm"
                  >
                    {obj.icon} {obj.name}
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
              <div className="text-6xl mb-4">🎮</div>
              <h2 className="text-2xl font-bold text-white mb-2">Editor Canvas 3D</h2>
              <p className="text-gray-400 mb-4">Arraste objetos do painel esquerdo</p>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Scene Properties */}
            <div>
              <h3 className="font-semibold mb-3">Propriedades da Cena</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nome da Cena</label>
                  <input
                    type="text"
                    value={selectedScene}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Lighting */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Iluminação
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cor de Fundo</label>
                  <input
                    type="color"
                    value={config.backgroundColor || '#000000'}
                    onChange={e => setConfig({ ...config, backgroundColor: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Luz Ambiente</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.ambientLight || 50}
                    onChange={e => setConfig({ ...config, ambientLight: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Physics */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Física</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Motor de Física</label>
                  <select
                    value={config.physicsEngine || 'rapier'}
                    onChange={e => setConfig({ ...config, physicsEngine: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  >
                    <option value="rapier">Rapier</option>
                    <option value="cannon">Cannon.js</option>
                    <option value="oimo">Oimo.js</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Gravidade</label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.gravity || 9.8}
                    onChange={e => setConfig({ ...config, gravity: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Graphics Settings */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Gráficos</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.shadowsEnabled || true}
                    onChange={e => setConfig({ ...config, shadowsEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Ativar Sombras</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.reflectionsEnabled || false}
                    onChange={e => setConfig({ ...config, reflectionsEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Reflexões</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
