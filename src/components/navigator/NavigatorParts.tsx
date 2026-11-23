// Componentes do Vertal Navigator extraídos do NavigatorPanel (fase 4) para serem
// usados também no cartão do navegador dentro do chat do Vibe Code. O painel do
// Vertal Chat continua com a mesma aparência e o mesmo comportamento.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Hand, Send, KeyRound, Loader2, MousePointerClick, Play, Power, ShieldAlert, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import type { NavigatorEvent, NavigatorPending } from '@/lib/navigator/navigatorCore';
import { navigatorAudioUrl } from '@/lib/navigator/client';
import {
  answerNavigator, releaseNavigator, startNavigator, stopNavigator, takeoverNavigator, type NavigatorState,
} from '@/lib/navigator/store';
import { approvalCopy, hostOf, navBtn, navBtnSm, navInput, navigatorStepLines, navPrimary, navPrimarySm } from './navigatorUi';

/**
 * Ouvir no celular o áudio que o navegador da nuvem está tocando (stream /audio via Worker).
 * O ticket é buscado antes do clique (prefetch), para o play() rodar dentro do gesto do
 * usuário, exigência do iOS. Se o stream cair, avisa e deixa tocar de novo.
 */
export function NavigatorAudioButton({ sessionId, compact = false }: { sessionId: string | null | undefined; compact?: boolean }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wantOn = useRef(false);
  const cached = useRef<{ sessionId: string; url: string; expiresAt: number } | null>(null);

  const stop = useCallback(() => {
    wantOn.current = false;
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setOn(false);
  }, []);

  // Sessão trocou ou acabou: para o som e descarta o ticket.
  useEffect(() => {
    cached.current = null;
    stop();
  }, [sessionId, stop]);

  // Pega o ticket antes do clique (ver comentário acima).
  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    navigatorAudioUrl(sessionId)
      .then((r) => {
        if (alive && r.ok) cached.current = { sessionId, url: r.url, expiresAt: r.expiresAt };
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [sessionId]);

  const lost = () => {
    if (!wantOn.current) return;
    cached.current = null;
    stop();
    setError('O áudio parou. Toque em “Ouvir no celular” para reconectar.');
  };

  const toggle = async () => {
    if (on || wantOn.current) {
      stop();
      return;
    }
    if (!sessionId || !audioRef.current) return;
    setError(null);
    wantOn.current = true;
    let entry = cached.current;
    if (!entry || entry.sessionId !== sessionId || entry.expiresAt - 30_000 <= Date.now()) {
      setBusy(true);
      const r = await navigatorAudioUrl(sessionId);
      setBusy(false);
      if (r.ok === false) {
        wantOn.current = false;
        setError(r.message);
        return;
      }
      entry = { sessionId, url: r.url, expiresAt: r.expiresAt };
      cached.current = entry;
    }
    const el = audioRef.current;
    if (!el) return;
    el.src = entry.url;
    try {
      await el.play();
      setOn(true);
    } catch {
      // Bloqueado pelo navegador do celular: o toque seguinte libera o som.
      wantOn.current = false;
      el.removeAttribute('src');
      el.load();
      setError('Toque em “Ouvir no celular” de novo para liberar o som neste aparelho.');
    }
  };

  const label = busy ? 'Conectando…' : on ? 'Parar áudio' : 'Ouvir no celular';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio ref={audioRef} preload="none" onError={lost} onEnded={lost} />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!sessionId || busy}
        aria-pressed={on}
        className={compact ? navBtnSm : navBtn}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : on ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {label}
      </button>
      {on && <span className={`text-white/80 ${compact ? 'text-[10px]' : 'text-xs'}`}>Tocando o áudio do navegador</span>}
      {error && <span role="alert" className={`text-amber-300 ${compact ? 'text-[10px]' : 'text-xs'}`}>{error}</span>}
    </div>
  );
}

/** Tela ao vivo (noVNC em iframe) ou a última captura, com o botão de ouvir o áudio. */
export function NavigatorLiveFrame({ nav, className = 'aspect-[16/10] w-full', compact = false }: { nav: NavigatorState; className?: string; compact?: boolean }) {
  const frameUrl = nav.takeover && nav.controlUrl ? nav.controlUrl : nav.liveViewUrl;
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-black/90">
      {frameUrl ? (
        <iframe
          key={frameUrl}
          title="Tela ao vivo do Vertal Navigator"
          src={frameUrl}
          className={className}
          allow="clipboard-read; clipboard-write"
          referrerPolicy="no-referrer"
        />
      ) : nav.screenshot ? (
        <img src={nav.screenshot} alt="Última captura do navegador" className="w-full" />
      ) : (
        <div className={`flex items-center justify-center text-white/70 ${compact ? 'text-xs' : 'text-sm'} ${className}`}>
          {nav.busy ? 'Abrindo o navegador na nuvem…' : 'O navegador aparece aqui.'}
        </div>
      )}
      {nav.takeover && (
        <p className={`bg-amber-500/90 px-3 py-1 font-medium text-black ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Você está no controle: o agente está pausado. Faça login à mão se quiser; clique em “Devolver ao agente” quando terminar.
        </p>
      )}
      {nav.sessionId && (
        <div className="border-t border-border/60 bg-background/80 px-3 py-2">
          <NavigatorAudioButton sessionId={nav.sessionId} compact={compact} />
        </div>
      )}
    </div>
  );
}

/** Lista "Passos do agente" (mais recentes primeiro). */
export function NavigatorStepList({ events, max = 40, className = 'max-h-[420px] space-y-1.5 overflow-y-auto text-xs', empty = 'Os passos do agente aparecem aqui.' }: {
  events: NavigatorEvent[]; max?: number; className?: string; empty?: string;
}) {
  const lines = navigatorStepLines(events, max);
  return (
    <ol className={className} aria-label="Passos do agente">
      {lines.map((l) => <li key={l.seq} className="rounded-md bg-secondary/60 px-2 py-1.5">{l.text}</li>)}
      {lines.length === 0 && <li className="text-muted-foreground">{empty}</li>}
    </ol>
  );
}

/** Campo do código 2FA / resposta a uma pergunta do agente. */
export function NavigatorPendingInput({ pending, compact = false }: { pending: NavigatorPending; compact?: boolean }) {
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
    <form className={`space-y-2 rounded-lg border border-primary/40 bg-primary/5 ${compact ? 'p-2' : 'p-3'}`} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className={`flex items-center gap-1.5 font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
        <KeyRound className="h-4 w-4" aria-hidden /> {isCode ? 'Código de verificação' : 'O agente perguntou'}
      </p>
      <p className={compact ? 'text-xs' : 'text-sm'}>{pending.question}</p>
      <div className="flex gap-2">
        <input
          className={navInput} value={value} onChange={(e) => setValue(e.target.value)} autoFocus
          {...(isCode ? { inputMode: 'numeric' as const, autoComplete: 'one-time-code', maxLength: 32, placeholder: '123456' } : { maxLength: 500 })}
          aria-label={isCode ? 'Código de verificação' : 'Resposta'}
        />
        <button type="submit" className={compact ? navPrimarySm : navPrimary} disabled={sending || !value.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Enviar'}</button>
      </div>
      {isCode && <p className="text-xs text-muted-foreground">O código é digitado direto no site, sem passar pela IA.</p>}
    </form>
  );
}

/** Aviso "preenchendo do cofre…" (segredos/TOTP resolvidos no servidor). */
export function NavigatorFilling({ nav }: { nav: NavigatorState }) {
  if (nav.filling.length === 0) return null;
  return (
    <p className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs">
      <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden /> {nav.filling.some((f) => f.kind === 'totp') ? 'Gerando código 2FA do autenticador' : 'Preenchendo'} {nav.filling.map((f) => f.name).join(', ')} do cofre…
    </p>
  );
}

/** Botões Abrir / Assumir controle / Devolver / Fechar (salva o login). */
export function NavigatorControls({ nav, compact = false, allowOpen = true }: { nav: NavigatorState; compact?: boolean; allowOpen?: boolean }) {
  const b = compact ? navBtnSm : navBtn;
  const p = compact ? navPrimarySm : navPrimary;
  const icon = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className="flex flex-wrap gap-2">
      {!nav.sessionId && allowOpen && (
        <button type="button" className={p} disabled={nav.busy} onClick={() => void startNavigator()}>
          {nav.busy ? <Loader2 className={`${icon} animate-spin`} aria-hidden /> : <Play className={icon} aria-hidden />} Abrir navegador
        </button>
      )}
      {nav.sessionId && !nav.takeover && (
        <button type="button" className={b} onClick={() => void takeoverNavigator()}>
          <Hand className={icon} aria-hidden /> Assumir controle
        </button>
      )}
      {nav.sessionId && nav.takeover && (
        <button type="button" className={p} onClick={() => void releaseNavigator()}>
          <MousePointerClick className={icon} aria-hidden /> Devolver ao agente
        </button>
      )}
      {nav.sessionId && (
        <button type="button" className={b} disabled={nav.busy} onClick={() => void stopNavigator()}>
          <Power className={icon} aria-hidden /> Fechar (salva o login)
        </button>
      )}
    </div>
  );
}

/** Corpo do cartão de aprovação de pagamento: loja, total, itens, botão, URL e captura. */
/** Ação de escrita: mostra o conteúdo exato que vai sair (campos preenchidos), o botão, a página e a captura. */
export function NavigatorWriteDetails({ approval, screenshot }: { approval: NavigatorPending; screenshot?: string | null }) {
  const shot = approval.screenshot || screenshot || '';
  const fields = approval.fields ?? [];
  return (
    <div className="space-y-2 text-sm" data-testid="navigator-write-details">
      <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
        <p className="mb-1 text-xs text-muted-foreground">Conteúdo que será enviado (lido dos campos da página)</p>
        {fields.length ? (
          <dl className="space-y-1.5">
            {fields.map((f, i) => (
              <div key={`${f.label}-${i}`}>
                <dt className="text-[11px] font-medium text-muted-foreground">{f.label || 'Campo'}</dt>
                <dd className="whitespace-pre-wrap break-words text-xs">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs">Não consegui ler os campos desta página: confira o conteúdo na captura.</p>
        )}
      </div>
      <div className="rounded-lg border border-border/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">Botão</p>
        <p className="break-words font-medium">{approval.target || approval.action || '—'}</p>
      </div>
      {approval.url && <p className="break-all text-xs text-muted-foreground">{approval.url}</p>}
      {shot && <img src={shot} alt="Página no momento do pedido de aprovação" className="max-h-72 w-full rounded-lg border border-border/50 object-contain" />}
      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Só aprove se o destinatário e o texto estiverem certos. Se tiver dúvida, recuse e assuma o controle.
      </p>
    </div>
  );
}

export function NavigatorApprovalDetails({ approval, screenshot }: { approval: NavigatorPending; screenshot?: string | null }) {
  if (approval.category === 'write') return <NavigatorWriteDetails approval={approval} screenshot={screenshot} />;
  const shot = approval.screenshot || screenshot || '';
  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">Loja</p>
          <p className="break-words font-medium">{approval.store || hostOf(approval.url) || '—'}</p>
          {approval.pageTitle && <p className="line-clamp-2 text-xs text-muted-foreground">{approval.pageTitle}</p>}
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-xs text-muted-foreground">Valor total (lido da página)</p>
          <p className="text-lg font-semibold">{approval.total || 'Não identificado'}</p>
        </div>
      </div>
      {approval.items && approval.items.length > 0 && (
        <div className="rounded-lg border border-border/40 px-3 py-2">
          <p className="mb-1 text-xs text-muted-foreground">Itens</p>
          <ul className="space-y-0.5 text-xs">
            {approval.items.map((item) => <li key={item} className="break-words">{item}</li>)}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-border/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">Botão</p>
        <p className="break-words font-medium">{approval.target || approval.action || '—'}</p>
      </div>
      {approval.url && <p className="break-all text-xs text-muted-foreground">{approval.url}</p>}
      {shot && <img src={shot} alt="Página no momento do pedido de aprovação" className="max-h-72 w-full rounded-lg border border-border/50 object-contain" />}
      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {approval.total
          ? 'Loja, itens e total são lidos automaticamente da página e podem falhar: confira na captura antes de aprovar. Se tiver dúvida, recuse e assuma o controle.'
          : 'Não consegui ler o valor total desta página: confira valor e itens na captura antes de aprovar. Se tiver dúvida, recuse e assuma o controle.'}
      </p>
    </div>
  );
}

/**
 * Cartão de aprovação de pagamento dentro do chat (Vibe Code). Mesma regra dura do
 * diálogo: só "Aprovar e clicar" envia approve + confirmed (store.answerNavigator).
 */
export function NavigatorApprovalInline({ approval, screenshot }: { approval: NavigatorPending; screenshot?: string | null }) {
  const [sending, setSending] = useState(false);
  const copy = approvalCopy(approval);
  const decide = async (approve: boolean) => {
    setSending(true);
    await answerNavigator(approval, { approve });
    setSending(false);
  };
  return (
    <section className="space-y-2 rounded-xl border border-primary/50 bg-primary/5 p-3" aria-label={copy.title.replace('?', '')} data-testid="navigator-approval-inline">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {copy.isWrite ? <Send className="h-4 w-4 text-primary" aria-hidden /> : <CreditCard className="h-4 w-4 text-primary" aria-hidden />} {copy.title}
      </p>
      {copy.isWrite ? (
        <p className="text-xs text-muted-foreground">{copy.description}{hostOf(approval.url) ? <> Página: <strong>{hostOf(approval.url)}</strong>.</> : null}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          O navegador parou antes de clicar num botão que pode <strong>pagar, comprar ou confirmar um pedido</strong>
          {hostOf(approval.url) ? <> em <strong>{hostOf(approval.url)}</strong></> : null}. Nada foi clicado ainda.
        </p>
      )}
      <NavigatorApprovalDetails approval={approval} screenshot={screenshot} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={sending} onClick={() => void decide(false)} className={navBtn}>
          <X className="h-4 w-4" aria-hidden /> Recusar
        </button>
        <button type="button" disabled={sending} onClick={() => void decide(true)} className={navPrimary}>
          {copy.isWrite ? <Send className="h-4 w-4" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />} {copy.approveLabel}
        </button>
      </div>
    </section>
  );
}
