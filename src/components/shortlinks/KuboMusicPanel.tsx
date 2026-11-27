import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Music2, Play, PlayCircle, Volume2 } from "lucide-react";
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
  embedHeightFor,
  hardenSpotifyIframe,
  isIOSDevice,
  isTouchPlaybackDevice,
  loadSpotifyIframeApi,
  readPlaybackEnv,
  spotifyTrackUrl,
  type SpotifyEmbedController,
  type SpotifyPlaybackUpdate,
} from "@/lib/spotifyEmbed";

/** Intervalo entre relatórios de progresso ao servidor. */
const REPORT_EVERY_MS = 5000;
/** Sem evento "ready" do player depois disso, mostra o aviso com o link para o Spotify. */
const PLAYER_READY_TIMEOUT_MS = 15000;

const trackUri = (id: string) => `spotify:track:${id}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * "Ouça as 5 músicas do Kubo": player do Spotify (iFrame Embed API) com as 5 faixas.
 * Mede só reprodução real (eventos playback_update, sem pausa/buffer/seek) e manda o tempo ao
 * servidor (função daily-rewards), que confere com o relógio e conta a faixa a partir de 30 s.
 *
 * Celular: o navegador só toca com som depois de um toque DENTRO do iframe do Spotify, então
 * aqui nunca chamamos play() pela página (src/lib/spotifyEmbed.ts, canAutoPlayEmbed). O player
 * fica maior, com o aviso "toque no play do player", e o medidor só conta quando o próprio
 * usuário dá o play no player (som real), nunca por um play() silencioso da página.
 */
export default function KuboMusicPanel({
  checklist,
  onProgress,
}: {
  checklist: DailyChecklist | null;
  onProgress?: (checklist: DailyChecklist) => void;
}) {
  const minSeconds = checklist?.music_min_seconds ?? KUBO_MUSIC_MIN_SECONDS;
  const tracks: ChecklistTrack[] =
    checklist?.tracks?.length
      ? checklist.tracks
      : KUBO_TRACKS.map((t) => ({ ...t, listened_seconds: 0, counted: false }));

  const hostRef = useRef<HTMLDivElement>(null);
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
  const lastStateRef = useRef<{ position: number; duration: number } | null>(null);

  const [current, setCurrent] = useState(currentRef.current);
  const [live, setLive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [ready, setReady] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);

  // Ambiente lido uma vez: celular/tablet (toque) x computador.
  const [env] = useState(readPlaybackEnv);
  const touch = isTouchPlaybackDevice(env);
  const ios = isIOSDevice(env);
  const autoPlayAllowedRef = useRef(canAutoPlayEmbed(env));
  const embedHeight = embedHeightFor(touch);

  const flush = useCallback(async (force = false) => {
    const nonce = nonceRef.current;
    const listened = meterRef.current.listenedSeconds;
    if (!nonce || listened <= reportedRef.current + 0.4) return;
    if (!force && Date.now() - lastReportAtRef.current < 2100) return;
    lastReportAtRef.current = Date.now();
    try {
      const res = await reportMusicProgress(nonce, listened);
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

  const selectTrack = useCallback(
    async (trackId: string, autoplay = true) => {
      await flush(true);
      currentRef.current = trackId;
      setCurrent(trackId);
      wasPlayingRef.current = false;
      setPlaying(false);
      const controller = controllerRef.current;
      if (controller) {
        controller.loadUri(trackUri(trackId));
        // No celular play() da página não é gesto do usuário dentro do iframe: o navegador
        // bloqueia ou toca sem som. Lá o usuário toca no play do próprio player.
        if (autoplay && autoPlayAllowedRef.current) controller.play();
        hardenSpotifyIframe(hostRef.current);
      }
      if (!autoPlayAllowedRef.current) {
        hostRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      }
      await openSession(trackId);
    },
    [flush, openSession],
  );

  // Cria o player uma vez.
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const target = document.createElement("div");
    host.appendChild(target);

    loadSpotifyIframeApi()
      .then((api) => {
        if (cancelled) return;
        api.createController(
          target,
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
              const d = e.data;
              setReady(true);
              const uri = d.playingURI;
              if (uri && uri !== trackUri(currentRef.current)) return; // evento da faixa anterior
              const listened = meterRef.current.update(d, Date.now()) / 1000;
              setLive(listened);
              const isPlaying = !d.isPaused && !d.isBuffering;
              setPlaying(isPlaying);
              const prev = lastStateRef.current;
              // Fim da faixa (ou da prévia de 30 s): manda o tempo e segue para a próxima que falta.
              const ended =
                wasPlayingRef.current && d.isPaused && prev !== null && prev.duration > 0 &&
                prev.position >= prev.duration - 1500;
              wasPlayingRef.current = isPlaying;
              lastStateRef.current = { position: d.position, duration: d.duration };
              if (ended) {
                void flush(true).then(() => {
                  const list = tracksRef.current;
                  const idx = list.findIndex((t) => t.track_id === currentRef.current);
                  const next =
                    list.slice(idx + 1).find((t) => !t.counted) ?? list.find((t) => !t.counted && t.track_id !== currentRef.current);
                  if (next) void selectTrack(next.track_id);
                });
              } else if (listened >= minSeconds && reportedRef.current < minSeconds) {
                void flush();
              }
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
      target.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relatório periódico.
  useEffect(() => {
    const timer = setInterval(() => void flush(), REPORT_EVERY_MS);
    return () => clearInterval(timer);
  }, [flush]);

  const counted = tracks.filter((t) => t.counted).length;

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
          Listen to the 5 Kubo songs. Each song counts after {minSeconds} seconds of real playback
          (pausing or skipping ahead does not count).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={hostRef}
          className="w-full overflow-hidden rounded-xl"
          style={{ minHeight: embedHeight }}
          data-testid="kubo-spotify-embed"
          data-touch={touch ? "true" : "false"}
        />
        {touch && !playing && !playerError && (
          <p
            className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
            data-testid="kubo-tap-hint"
          >
            <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Tap the play button inside the Spotify player to start the song. On phones, the sound
              only starts after a tap on the player itself.
            </span>
          </p>
        )}
        {touch && playing && (
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground" data-testid="kubo-sound-hint">
            <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {ios
                ? "No sound? Turn off Silent mode (the switch on the side of the iPhone) and turn up the volume."
                : "No sound? Turn up the media volume of your phone."}
            </span>
          </p>
        )}
        {(playerError || (slowLoad && !ready)) && (
          <p className="text-xs text-destructive" data-testid="kubo-player-error">
            We could not load the Spotify player. If you use a blocker, allow open.spotify.com and reload the page.
          </p>
        )}
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
              minSeconds,
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
                      {t.counted ? "played" : `${Math.floor(shown)}/${minSeconds}s`} · {fmt(t.duration_seconds)}
                    </span>
                  </div>
                  {!t.counted && <Progress value={(shown / minSeconds) * 100} className="mt-2 h-1" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Without a Spotify login, the player plays 30-second previews. Previews count too.{" "}
          <a href={KUBO_SPOTIFY_ARTIST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Kubo on Spotify <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
