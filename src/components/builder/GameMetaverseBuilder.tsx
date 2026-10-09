import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Play, Users, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

interface Game {
  id: string
  title: string
  description?: string
  game_type: 'metaverse'
  engine: string
  cover_image_url?: string
  config: Record<string, any>
}

interface GameMetaverseBuilderProps {
  game: Game
  onBack: () => void
  onSave: () => void
}

export default function GameMetaverseBuilder({ game, onBack, onSave }: GameMetaverseBuilderProps) {
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
            is_multiplayer: true,
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
            <p className="text-xs text-muted-foreground">Editor Metaverso • Multiplayer</p>
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
        {/* Left Panel - Worlds & Spaces */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Mundos Disponíveis
              </h3>
              <div className="space-y-2">
                {['Hub Central', 'Arena de Batalha', 'Praça Social', 'Zona de Trading', 'Sala de Eventos'].map(world => (
                  <div
                    key={world}
                    className="p-2 bg-muted border border-border rounded cursor-pointer hover:border-primary transition-colors text-sm"
                  >
                    🌍 {world}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Avatares
              </h3>
              <div className="space-y-2">
                {['Humanoid', 'Fantasy', 'Sci-Fi', 'Animal'].map(avatar => (
                  <div
                    key={avatar}
                    className="p-2 bg-muted border border-border rounded cursor-move hover:border-primary transition-colors text-sm"
                  >
                    👤 {avatar}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gradient-to-br from-purple-900 via-slate-900 to-slate-900 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">🌐</div>
              <h2 className="text-2xl font-bold text-white mb-2">Construtor de Mundos Metaverso</h2>
              <p className="text-gray-400 mb-4">Crie espaços colaborativos multiplayer</p>
              <div className="flex gap-4 justify-center">
                <div className="text-center">
                  <div className="text-3xl mb-1">👥</div>
                  <p className="text-xs text-gray-400">Players Conectados: 0</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl mb-1">📍</div>
                  <p className="text-xs text-gray-400">Mundos: 5</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar - Multiplayer Settings */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Server Settings */}
            <div>
              <h3 className="font-semibold mb-3">Configurações de Servidor</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Max Players por Mundo</label>
                  <input
                    type="number"
                    value={config.maxPlayers || 100}
                    onChange={e => setConfig({ ...config, maxPlayers: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de Servidor</label>
                  <select
                    value={config.serverType || 'cloud'}
                    onChange={e => setConfig({ ...config, serverType: e.target.value })}
                    className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                  >
                    <option value="cloud">Cloud (Supabase)</option>
                    <option value="self-hosted">Self-Hosted</option>
                    <option value="hybrid">Híbrido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Avatar Customization */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Customização de Avatar</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.avatarCustomization || true}
                    onChange={e => setConfig({ ...config, avatarCustomization: e.target.checked })}
                  />
                  <span className="text-sm">Permitir Customização</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.nftAvatars || false}
                    onChange={e => setConfig({ ...config, nftAvatars: e.target.checked })}
                  />
                  <span className="text-sm">Suporte a NFT Avatares</span>
                </label>
              </div>
            </div>

            {/* Social Features */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Funcionalidades Sociais</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.voiceChat || true}
                    onChange={e => setConfig({ ...config, voiceChat: e.target.checked })}
                  />
                  <span className="text-sm">Voice Chat</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.textChat || true}
                    onChange={e => setConfig({ ...config, textChat: e.target.checked })}
                  />
                  <span className="text-sm">Chat de Texto</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.friendSystem || true}
                    onChange={e => setConfig({ ...config, friendSystem: e.target.checked })}
                  />
                  <span className="text-sm">Sistema de Amigos</span>
                </label>
              </div>
            </div>

            {/* Economy */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-3">Economia do Mundo</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.trading || true}
                    onChange={e => setConfig({ ...config, trading: e.target.checked })}
                  />
                  <span className="text-sm">Trading de Itens</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.cryptocurrency || false}
                    onChange={e => setConfig({ ...config, cryptocurrency: e.target.checked })}
                  />
                  <span className="text-sm">Suporte a Crypto</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
