import { useState } from 'react'
import { Play, Trash2, Eye, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ShortlinkPlayer from './ShortlinkPlayer'

interface Shortlink {
  id: string
  title: string
  description?: string
  video_url: string
  video_duration_seconds: number
  status: string
  view_count: number
  created_at: string
  updated_at: string
}

interface ShortlinksListProps {
  shortlinks: Shortlink[]
  onDelete: () => void
  dailyReward: number
}

export default function ShortlinksList({ shortlinks, onDelete, dailyReward }: ShortlinksListProps) {
  const [selectedShortlink, setSelectedShortlink] = useState<Shortlink | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza? Você não poderá recuperar este shortlink.')) return

    setDeleting(id)
    try {
      const { error } = await supabase.functions.invoke('shortlinks', {
        method: 'POST',
        headers: { 'X-Action': 'delete' },
        body: { shortlink_id: id },
      })

      if (error) throw error

      toast.success('Shortlink arquivado')
      onDelete()
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const activeShortlinks = shortlinks.filter(s => s.status === 'active')
  const archivedShortlinks = shortlinks.filter(s => s.status === 'archived')

  return (
    <div className="space-y-6">
      {selectedShortlink && (
        <ShortlinkPlayer
          shortlink={selectedShortlink}
          onClose={() => setSelectedShortlink(null)}
        />
      )}

      {activeShortlinks.length === 0 ? (
        <Alert>
          <AlertDescription>
            Nenhum shortlink criado ainda. Crie um para começar a ganhar 5 créditos por dia!
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Meus Shortlinks ({activeShortlinks.length}/10)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ganhando <span className="font-semibold text-primary">{dailyReward} créditos/dia</span>
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {activeShortlinks.map((shortlink) => (
              <Card key={shortlink.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{shortlink.title}</CardTitle>
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                          Ativo
                        </Badge>
                      </div>
                      {shortlink.description && (
                        <CardDescription className="mt-1">{shortlink.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 rounded-lg bg-secondary/30 p-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Visualizações</p>
                      <p className="text-lg font-semibold">{shortlink.view_count}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Duração</p>
                      <p className="text-lg font-semibold">{shortlink.video_duration_seconds}s</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Criado</p>
                      <p className="text-xs font-semibold">
                        {formatDistanceToNow(new Date(shortlink.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Thumbnail preview */}
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <video
                      src={shortlink.video_url}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSelectedShortlink(shortlink)}
                        className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Play className="h-6 w-6 fill-current" />
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedShortlink(shortlink)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Assistir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={deleting === shortlink.id}
                      onClick={() => handleDelete(shortlink.id)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Archived shortlinks section */}
      {archivedShortlinks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Arquivados ({archivedShortlinks.length})
          </h3>
          <div className="space-y-2">
            {archivedShortlinks.map((shortlink) => (
              <div key={shortlink.id} className="p-3 rounded-lg bg-muted/50 opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{shortlink.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {shortlink.view_count} visualizações
                    </p>
                  </div>
                  <Badge variant="secondary">Arquivado</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
