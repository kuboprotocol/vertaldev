// Aba "Atividade" do Vertal Navigator: sessões, tarefas, segredos usados (só nomes),
// códigos 2FA e aprovações/recusas de pagamento — lidos da auditoria no servidor.
import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw } from 'lucide-react';
import { describeAudit, type NavigatorAuditKind } from '@/lib/navigator/navigatorCore';
import type { NavigatorAuditEntry, NavigatorSessionSummary } from '@/lib/navigator/client';
import { loadNavigatorActivity } from '@/lib/navigator/store';

const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';

const TONE: Partial<Record<NavigatorAuditKind, string>> = {
  approval_granted: 'border-emerald-500/40',
  auto_approved: 'border-emerald-500/40',
  approval_denied: 'border-destructive/50',
  secret_used: 'border-sky-500/40',
  totp_used: 'border-sky-500/40',
  code_entered: 'border-sky-500/40',
};

const when = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export function NavigatorActivity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<NavigatorSessionSummary[]>([]);
  const [audit, setAudit] = useState<NavigatorAuditEntry[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await loadNavigatorActivity();
    setLoading(false);
    if (!res.ok) {
      setError(res.message ?? 'Não consegui carregar a atividade.');
      return;
    }
    setError(null);
    setSessions(res.sessions ?? []);
    setAudit(res.audit ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bySession = new Map<string, NavigatorAuditEntry[]>();
  const loose: NavigatorAuditEntry[] = [];
  for (const a of audit) {
    if (a.session_id) bySession.set(a.session_id, [...(bySession.get(a.session_id) ?? []), a]);
    else loose.push(a);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" aria-hidden /> Atividade</p>
        <button type="button" className={btn} onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Atualizar
        </button>
      </div>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>}
      {!loading && !error && sessions.length === 0 && loose.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Sessões, tarefas, segredos usados e aprovações aparecem aqui.</p>
      )}
      <ol className="space-y-3" aria-label="Sessões do navegador">
        {sessions.map((s) => {
          const items = bySession.get(s.id) ?? [];
          return (
            <li key={s.id} className="rounded-xl border border-border/60 p-3">
              <p className="text-sm font-medium">
                Sessão de {when(s.started_at)}
                <span className="font-normal text-muted-foreground"> · {s.billed_minutes} min{s.ended_at ? ` · encerrada ${when(s.ended_at)}` : ' · aberta'}</span>
              </p>
              {items.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {items.map((a) => (
                    <li key={a.id} className={`rounded-md border-l-2 bg-secondary/50 px-2 py-1 ${TONE[a.kind as NavigatorAuditKind] ?? 'border-border'}`}>
                      <span className="text-muted-foreground">{when(a.created_at)} · </span>{describeAudit({ kind: a.kind as NavigatorAuditKind, detail: a.detail })}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-xs text-muted-foreground">Sem ações registradas.</p>}
            </li>
          );
        })}
      </ol>
      {loose.length > 0 && (
        <div className="rounded-xl border border-border/60 p-3">
          <p className="text-sm font-medium">Preferências e cofre</p>
          <ul className="mt-2 space-y-1 text-xs">
            {loose.map((a) => (
              <li key={a.id} className="rounded-md bg-secondary/50 px-2 py-1">
                <span className="text-muted-foreground">{when(a.created_at)} · </span>{describeAudit({ kind: a.kind as NavigatorAuditKind, detail: a.detail })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Valores de senhas, códigos e cookies nunca são registrados — só os nomes dos segredos.</p>
    </div>
  );
}

export default NavigatorActivity;
