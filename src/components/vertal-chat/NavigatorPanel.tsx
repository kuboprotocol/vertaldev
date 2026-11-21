// Painel do Vertal Navigator dentro do Vertal Chat: tela ao vivo do navegador na
// nuvem (noVNC em iframe), passos do agente, "Assumir controle" e o campo para o
// código de verificação (2FA) quando o site pedir.
// Fase 2: abas "Ao vivo", "Atividade" (auditoria) e "Segurança" (aprovação
// automática até R$X e autenticador TOTP).
import { useEffect, useState } from 'react';
import { Globe, Loader2, Play } from 'lucide-react';
import { NavigatorActivity } from './NavigatorActivity';
import { NavigatorSecurity } from './NavigatorSecurity';
import { panelMounted, runNavigatorTask, useNavigator } from '@/lib/navigator/store';
// Fase 4: peças compartilhadas com o cartão do navegador no chat do Vibe Code.
import { NavigatorControls, NavigatorFilling, NavigatorLiveFrame, NavigatorPendingInput, NavigatorStepList } from '@/components/navigator/NavigatorParts';
import { hostOf, NAV_STATUS_LABEL, navInput, navPrimary } from '@/components/navigator/navigatorUi';

export function NavigatorPanel() {
  const nav = useNavigator();
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<'live' | 'activity' | 'security'>('live');

  useEffect(() => {
    panelMounted(1);
    return () => panelMounted(-1);
  }, []);

  const inputs = nav.pending.filter((p) => p.kind === 'code' || p.kind === 'text');

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
              {NAV_STATUS_LABEL[nav.agentStatus] ?? nav.agentStatus}
              {nav.sessionId ? ` · ${nav.billedMinutes} min · ${nav.creditsPerMinute} crédito/min` : ''}
              {nav.url ? ` · ${hostOf(nav.url)}` : ''}
            </p>
          </div>
        </div>
        <NavigatorControls nav={nav} />
      </header>

      {nav.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{nav.error}</p>}

      <div role="tablist" aria-label="Seções do Navigator" className="flex gap-1 border-b border-border/60">
        {([['live', 'Ao vivo'], ['activity', 'Atividade'], ['security', 'Segurança']] as const).map(([key, label]) => (
          <button
            key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'activity' && <NavigatorActivity />}
      {tab === 'security' && <NavigatorSecurity />}

      <div className={`grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] ${tab === 'live' ? '' : 'hidden'}`}>
        <NavigatorLiveFrame nav={nav} />

        <aside className="flex min-h-0 flex-col gap-3">
          {inputs.map((p) => <NavigatorPendingInput key={p.id} pending={p} />)}
          <NavigatorFilling nav={nav} />
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <textarea
              rows={3} className={navInput} value={task} onChange={(e) => setTask(e.target.value)} maxLength={4000}
              placeholder="Ex.: entre no meu GitHub e me diga quantas notificações eu tenho"
              aria-label="Tarefa para o navegador"
            />
            <button type="submit" className={navPrimary} disabled={running || !task.trim() || nav.agentStatus === 'running' || nav.agentStatus === 'waiting'}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Executar
            </button>
          </form>
          <NavigatorStepList events={nav.events} />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Pagar, comprar ou confirmar pedido sempre pede a sua aprovação. Senhas vêm do Cofre de segredos (vinculadas ao site) e nunca passam pela IA.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default NavigatorPanel;
