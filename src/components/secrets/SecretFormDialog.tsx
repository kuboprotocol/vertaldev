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
    if (!name.trim()) return toast({ title: 'Give the secret a name', variant: 'destructive' })
    if (keyError) return toast({ title: keyError, variant: 'destructive' })
    if (!editing && !value) return toast({ title: 'Enter the secret value', variant: 'destructive' })

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
        toast({ title: 'Secret updated' })
      } else {
        await onCreate({ ...meta, value })
        toast({ title: 'Secret saved in the vault' })
      }
      onOpenChange(false)
    } catch (e) {
      toast({
        title: 'Could not save',
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
          <DialogTitle>{editing ? 'Edit secret' : 'New secret'}</DialogTitle>
          <DialogDescription>
            The value is encrypted on the server. It is shown on this screen only when you ask to reveal it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-name">Name</Label>
            <Input id="secret-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="For example, Main OpenAI key" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-env">Variable</Label>
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
              <Label htmlFor="secret-group">Group</Label>
              <Input id="secret-group" value={group} maxLength={40} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Target</Label>
              <Select value={boundTo} onValueChange={setBoundTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TARGET}>None</SelectItem>
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
            <Label htmlFor="secret-desc">Description (optional)</Label>
            <Textarea id="secret-desc" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-value">{editing ? 'New value (optional)' : 'Value'}</Label>
            <Input
              id="secret-value"
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={editing ? 'Leave empty to keep the current value' : 'Paste the secret here'}
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save' : 'Save in vault'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
