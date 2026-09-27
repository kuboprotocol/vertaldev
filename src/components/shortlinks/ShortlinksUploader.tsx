import { useState, useRef } from 'react'
import { Loader2, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface ShortlinksUploaderProps {
  onSuccess: () => void
  canCreateMore: boolean
  activeCount: number
}

export default function ShortlinksUploader({ onSuccess, canCreateMore, activeCount }: ShortlinksUploaderProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo válido')
      return
    }

    // Check file size (max 50MB for 5-7 second video)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 50MB')
      return
    }

    setVideoFile(file)

    // Get video duration
    const reader = new FileReader()
    reader.onload = (event) => {
      const video = document.createElement('video')
      video.onloadedmetadata = () => {
        const durationSeconds = Math.round(video.duration)
        setDuration(durationSeconds)

        if (durationSeconds < 5 || durationSeconds > 7) {
          toast.error('Vídeo deve ter entre 5 e 7 segundos')
          setVideoFile(null)
          setDuration(null)
        } else {
          toast.success(`Vídeo detectado: ${durationSeconds}s ✓`)
        }
      }
      video.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!videoFile || !title.trim() || !duration) {
      toast.error('Preencha todos os campos e selecione um vídeo válido')
      return
    }

    if (duration < 5 || duration > 7) {
      toast.error('Vídeo deve ter entre 5 e 7 segundos')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Não autenticado')

      // Upload video to Supabase Storage
      const fileName = `${user.user.id}/${Date.now()}-${videoFile.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('shortlinks')
        .upload(fileName, videoFile, { upsert: false })

      if (uploadError) throw uploadError

      // Get public URL
      const { data } = supabase.storage.from('shortlinks').getPublicUrl(fileName)
      const videoUrl = data.publicUrl

      // Create shortlink record via edge function
      const { data: createData, error: createError } = await supabase.functions.invoke(
        'shortlinks',
        {
          method: 'POST',
          headers: { 'X-Action': 'create' },
          body: {
            title: title.trim(),
            description: description.trim(),
            video_url: videoUrl,
            video_duration_seconds: duration,
          },
        }
      )

      if (createError) throw createError

      if (createData.error === 'shortlink_limit_reached') {
        toast.error(`⚠️ ${createData.message}`)
        return
      }

      if (createData.error) {
        toast.error(`Erro: ${createData.error}`)
        return
      }

      toast.success('🎉 ' + createData.message)
      setTitle('')
      setDescription('')
      setVideoFile(null)
      setDuration(null)
      if (videoInputRef.current) videoInputRef.current.value = ''
      onSuccess()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao fazer upload: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Criar novo Shortlink</CardTitle>
        <CardDescription>
          Upload de vídeo curto (5-7 segundos) para ganhar 5 créditos por dia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canCreateMore && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Você atingiu o máximo de 10 shortlinks ativos ({activeCount}/10). Arquive alguns para criar novos.
            </AlertDescription>
          </Alert>
        )}

        {canCreateMore && (
          <>
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm">Título</Label>
              <Input
                id="title"
                placeholder="Ex: Dança viral, Tutorial rápido..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Describe seu shortlink..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Vídeo (5-7 segundos)</Label>
              <div className="relative">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-primary/30 rounded-lg hover:border-primary/50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <div className="text-sm">
                    {videoFile ? (
                      <>
                        <span className="font-medium">{videoFile.name}</span>
                        {duration && <span className="text-muted-foreground ml-2">({duration}s)</span>}
                      </>
                    ) : (
                      'Clique para selecionar vídeo'
                    )}
                  </div>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Máximo 50MB • Formato: MP4, WebM, etc
              </p>
            </div>

            {duration && duration >= 5 && duration <= 7 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Vídeo válido: {duration} segundos
                </span>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={uploading || !videoFile || !title.trim() || !duration}
              className="w-full gradient-primary"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fazendo upload ({uploadProgress}%)
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Criar Shortlink
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
