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
      toast({ title: 'Could not finish', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={secret !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Access · {secret?.name}</DialogTitle>
          <DialogDescription>
            People with access can use this secret in orchestration. Only people with "Can see the value" can reveal it.
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
              }, 'Access granted')
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="grant-email">Account email</Label>
              <Input id="grant-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Can see the value</p>
                <p className="text-xs text-muted-foreground">When off, the person can use the secret but cannot read it.</p>
              </div>
              <Switch checked={canReveal} onCheckedChange={setCanReveal} aria-label="Allow seeing the value" />
            </div>
            <Button type="submit" disabled={busy || !email.trim()}>
              Grant access
            </Button>
          </form>

          <div className="grid gap-2">
            <p className="text-sm font-medium">Who has access</p>
            {secret && secret.grants.length === 0 && (
              <p className="text-sm text-muted-foreground">Only you.</p>
            )}
            {secret?.grants.map((g) => (
              <div key={g.grantee_id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{g.email ?? 'Deleted account'}</p>
                  <p className="text-xs text-muted-foreground">{g.can_reveal ? 'Can see the value' : 'Can use only'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => onRevoke(secret.id, g.grantee_id), 'Access revoked')}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
