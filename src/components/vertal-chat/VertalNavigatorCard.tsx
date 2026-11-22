// Vertal Navigator INLINE no Vertal Chat (como no Hark): a tela ao vivo é um cartão na
// própria conversa. Quando o site pede algo (login, senha, código 2FA, telefone, aprovação),
// o pedido aparece aqui mesmo, num cartão seguro, e a tarefa continua no mesmo cartão.
// Nada abre outra página ou painel. No fim, o cartão vira o recibo (artefato "navigator").
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Globe, Quote, XCircle } from 'lucide-react';
import type { Artifact } from '@/lib/chatAgent/artifacts';
import { currentTaskEvents, inlineApprovalMounted, panelMounted, useNavigator } from '@/lib/navigator/store';
import { NavigatorApprovalInline, NavigatorControls, NavigatorFilling, NavigatorLiveFrame, NavigatorStepList } from '@/components/navigator/NavigatorParts';
import { NavigatorRequestCard, isRequestCardKind } from '@/components/navigator/NavigatorSecureForms';
import { hostOf, NAV_STATUS_LABEL } from '@/components/navigator/navigatorUi';

/** Mostra o cartão ao vivo só para tarefas pedidas por este chat. */
export function hasLiveChatNavigatorTask(origin: string | undefined, agentStatus: string): boolean {
  return origin === 'vertal-chat' && agentStatus !== 'none';
}

export function VertalNavigatorLiveCard() {
  const nav = useNavigator();
  useEffect(() => {
    // Este cartão é o "painel": pedidos e aprovações aparecem aqui, não em diálogo ou painel lateral.
    panelMounted(1);
    inlineApprovalMounted(1);
    return () => {
      panelMounted(-1);
      inlineApprovalMounted(-1);
    };
  }, []);
  const task = nav.currentTask;
  const events = task ? currentTaskEvents(nav, task) : [];
  const approval = nav.pending.find((p) => p.kind === 'approval') ?? null;
  const requests = nav.pending.filter((p) => isRequestCardKind(p.kind));
  const opening = !nav.sessionId || !task;
  return (
    <section className="space-y-2 rounded-2xl border border-primary/30 bg-card/60 p-3" data-testid="vertal-navigator-live" aria-label="Vertal Navigator ao vivo" data-sentry-mask>
      <header className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className={`h-1.5 w-1.5 rounded-full ${opening ? 'bg-amber-400' : nav.agentStatus === 'waiting' ? 'bg-sky-400' : 'bg-emerald-500'} animate-pulse`} />
          {opening ? 'Abrindo o navegador na nuvem…' : NAV_STATUS_LABEL[nav.agentStatus] ?? nav.agentStatus}
          {nav.sessionId ? ` · ${nav.billedMinutes} min · ${nav.creditsPerMinute} crédito/min` : ''}
          {nav.url ? ` · ${hostOf(nav.url)}` : ''}
        </span>
      </header>
      {task && <p className="line-clamp-2 text-xs text-foreground/90">{task.task}</p>}
      <NavigatorLiveFrame nav={nav} compact className="aspect-[16/10] w-full" />
      {nav.error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px]">{nav.error}</p>}
      {requests.map((p) => <NavigatorRequestCard key={p.id} pending={p} compact />)}
      {approval && <NavigatorApprovalInline approval={approval} screenshot={nav.screenshot} />}
      <NavigatorFilling nav={nav} />
      <NavigatorControls nav={nav} compact allowOpen={false} />
      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted-foreground">Passos do agente</summary>
        <NavigatorStepList events={events} max={10} className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[11px]" empty="O agente está planejando…" />
      </details>
    </section>
  );
}

/** Recibo da tarefa na conversa (fica salvo; a captura só durante a sessão). */
export function NavigatorResultCard({ artifact }: { artifact: Extract<Artifact, { kind: 'navigator' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-3" data-testid="vertal-navigator-result" aria-label="Resultado do navegador">
      <header className="flex items-start gap-2">
        {artifact.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary/90">Vertal Navigator</p>
          <p className="break-words text-xs text-foreground/90">{artifact.task}</p>
        </div>
      </header>
      {artifact.screenshot?.url && <img src={artifact.screenshot.url} alt="Tela final do navegador" className="max-h-64 w-full rounded-lg border border-border/40 object-contain" />}
      {artifact.answer && (
        <blockquote className="flex gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="whitespace-pre-wrap break-words">{artifact.answer}</span>
        </blockquote>
      )}
      {artifact.finalUrl && <p className="break-all text-[10px] text-muted-foreground">Página final: {artifact.finalUrl}</p>}
      {artifact.steps.length > 0 && (
        <button type="button" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden /> Passos do agente ({artifact.steps.length})
        </button>
      )}
      {open && (
        <ol className="max-h-48 space-y-1 overflow-y-auto text-[11px]">
          {artifact.steps.map((l, i) => <li key={i} className="rounded-md bg-secondary/60 px-2 py-1">{l}</li>)}
        </ol>
      )}
    </section>
  );
}

/** Usado no MessageRow: cartão ao vivo enquanto a tarefa deste chat roda. */
export function VertalNavigatorInline({ pending }: { pending?: boolean }) {
  const nav = useNavigator();
  if (!pending || !hasLiveChatNavigatorTask(nav.currentTask?.origin, nav.agentStatus)) {
    // Abrindo (sem tarefa ainda) também mostra, para o usuário ver o navegador subir.
    if (!pending || !nav.busy) return null;
  }
  return <VertalNavigatorLiveCard />;
}

