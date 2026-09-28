import { useState, useEffect } from 'react'
import { Loader2, Copy, Check, Trash2, Plus, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface ApiKey {
  id: string
  key_preview: string
  name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function AffiliateApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [newKeyCopied, setNewKeyCopied] = useState(false)

  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('mcp-api-keys', {
        body: {},
        method: 'POST',
        headers: { 'X-Action': 'list' },
      })
      if (error) throw error
      setKeys(data.keys || [])
    } catch (e: any) {
      toast.error(`Erro ao carregar chaves: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Digite um nome para a chave')
      return
    }

    setGeneratingId('generating')
    try {
      const { data, error } = await supabase.functions.invoke('mcp-api-keys', {
        body: { name: newKeyName },
        method: 'POST',
        headers: { 'X-Action': 'generate' },
      })
      if (error) throw error

      setNewKeyValue(data.key)
      setNewKeyName('')
      setShowNewKey(true)

      // Recarregar lista
      await loadKeys()
      toast.success('Chave gerada! Salve em um lugar seguro.')
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    } finally {
      setGeneratingId(null)
    }
  }

  const handleCopyKey = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNewKeyCopied(true)
      setTimeout(() => setNewKeyCopied(false), 2000)
      toast.success('Copiado!')
    } catch {
      toast.error('Erro ao copiar')
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Tem certeza? Isso revogará a chave imediatamente.')) return

    try {
      const { error } = await supabase.functions.invoke('mcp-api-keys', {
        body: { key_id: keyId },
        method: 'POST',
        headers: { 'X-Action': 'revoke' },
      })
      if (error) throw error

      setKeys(keys.map(k => k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k))
      toast.success('Chave revogada')
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">API Keys do MCP</h3>
        <p className="text-sm text-muted-foreground">
          Use as chaves para autenticar requisições ao endpoint MCP. Cada chave é privada e não pode ser recuperada.
        </p>
      </div>

      {/* Alert se não há chaves */}
      {keys.length === 0 && !loading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você não tem nenhuma chave API. Crie uma para começar a usar o MCP.
          </AlertDescription>
        </Alert>
      )}

      {/* Gerar nova chave */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Gerar nova chave</CardTitle>
          <CardDescription>Digite um nome para identificar a chave</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name" className="text-sm">Nome da chave</Label>
            <Input
              id="key-name"
              placeholder="ex: Chave de produção, Chave de teste..."
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              disabled={generatingId !== null}
            />
          </div>
          <Button
            onClick={handleGenerateKey}
            disabled={generatingId !== null || !newKeyName.trim()}
            className="w-full"
          >
            {generatingId ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Gerar chave
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Exibir nova chave gerada */}
      {newKeyValue && showNewKey && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="space-y-3">
            <p className="text-sm font-semibold">⚠️ Salve esta chave em um lugar seguro!</p>
            <p className="text-xs text-muted-foreground">
              Você não poderá vê-la novamente. Se perder, precisará revogar e criar uma nova.
            </p>
            <div className="flex gap-2 mt-2">
              <Input
                value={newKeyValue}
                readOnly
                className="text-xs font-mono bg-muted/50"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyKey(newKeyValue)}
              >
                {newKeyCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Lista de chaves existentes */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : keys.length > 0 ? (
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">{key.key_preview}</p>
                    <p className="text-xs text-muted-foreground mt-1">{key.name}</p>
                  </div>
                  {key.revoked_at && (
                    <Badge variant="destructive" className="ml-2">Revogada</Badge>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <p>Criada: {new Date(key.created_at).toLocaleDateString('pt-BR')}</p>
                {key.last_used_at && (
                  <p>Último uso: {new Date(key.last_used_at).toLocaleDateString('pt-BR')}</p>
                )}
              </div>
              {!key.revoked_at && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeKey(key.id)}
                  className="ml-4 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
