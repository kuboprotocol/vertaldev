import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Gamepad2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
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

type GameTypeId = '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'

// `gradient` e `glow` são classes Tailwind literais: o scanner precisa encontrá-las no arquivo.
const GAME_TYPES: {
  id: GameTypeId
  label: string
  description: string
  icon: string
  gradient: string
  glow: string
}[] = [
  { id: '2d', label: '2D', description: 'Jogos 2D clássicos com Phaser ou PixiJS', icon: '🎮', gradient: 'from-cyan-400 via-sky-500 to-blue-600', glow: 'shadow-cyan-500/40' },
  { id: '3d', label: '3D', description: 'Jogos 3D com Babylon.js ou Three.js', icon: '🎲', gradient: 'from-violet-400 via-purple-500 to-fuchsia-600', glow: 'shadow-violet-500/40' },
  { id: 'retro', label: 'Retro', description: 'Estilo pixel art e visual retro', icon: '👾', gradient: 'from-lime-300 via-emerald-500 to-teal-700', glow: 'shadow-emerald-500/40' },
  { id: 'realistic', label: 'Realista', description: 'Gráficos 3D realistas e detalhados', icon: '🌟', gradient: 'from-amber-300 via-orange-500 to-rose-600', glow: 'shadow-orange-500/40' },
  { id: 'metaverse', label: 'Metaverso', description: 'Mundos virtuais multiplayer', icon: '🌐', gradient: 'from-pink-400 via-rose-500 to-red-600', glow: 'shadow-pink-500/40' },
  { id: '4d', label: '4D Ultra', description: 'Física avançada e efeitos ultra realistas', icon: '⚡', gradient: 'from-fuchsia-400 via-purple-600 to-indigo-800', glow: 'shadow-fuchsia-500/40' },
]

const ENGINES: { id: string; label: string; types: GameTypeId[] }[] = [
  { id: 'babylon', label: 'Babylon.js', types: ['3d', 'realistic', 'metaverse', '4d'] },
  { id: 'threejs', label: 'Three.js', types: ['3d', 'realistic', 'metaverse', '4d'] },
  { id: 'phaser', label: 'Phaser', types: ['2d', 'retro'] },
  { id: 'pixijs', label: 'PixiJS', types: ['2d', 'retro'] },
  { id: 'playcanvas', label: 'PlayCanvas', types: ['3d', 'realistic', 'metaverse'] },
  { id: 'custom', label: 'Custom', types: ['2d', '3d', 'retro', 'realistic', 'metaverse', '4d'] },
]

// Brilhos de fundo: massas de cor desfocadas que flutuam devagar.
const ORBS = [
  { className: 'left-[-10%] top-[-15%] h-72 w-72 bg-fuchsia-600/50', drift: { x: [0, 60, -20, 0], y: [0, 40, 80, 0] }, duration: 18 },
  { className: 'right-[-12%] top-[10%] h-80 w-80 bg-cyan-500/40', drift: { x: [0, -70, 10, 0], y: [0, 60, -30, 0] }, duration: 22 },
  { className: 'bottom-[-18%] left-[25%] h-96 w-96 bg-amber-500/30', drift: { x: [0, 50, -40, 0], y: [0, -50, 20, 0] }, duration: 26 },
]

export default function GameCreateModal({ isOpen, onClose, onCreate }: GameCreateModalProps) {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState<'type' | 'details'>('type')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    game_type: '' as GameTypeId | '',
    engine: '',
    cover_image_url: '',
  })

  const selectedTypeInfo = GAME_TYPES.find(t => t.id === formData.game_type)
  const availableEngines = ENGINES.filter(e =>
    formData.game_type === '' || e.types.includes(formData.game_type)
  )

  const handleSelectType = (typeId: GameTypeId) => {
    setFormData({
      ...formData,
      game_type: typeId,
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

  const fieldClass =
    'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/35 transition focus:border-fuchsia-400/60 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          {/* Fundo vivo: brilhos flutuando atrás do painel */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {ORBS.map((orb, i) => (
              <motion.div
                key={i}
                className={`absolute rounded-full blur-3xl ${orb.className}`}
                animate={reduceMotion ? undefined : orb.drift}
                transition={{ duration: orb.duration, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </div>

          <motion.div
            initial={{ y: 40, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950/80 text-white shadow-2xl shadow-fuchsia-900/30 backdrop-blur-xl sm:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Filete em gradiente no topo */}
            <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400" />

            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500 to-cyan-500 p-2.5 shadow-lg shadow-fuchsia-500/30">
                  <Gamepad2 className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black tracking-tight">Criar novo Game</h2>
                  <p className="text-xs text-white/50">
                    {step === 'type' ? 'Passo 1 de 2 · tipo e engine' : 'Passo 2 de 2 · detalhes'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Barra de progresso entre os passos */}
            <div className="h-1 w-full bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                initial={false}
                animate={{ width: step === 'type' ? '50%' : '100%' }}
                transition={{ duration: reduceMotion ? 0 : 0.4 }}
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">
              {step === 'type' ? (
                <motion.div
                  key="type"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-7"
                >
                  <div>
                    <h3 className="mb-4 text-lg font-bold">Escolha o tipo de game</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {GAME_TYPES.map(type => {
                        const selected = formData.game_type === type.id
                        return (
                          <motion.button
                            key={type.id}
                            type="button"
                            whileHover={reduceMotion ? undefined : { y: -3, rotateX: 2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectType(type.id)}
                            aria-pressed={selected}
                            className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-shadow ${
                              selected
                                ? `border-white/30 shadow-xl ${type.glow}`
                                : 'border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br ${type.gradient} ${selected ? 'opacity-30' : 'opacity-0 group-hover:opacity-20'} transition-opacity`} />
                            <div className="relative">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-3xl drop-shadow">{type.icon}</span>
                                {selected && <Sparkles className="h-4 w-4 text-amber-300" />}
                              </div>
                              <div className={`bg-gradient-to-r ${type.gradient} bg-clip-text text-lg font-black text-transparent`}>
                                {type.label}
                              </div>
                              <div className="text-xs leading-snug text-white/60">{type.description}</div>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Engine Selection */}
                  {formData.game_type && (
                    <motion.div
                      key="engine"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <h3 className="mb-4 text-lg font-bold">Escolha a engine</h3>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {availableEngines.map(engine => {
                            const selected = formData.engine === engine.id
                            return (
                              <motion.button
                                key={engine.id}
                                type="button"
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleSelectEngine(engine.id)}
                                aria-pressed={selected}
                                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                                  selected
                                    ? `border-transparent bg-gradient-to-r ${selectedTypeInfo?.gradient ?? 'from-fuchsia-500 to-cyan-500'} text-white shadow-lg`
                                    : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10'
                                }`}
                              >
                                {engine.label}
                              </motion.button>
                            )
                          })}
                        </div>
                      </div>

                      <Button
                        onClick={() => setStep('details')}
                        className="h-12 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-base font-bold text-white hover:opacity-90"
                        disabled={!formData.engine}
                      >
                        Próximo passo <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="mb-4 text-lg font-bold">Detalhes do game</h3>
                    <div className="space-y-5">
                      {/* Type & Engine Summary */}
                      <div className={`rounded-2xl bg-gradient-to-br ${selectedTypeInfo?.gradient ?? ''} p-[1px]`}>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl bg-zinc-950/90 px-4 py-3 text-sm">
                          <p className="text-white/60">
                            <span className="font-semibold text-white">Tipo:</span> {selectedTypeInfo?.label}
                          </p>
                          <p className="text-white/60">
                            <span className="font-semibold text-white">Engine:</span> {ENGINES.find(e => e.id === formData.engine)?.label}
                          </p>
                        </div>
                      </div>

                      {/* Title */}
                      <div>
                        <label htmlFor="game-title" className="mb-2 block text-sm font-semibold">Título do Game *</label>
                        <input
                          id="game-title"
                          type="text"
                          placeholder="Ex: Ilha dos Espelhos Derretidos"
                          value={formData.title}
                          onChange={e => setFormData({ ...formData, title: e.target.value })}
                          className={fieldClass}
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label htmlFor="game-description" className="mb-2 block text-sm font-semibold">Descrição</label>
                        <textarea
                          id="game-description"
                          placeholder="Descreva o mundo, o personagem e o que o jogador faz. Quanto mais detalhe, melhor o blueprint."
                          value={formData.description}
                          onChange={e => setFormData({ ...formData, description: e.target.value })}
                          rows={4}
                          className={`${fieldClass} resize-none`}
                        />
                      </div>

                      {/* Cover Image URL */}
                      <div>
                        <label htmlFor="game-cover" className="mb-2 block text-sm font-semibold">URL da Capa (opcional)</label>
                        <input
                          id="game-cover"
                          type="url"
                          inputMode="url"
                          placeholder="https://exemplo.com/imagem.jpg"
                          value={formData.cover_image_url}
                          onChange={e => setFormData({ ...formData, cover_image_url: e.target.value })}
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => setStep('type')}
                      className="h-12 flex-1 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                    </Button>
                    <Button
                      onClick={handleCreateGame}
                      className="h-12 flex-1 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-600 text-base font-bold text-white shadow-lg shadow-fuchsia-600/30 hover:opacity-90 disabled:opacity-40"
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
