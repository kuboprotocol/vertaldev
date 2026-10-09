import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Upload, Download, Trash2, Star, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Logo {
  id: string
  name: string
  storage_path: string
  file_format: string
  file_size: number
  width?: number
  height?: number
  is_active: boolean
  is_primary: boolean
  created_at: string
  tags: string[]
  publicUrl?: string
}

interface AppLogoManagerProps {
  appId: string
  onLogosChange?: (logos: Logo[]) => void
}

export default function AppLogoManager({ appId, onLogosChange }: AppLogoManagerProps) {
  const [logos, setLogos] = useState<Logo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchLogos()
  }, [appId])

  const fetchLogos = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase.functions.invoke('app-logos', {
        body: { action: 'list' },
        headers: { 'app_id': appId },
      })

      if (error) throw error
      setLogos(data?.logos || [])
      onLogosChange?.(data?.logos || [])
    } catch (err) {
      toast.error('Erro ao carregar logos')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name.split('.')[0])

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/app-logos?action=upload&app_id=${appId}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
          body: formData,
        }
      )

      if (!response.ok) throw new Error('Upload falhou')

      const result = await response.json()
      setLogos([result.logo, ...logos])
      onLogosChange?.([result.logo, ...logos])
      toast.success('Logo adicionado com sucesso!')
      event.target.value = ''
    } catch (err) {
      toast.error('Erro ao fazer upload do logo')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleSetPrimary = async (logoId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/app-logos?action=set-primary&app_id=${appId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ logo_id: logoId }),
        }
      )

      if (!response.ok) throw new Error('Erro ao definir como primário')

      setLogos(logos.map(l => ({ ...l, is_primary: l.id === logoId })))
      toast.success('Logo definido como principal')
    } catch (err) {
      toast.error('Erro ao atualizar logo')
      console.error(err)
    }
  }

  const handleDownload = (logo: Logo) => {
    if (logo.publicUrl) {
      const link = document.createElement('a')
      link.href = logo.publicUrl
      link.download = `${logo.name}.${logo.file_format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Download iniciado')
    }
  }

  const handleDelete = async (logoId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      if (!confirm('Tem certeza que deseja deletar este logo?')) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/app-logos?action=delete&app_id=${appId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ logo_id: logoId }),
        }
      )

      if (!response.ok) throw new Error('Erro ao deletar')

      setLogos(logos.filter(l => l.id !== logoId))
      onLogosChange?.(logos.filter(l => l.id !== logoId))
      toast.success('Logo deletado')
    } catch (err) {
      toast.error('Erro ao deletar logo')
      console.error(err)
    }
  }

  return (
    <div className="w-full">
      <div className="space-y-6">
        {/* Header com Upload */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold font-display mb-1">Logos do App</h3>
            <p className="text-sm text-muted-foreground">Crie, importe e gerencie os logos do seu aplicativo</p>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
            <Button asChild disabled={uploading} className="gap-2">
              <span>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Novo Logo
                  </>
                )}
              </span>
            </Button>
          </label>
        </div>

        {/* Grid de Logos */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : logos.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">Nenhum logo adicionado ainda</p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
              <Button asChild variant="outline" className="gap-2">
                <span>
                  <Upload className="h-4 w-4" />
                  Importar Primeiro Logo
                </span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {logos.map((logo, idx) => (
              <motion.div
                key={logo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />

                <div className="relative bg-card/50 backdrop-blur border border-primary/20 rounded-xl p-4 hover:border-primary/40 transition-all space-y-3">
                  {/* Thumbnail */}
                  <div className="relative bg-muted/50 rounded-lg overflow-hidden h-32 flex items-center justify-center">
                    {logo.file_format === 'svg' ? (
                      <svg className="w-16 h-16 text-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <img
                        src={logo.publicUrl}
                        alt={logo.name}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"%3E%3Crect width="24" height="24" fill="%23f5f5f5"/%3E%3C/svg%3E'
                        }}
                      />
                    )}
                    {logo.is_primary && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5">
                        <Star className="h-3 w-3 fill-current" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    <div>
                      <p className="font-semibold text-sm line-clamp-1">{logo.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(logo.file_size / 1024).toFixed(1)} KB · {logo.file_format.toUpperCase()}
                      </p>
                    </div>

                    {logo.tags && logo.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {logo.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-border/50">
                    {!logo.is_primary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 gap-1 text-xs"
                        onClick={() => handleSetPrimary(logo.id)}
                      >
                        <Star className="h-3 w-3" />
                        Definir como Principal
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => handleDownload(logo)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(logo.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-border">
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
            <p className="text-xs text-muted-foreground mb-1">Total de Logos</p>
            <p className="text-2xl font-bold text-primary">{logos.length}</p>
          </div>
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
            <p className="text-xs text-muted-foreground mb-1">Tamanho Total</p>
            <p className="text-2xl font-bold text-primary">
              {(logos.reduce((acc, l) => acc + (l.file_size || 0), 0) / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
            <p className="text-xs text-muted-foreground mb-1">Logo Principal</p>
            <p className="text-sm font-semibold text-primary">
              {logos.find(l => l.is_primary)?.name || 'Nenhum'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
