import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCredits, isValidPixKey } from '@/lib/rewards'

interface WithdrawCreditsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  balance: number
  minWithdraw: number
  submitting?: boolean
  onSubmit: (pixKey: string) => Promise<void> | void
}

export default function WithdrawCreditsDialog({
  open,
  onOpenChange,
  balance,
  minWithdraw,
  submitting = false,
  onSubmit,
}: WithdrawCreditsDialogProps) {
  const [pixKey, setPixKey] = useState('')
  const canWithdraw = balance >= minWithdraw

  useEffect(() => {
    if (open) setPixKey('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sacar créditos</DialogTitle>
          <DialogDescription>
            Saldo disponível: <span className="font-semibold text-foreground">{formatCredits(balance)}</span> créditos.
            O saque é feito via PIX e o valor total da carteira é solicitado.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canWithdraw || !isValidPixKey(pixKey) || submitting) return
            onSubmit(pixKey.trim())
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="pix-key">Chave PIX</Label>
            <Input
              id="pix-key"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              maxLength={140}
              autoComplete="off"
              disabled={!canWithdraw || submitting}
            />
          </div>

          {!canWithdraw && (
            <p className="text-xs text-muted-foreground">
              Você precisa de no mínimo {formatCredits(minWithdraw)} créditos para sacar.
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={!canWithdraw || !isValidPixKey(pixKey) || submitting}
          >
            {submitting ? 'Enviando...' : 'Solicitar saque'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
