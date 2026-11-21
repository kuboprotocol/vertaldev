// Painel do Vertal Navigator dentro do Vertal Chat: tela ao vivo do navegador na
// nuvem (noVNC em iframe), passos do agente, "Assumir controle" e o campo para o
// código de verificação (2FA) quando o site pedir.
import { useEffect, useState } from 'react';
import { Globe, Hand, KeyRound, Loader2, MousePointerClick, Play, Power, ShieldCheck } from 'lucide-react';
import type { NavigatorEvent, NavigatorPending } from '@/lib/navigator/navigatorCore';
import {
  answerNavigator, panelMounted, releaseNavigator, runNavigatorTask, startNavigator, stopNavigator, takeoverNavigator, useNavigator,
} from '@/lib/navigator/store';

const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
const inputCls = 'w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const STATUS_LABEL: Record<string, string> = {
  none: 'Fechado', idle: 'Pronto', running: 'Trabalhando…', paused: 'Pausado (você no controle)', waiting: 'Esperando você',
  done: 'Concluído', failed: 'Falhou', stopped: 'Parado',
};

function describe(ev: NavigatorEvent): string | null {
  switch (ev.type) {
    case 'step': {
      const actions = Array.isArray(ev.actions) ? (ev.actions as Array<{ name?: string }>).map((a) => a.name).filter(Boolean).join(', ') : '';
      return `Passo ${String(ev.n ?? '')}: ${String(ev.goal || ev.evaluation || 'analisando a página')}${actions ? ` (${actions})` : ''}`;
    }
    case 'needs_approval': return `Pediu aprovação para: ${String(ev.target || ev.action || 'ação de pagamento')}`;
    case 'approval_granted': return 'Você aprovou a ação.';
    case 'approval_denied': return 'Ação de pagamento recusada.';
    case 'needs_user_input': return `Pergunta: ${String(ev.question ?? '')}`;
    case 'needs_secret': return `Preenchendo ${String(ev.name ?? 'credencial')} do cofre em ${String(ev.host ?? '')}`;
    case 'secret_filled': return `Credencial ${String(ev.name ?? '')} preenchida (o valor não passa pela IA).`;
    case 'takeover': return ev.active ? 'Você assumiu o controle.' : 'Controle devolvido ao agente.';
    case 'done': return `Fim: ${String(ev.result ?? '')}`;
    case 'input_timeout': return 'Pedido expirou sem resposta.';
    default: return null;
  }
}

function PendingInput({ pending }: { pending: NavigatorPending }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const isCode = pending.kind === 'code';
  const send = async () => {
    if (!value.trim()) return;
    setSending(true);
    await answerNavigator(pending, { value: value.trim() });
    setSending(false);
    setValue('');
  };
  return (
    <form className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <KeyRound className="h-4 w-4" aria-hidden /> {isCode ? 'Código de verificação' : 'O agente perguntou'}
      </p>
      <p className="text-sm">{pending.question}</p>
      <div className="flex gap-2">
        <input
          className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} autoFocus
          {...(isCode ? { inputMode: 'numeric' as const, autoComplete: 'one-time-code', maxLength: 32, placeholder: '123456' } : { maxLength: 500 })}
          aria-label={isCode ? 'Código de verificação' : 'Resposta'}
        />
        <button type="submit" className={primary} disabled={sending || !value.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Enviar'}</button>
      </div>
      {isCode && <p className="text-xs text-muted-foreground">O código é digitado direto no site, sem passar pela IA.</p>}
    </form>
  );
}

export function NavigatorPanel() {
  const nav = useNavigator();
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    panelMounted(1);
    return () => panelMounted(-1);
  }, []);

  const frameUrl = nav.takeover && nav.controlUrl ? nav.controlUrl : nav.liveViewUrl;
  const inputs = nav.pending.filter((p) => p.kind === 'code' || p.kind === 'text');
  const lines = nav.events.map((ev) => ({ seq: ev.seq, text: describe(ev) })).filter((l) => l.text).slice(-40).reverse();

  const run = async () => {
    if (!task.trim()) return;
    setRunning(true);
    const text = task.trim();
    setTask('');
    await runNavigatorTask(text);
    setRunning(false);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">Vertal Navigator</h2>
            <p className="text-xs text-muted-foreground">
              {STATUS_LABEL[nav.agentStatus] ?? nav.agentStatus}
              {nav.sessionId ? ` · ${nav.billedMinutes} min · ${nav.creditsPerMinute} crédito/min` : ''}
              {nav.url ? ` · ${(() => { try { return new URL(nav.url).host; } catch { return ''; } })()}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!nav.sessionId && (
            <button type="button" className={primary} disabled={nav.busy} onClick={() => void startNavigator()}>
              {nav.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Abrir navegador
            </button>
          )}
          {nav.sessionId && !nav.takeover && (
            <button type="button" className={btn} onClick={() => void takeoverNavigator()}>
              <Hand className="h-4 w-4" aria-hidden /> Assumir controle
            </button>
          )}
          {nav.sessionId && nav.takeover && (
            <button type="button" className={primary} onClick={() => void releaseNavigator()}>
              <MousePointerClick className="h-4 w-4" aria-hidden /> Devolver ao agente
            </button>
          )}
          {nav.sessionId && (
            <button type="button" className={btn} disabled={nav.busy} onClick={() => void stopNavigator()}>
              <Power className="h-4 w-4" aria-hidden /> Fechar (salva o login)
            </button>
          )}
        </div>
      </header>

      {nav.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{nav.error}</p>}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border border-border/60 bg-black/90">
          {frameUrl ? (
            <iframe
              key={frameUrl}
              title="Tela ao vivo do Vertal Navigator"
              src={frameUrl}
              className="aspect-[16/10] w-full"
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          ) : nav.screenshot ? (
            <img src={nav.screenshot} alt="Última captura do navegador" className="w-full" />
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center text-sm text-white/70">
              {nav.busy ? 'Abrindo o navegador na nuvem…' : 'O navegador aparece aqui.'}
            </div>
          )}
          {nav.takeover && (
            <p className="bg-amber-500/90 px-3 py-1 text-xs font-medium text-black">
              Você está no controle: o agente está pausado. Faça login à mão se quiser; clique em “Devolver ao agente” quando terminar.
            </p>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-3">
          {inputs.map((p) => <PendingInput key={p.id} pending={p} />)}
          {nav.filling.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden /> Preenchendo {nav.filling.map((f) => f.name).join(', ')} do cofre…
            </p>
          )}
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <textarea
              rows={3} className={inputCls} value={task} onChange={(e) => setTask(e.target.value)} maxLength={4000}
              placeholder="Ex.: entre no meu GitHub e me diga quantas notificações eu tenho"
              aria-label="Tarefa para o navegador"
            />
            <button type="submit" className={primary} disabled={running || !task.trim() || nav.agentStatus === 'running' || nav.agentStatus === 'waiting'}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Executar
            </button>
          </form>
          <ol className="max-h-[420px] space-y-1.5 overflow-y-auto text-xs" aria-label="Passos do agente">
            {lines.map((l) => <li key={l.seq} className="rounded-md bg-secondary/60 px-2 py-1.5">{l.text}</li>)}
            {lines.length === 0 && <li className="text-muted-foreground">Os passos do agente aparecem aqui.</li>}
          </ol>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Pagar, comprar ou confirmar pedido sempre pede a sua aprovação. Senhas vêm do Cofre de segredos (vinculadas ao site) e nunca passam pela IA.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default NavigatorPanel;
