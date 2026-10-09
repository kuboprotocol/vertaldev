import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Gamepad2, Trash2, Edit2, Copy, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import GameCreateModal from './GameCreateModal'
import Game2DBuilder from './Game2DBuilder'
import Game3DBuilder from './Game3DBuilder'
import GameRetroBuilder from './GameRetroBuilder'
import GameRealisticBuilder from './GameRealisticBuilder'
import GameMetaverseBuilder from './GameMetaverseBuilder'
import Game4DBuilder from './Game4DBuilder'

interface Game {
  id: string
  user_id: string
  title: string
  description?: string
  game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
  engine: string
  cover_image_url?: string
  status: 'draft' | 'published' | 'archived'
  plays: number
  likes: number
  created_at: string
  updated_at: string
}

export default function GameBuilder() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [sessionToken, setSessionToken] = useState<string>('')

  useEffect(() => {
    getSession()
    fetchGames()
  }, [])

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      setSessionToken(session.access_token)
    }
  }

  const fetchGames = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/get-games`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )

      if (response.ok) {
        const result = await response.json()
        setGames(result.games || [])
      }
    } catch (err) {
      console.error('Error fetching games:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGame = async (gameData: {
    title: string
    description?: string
    game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
    engine: string
    cover_image_url?: string
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/create-game`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(gameData),
        }
      )

      if (response.ok) {
        const result = await response.json()
        setGames([result.game, ...games])
        setShowCreateModal(false)
        setEditingGame(result.game)
      }
    } catch (err) {
      console.error('Error creating game:', err)
    }
  }

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Tem certeza que deseja deletar este game?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/delete-game?game_id=${gameId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )

      if (response.ok) {
        setGames(games.filter(g => g.id !== gameId))
        if (selectedGame?.id === gameId) setSelectedGame(null)
      }
    } catch (err) {
      console.error('Error deleting game:', err)
    }
  }

  const getGameTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      '2d': '2D',
      '3d': '3D',
      'retro': 'Retro',
      'realistic': 'Realista',
      'metaverse': 'Metaverso',
      '4d': '4D Ultra',
    }
    return labels[type] || type
  }

  const getEngineLabel = (engine: string) => {
    const labels: Record<string, string> = {
      'babylon': 'Babylon.js',
      'threejs': 'Three.js',
      'playcanvas': 'PlayCanvas',
      'pixijs': 'PixiJS',
      'phaser': 'Phaser',
      'custom': 'Custom',
    }
    return labels[engine] || engine
  }

  if (editingGame) {
    switch (editingGame.game_type) {
      case '2d':
        return <Game2DBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      case '3d':
        return <Game3DBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      case 'retro':
        return <GameRetroBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      case 'realistic':
        return <GameRealisticBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      case 'metaverse':
        return <GameMetaverseBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      case '4d':
        return <Game4DBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
      default:
        return <Game3DBuilder game={editingGame} onBack={() => setEditingGame(null)} onSave={fetchGames} />
    }
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Gamepad2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold font-display">Meus Games</h1>
                <p className="text-muted-foreground">Crie e gerencie seus games 2D, 3D, Retro, Realista, Metaverso e 4D</p>
              </div>
            </div>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Game
            </Button>
          </div>
        </motion.div>

        {/* Games Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Carregando games...</div>
          </div>
        ) : games.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Gamepad2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">Você ainda não criou nenhum game</p>
            <Button onClick={() => setShowCreateModal(true)}>Criar seu primeiro game</Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {games.map(game => (
              <motion.div
                key={game.id}
                whileHover={{ y: -4 }}
                className="bg-card/50 backdrop-blur border border-border rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => setEditingGame(game)}
              >
                {/* Game Cover */}
                <div className="relative h-40 bg-gradient-to-br from-primary/20 to-secondary/20 overflow-hidden">
                  {game.cover_image_url && (
                    <img
                      src={game.cover_image_url}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />

                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      game.status === 'published'
                        ? 'bg-green-500/20 text-green-400'
                        : game.status === 'archived'
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {game.status === 'published' ? 'Publicado' : game.status === 'archived' ? 'Arquivado' : 'Rascunho'}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-2 line-clamp-2">{game.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{game.description || 'Sem descrição'}</p>

                  {/* Type & Engine */}
                  <div className="flex gap-2 mb-4">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                      {getGameTypeLabel(game.game_type)}
                    </span>
                    <span className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full font-medium">
                      {getEngineLabel(game.engine)}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                    <span>👁️ {game.plays} plays</span>
                    <span>❤️ {game.likes} likes</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingGame(game)
                      }}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGame(game.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <GameCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateGame}
        />
      )}
    </div>
  )
}
