import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Music2, Play, PlayCircle, Volume2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  KUBO_MUSIC_MIN_SECONDS,
  KUBO_SPOTIFY_ARTIST_URL,
  KUBO_TRACKS,
  ListeningMeter,
  reportMusicProgress,
  startMusicSession,
  type ChecklistTrack,
  type DailyChecklist,
} from "@/lib/dailyRewards";
import {
  canAutoPlayEmbed,
  countTargetSeconds,
  embedHeightFor,
  hardenSpotifyIframe,
  isAtEnd,
  isInAppBrowser,
  isIOSDevice,
  isStalled,
  isTouchPlaybackDevice,
  loadSpotifyIframeApi,
  previewSecondsFrom,
  readPlaybackEnv,
  spotifyTrackUrl,
  type SpotifyEmbedController,
  type SpotifyPlaybackUpdate,
} from "@/lib/spotifyEmbed";
import {
  KUBO_OWN_AUDIO_MODE,
  KUBO_SUPABASE_URL,
  kuboOwnAudioUrl,
  shouldUseOwnAudio,
  type OwnAudioMode,
} from "@/lib/kuboOwnAudio";

/** Intervalo entre relatórios de progresso ao servidor. */
const REPORT_EVERY_MS = 5000;
/** Sem evento "ready" do player depois disso, mostra o aviso com o link para o Spotify. */
const PLAYER_READY_TIMEOUT_MS = 15000;
/** "Tocando" sem a posição andar por esse tempo = player travado / sem áudio real. */
const STALL_MS = 5000;

const trackUri = (id: string) => `spotify:track:${id}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface PlaybackData {
  position: number;
  duration: number;
  isPaused: boolean;
  isBuffering: boolean;
  playingURI?: string;
}

/**
 * "Ouça as 5 músicas do Kubo": player do Spotify (iFrame Embed API) com as 5 faixas.
 * Mede só reprodução real (eventos playback_update, sem pausa/buffer/seek) e manda o tempo ao
 * servidor (função daily-rewards), que confere com o relógio.
 *
 * Celular: o navegador só toca com som depois de um toque DENTRO do iframe do Spotify, então
 * aqui nunca chamamos play() pela página (src/lib/spotifyEmbed.ts, canAutoPlayEmbed).
 * Sem login no Spotify naquele navegador (o normal no celular) o embed toca só uma PRÉVIA de
 * ~15 s; aí a faixa conta com a prévia inteira (countTargetSeconds, igual ao servidor), e o fim
 * da prévia é detectado pela posição (o embed não manda "pausado" no fim).
 *
 * Opcional (desligado): VITE_KUBO_OWN_AUDIO toca os MP3 do próprio Kubo (Supabase Storage) num
 * <audio> da página, com a mesma medição. Ver src/lib/kuboOwnAudio.ts.
 */
export default function KuboMusicPanel({
  checklist,
  onProgress,
  ownAudioMode = KUBO_OWN_AUDIO_MODE,
}: {
  checklist: DailyChecklist | null;
  onProgress?: (checklist: DailyChecklist) => void;
  /** Só para testes; em produção vem de VITE_KUBO_OWN_AUDIO. */
  ownAudioMode?: OwnAudioMode;
}) {
  const minSeconds = checklist?.music_min_seconds ?? KUBO_MUSIC_MIN_SECONDS;
  const tracks: ChecklistTrack[] =
    checklist?.tracks?.length
      ? checklist.tracks
      : KUBO_TRACKS.map((t) => ({ ...t, listened_seconds: 0, counted: false }));

  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const meterRef = useRef(new ListeningMeter());
  const nonceRef = useRef<string | null>(null);
  const reportedRef = useRef(0);
  const lastReportAtRef = useRef(0);
  const currentRef = useRef<string>(tracks.find((t) => !t.counted)?.track_id ?? tracks[0].track_id);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const wasPlayingRef = useRef(false);
  const endedRef = useRef(false);
  const previewRef = useRef<number | null>(null);
  const lastStateRef = useRef<{ position: number; duration: number; wallMs: number; playing: boolean } | null>(null);
  const lastAdvanceRef = useRef<number | null>(null);

  const [current, setCurrent] = useState(currentRef.current);
  const [live, setLive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [ready, setReady] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  const [everAdvanced, setEverAdvanced] = useState(false);
  const [needsTapNext, setNeedsTapNext] = useState(false);

  // Ambiente lido uma vez: celular/tablet (toque) x computador.
  const [env] = useState(readPlaybackEnv);
  const touch = isTouchPlaybackDevice(env);
  const ios = isIOSDevice(env);
  const inApp = isInAppBrowser(env.userAgent);
  const [ownAudio, setOwnAudio] = useState(() => shouldUseOwnAudio(ownAudioMode, touch));
  const ownAudioRef = useRef(ownAudio);
  ownAudioRef.current = ownAudio;
  const autoPlayAllowedRef = useRef(canAutoPlayEmbed(env));
  const embedHeight = embedHeightFor(touch);
  const target = countTargetSeconds(minSeconds, previewSeconds);

  const flush = useCallback(async (force = false) => {
    const nonce = nonceRef.current;
    const listened = meterRef.current.listenedSeconds;
    if (!nonce || listened <= reportedRef.current + 0.4) return;
    if (!force && Date.now() - lastReportAtRef.current < 2100) return;
    lastReportAtRef.current = Date.now();
    try {
      const res = await reportMusicProgress(nonce, listened, previewRef.current);
      if (res.ok) {
        reportedRef.current = listened;
        if (res.checklist) onProgressRef.current?.(res.checklist);
      } else if (res.error === "session_closed" || res.error === "nonce_expired") {
        // Outra aba abriu uma faixa (ou a sessão venceu): abre uma nova para esta faixa.
        nonceRef.current = null;
        const started = await startMusicSession(currentRef.current);
        if (started.ok && started.nonce) {
          nonceRef.current = started.nonce;
          meterRef.current.reset();
          reportedRef.current = 0;
        }
      }
    } catch {
      /* rede: tenta de novo no próximo intervalo */
    }
  }, []);

  const openSession = useCallback(async (trackId: string) => {
    nonceRef.current = null;
    meterRef.current.reset();
    reportedRef.current = 0;
    setLive(0);
    try {
      const started = await startMusicSession(trackId);
      if (started.ok && started.nonce && currentRef.current === trackId) {
        nonceRef.current = started.nonce;
      } else if (!started.ok && started.error === "rate_limited") {
        toast.info("Too many track changes. Please wait a little.");
      }
    } catch {
      /* sem sessão o progresso desta faixa não conta; a próxima troca tenta de novo */
    }
  }, []);

  const resetTrackState = () => {
    wasPlayingRef.current = false;
    endedRef.current = false;
    lastStateRef.current = null;
    lastAdvanceRef.current = null;
    setPlaying(false);
    setStalled(false);
  };

  const selectTrack = useCallback(
    async (trackId: string, autoplay = true, fromUserTap = true) => {
      await flush(true);
      currentRef.current = trackId;
      setCurrent(trackId);
      resetTrackState();
      setNeedsTapNext(false);
      if (ownAudioRef.current) {
        const audio = audioRef.current;
        if (audio) {
          audio.src = kuboOwnAudioUrl(KUBO_SUPABASE_URL, trackId);
          // O toque no nome da faixa é gesto do usuário NESTA página: play() do <audio> pode.
          if (autoplay) {
            audio.play().catch(() => {
              if (!fromUserTap) setNeedsTapNext(true);
            });
          }
        }
      } else {
        const controller = controllerRef.current;
        if (controller) {
          controller.loadUri(trackUri(trackId));
          // No celular play() da página não é gesto do usuário dentro do iframe: o navegador
          // bloqueia ou toca sem som. Lá o usuário toca no play do próprio player.
          if (autoplay && autoPlayAllowedRef.current) controller.play();
          hardenSpotifyIframe(hostRef.current);
        }
        if (!autoPlayAllowedRef.current) {
          if (!fromUserTap) setNeedsTapNext(true);
          hostRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
      }
      await openSession(trackId);
    },
    [flush, openSession],
  );
  const selectTrackRef = useRef(selectTrack);
  selectTrackRef.current = selectTrack;

  /** Mesmo tratamento para o embed do Spotify e para o <audio> próprio. */
  const handlePlayback = useCallback(
    (d: PlaybackData, source: "spotify" | "own") => {
      setReady(true);
      const uri = d.playingURI;
      if (source === "spotify" && uri && uri !== trackUri(currentRef.current)) return; // faixa anterior
      const now = Date.now();
      if (source === "spotify") {
        const p = previewSecondsFrom(d.duration, minSeconds);
        if (p !== previewRef.current) {
          previewRef.current = p;
          setPreviewSeconds(p);
        }
      }
      const listened = meterRef.current.update(d, now) / 1000;
      setLive(listened);
      const atEnd = isAtEnd(d.position, d.duration);
      const isPlaying = !d.isPaused && !d.isBuffering && !atEnd;
      setPlaying(isPlaying);
      const prev = lastStateRef.current;
      if (isPlaying && (prev === null || d.position > prev.position)) {
        lastAdvanceRef.current = now;
        if (d.position > 0) setEverAdvanced(true);
      }
      if (isPlaying && prev === null) lastAdvanceRef.current = now;
      // Tocou de novo depois do fim (o usuário repetiu a faixa): pode avançar de novo no próximo fim.
      if (isPlaying && endedRef.current && d.position < d.duration - 3000) endedRef.current = false;
      setStalled(false);
      // Fim da faixa/prévia: o embed do Spotify fica em position == duration sem mandar "pausado".
      const ended =
        !endedRef.current &&
        wasPlayingRef.current &&
        prev !== null &&
        prev.duration > 0 &&
        (atEnd || (d.isPaused && prev.position >= prev.duration - 1500));
      wasPlayingRef.current = isPlaying;
      lastStateRef.current = { position: d.position, duration: d.duration, wallMs: now, playing: isPlaying };
      const goal = countTargetSeconds(minSeconds, previewRef.current);
      if (ended) {
        endedRef.current = true;
        void flush(true).then(() => {
          const list = tracksRef.current;
          const idx = list.findIndex((t) => t.track_id === currentRef.current);
          const next =
            list.slice(idx + 1).find((t) => !t.counted) ??
            list.find((t) => !t.counted && t.track_id !== currentRef.current);
          if (next) void selectTrackRef.current(next.track_id, true, false);
        });
      } else if (listened >= goal - 2 && reportedRef.current < goal - 2) {
        void flush(true);
      }
    },
    [flush, minSeconds],
  );
  const handlePlaybackRef = useRef(handlePlayback);
  handlePlaybackRef.current = handlePlayback;

  // Cria o player do Spotify uma vez (quando não está no modo de áudio próprio).
  useEffect(() => {
    if (ownAudio) return;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const targetEl = document.createElement("div");
    host.appendChild(targetEl);

    loadSpotifyIframeApi()
      .then((api) => {
        if (cancelled) return;
        api.createController(
          targetEl,
          { uri: trackUri(currentRef.current), width: "100%", height: embedHeight },
          (controller) => {
            if (cancelled) {
              controller.destroy();
              return;
            }
            controllerRef.current = controller;
            hardenSpotifyIframe(host);
            controller.addListener("ready", () => {
              if (!cancelled) setReady(true);
            });
            void openSession(currentRef.current);
            controller.addListener("playback_update", (e: SpotifyPlaybackUpdate) => {
              if (!cancelled) handlePlaybackRef.current(e.data, "spotify");
            });
          },
        );
      })
      .catch(() => {
        if (!cancelled) setPlayerError(true);
      });

    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlowLoad(true);
    }, PLAYER_READY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      void flush(true);
      controllerRef.current?.destroy();
      controllerRef.current = null;
      targetEl.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAudio]);

  // Modo áudio próprio: abre a sessão da faixa atual.
  useEffect(() => {
    if (!ownAudio) return;
    void openSession(currentRef.current);
    return () => {
      void flush(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAudio]);

  // Relatório periódico + detector de "tocando sem andar".
  useEffect(() => {
    const timer = setInterval(() => void flush(), REPORT_EVERY_MS);
    const stallTimer = setInterval(() => {
      setStalled(isStalled(lastStateRef.current, lastAdvanceRef.current, Date.now(), STALL_MS));
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(stallTimer);
    };
  }, [flush]);

  const audioEvent = () => {
    const a = audioRef.current;
    if (!a) return;
    handlePlaybackRef.current(
      {
        position: a.currentTime * 1000,
        duration: Number.isFinite(a.duration) ? a.duration * 1000 : 0,
        isPaused: a.paused,
        isBuffering: a.readyState < 3 && !a.paused,
      },
      "own",
    );
  };

  const counted = tracks.filter((t) => t.counted).length;
  const ownAudioUnavailable = !ownAudio && ownAudioMode !== "off" && shouldUseOwnAudio(ownAudioMode, touch);

  return (
    <Card className="rounded-2xl border-white/[0.06] bg-card/50" data-testid="kubo-music-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Music2 className="h-5 w-5 text-primary" />
            Kubo music
          </CardTitle>
          <span className="text-xs text-muted-foreground" data-testid="kubo-music-count">
            {counted}/{tracks.length} played today
          </span>
        </div>
        <CardDescription>
          Listen to the 5 Kubo songs. Each song counts after {target} seconds of real playback
          (pausing or skipping ahead does not count).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ownAudio ? (
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            playsInline
            src={kuboOwnAudioUrl(KUBO_SUPABASE_URL, current)}
            className="w-full"
            data-testid="kubo-own-audio"
            onLoadedMetadata={() => setReady(true)}
            onPlay={audioEvent}
            onPause={audioEvent}
            onTimeUpdate={audioEvent}
            onWaiting={audioEvent}
            onEnded={audioEvent}
            onError={() => {
              // MP3 ainda não enviado (ou erro de rede): volta para o player do Spotify.
              setOwnAudio(false);
              resetTrackState();
            }}
          />
        ) : (
          <div
            ref={hostRef}
            className="w-full overflow-hidden rounded-xl"
            style={{ minHeight: embedHeight }}
            data-testid="kubo-spotify-embed"
            data-touch={touch ? "true" : "false"}
            data-ready={ready ? "true" : "false"}
          />
        )}
        {inApp && (
          <p
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="kubo-inapp-hint"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              You opened this page inside another app. The music player may not play here: open
              vertal.dev/recompensas in Chrome or Safari.
            </span>
          </p>
        )}
        {!ownAudio && touch && !playing && !playerError && (
          <p
            className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
            data-testid="kubo-tap-hint"
          >
            <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {needsTapNext
                ? "Next song loaded. Tap the play button inside the Spotify player to keep going."
                : "Tap the play button inside the Spotify player to start the song. On phones, the sound only starts after a tap on the player itself."}
            </span>
          </p>
        )}
        {ownAudio && needsTapNext && !playing && (
          <p className="text-xs text-foreground" data-testid="kubo-tap-hint">
            Next song loaded. Tap play to keep going.
          </p>
        )}
        {previewSeconds !== null && (
          <p className="text-[11px] text-muted-foreground" data-testid="kubo-preview-hint">
            Spotify is playing a {Math.round(previewSeconds)}-second preview (you are not signed in to
            Spotify in this browser). Listening to the whole preview counts.
          </p>
        )}
        {stalled && (
          <p
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="kubo-stalled-hint"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              The player says it is playing, but the song is not moving. Tap pause and play again in the
              player. If it keeps happening, reload the page
              {inApp ? " or open it in Chrome" : ""}.
            </span>
          </p>
        )}
        {touch && playing && (
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground" data-testid="kubo-sound-hint">
            <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {ios
                ? "No sound? Turn off Silent mode (the switch on the side of the iPhone) and turn up the volume."
                : "No sound? Turn up the media volume of your phone (volume button while the song plays) and check that no Bluetooth device is connected."}
            </span>
          </p>
        )}
        {(playerError || (slowLoad && !ready)) && (
          <p className="text-xs text-destructive" data-testid="kubo-player-error">
            We could not load the Spotify player. If you use a blocker, allow open.spotify.com and reload the page.
          </p>
        )}
        {ownAudioUnavailable && (
          <p className="text-[11px] text-muted-foreground" data-testid="kubo-own-audio-fallback">
            The Kubo audio file is not available right now, so the Spotify player is used.
          </p>
        )}
        <p
          className="text-[10px] text-muted-foreground/70"
          data-testid="kubo-player-status"
          aria-live="polite"
        >
          Player: {ownAudio ? "Kubo audio" : "Spotify"} · {ready ? "loaded" : "loading"}
          {playing ? " · playing" : ""}
          {everAdvanced ? "" : ready ? " · not started" : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          <a
            href={spotifyTrackUrl(current)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-foreground underline"
            data-testid="kubo-open-in-spotify"
          >
            Open this song in Spotify <ExternalLink className="h-3 w-3" />
          </a>{" "}
          (listening in the Spotify app does not count toward today&apos;s rewards)
        </p>
        <ul className="space-y-2">
          {tracks.map((t, i) => {
            const isCurrent = t.track_id === current;
            const shown = Math.min(
              target,
              isCurrent ? Math.max(t.listened_seconds, t.listened_seconds - reportedRef.current + live) : t.listened_seconds,
            );
            return (
              <li key={t.track_id}>
                <button
                  type="button"
                  onClick={() => void selectTrack(t.track_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    isCurrent ? "border-primary/60 bg-primary/5" : "border-border/60 hover:bg-accent/40"
                  }`}
                  data-testid={`kubo-track-${t.track_id}`}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {t.counted ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Counted" />
                      ) : (
                        <PlayCircle className={`h-4 w-4 ${isCurrent && playing ? "text-primary" : "text-muted-foreground"}`} />
                      )}
                      {i + 1}. {t.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.counted ? "played" : `${Math.floor(shown)}/${target}s`} · {fmt(t.duration_seconds)}
                    </span>
                  </div>
                  {!t.counted && <Progress value={(shown / target) * 100} className="mt-2 h-1" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Without a Spotify login in this browser, the player plays short previews (about 15 seconds on
          phones). Previews count too.{" "}
          <a href={KUBO_SPOTIFY_ARTIST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Kubo on Spotify <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
