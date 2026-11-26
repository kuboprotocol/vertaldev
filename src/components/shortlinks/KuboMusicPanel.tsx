import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Music2, PlayCircle } from "lucide-react";
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
  loadSpotifyIframeApi,
  type SpotifyEmbedController,
  type SpotifyPlaybackUpdate,
} from "@/lib/spotifyEmbed";

/** Intervalo entre relatórios de progresso ao servidor. */
const REPORT_EVERY_MS = 5000;

const trackUri = (id: string) => `spotify:track:${id}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * "Ouça as 5 músicas do Kubo": player do Spotify (iFrame Embed API) com as 5 faixas.
 * Mede só reprodução real (eventos playback_update, sem pausa/buffer/seek) e manda o tempo ao
 * servidor (função daily-rewards), que confere com o relógio e conta a faixa a partir de 30 s.
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
        toast.info("Muitas trocas de música. Aguarde um pouco.");
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
        if (autoplay) controller.play();
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
          { uri: trackUri(currentRef.current), width: "100%", height: 152 },
          (controller) => {
            if (cancelled) {
              controller.destroy();
              return;
            }
            controllerRef.current = controller;
            void openSession(currentRef.current);
            controller.addListener("playback_update", (e: SpotifyPlaybackUpdate) => {
              const d = e.data;
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

    return () => {
      cancelled = true;
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
    <Card className="glass glass-border" data-testid="kubo-music-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Music2 className="h-5 w-5 text-primary" />
            Músicas do Kubo
          </CardTitle>
          <span className="text-xs text-muted-foreground" data-testid="kubo-music-count">
            {counted}/{tracks.length} ouvidas hoje
          </span>
        </div>
        <CardDescription>
          Ouça as 5 músicas do Kubo. Cada uma conta depois de {minSeconds} segundos tocando de verdade
          (pausar ou pular para frente não conta).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={hostRef} className="min-h-[152px] overflow-hidden rounded-xl" data-testid="kubo-spotify-embed" />
        {playerError && (
          <p className="text-xs text-destructive">
            Não foi possível carregar o player do Spotify. Se usa bloqueador, libere open.spotify.com e recarregue.
          </p>
        )}
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
                        <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Contada" />
                      ) : (
                        <PlayCircle className={`h-4 w-4 ${isCurrent && playing ? "text-primary" : "text-muted-foreground"}`} />
                      )}
                      {i + 1}. {t.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.counted ? "ouvida" : `${Math.floor(shown)}/${minSeconds}s`} · {fmt(t.duration_seconds)}
                    </span>
                  </div>
                  {!t.counted && <Progress value={(shown / minSeconds) * 100} className="mt-2 h-1" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Sem login no Spotify o player toca prévias de 30 s, que já contam.{" "}
          <a href={KUBO_SPOTIFY_ARTIST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Kubo no Spotify <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
