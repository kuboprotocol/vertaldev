import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import type { VaultSecret } from '@/hooks/useKuboSecrets'

interface Props {
  secret: VaultSecret | null
  onOpenChange: (open: boolean) => void
  onGrant: (id: string, email: string, canReveal: boolean) => Promise<void>
  onRevoke: (id: string, granteeId: string) => Promise<void>
}

/** Quem pode usar ou ver o valor deste segredo. Só o dono chega aqui. */
export function SecretAccessDialog({ secret, onOpenChange, onGrant, onRevoke }: Props) {
  const [email, setEmail] = useState('')
  const [canReveal, setCanReveal] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>, okTitle: string) => {
    setBusy(true)
    try {
      await fn()
      toast({ title: okTitle })
    } catch (e) {
      toast({ title: 'Não foi possível concluir', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={secret !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acessos · {secret?.name}</DialogTitle>
          <DialogDescription>
            Quem tiver acesso pode usar este segredo na orquestração. Só quem tiver “ver valor” consegue revelá-lo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!secret || !email.trim()) return
              void run(async () => {
                await onGrant(secret.id, email.trim(), canReveal)
                setEmail('')
                setCanReveal(false)
              }, 'Acesso concedido')
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="grant-email">E-mail da conta</Label>
              <Input id="grant-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Pode ver o valor</p>
                <p className="text-xs text-muted-foreground">Desligado: a pessoa só usa, não lê.</p>
              </div>
              <Switch checked={canReveal} onCheckedChange={setCanReveal} aria-label="Permitir ver o valor" />
            </div>
            <Button type="submit" disabled={busy || !email.trim()}>
              Conceder acesso
            </Button>
          </form>

          <div className="grid gap-2">
            <p className="text-sm font-medium">Com acesso hoje</p>
            {secret && secret.grants.length === 0 && (
              <p className="text-sm text-muted-foreground">Só você.</p>
            )}
            {secret?.grants.map((g) => (
              <div key={g.grantee_id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{g.email ?? 'Conta removida'}</p>
                  <p className="text-xs text-muted-foreground">{g.can_reveal ? 'Pode ver o valor' : 'Só usa'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => onRevoke(secret.id, g.grantee_id), 'Acesso revogado')}
                >
                  Revogar
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
