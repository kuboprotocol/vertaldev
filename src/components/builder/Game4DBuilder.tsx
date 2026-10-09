import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface Game {
  id: string
  title: string
  description?: string
  game_type: '4d'
  engine: string
  cover_image_url?: string
  config: Record<string, any>
}

interface Game4DBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function Game4DBuilder({ game, onBack, onSave }: Game4DBuilderProps) {
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
            <p className="text-xs text-muted-foreground">Editor 4D Ultra • Avançado</p>
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
        {/* Left Panel - Advanced Modules */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                Sistemas Avançados
              </h3>
              <div className="space-y-2">
                {['Simulação de Fluidos', 'Destruição Dinâmica', 'Clima em Tempo Real', 'Física Gravitacional', 'Deformação Terreno'].map(sys => (
                  <div
                    key={sys}
                    className="p-2 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded cursor-pointer hover:border-yellow-500/50 transition-colors text-sm"
                  >
                    ⚡ {sys}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2">Efeitos Especiais</h3>
              <div className="space-y-2">
                {['Partículas 4D', 'Hologramas', 'Buracos Negros', 'Wormholes', 'Dobra Espaço-Tempo'].map(effect => (
                  <div
                    key={effect}
                    className="p-2 bg-muted border border-border rounded cursor-move hover:border-primary transition-colors text-sm"
                  >
                    ✨ {effect}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-950 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="text-6xl mb-4 inline-block"
              >
                ⚡
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">Renderizador 4D Ultra</h2>
              <p className="text-gray-400 mb-4">Física Avançada • Efeitos Temporais • Simulações Complexas</p>
              <div className="text-purple-400 text-sm">Engine: {game.engine}</div>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Physics & Simulation */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Physics Engine */}
            <div>
              <h3 className="font-semibold mb-3">Simulação de Física</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Motor de Física</label>
                  <select
                    value={config.physicsEngine || 'rapier-4d'}
                    onChange={e => setConfig({ ...config, physicsEngine: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  >
                    <option value="rapier-4d">Rapier 4D</option>
                    <option value="bullet-advanced">Bullet Advanced</option>
                    <option value="custom-4d">Custom 4D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Timestep</label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.timestep || 0.016}
                    onChange={e => setConfig({ ...config, timestep: parseFloat(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Fluid Simulation */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Simulação de Fluidos</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.fluidSimulation || false}
                    onChange={e => setConfig({ ...config, fluidSimulation: e.target.checked })}
                  />
                  <span className="text-sm">Ativar SPH</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.vorticity || false}
                    onChange={e => setConfig({ ...config, vorticity: e.target.checked })}
                  />
                  <span className="text-sm">Vorticidade</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.surfaceTension || false}
                    onChange={e => setConfig({ ...config, surfaceTension: e.target.checked })}
                  />
                  <span className="text-sm">Tensão Superficial</span>
                </label>
              </div>
            </div>

            {/* Temporal Mechanics */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Mecânicas Temporais</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.timeRewinding || false}
                    onChange={e => setConfig({ ...config, timeRewinding: e.target.checked })}
                  />
                  <span className="text-sm">Time Rewinding</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.timeSlowing || false}
                    onChange={e => setConfig({ ...config, timeSlowing: e.target.checked })}
                  />
                  <span className="text-sm">Bullet Time</span>
                </label>
              </div>
            </div>

            {/* Advanced Rendering */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Renderização Avançada</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Ray Tracing Bounces</label>
                  <input
                    type="number"
                    value={config.rtBounces || 16}
                    onChange={e => setConfig({ ...config, rtBounces: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.pathTracing || false}
                    onChange={e => setConfig({ ...config, pathTracing: e.target.checked })}
                  />
                  <span className="text-sm">Path Tracing</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.superSampling || true}
                    onChange={e => setConfig({ ...config, superSampling: e.target.checked })}
                  />
                  <span className="text-sm">Super Sampling 4x</span>
                </label>
              </div>
            </div>

            {/* Performance */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Desempenho Computacional</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">GPU Threads</label>
                  <input
                    type="number"
                    value={config.gpuThreads || 512}
                    onChange={e => setConfig({ ...config, gpuThreads: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">VRAM Budget (MB)</label>
                  <input
                    type="number"
                    value={config.vramBudget || 8192}
                    onChange={e => setConfig({ ...config, vramBudget: parseInt(e.target.value) })}
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
