// Som do Vertal Navigator: o usuário escolhe como ouvir o que o navegador da nuvem toca.
//   • "Som da nuvem": stream do PulseAudio do sandbox (navd /audio → Worker → <audio>).
//   • "Tocar no meu aparelho": se a aba é YouTube/YouTube Music/Spotify/SoundCloud/Vimeo,
//     abre o player OFICIAL de embed aqui (ou o link no app do serviço) e pausa a aba na nuvem.
//   • "Sem som".
// A escolha fica lembrada por usuário neste aparelho (localStorage, lib/navigator/sound.ts).
// Nada de telemetria: nenhuma chamada além das rotas do Navigator e do player escolhido.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, MonitorSmartphone, Cloud, Volume2, VolumeX, X } from 'lucide-react';
import { navigatorAudioUrl, navigatorUserId, pauseNavigatorMedia } from '@/lib/navigator/client';
import type { NavigatorState } from '@/lib/navigator/store';
import {
  catchUpTarget, loadSoundPrefs, mediaEmbedFor, saveSoundPrefs, SOUND_MODES,
  type MediaEmbed, type NavigatorSoundMode, type NavigatorSoundPrefs,
} from '@/lib/navigator/sound';
import { navBtn, navBtnSm } from './navigatorUi';

/**
 * Ouvir o áudio que o navegador da nuvem está tocando (stream /audio via Worker) — opção
 * "Som da nuvem". O ticket é buscado antes do clique (prefetch), para o play() rodar
 * dentro do gesto do usuário, exigência do iOS. Se o stream cair, avisa e deixa tocar de
 * novo. Com o som ligado: mudo e volume (o iOS ignora o volume; lá só vale o mudo) e
 * correção de atraso (se o buffer passar de ~2,5 s, pula para perto da ponta).
 */
export function NavigatorAudioButton({ sessionId, compact = false, label = 'Ouvir no celular', volume = 1, onVolumeChange }: {
  sessionId: string | null | undefined;
  compact?: boolean;
  /** Texto do botão parado (o painel com a escolha de som usa "Ouvir som da nuvem"). */
  label?: string;
  /** 0–1, lembrado pelo controle de som. */
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
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

  // Ao sair da tela (ou trocar de opção de som): fecha o stream. Um <audio> fora do DOM
  // pode continuar tocando em alguns navegadores, e o ffmpeg na nuvem seguiria rodando.
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = Math.min(1, Math.max(0, volume));
      el.muted = muted;
    }
  }, [volume, muted, on]);

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
    setError(`O áudio parou. Toque em “${label}” para reconectar.`);
  };

  const catchUp = () => {
    const el = audioRef.current;
    if (!el || !on || el.buffered.length === 0) return;
    const to = catchUpTarget(el.buffered.end(el.buffered.length - 1), el.currentTime);
    if (to !== null) {
      try {
        el.currentTime = to;
      } catch {
        // Alguns navegadores não deixam pular num stream ao vivo: segue com o atraso.
      }
    }
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
      setError(`Toque em “${label}” de novo para liberar o som neste aparelho.`);
    }
  };

  const text = busy ? 'Conectando…' : on ? 'Parar áudio' : label;
  const small = compact ? 'text-[10px]' : 'text-xs';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio ref={audioRef} preload="none" onError={lost} onEnded={lost} onTimeUpdate={catchUp} />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!sessionId || busy}
        aria-pressed={on}
        className={compact ? navBtnSm : navBtn}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : on ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {text}
      </button>
      {on && (
        <>
          <button type="button" className={compact ? navBtnSm : navBtn} aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />} {muted ? 'Ativar som' : 'Mudo'}
          </button>
          <input
            type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume do som da nuvem"
            onChange={(e) => onVolumeChange?.(Number(e.target.value))}
            className="h-1 w-24 accent-primary"
          />
          <span className={`text-white/80 ${small}`}>Tocando o áudio do navegador</span>
        </>
      )}
      {error && <span role="alert" className={`text-amber-300 ${small}`}>{error}</span>}
    </div>
  );
}

/** Mesma mídia (ignora o ponto de início). */
function sameMedia(a: MediaEmbed, b: MediaEmbed): boolean {
  const strip = (u: string) => u.replace(/([?&])t=\d+s?(&|$)/, '$1').replace(/[?&]$/, '');
  return a.provider === b.provider && strip(a.openUrl) === strip(b.openUrl);
}

const MODE_ICON: Record<NavigatorSoundMode, typeof Cloud> = { cloud: Cloud, device: MonitorSmartphone, off: VolumeX };

/** Tempo máximo esperando a aba na nuvem pausar antes de abrir o player no aparelho. */
const PAUSE_WAIT_MS = 2500;

/** Escolha de som + o player da opção escolhida (vai embaixo da tela ao vivo). */
export function NavigatorSoundControl({ nav, compact = false }: { nav: Pick<NavigatorState, 'sessionId' | 'url'>; compact?: boolean }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NavigatorSoundPrefs>(() => loadSoundPrefs(null));

  // Lembra por usuário: troca para a escolha deste usuário quando a sessão do Supabase responde.
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => navigatorUserId())
      .then((id) => {
        if (!alive || !id) return;
        setUserId(id);
        setPrefs(loadSoundPrefs(id));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const update = useCallback((patch: Partial<NavigatorSoundPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      saveSoundPrefs(next, userId);
      return next;
    });
  }, [userId]);

  const small = compact ? 'text-[10px]' : 'text-xs';
  return (
    <div className="space-y-2" data-testid="navigator-sound">
      <div role="radiogroup" aria-label="Som do navegador" className="flex flex-wrap items-center gap-1.5">
        <span className={`mr-1 text-white/70 ${small}`}>Som:</span>
        {SOUND_MODES.map((m) => {
          const Icon = MODE_ICON[m.id];
          const active = prefs.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={m.hint}
              onClick={() => update({ mode: m.id })}
              className={`${compact ? navBtnSm : navBtn} ${active ? 'border-primary bg-primary/20 text-white' : 'opacity-80'}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
            </button>
          );
        })}
      </div>
      {prefs.mode === 'cloud' && (
        <NavigatorAudioButton
          sessionId={nav.sessionId}
          compact={compact}
          label="Ouvir som da nuvem"
          volume={prefs.volume}
          onVolumeChange={(volume) => update({ volume })}
        />
      )}
      {prefs.mode === 'device' && <NavigatorDevicePlayer sessionId={nav.sessionId} url={nav.url} compact={compact} />}
      {prefs.mode === 'off' && <p className={`text-white/60 ${small}`}>Sem som. Escolha “Som da nuvem” ou “Tocar no meu aparelho” quando quiser ouvir.</p>}
    </div>
  );
}

/**
 * "Tocar no meu aparelho": player oficial do serviço (embed) dentro do painel, ou o link
 * para abrir no app. Antes de abrir, pausa a mídia da aba na nuvem e continua do mesmo ponto.
 */
export function NavigatorDevicePlayer({ sessionId, url, compact = false }: { sessionId: string | null | undefined; url: string | null | undefined; compact?: boolean }) {
  const embed = useMemo(() => mediaEmbedFor(url), [url]);
  const [playing, setPlaying] = useState<MediaEmbed | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const small = compact ? 'text-[10px]' : 'text-xs';

  // Sessão trocou/acabou: fecha o player.
  useEffect(() => { setPlaying(null); setNote(null); }, [sessionId]);

  /** Pausa a aba na nuvem (com limite de espera). Devolve o segundo em que estava. */
  const pauseCloud = async (): Promise<number> => {
    if (!sessionId) return 0;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), PAUSE_WAIT_MS));
    const r = await Promise.race([pauseNavigatorMedia(sessionId).catch(() => null), timeout]);
    if (!r) {
      setNote('Não consegui confirmar a pausa na nuvem; se ouvir eco, pause o vídeo na tela ao vivo.');
      return 0;
    }
    if (r.ok === false) {
      setNote(r.message);
      return 0;
    }
    return r.currentTime;
  };

  const playHere = async () => {
    if (!embed) return;
    setBusy(true);
    setNote(null);
    const at = await pauseCloud();
    setBusy(false);
    setPlaying(mediaEmbedFor(url, at) ?? embed);
  };

  if (!embed && !playing) {
    return (
      <p className={`text-white/60 ${small}`}>
        Esta página não tem um player oficial para tocar no seu aparelho. Funciona com YouTube, YouTube Music, Spotify, SoundCloud e Vimeo;
        nas outras páginas use “Som da nuvem”.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {playing ? (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-black">
          <iframe
            key={playing.embedUrl}
            title={`Player oficial do ${playing.label}`}
            src={playing.embedUrl}
            className={playing.kind === 'video' ? 'aspect-video w-full' : 'h-[152px] w-full'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!playing && embed && (
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={busy} onClick={() => void playHere()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />} Tocar aqui ({embed.label})
          </button>
        )}
        {playing && embed && !sameMedia(embed, playing) && (
          <button type="button" className={compact ? navBtnSm : navBtn} disabled={busy} onClick={() => void playHere()}>
            <Volume2 className="h-4 w-4" aria-hidden /> Tocar o que está na aba agora
          </button>
        )}
        {(playing ?? embed) && (
          <a
            href={(playing ?? embed)!.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { void pauseCloud(); }}
            className={compact ? navBtnSm : navBtn}
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir no app do {(playing ?? embed)!.label}
          </a>
        )}
        {playing && (
          <button type="button" className={compact ? navBtnSm : navBtn} onClick={() => setPlaying(null)}>
            <X className="h-4 w-4" aria-hidden /> Fechar player
          </button>
        )}
      </div>
      {playing && <p className={`text-white/60 ${small}`}>Tocando no seu aparelho pelo player oficial. A aba na nuvem foi pausada.</p>}
      {note && <p role="status" className={`text-amber-300 ${small}`}>{note}</p>}
    </div>
  );
}
