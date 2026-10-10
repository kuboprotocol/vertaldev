import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Gamepad2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GameCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (gameData: {
    title: string
    description?: string
    game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
    engine: string
    cover_image_url?: string
  }) => void
}

const GAME_TYPES = [
  { id: '2d', label: '2D', description: 'Jogos 2D clássicos com Phaser ou PixiJS', icon: '🎮' },
  { id: '3d', label: '3D', description: 'Jogos 3D com Babylon.js ou Three.js', icon: '🎲' },
  { id: 'retro', label: 'Retro', description: 'Estilo pixel art e visual retro', icon: '👾' },
  { id: 'realistic', label: 'Realista', description: 'Gráficos 3D realistas e detalhados', icon: '🌟' },
  { id: 'metaverse', label: 'Metaverso', description: 'Mundos virtuais multiplayer', icon: '🌐' },
  { id: '4d', label: '4D Ultra', description: 'Física avançada e efeitos ultra realistas', icon: '⚡' },
]

const ENGINES = [
  { id: 'babylon', label: 'Babylon.js', types: ['3d', 'realistic', 'metaverse', '4d'] },
  { id: 'threejs', label: 'Three.js', types: ['3d', 'realistic', 'metaverse', '4d'] },
  { id: 'phaser', label: 'Phaser', types: ['2d', 'retro'] },
  { id: 'pixijs', label: 'PixiJS', types: ['2d', 'retro'] },
  { id: 'playcanvas', label: 'PlayCanvas', types: ['3d', 'realistic', 'metaverse'] },
  { id: 'custom', label: 'Custom', types: ['2d', '3d', 'retro', 'realistic', 'metaverse', '4d'] },
]

export default function GameCreateModal({ isOpen, onClose, onCreate }: GameCreateModalProps) {
  const [step, setStep] = useState<'type' | 'details'>('type')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    game_type: '' as '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d' | '',
    engine: '',
    cover_image_url: '',
  })

  const selectedTypeInfo = GAME_TYPES.find(t => t.id === formData.game_type)
  const availableEngines = ENGINES.filter(e =>
    formData.game_type === '' || e.types.includes(formData.game_type)
  )

  const handleSelectType = (typeId: string) => {
    setFormData({
      ...formData,
      game_type: typeId as '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d',
      engine: '', // Reset engine when changing type
    })
  }

  const handleSelectEngine = (engineId: string) => {
    setFormData({
      ...formData,
      engine: engineId,
    })
  }

  const handleCreateGame = () => {
    if (!formData.title || !formData.game_type || !formData.engine) {
      alert('Por favor, preencha todos os campos obrigatórios')
      return
    }

    onCreate({
      title: formData.title,
      description: formData.description,
      game_type: formData.game_type,
      engine: formData.engine,
      cover_image_url: formData.cover_image_url,
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold">Criar novo Game</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {step === 'type' ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Escolha o tipo de game</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {GAME_TYPES.map(type => (
                        <motion.button
                          key={type.id}
                          whileHover={{ y: -2 }}
                          onClick={() => handleSelectType(type.id)}
                          className={`p-4 rounded-lg border-2 transition-all text-left ${
                            formData.game_type === type.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="text-2xl mb-2">{type.icon}</div>
                          <div className="font-semibold">{type.label}</div>
                          <div className="text-xs text-muted-foreground">{type.description}</div>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Engine Selection */}
                  {formData.game_type && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Escolha a engine</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {availableEngines.map(engine => (
                            <motion.button
                              key={engine.id}
                              whileHover={{ y: -2 }}
                              onClick={() => handleSelectEngine(engine.id)}
                              className={`p-4 rounded-lg border-2 transition-all text-left ${
                                formData.engine === engine.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <div className="font-semibold text-sm">{engine.label}</div>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={() => setStep('details')}
                        className="w-full"
                        disabled={!formData.engine}
                      >
                        Próximo passo
                      </Button>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Detalhes do game</h3>
                    <div className="space-y-4">
                      {/* Type & Engine Summary */}
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">Tipo:</span> {selectedTypeInfo?.label}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">Engine:</span> {ENGINES.find(e => e.id === formData.engine)?.label}
                        </p>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="block text-sm font-semibold mb-2">Título do Game *</label>
                        <input
                          type="text"
                          placeholder="Ex: My Awesome Game"
                          value={formData.title}
                          onChange={e => setFormData({ ...formData, title: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-semibold mb-2">Descrição</label>
                        <textarea
                          placeholder="Descreva seu game..."
                          value={formData.description}
                          onChange={e => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                      </div>

                      {/* Cover Image URL */}
                      <div>
                        <label className="block text-sm font-semibold mb-2">URL da Capa (opcional)</label>
                        <input
                          type="url"
                          placeholder="https://exemplo.com/imagem.jpg"
                          value={formData.cover_image_url}
                          onChange={e => setFormData({ ...formData, cover_image_url: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setStep('type')}
                      className="flex-1"
                    >
                      Voltar
                    </Button>
                    <Button
                      onClick={handleCreateGame}
                      className="flex-1"
                      disabled={!formData.title}
                    >
                      Criar Game
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
