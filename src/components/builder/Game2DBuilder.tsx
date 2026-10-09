import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface Game {
  id: string
  title: string
  description?: string
  game_type: '2d'
  engine: string
  cover_image_url?: string
  config: Record<string, any>
}

interface Game2DBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function Game2DBuilder({ game, onBack, onSave }: Game2DBuilderProps) {
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
            <p className="text-xs text-muted-foreground">Editor 2D • {game.engine}</p>
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
        {/* Canvas Area */}
        <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <h2 className="text-2xl font-bold text-white mb-2">Editor Canvas 2D</h2>
              <p className="text-gray-400 mb-4">Comece adicionando objetos e scripts</p>
              <div className="flex gap-2 justify-center">
                <Button className="gap-2">
                  <Package className="h-4 w-4" />
                  Adicionar Objeto
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Game Properties */}
            <div>
              <h3 className="font-semibold mb-3">Propriedades do Game</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Largura</label>
                  <input
                    type="number"
                    value={config.width || 800}
                    onChange={e => setConfig({ ...config, width: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Altura</label>
                  <input
                    type="number"
                    value={config.height || 600}
                    onChange={e => setConfig({ ...config, height: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cor de Fundo</label>
                  <input
                    type="color"
                    value={config.backgroundColor || '#000000'}
                    onChange={e => setConfig({ ...config, backgroundColor: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Physics Settings */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Física</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.physicsEnabled || false}
                    onChange={e => setConfig({ ...config, physicsEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Ativar Física</span>
                </label>
                {config.physicsEnabled && (
                  <>
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
                  </>
                )}
              </div>
            </div>

            {/* Audio Settings */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Áudio</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.audioEnabled || true}
                    onChange={e => setConfig({ ...config, audioEnabled: e.target.checked })}
                  />
                  <span className="text-sm">Ativar Áudio</span>
                </label>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Volume</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.masterVolume || 100}
                    onChange={e => setConfig({ ...config, masterVolume: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Difficulty Settings */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Dificuldade</h3>
              <div className="space-y-2">
                {['Easy', 'Normal', 'Hard', 'Nightmare'].map(difficulty => (
                  <label key={difficulty} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="difficulty"
                      checked={config.difficulty === difficulty}
                      onChange={() => setConfig({ ...config, difficulty })}
                    />
                    <span className="text-sm">{difficulty}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Panel - Objects */}
      <div className="h-32 bg-card border-t border-border p-4 overflow-x-auto">
        <h3 className="font-semibold mb-2 text-sm">Objetos do Game</h3>
        <div className="flex gap-2">
          <div className="flex-shrink-0 w-20 h-20 bg-muted border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
            <div className="text-center">
              <div className="text-2xl">+</div>
              <p className="text-xs text-muted-foreground">Novo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
