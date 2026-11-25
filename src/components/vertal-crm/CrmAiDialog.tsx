// Vertal CRM · ações de IA. Mostra o custo (1 crédito) ANTES; só roda depois de "Usar IA".
// Chave idempotente por clique: repetir o pedido não cobra de novo; falha = crédito devolvido no servidor.
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { callCrmAi, CrmError, newIdempotencyKey } from '@/lib/vertalCrm/client';
import { crmErrorText } from '@/lib/vertalCrm/i18n';
import type { CrmAiKind } from '../../../supabase/functions/_shared/vertalCrm/core';
import { useCrm } from './crmState';

interface Props {
  kind: CrmAiKind;
  entityType?: 'contact' | 'deal' | 'company';
  entityId?: string;
  query?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: (result: Record<string, unknown>) => void;
}

export function CrmAiDialog({ kind, entityType, entityId, query, open, onOpenChange, onDone }: Props) {
  const { t, costs, workspace, lang } = useCrm();
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const [saveAsNote, setSaveAsNote] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async () => {
    if (!workspace) return;
    setBusy(true);
    setMsg('');
    try {
      // Mesma chave em todas as tentativas: repetir não cobra de novo e traz o resultado guardado.
      const r = await callCrmAi<{ result: Record<string, unknown>; credits: number; replayed?: boolean }>({
        workspaceId: workspace.id, kind, entityType, entityId, query, goal, lang, createTask, saveAsNote, idempotencyKey: newIdempotencyKey(),
      }, { onWaiting: () => setMsg(t.ai.slow) });
      setResult(r.result);
      setMsg(r.replayed ? '' : t.ai.charged(r.credits));
      onDone?.(r.result);
    } catch (e) {
      const code = e instanceof CrmError ? e.code : 'error';
      const refunded = e instanceof CrmError && e.detail.refunded === true;
      setMsg(refunded ? t.ai.refunded : code === 'ai_slow' ? t.ai.slowGaveUp : crmErrorText(code, t));
    } finally {
      setBusy(false);
    }
  };

  const close = (v: boolean) => {
    if (!v) {
      setResult(null);
      setMsg('');
      setGoal('');
    }
    onOpenChange(v);
  };

  const draft = result?.draft as { subject?: string; body?: string } | undefined;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t.ai[kind]}</DialogTitle>
          <DialogDescription data-testid="crm-ai-cost">{t.ai.cost(costs.ai)}</DialogDescription>
        </DialogHeader>
        {!result && (
          <div className="space-y-3">
            {kind === 'email' && (
              <>
                <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t.ai.goal} maxLength={300} />
                <p className="text-xs text-muted-foreground">{t.ai.draftOnly}</p>
              </>
            )}
            {kind === 'next_action' && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />{t.ai.createTask}</label>
            )}
            {(kind === 'summary' || kind === 'next_action') && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveAsNote} onChange={(e) => setSaveAsNote(e.target.checked)} />{t.ai.saveAsNote}</label>
            )}
            {kind === 'search' && <p className="text-sm text-muted-foreground">“{query}”</p>}
          </div>
        )}
        {result && (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto text-sm" data-testid="crm-ai-result">
            {typeof result.summary === 'string' && <p className="whitespace-pre-wrap">{result.summary}</p>}
            {draft && (
              <div className="space-y-2">
                {draft.subject && <p className="font-medium">{draft.subject}</p>}
                <Textarea readOnly value={draft.body ?? ''} rows={8} />
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(`${draft.subject ? `${draft.subject}\n\n` : ''}${draft.body ?? ''}`); toast.success(t.ai.copied); }}>{t.ai.copy}</Button>
                <p className="text-xs text-muted-foreground">{t.ai.draftOnly}</p>
              </div>
            )}
            {typeof result.score === 'number' && (
              <div><p className="text-2xl font-bold">{result.score}/100</p><ul className="list-disc pl-5">{(result.reasons as string[] ?? []).map((r) => <li key={r}>{r}</li>)}</ul></div>
            )}
            {typeof result.action === 'string' && (
              <div><p className="font-medium">{result.action}</p>{typeof result.why === 'string' && <p className="text-muted-foreground">{result.why}</p>}</div>
            )}
            {Array.isArray(result.items) && <p>{(result.items as unknown[]).length} {lang === 'en' ? 'results' : 'resultados'}</p>}
          </div>
        )}
        {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>{t.close}</Button>
          {!result && (
            <Button onClick={run} disabled={busy} data-testid="crm-ai-confirm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t.ai.confirm} · {costs.ai}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
