// Fase 4 do Vertal Navigator: o navegador na nuvem DENTRO do chat do Vibe Code
// (como os agentes de navegador do Lovable/Bolt/Replit e o cartão ao vivo do Hark).
// Padrão: cartão compacto na página do projeto; nada navega para outra página sozinho.
// Ao vivo: tela compacta na largura do chat, passo atual, "Expandir" (o MESMO cartão
// em tela cheia, sem recarregar a tela ao vivo), "Abrir em outra tela" (sub-página
// /navegar/:sessionId, só quando o usuário toca), passos do agente, minutos/créditos, "Assumir controle",
// "Fechar (salva o login)", código 2FA e aprovação de pagamento inline.
// Encerrado: captura final + resposta + passos (fica guardado na conversa).
import { useEffect, useState, type CSSProperties } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, Globe, Loader2, Maximize2, MessageSquarePlus, Minimize2, Play, Quote, XCircle } from 'lucide-react';
import {
  NavigatorApprovalInline, NavigatorControls, NavigatorFilling, NavigatorLiveFrame, NavigatorStepList,
} from '@/components/navigator/NavigatorParts';
import { NavigatorRequestCard } from '@/components/navigator/NavigatorSecureForms';
import { isRequestCardKind } from '@/components/navigator/navigatorUi';
import { hostOf, NAV_STATUS_LABEL, navBtnSm, navigatorSessionPath, navigatorStepLines, navPrimarySm } from '@/components/navigator/navigatorUi';
import { useNavigatorFullscreen } from '@/components/navigator/useNavigatorFullscreen';
import { currentTaskEvents, inlineApprovalMounted, panelMounted, useNavigator } from '@/lib/navigator/store';
import type { NavigatorCardData } from '@/lib/navigator/vibeCard';

interface Props {
  card: NavigatorCardData;
  /** "Usar no pedido": a resposta entra no campo do Vibe Code. */
  onUse?: (text: string) => void;
  /** "Continuar com o agente": manda o resultado ao agente do Vibe Code. */
  onContinue?: (card: NavigatorCardData) => void;
  /** Cartão pedido pelo agente que ainda não rodou (ex.: recarregou a página): roda agora. */
  onRun?: (card: NavigatorCardData) => void;
  disabled?: boolean;
}

const SAFE_AREA_STYLE: CSSProperties = {
  paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
  paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
};

/**
 * Cartão ao vivo (como o cartão do navegador do Hark): fica DENTRO da página do projeto,
 * compacto, com a tela ao vivo, o passo atual e os controles. "Expandir" leva o MESMO
 * cartão para a tela cheia (o iframe do noVNC e o controle de som continuam montados no
 * mesmo lugar do DOM: sem recarregar a tela nem abrir um segundo stream de áudio).
 * "Abrir em outra tela" só abre a sub-página /navegar/:sessionId quando o usuário toca.
 */
function LiveBody({ card }: { card: NavigatorCardData }) {
  const nav = useNavigator();
  const fs = useNavigatorFullscreen();
  const full = fs.fullscreen;
  // Enquanto o cartão está ao vivo, ele é o "painel": 2FA e aprovação aparecem aqui, não em diálogo.
  useEffect(() => {
    panelMounted(1);
    inlineApprovalMounted(1);
    return () => {
      panelMounted(-1);
      inlineApprovalMounted(-1);
    };
  }, []);
  const mine = nav.currentTask && nav.currentTask.id === card.taskId ? nav.currentTask : null;
  const events = mine ? currentTaskEvents(nav, mine) : [];
  const approval = nav.pending.find((p) => p.kind === 'approval') ?? null;
  const inputs = nav.pending.filter((p) => isRequestCardKind(p.kind));
  const opening = !nav.sessionId || !mine;
  const currentStep = navigatorStepLines(events, 1)[0]?.text ?? null;

  const openElsewhere = () => {
    if (!nav.sessionId || typeof window === 'undefined') return;
    if (full) fs.close();
    window.open(navigatorSessionPath(nav.sessionId), '_blank', 'noopener,noreferrer');
  };

  return (
    // Mesmo elemento nos dois modos (só muda a classe): o React não desmonta o iframe.
    <div
      ref={fs.shellRef}
      data-testid="navigator-live-shell"
      data-fullscreen={full ? 'true' : 'false'}
      role={full ? 'dialog' : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? 'Vertal Navigator em tela cheia' : undefined}
      onKeyDown={fs.onKeyDown}
      style={full ? SAFE_AREA_STYLE : undefined}
      className={full
        ? 'fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col gap-2 overflow-y-auto overscroll-contain bg-background'
        : 'space-y-2'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5" aria-live="polite">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${opening ? 'bg-amber-400' : 'bg-emerald-500'} animate-pulse`} aria-hidden />
          {full && <Globe className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
          <span className="truncate">
            {full ? <strong className="text-foreground">Vertal Navigator · </strong> : null}
            {opening ? 'Abrindo o navegador na nuvem…' : NAV_STATUS_LABEL[nav.agentStatus] ?? nav.agentStatus}
            {nav.sessionId ? ` · ${nav.billedMinutes} min · ${nav.creditsPerMinute} crédito/min` : ''}
            {nav.url ? ` · ${hostOf(nav.url)}` : ''}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {nav.sessionId && (
            <button type="button" className={navBtnSm} onClick={openElsewhere} aria-label="Abrir o navegador em outra tela" title="Abre uma página só do navegador, em outra aba">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Abrir em outra tela</span>
            </button>
          )}
          {full ? (
            <button type="button" ref={fs.closeRef} className={navBtnSm} onClick={fs.close} aria-label="Recolher o navegador (Esc)">
              <Minimize2 className="h-3.5 w-3.5" aria-hidden /> Recolher
            </button>
          ) : (
            <button type="button" ref={fs.triggerRef} className={navBtnSm} onClick={fs.open} aria-label="Expandir o navegador em tela cheia">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Expandir
            </button>
          )}
        </span>
      </div>
      {full && <p className="line-clamp-2 break-words text-xs text-foreground/90">{card.task}</p>}
      {currentStep && (
        <p className="truncate text-[11px] text-foreground/80" data-testid="navigator-current-step">
          <span className="font-semibold">Agora:</span> {currentStep}
        </p>
      )}
      <div className={full ? 'grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]' : 'space-y-2'}>
        <NavigatorLiveFrame
          nav={nav}
          compact={!full}
          className={full ? 'h-[60dvh] w-full lg:h-[calc(100dvh-7rem)]' : 'aspect-[16/10] w-full'}
        />
        <div className={full ? 'flex min-h-0 flex-col gap-2 lg:overflow-y-auto' : 'space-y-2'}>
          {nav.error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px]">{nav.error}</p>}
          {approval && <NavigatorApprovalInline approval={approval} screenshot={nav.screenshot} />}
          {inputs.map((p) => <NavigatorRequestCard key={p.id} pending={p} compact />)}
          <NavigatorFilling nav={nav} />
          <NavigatorControls nav={nav} compact allowOpen={false} />
          <div>
            <p className="mb-1 text-[11px] font-semibold text-foreground/80">Passos do agente</p>
            <NavigatorStepList
              events={events}
              max={full ? 40 : 8}
              className={full ? 'max-h-[40dvh] space-y-1 overflow-y-auto text-xs lg:max-h-none' : 'max-h-40 space-y-1 overflow-y-auto text-[11px]'}
              empty="O agente está planejando…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VibeNavigatorCard({ card, onUse, onContinue, onRun, disabled }: Props) {
  const [showSteps, setShowSteps] = useState(false);
  const live = card.state === 'running';
  const finished = card.state === 'done' || card.state === 'failed' || card.state === 'cancelled';

  return (
    <section className="space-y-2 rounded-2xl border border-primary/30 bg-black/40 p-3" data-testid="vibe-navigator-card" aria-label="Vertal Navigator">
      <header className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {live ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : card.state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : card.state === 'requested' ? <Globe className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5 text-rose-400" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary/90">
            Vertal Navigator{card.origin === 'agent' ? ' · pedido pelo agente' : ''}
          </p>
          <p className="break-words text-xs text-foreground/90">{card.task}</p>
        </div>
      </header>

      {live && <LiveBody card={card} />}

      {card.state === 'requested' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-muted-foreground">O agente pediu para usar o navegador na nuvem nesta tarefa.</p>
          {onRun && (
            <button type="button" className={navPrimarySm} onClick={() => onRun(card)} disabled={disabled}>
              <Play className="h-3.5 w-3.5" aria-hidden /> Executar agora
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="space-y-2">
          {card.screenshot && (
            <img src={card.screenshot} alt="Tela final do navegador" className="max-h-64 w-full rounded-lg border border-border/40 object-contain" />
          )}
          {card.answer && (
            <blockquote className="flex gap-2 rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-xs">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="whitespace-pre-wrap break-words">{card.answer}</span>
            </blockquote>
          )}
          {card.finalUrl && <p className="break-all text-[10px] text-muted-foreground">Página final: {card.finalUrl}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {onUse && card.answer && (
              <button type="button" className={navBtnSm} onClick={() => onUse(card.answer!)} disabled={disabled}>
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Usar no pedido
              </button>
            )}
            {onContinue && card.answer && (
              <button type="button" className={navPrimarySm} onClick={() => onContinue(card)} disabled={disabled}>
                <Play className="h-3.5 w-3.5" aria-hidden /> Continuar com o agente
              </button>
            )}
            {(card.steps?.length ?? 0) > 0 && (
              <button type="button" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSteps ? '' : '-rotate-90'}`} aria-hidden />
                Passos do agente ({card.stepsCount ?? card.steps!.length})
              </button>
            )}
          </div>
          {card.plan && showSteps && <p className="text-[11px] text-muted-foreground"><strong>Plano:</strong> {card.plan}</p>}
          {showSteps && (
            <ol className="max-h-48 space-y-1 overflow-y-auto text-[11px]" aria-label="Passos do agente">
              {card.steps!.map((l, i) => <li key={i} className="rounded-md bg-secondary/60 px-2 py-1">{l}</li>)}
            </ol>
          )}
        </div>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground/70">
        Pagar, comprar ou confirmar pedido sempre pede a sua aprovação. Senhas vêm do Cofre (vinculadas ao site) e nunca passam pela IA.
      </p>
    </section>
  );
}

export default VibeNavigatorCard;
