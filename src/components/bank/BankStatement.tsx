import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Copy, Check, ExternalLink, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMinor } from '@/lib/wallet/currency'
import { METHOD_LABEL, TX_STATUS_LABEL, type BankTransaction, type TxProvider, type TxStatus } from '@/lib/bank/api'

const STATUS_CLS: Record<TxStatus, string> = {
  pending: 'text-amber-400 bg-amber-400/10',
  available: 'text-violet-300 bg-violet-400/10',
  paid: 'text-emerald-400 bg-emerald-400/10',
  failed: 'text-destructive bg-destructive/10',
  refunded: 'text-sky-400 bg-sky-400/10',
  expired: 'text-muted-foreground bg-muted/40',
  canceled: 'text-muted-foreground bg-muted/40',
}

const PROVIDER_CLS: Record<TxProvider, string> = {
  stripe: 'bg-[#635bff]/20 text-[#a5a0ff]',
  asaas: 'bg-[#0030b9]/25 text-[#7ea2ff]',
  internal: 'bg-primary/20 text-primary',
}

export function ProviderDot({ provider }: { provider: TxProvider }) {
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1 text-[9px] font-bold uppercase tracking-wider ${PROVIDER_CLS[provider] ?? PROVIDER_CLS.internal}`}
    >
      {provider === 'internal' ? 'vertal' : provider}
    </span>
  )
}

function CopyLine({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        toast.success(`${label} copiado`)
        setTimeout(() => setDone(false), 1500)
      }}
      className="flex w-full items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="truncate">{value}</span>
    </button>
  )
}

export function BankStatement({ items, empty = 'Nenhuma movimentação ainda.' }: { items: BankTransaction[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 py-10 text-center">
        <Receipt className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-background/40" data-testid="bank-statement">
      {items.map((t) => {
        const incoming = t.direction === 'in'
        const expanded = open === t.id
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : t.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
              aria-expanded={expanded}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${incoming ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'}`}>
                {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                  <span className="truncate">{t.description || t.counterparty || METHOD_LABEL[t.method]}</span>
                  <ProviderDot provider={t.provider} />
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {METHOD_LABEL[t.method]}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-mono text-sm font-semibold ${incoming ? 'text-foreground' : 'text-rose-300'}`}>
                  {incoming ? '+' : '−'}{formatMinor(t.amountMinor, t.currency)}
                </p>
                <Badge variant="secondary" className={`mt-0.5 border-0 text-[10px] ${STATUS_CLS[t.status]}`}>{TX_STATUS_LABEL[t.status]}</Badge>
              </div>
            </button>
            {expanded && (
              <div className="space-y-2 bg-background/30 px-4 pb-4 pl-16 text-xs text-muted-foreground">
                {t.netMinor !== null && t.netMinor !== t.amountMinor && <p>Líquido: {formatMinor(t.netMinor, t.currency)}</p>}
                {t.dueDate && <p>Vencimento: {new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</p>}
                {t.failureReason && <p className="text-amber-400">{t.failureReason}</p>}
                {t.pixPayload && <CopyLine value={t.pixPayload} label="Pix copia e cola" />}
                {t.boletoLine && <CopyLine value={t.boletoLine} label="Linha digitável" />}
                <div className="flex flex-wrap gap-2">
                  {t.url && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={t.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Abrir cobrança</a>
                    </Button>
                  )}
                  {t.receiptUrl && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={t.receiptUrl} target="_blank" rel="noreferrer"><Receipt className="h-3 w-3" />Comprovante</a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
