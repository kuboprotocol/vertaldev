import { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus, Search, Filter, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGames } from '@/hooks/useGames';
import { gameService } from '@/services/gameService';
import { Database } from '@/types/database';
import { toast } from 'sonner';

type Game = Database['public']['Tables']['games']['Row'];
type GameInsert = Database['public']['Tables']['games']['Insert'];

interface GameFormData {
  title: string;
  description: string;
  game_type: 'retro' | '2d' | '3d' | 'realistic' | 'metaverse' | '4d';
  engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';
  cover_image_url?: string;
}

const GAME_TYPES = ['2d', '3d', 'retro', 'realistic', 'metaverse', '4d'] as const;
const ENGINES = ['babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom'] as const;

export function GameManager() {
  const {
    games,
    loading,
    error,
    currentPage,
    totalPages,
    createGame,
    updateGame,
    deleteGame,
    searchGames,
    getGamesByType,
    loadGames,
    nextPage,
    prevPage,
  } = useGames(12);

  const [showForm, setShowForm] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [formData, setFormData] = useState<GameFormData>({
    title: '',
    description: '',
    game_type: '2d',
    engine: 'babylon',
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleFormChange = (field: keyof GameFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingGame) {
        await updateGame(editingGame.id, {
          title: formData.title,
          description: formData.description,
          game_type: formData.game_type,
          engine: formData.engine,
          cover_image_url: formData.cover_image_url,
        });
        toast.success('Game updated successfully');
      } else {
        await createGame({
          title: formData.title,
          description: formData.description,
          game_type: formData.game_type,
          engine: formData.engine,
          cover_image_url: formData.cover_image_url,
          status: 'draft',
        } as GameInsert);
        toast.success('Game created successfully');
      }

      resetForm();
      setShowForm(false);
      loadGames(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save game';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (game: Game) => {
    setEditingGame(game);
    setFormData({
      title: game.title,
      description: game.description || '',
      game_type: (game.game_type as any) || '2d',
      engine: (game.engine as any) || 'babylon',
      cover_image_url: game.cover_image_url || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (gameId: string) => {
    try {
      await deleteGame(gameId);
      toast.success('Game deleted successfully');
      setDeleteConfirm(null);
      loadGames(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete game';
      toast.error(message);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      await searchGames(query);
    } else {
      loadGames(1);
    }
  };

  const handleFilter = async (type: string) => {
    setFilterType(type);
    if (type === 'all') {
      loadGames(1);
    } else {
      await getGamesByType(type);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      game_type: '2d',
      engine: 'babylon',
    });
    setEditingGame(null);
  };

  const getGameTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      '2d': 'bg-blue-500',
      '3d': 'bg-purple-500',
      retro: 'bg-yellow-500',
      realistic: 'bg-green-500',
      metaverse: 'bg-pink-500',
      '4d': 'bg-red-500',
    };
    return colors[type] || 'bg-gray-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Game Manager</h1>
          <p className="text-slate-400">Create, edit, and manage your games</p>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-8 flex-wrap">
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Game
          </Button>

          <Input
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-xs bg-slate-700 border-slate-600 text-white placeholder-slate-400"
          />

          <select
            value={filterType}
            onChange={(e) => handleFilter(e.target.value)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg"
          >
            <option value="all">All Types</option>
            {GAME_TYPES.map(type => (
              <option key={type} value={type}>{type.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Error State */}
        {error && (
          <Card className="mb-8 bg-red-900/20 border-red-500 p-4">
            <p className="text-red-400">{error}</p>
          </Card>
        )}

        {/* Form Modal */}
        {showForm && (
          <Card className="mb-8 bg-slate-800 border-slate-700 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {editingGame ? 'Edit Game' : 'Create New Game'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-white mb-2">Title *</label>
                <Input
                  required
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="Game title"
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-white mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Game description"
                  className="w-full p-2 bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white mb-2">Game Type *</label>
                  <select
                    value={formData.game_type}
                    onChange={(e) => handleFormChange('game_type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg"
                  >
                    {GAME_TYPES.map(type => (
                      <option key={type} value={type}>{type.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white mb-2">Engine *</label>
                  <select
                    value={formData.engine}
                    onChange={(e) => handleFormChange('engine', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg"
                  >
                    {ENGINES.map(engine => (
                      <option key={engine} value={engine}>{engine}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-white mb-2">Cover Image URL</label>
                <Input
                  value={formData.cover_image_url || ''}
                  onChange={(e) => handleFormChange('cover_image_url', e.target.value)}
                  placeholder="https://..."
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                >
                  {submitting ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingGame ? 'Update Game' : 'Create Game'
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  variant="outline"
                  className="border-slate-600 text-white hover:bg-slate-700"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Games Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {loading && !games.length ? (
            <div className="col-span-full flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : games.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="text-slate-400 text-lg">No games found</p>
              <p className="text-slate-500 mt-2">Create your first game to get started</p>
            </div>
          ) : (
            games.map(game => (
              <Card
                key={game.id}
                className="bg-slate-800 border-slate-700 overflow-hidden hover:border-slate-600 transition"
              >
                {game.cover_image_url && (
                  <div className="h-40 bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden">
                    <img
                      src={game.cover_image_url}
                      alt={game.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.parentElement!.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-bold text-white flex-1 break-words">{game.title}</h3>
                    <Badge className={`${getGameTypeColor(game.game_type)} text-white text-xs`}>
                      {game.game_type}
                    </Badge>
                  </div>

                  <p className="text-slate-400 text-sm mb-3 line-clamp-2">
                    {game.description || 'No description'}
                  </p>

                  <div className="flex gap-2 mb-3 flex-wrap">
                    <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                      {game.engine}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                      {game.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-slate-700 rounded p-2">
                      <p className="text-slate-400 text-xs">Plays</p>
                      <p className="text-white font-bold">{game.plays || 0}</p>
                    </div>
                    <div className="bg-slate-700 rounded p-2">
                      <p className="text-slate-400 text-xs">Likes</p>
                      <p className="text-white font-bold">{game.likes || 0}</p>
                    </div>
                    <div className="bg-slate-700 rounded p-2">
                      <p className="text-slate-400 text-xs">Rating</p>
                      <p className="text-white font-bold">{(game.rating || 0).toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEdit(game)}
                      variant="outline"
                      size="sm"
                      className="flex-1 border-slate-600 text-white hover:bg-slate-700"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {deleteConfirm === game.id ? (
                      <div className="flex-1 flex gap-2">
                        <Button
                          onClick={() => handleDelete(game.id)}
                          size="sm"
                          className="flex-1 bg-red-600 hover:bg-red-700"
                        >
                          Confirm
                        </Button>
                        <Button
                          onClick={() => setDeleteConfirm(null)}
                          size="sm"
                          variant="outline"
                          className="px-2 border-slate-600"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setDeleteConfirm(game.id)}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-red-600 text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4">
            <Button
              onClick={prevPage}
              disabled={currentPage === 1}
              variant="outline"
              className="border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Previous
            </Button>
            <span className="text-white">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              variant="outline"
              className="border-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
