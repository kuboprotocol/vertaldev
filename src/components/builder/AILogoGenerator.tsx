import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Loader2, Check, AlertCircle, Download, Copy, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Generation {
  id: string
  name: string
  prompt: string
  storage_path: string
  publicUrl?: string
  status: 'pending' | 'completed' | 'failed'
  error_message?: string
  created_at: string
}

interface AILogoGeneratorProps {
  appId: string
  onLogoGenerated?: (generation: Generation) => void
}

const examplePrompts = [
  "Modern fintech app with blue and white colors, minimalist style",
  "AI assistant with purple gradient, futuristic, rounded shapes",
  "E-commerce platform, vibrant orange and yellow, friendly",
  "SaaS dashboard for developers, dark theme, tech vibe",
  "Social network for creators, pink and blue gradient, trendy",
]

export default function AILogoGenerator({ appId, onLogoGenerated }: AILogoGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [dailyUsage, setDailyUsage] = useState(0)
  const maxDaily = 10

  useEffect(() => {
    fetchGenerations()
  }, [appId])

  const fetchGenerations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-logo-ai?action=list-generations&app_id=${appId}`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      )

      if (!response.ok) throw new Error('Failed to fetch generations')

      const result = await response.json()
      setGenerations(result.generations || [])

      // Contar gerações de hoje
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todaysGenerations = result.generations?.filter(
        (g: Generation) => new Date(g.created_at) >= today
      ).length || 0
      setDailyUsage(todaysGenerations)
    } catch (err) {
      console.error('Error fetching generations:', err)
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim()) {
      toast.error('Digite uma descrição para o logo')
      return
    }

    if (prompt.length < 5) {
      toast.error('A descrição deve ter pelo menos 5 caracteres')
      return
    }

    if (dailyUsage >= maxDaily) {
      toast.error(`Limite diário atingido (${maxDaily} gerações/dia). Tente amanhã!`)
      return
    }

    try {
      setLoading(true)
      const generationId = crypto.randomUUID()
      setGeneratingId(generationId)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-logo-ai?action=generate&app_id=${appId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            name: `AI Logo - ${new Date().toLocaleString()}`,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate logo')
      }

      const result = await response.json()
      const newGeneration = result.generation

      setGenerations([newGeneration, ...generations])
      setDailyUsage(dailyUsage + 1)
      setPrompt('')
      onLogoGenerated?.(newGeneration)

      toast.success('Logo gerado com sucesso! 🎨')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar logo')
      console.error('Generation error:', err)
    } finally {
      setLoading(false)
      setGeneratingId(null)
    }
  }

  const handleDownload = (generation: Generation) => {
    if (generation.publicUrl) {
      const link = document.createElement('a')
      link.href = generation.publicUrl
      link.download = `${generation.name}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Download iniciado')
    }
  }

  const handleDelete = async (generationId: string) => {
    if (!confirm('Deletar esta geração?')) return

    // Aqui você poderia chamar uma edge function para deletar
    setGenerations(generations.filter(g => g.id !== generationId))
    toast.success('Geração deletada')
  }

  const handleImportAsLogo = async (generation: Generation) => {
    toast.success(`Logo "${generation.name}" pronto para ser importado em Logos!`)
    onLogoGenerated?.(generation)
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg">
            <Wand2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-display">Gerar Logo com IA</h3>
            <p className="text-sm text-muted-foreground">
              Use DALL-E 3 para criar logos únicos em segundos
            </p>
          </div>
        </div>

        {/* Daily usage */}
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-muted/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Gerações Hoje</p>
              <p className="text-xs text-muted-foreground">
                {dailyUsage}/{maxDaily}
              </p>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${(dailyUsage / maxDaily) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Generator Form */}
      <motion.form
        onSubmit={handleGenerate}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva o logo que deseja... Ex: 'App de fitness moderno com cores vibrantes e tema de saúde'"
            disabled={loading || dailyUsage >= maxDaily}
            className="w-full px-4 py-3 bg-card/50 backdrop-blur border border-primary/20 rounded-xl resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
            rows={3}
            maxLength={500}
          />
          <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
            {prompt.length}/500
          </div>
        </div>

        {/* Examples */}
        <div className="grid sm:grid-cols-2 gap-2">
          {examplePrompts.slice(0, 2).map((example, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setPrompt(example)}
              className="text-xs p-2 bg-secondary/50 hover:bg-secondary border border-border/50 rounded-lg text-left hover:border-primary/30 transition-all"
              disabled={loading}
            >
              <span className="text-muted-foreground hover:text-foreground line-clamp-2">
                {example}
              </span>
            </button>
          ))}
        </div>

        <Button
          type="submit"
          disabled={loading || !prompt.trim() || dailyUsage >= maxDaily}
          className="w-full gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando Logo... (20-30s)
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Gerar com IA
            </>
          )}
        </Button>
      </motion.form>

      {/* History Toggle */}
      {generations.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-primary hover:underline"
        >
          {showHistory ? '✕ Fechar Histórico' : `📋 Ver Histórico (${generations.length})`}
        </button>
      )}

      {/* Generations History */}
      <AnimatePresence>
        {showHistory && generations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <h4 className="font-semibold text-sm">Histórico de Gerações</h4>
            <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {generations.map((gen, idx) => (
                <motion.div
                  key={gen.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />

                  <div className="relative bg-card/50 backdrop-blur border border-primary/20 rounded-lg p-3 space-y-2">
                    {/* Thumbnail */}
                    {gen.publicUrl && (
                      <div className="bg-muted/50 rounded-md overflow-hidden h-24 flex items-center justify-center">
                        <img
                          src={gen.publicUrl}
                          alt={gen.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}

                    {/* Info */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold line-clamp-1">{gen.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        "{gen.prompt}"
                      </p>
                      <p className="text-xs text-muted-foreground/60">
                        {new Date(gen.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>

                    {/* Status */}
                    {gen.status === 'completed' && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Concluído
                      </div>
                    )}
                    {gen.status === 'pending' && (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Gerando...
                      </div>
                    )}
                    {gen.status === 'failed' && (
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="h-3 w-3" />
                        {gen.error_message || 'Falha'}
                      </div>
                    )}

                    {/* Actions */}
                    {gen.status === 'completed' && (
                      <div className="flex gap-1 pt-2 border-t border-border/50">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 gap-1 text-xs h-7"
                          onClick={() => handleImportAsLogo(gen)}
                        >
                          <Plus className="h-3 w-3" />
                          Importar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs h-7"
                          onClick={() => handleDownload(gen)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs h-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(gen.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Card */}
      <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Como funciona:</p>
            <ul className="text-xs space-y-0.5">
              <li>• Descreva o logo em detalhes (cores, estilo, tema)</li>
              <li>• IA gera 1 logo em ~30 segundos</li>
              <li>• Limite: 10 gerações/dia</li>
              <li>• Importar para Logos e usar no app</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
