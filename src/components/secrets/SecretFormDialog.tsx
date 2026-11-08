import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { ORCHESTRATION_TARGETS, normalizeEnvKey, validateEnvKey } from '../../../supabase/functions/_shared/kuboSecretsCore'
import type { SecretFormInput, VaultSecret } from '@/hooks/useKuboSecrets'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  secret: VaultSecret | null
  /** Preenchimento inicial de um segredo novo (ex.: vindo do agente do Vibe Code). */
  initial?: { name?: string; env_key?: string } | null
  onCreate: (input: SecretFormInput) => Promise<void>
  onUpdate: (id: string, fields: Partial<SecretFormInput>) => Promise<void>
  onRotate: (id: string, value: string) => Promise<void>
}

const NO_TARGET = '__none__'

/** Criação e edição. Na edição, trocar o valor é opcional e vai por um caminho separado. */
export function SecretFormDialog({ open, onOpenChange, secret, initial, onCreate, onUpdate, onRotate }: Props) {
  const editing = secret !== null
  const [name, setName] = useState('')
  const [envKey, setEnvKey] = useState('')
  const [group, setGroup] = useState('geral')
  const [description, setDescription] = useState('')
  const [boundTo, setBoundTo] = useState(NO_TARGET)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(secret?.name ?? initial?.name ?? '')
    setEnvKey(secret?.env_key ?? normalizeEnvKey(initial?.env_key ?? ''))
    setGroup(secret?.group_name ?? 'geral')
    setDescription(secret?.description ?? '')
    setBoundTo(secret?.bound_to ?? NO_TARGET)
    setValue('')
  }, [open, secret, initial])

  const submit = async () => {
    const keyError = validateEnvKey(envKey)
    if (!name.trim()) return toast({ title: 'Dê um nome ao segredo', variant: 'destructive' })
    if (keyError) return toast({ title: keyError, variant: 'destructive' })
    if (!editing && !value) return toast({ title: 'Informe o valor do segredo', variant: 'destructive' })

    setSaving(true)
    try {
      const meta = {
        name: name.trim(),
        env_key: normalizeEnvKey(envKey),
        group_name: group.trim() || 'geral',
        description: description.trim() || null,
        bound_to: boundTo === NO_TARGET ? null : boundTo,
      }
      if (editing && secret) {
        await onUpdate(secret.id, meta)
        if (value) await onRotate(secret.id, value)
        toast({ title: 'Segredo atualizado' })
      } else {
        await onCreate({ ...meta, value })
        toast({ title: 'Segredo guardado no cofre' })
      }
      onOpenChange(false)
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setValue('')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar segredo' : 'Novo segredo'}</DialogTitle>
          <DialogDescription>
            O valor é cifrado no servidor e nunca volta para esta tela, exceto quando você pede para revelar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-name">Nome</Label>
            <Input id="secret-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Chave principal da OpenAI" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-env">Variável</Label>
            <Input
              id="secret-env"
              value={envKey}
              maxLength={64}
              className="font-mono"
              onChange={(e) => setEnvKey(e.target.value.toUpperCase())}
              placeholder="OPENAI_API_KEY"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="secret-group">Grupo</Label>
              <Input id="secret-group" value={group} maxLength={40} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Destino</Label>
              <Select value={boundTo} onValueChange={setBoundTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TARGET}>Nenhum</SelectItem>
                  {ORCHESTRATION_TARGETS.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-desc">Descrição (opcional)</Label>
            <Textarea id="secret-desc" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-value">{editing ? 'Trocar valor (opcional)' : 'Valor'}</Label>
            <Input
              id="secret-value"
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={editing ? 'Deixe em branco para manter o atual' : 'Cole aqui o segredo'}
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Salvar' : 'Guardar no cofre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
