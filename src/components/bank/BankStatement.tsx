import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Copy, Check, ExternalLink, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMinor } from '@/lib/wallet/currency'
import { formatDate } from './payCopyEn'
import { METHOD_LABEL, TX_STATUS_LABEL, type BankTransaction, type TxStatus } from '@/lib/bank/api'

const STATUS_CLS: Record<TxStatus, string> = {
  pending: 'text-amber-400 bg-amber-400/10',
  paid: 'text-emerald-400 bg-emerald-400/10',
  failed: 'text-destructive bg-destructive/10',
  refunded: 'text-sky-400 bg-sky-400/10',
  expired: 'text-muted-foreground bg-muted/40',
  canceled: 'text-muted-foreground bg-muted/40',
}

export function ProviderDot({ provider }: { provider: 'stripe' | 'asaas' }) {
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1 text-[9px] font-bold uppercase tracking-wider ${provider === 'stripe' ? 'bg-[#635bff]/20 text-[#a5a0ff]' : 'bg-[#0030b9]/25 text-[#7ea2ff]'}`}
    >
      {provider}
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
        toast.success(`${label} copied`)
        setTimeout(() => setDone(false), 1500)
      }}
      className="flex w-full items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="truncate">{value}</span>
    </button>
  )
}

export function BankStatement({ items, empty = 'No activity yet.' }: { items: BankTransaction[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.1] py-10 text-center">
        <Receipt className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-card/50" data-testid="bank-statement">
      {items.map((t) => {
        const incoming = t.direction === 'in'
        const expanded = open === t.id
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : t.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
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
                  {formatDate(t.createdAt, true)} · {METHOD_LABEL[t.method]}
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
                {t.netMinor !== null && t.netMinor !== t.amountMinor && <p>Net: {formatMinor(t.netMinor, t.currency)}</p>}
                {t.dueDate && <p>Due date: {formatDate(`${t.dueDate}T12:00:00`)}</p>}
                {t.failureReason && <p className="text-amber-400">{t.failureReason}</p>}
                {t.pixPayload && <CopyLine value={t.pixPayload} label="Pix copy and paste code" />}
                {t.boletoLine && <CopyLine value={t.boletoLine} label="Boleto number" />}
                <div className="flex flex-wrap gap-2">
                  {t.url && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={t.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Open payment request</a>
                    </Button>
                  )}
                  {t.receiptUrl && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={t.receiptUrl} target="_blank" rel="noreferrer"><Receipt className="h-3 w-3" />Receipt</a>
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
