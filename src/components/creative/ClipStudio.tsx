import { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions, Check, Coins, Copy, Crosshair, Download, Flame, Link2, Loader2, Pause, Play, RotateCw, Scissors, Sparkles,
  Upload, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import {
  CLIP_ASPECTS, CLIP_LENGTHS, TRANSCRIBE_CHUNK_SECONDS, captionPages, findClips, formatTime, mergeTranscripts,
  normalizeAiClips, pickNonOverlapping, quoteClips, transcriptForPrompt,
  type Clip, type ClipAspectKey, type ClipLengthKey, type FocusKey, type Transcript,
} from "@/lib/clipEngine";
import { trackSubject } from "@/lib/clipTracker";
import {
  CAPTION_STYLES, drawClipFrame, extractAudioChunks, renderClip,
  type CaptionStyleKey, type FrameLayout, type FrameOptions,
} from "@/lib/clipRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MAX_FILE_GB = 2;
const MAX_DURATION_MIN = 180;
const TRANSCRIBE_CONCURRENCY = 3;

type Phase = "idle" | "extracting" | "transcribing" | "analyzing" | "ready";

const ERRORS: Record<string, string> = {
  deduction_failed: "Créditos insuficientes.",
  insufficient_credits: "Créditos insuficientes.",
  no_audio_track: "Não encontramos áudio neste vídeo. Envie um vídeo com fala.",
  audio_unsupported: "Seu navegador não suporta extração de áudio. Use Chrome, Edge ou Safari atualizados.",
  transcription_unavailable: "A transcrição ainda não está ativa no servidor.",
  media_recorder_unsupported: "Seu navegador não suporta gravação de vídeo. Use Chrome, Edge ou Safari atualizados.",
  no_supported_video_format: "Seu navegador não suporta gravação de vídeo. Use Chrome, Edge ou Safari atualizados.",
  video_load_failed: "Não foi possível abrir o vídeo.",
  import_blocked: "A plataforma bloqueou a importação direta. Baixe pelo link e envie o arquivo.",
};
const friendly = (code: string) => ERRORS[code] ?? (code.startsWith("rate_limit") ? "Muitas solicitações. Aguarde um minuto." : code);

async function invokeClips<T>(body: Record<string, unknown> | FormData, idempotencyKey: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("creative-clips", { body, headers: { "X-Idempotency-Key": idempotencyKey } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = await ctx?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

function readDuration(url: string): Promise<number> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => res(v.duration);
    v.onerror = () => rej(new Error("video_load_failed"));
    v.src = url;
  });
}

function scoreTone(score: number) {
  if (score >= 80) return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
  if (score >= 65) return "text-primary border-primary/40 bg-primary/10";
  return "text-muted-foreground border-border/40 bg-muted/20";
}

/** Live WYSIWYG preview: the same drawClipFrame used for export, driven by a hidden <video>. */
function ClipPreview({ src, clip, transcript, frame }: { src: string; clip: Clip; transcript: Transcript; frame: FrameOptions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const pages = useMemo(() => captionPages(transcript.words, clip.start, clip.end), [transcript, clip.start, clip.end]);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const { width: W, height: H } = CLIP_ASPECTS[frame.aspect];

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
    const seek = () => { v.currentTime = clip.start; };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [clip.start, clip.end]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (v && ctx) {
        if (v.currentTime >= clip.end) {
          v.pause();
          v.currentTime = clip.start;
          setPlaying(false);
        }
        drawClipFrame(ctx, v, frameRef.current, { t: v.currentTime, clipStart: clip.start, clipEnd: clip.end, pages });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clip.start, clip.end, pages]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < clip.start || v.currentTime >= clip.end) v.currentTime = clip.start;
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: W >= H ? 560 : 300 }}>
      <video ref={videoRef} src={src} playsInline preload="auto" className="hidden" />
      <canvas ref={canvasRef} width={W} height={H} onClick={toggle}
        className="w-full cursor-pointer rounded-2xl bg-black shadow-2xl shadow-primary/10 ring-1 ring-white/10" />
      <button type="button" onClick={toggle} aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn("absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity",
          playing ? "opacity-0 hover:opacity-100" : "opacity-100")}>
        {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
      </button>
    </div>
  );
}

export function ClipStudio() {
  const { editsRemaining, refetch } = useSubscription();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /** Fixed trim window per clip (±30s around the original cut) so the slider doesn't drift while dragging. */
  const [bounds, setBounds] = useState<Record<string, { min: number; max: number }>>({});
  const [lengthKey, setLengthKey] = useState<ClipLengthKey>("medium");
  const [count, setCount] = useState(8);
  const [aspect, setAspect] = useState<ClipAspectKey>("9:16");
  const [layout, setLayout] = useState<FrameLayout>("fill");
  const [focusX, setFocusX] = useState(0.5);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleKey>("viral");
  const [captions, setCaptions] = useState(true);
  const [hookTitle, setHookTitle] = useState(true);
  const [progressBar, setProgressBar] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [emojis, setEmojis] = useState(true);
  const [autoTrack, setAutoTrack] = useState(true);
  /** Auto-reframe tracks keyed by clip bounds + aspect, so trims and format changes re-track. */
  const [tracks, setTracks] = useState<Record<string, FocusKey[]>>({});
  const [tracking, setTracking] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<{ id: string; progress: number } | null>(null);
  const [exported, setExported] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); abortRef.current?.abort(); }, [src]);

  const quote = quoteClips(count);
  const busy = phase === "extracting" || phase === "transcribing" || phase === "analyzing";
  const clip = clips.find((c) => c.id === selected) ?? null;
  const useTrack = autoTrack && layout === "fill";
  const trackKey = (c: Clip) => `${c.id}:${c.start.toFixed(1)}:${c.end.toFixed(1)}:${aspect}`;
  const frame: FrameOptions = {
    aspect, layout, focusX, captionStyle, captions, progressBar, watermark, emojis,
    focusTrack: useTrack && clip ? tracks[trackKey(clip)] : undefined,
    hookTitle: hookTitle ? clip?.title : undefined,
  };

  const ensureTrack = async (c: Clip, signal?: AbortSignal): Promise<FocusKey[] | undefined> => {
    if (!useTrack || !src) return undefined;
    const key = trackKey(c);
    if (tracks[key]) return tracks[key];
    setTracking(key);
    try {
      const t = await trackSubject({ src, start: c.start, end: c.end, aspect, signal });
      setTracks((prev) => ({ ...prev, [key]: t }));
      return t;
    } finally {
      setTracking((k) => (k === key ? null : k));
    }
  };

  // Track the selected clip in the background (debounced so trim drags don't re-track every frame).
  useEffect(() => {
    if (!clip || !useTrack || !src || tracks[trackKey(clip)] || exporting) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => { void ensureTrack(clip, ctrl.signal).catch(() => {}); }, 600);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, clip?.start, clip?.end, aspect, useTrack, src, !!exporting]);

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!/^https?:\/\//i.test(url)) return toast.error("Cole um link válido (YouTube, Instagram, TikTok…).");
    setImporting(true);
    let downloadUrl: string | undefined;
    try {
      const { data, error } = await supabase.functions.invoke("creative-download", {
        body: { url, format: "mp4" },
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
      });
      if (error) {
        const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      downloadUrl = (data as { download_url?: string })?.download_url;
      if (!downloadUrl) throw new Error("Não foi possível obter o vídeo.");
      let blob: Blob;
      try {
        const r = await fetch(downloadUrl);
        if (!r.ok) throw new Error();
        blob = await r.blob();
      } catch {
        throw new Error("import_blocked");
      }
      const name = `${url.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0]}-${Date.now()}.mp4`;
      await pickFile(new File([blob], name, { type: blob.type.startsWith("video/") ? blob.type : "video/mp4" }));
      setImportUrl("");
    } catch (e) {
      const msg = (e as Error).message;
      toast.error("Não foi possível importar", {
        description: friendly(msg),
        action: msg === "import_blocked" && downloadUrl ? { label: "Baixar", onClick: () => window.open(downloadUrl, "_blank", "noopener") } : undefined,
      });
    } finally {
      setImporting(false);
      void refetch?.();
    }
  };

  const pickFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !f.type.startsWith("audio/")) return toast.error("Envie um arquivo de vídeo.");
    if (f.size > MAX_FILE_GB * 1024 ** 3) return toast.error(`Arquivo acima de ${MAX_FILE_GB}GB.`);
    const url = URL.createObjectURL(f);
    try {
      const d = await readDuration(url);
      if (d > MAX_DURATION_MIN * 60) {
        URL.revokeObjectURL(url);
        return toast.error(`Vídeos de até ${MAX_DURATION_MIN} minutos.`);
      }
      if (src) URL.revokeObjectURL(src);
      setFile(f);
      setSrc(url);
      setDuration(d);
      setTranscript(null);
      setClips([]);
      setSelected(null);
      setExported(new Set());
      setTracks({});
      setPhase("idle");
    } catch {
      URL.revokeObjectURL(url);
      toast.error(friendly("video_load_failed"));
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    if (src) URL.revokeObjectURL(src);
    setFile(null); setSrc(null); setDuration(0); setTranscript(null); setClips([]); setSelected(null); setPhase("idle");
  };

  const selectClips = (t: Transcript, fromAi: unknown) => {
    const range = CLIP_LENGTHS[lengthKey];
    const ai = fromAi ? normalizeAiClips(fromAi, t, range, count) : [];
    // Top up with the in-house engine when the AI returns fewer clips than asked.
    const result = ai.length >= count ? ai : pickNonOverlapping([...ai, ...findClips(t, range, count * 2).map((c) => ({ ...c, score: c.score - 0.5 }))], count);
    setClips(result);
    setBounds(Object.fromEntries(result.map((c) => [c.id, { min: Math.max(0, c.start - 30), max: Math.min(t.duration, c.end + 30) }])));
    setSelected(result[0]?.id ?? null);
    return result.length;
  };

  const run = async () => {
    if (!file) return;
    if (editsRemaining < quote) return toast.error(`Você precisa de até ${quote} créditos para ${count} cortes (1 crédito por corte).`);
    const runId = crypto.randomUUID();
    try {
      let t = transcript;
      if (!t) {
        setPhase("extracting");
        setProgress(5);
        const { duration: audioDuration, chunks } = await extractAudioChunks(file, TRANSCRIBE_CHUNK_SECONDS);
        setPhase("transcribing");
        let done = 0;
        const parts: Array<{ offset: number; transcript: Partial<Transcript> }> = [];
        const queue = chunks.map((c, i) => ({ ...c, i }));
        const worker = async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            const form = new FormData();
            form.append("file", next.blob, `chunk-${next.i}.wav`);
            const data = await invokeClips<Partial<Transcript>>(form, `${runId}-t${next.i}`);
            parts.push({ offset: next.offset, transcript: data });
            done++;
            setProgress(10 + (done / chunks.length) * 70);
          }
        };
        await Promise.all(Array.from({ length: Math.min(TRANSCRIBE_CONCURRENCY, chunks.length) }, worker));
        t = mergeTranscripts(parts, audioDuration);
        if (!t.segments.length) throw new Error("Não detectamos fala neste vídeo.");
        setTranscript(t);
      }

      setPhase("analyzing");
      setProgress(85);
      const range = CLIP_LENGTHS[lengthKey];
      let aiClips: unknown = null;
      let charged = 0;
      try {
        const data = await invokeClips<{ clips: unknown; credits_charged?: number }>({
          action: "analyze", transcript: transcriptForPrompt(t), duration: t.duration, count,
          min_sec: range.min, max_sec: range.max, language: t.language ?? "pt-BR", title: file.name.replace(/\.[^.]+$/, ""),
        }, `${runId}-a`);
        aiClips = data.clips;
        charged = data.credits_charged ?? 0;
      } catch (e) {
        toast.info("IA indisponível — usando o motor Vertal offline", { description: friendly((e as Error).message) });
      }
      const n = selectClips(t, aiClips);
      setPhase("ready");
      setProgress(100);
      void refetch?.();
      toast.success(`${n} cortes prontos`, {
        description: charged ? `${charged} crédito${charged > 1 ? "s" : ""} usado${charged > 1 ? "s" : ""} (1 por corte da IA). Revise e exporte.` : "Revise, ajuste e exporte.",
      });
    } catch (e) {
      setPhase(transcript ? "ready" : "idle");
      void refetch?.();
      toast.error("Não foi possível gerar os cortes", { description: friendly((e as Error).message) });
    }
  };

  const updateClip = (id: string, patch: Partial<Clip>) => setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const exportClip = async (c: Clip) => {
    if (!src || !transcript) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setExporting({ id: c.id, progress: 0 });
    try {
      const focusTrack = await ensureTrack(c, ctrl.signal);
      const res = await renderClip({
        ...frame, focusTrack, hookTitle: hookTitle ? c.title : undefined,
        src, start: c.start, end: c.end, words: transcript.words, signal: ctrl.signal,
        onProgress: (p) => setExporting({ id: c.id, progress: p }),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.blob);
      a.download = `vertal-clip-${c.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || c.id}.${res.extension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setExported((prev) => new Set(prev).add(c.id));
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Falha ao exportar", { description: friendly((e as Error).message) });
      throw e;
    } finally {
      setExporting(null);
    }
  };

  const exportAll = async () => {
    for (const c of clips) {
      try {
        await exportClip(c);
      } catch {
        break;
      }
    }
  };

  const copyCaption = (c: Clip) => {
    void navigator.clipboard.writeText([c.title, "", c.hook, "", c.hashtags.join(" ")].join("\n").trim());
    toast.success("Legenda copiada");
  };

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    extracting: "Extraindo o áudio no seu navegador…",
    transcribing: "Transcrevendo palavra por palavra…",
    analyzing: "IA caçando os momentos mais virais…",
    ready: "",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Scissors className="h-6 w-6" /></div>
          <div className="flex-1">
            <h3 className="text-lg font-orbitron font-bold tracking-tight">Vertal Clips</h3>
            <p className="text-sm text-muted-foreground">Envie um vídeo longo: a IA encontra os melhores momentos, reenquadra em 9:16 e coloca legendas animadas.</p>
          </div>
          <Badge variant="outline" className="hidden sm:flex gap-1 border-primary/30 text-primary"><Coins className="h-3 w-3" /> {editsRemaining} créditos</Badge>
        </div>
      </Card>

      {!src ? (
        <Card className="p-5 bg-background/40 border-border/10">
          <input ref={fileInput} type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void pickFile(e.dataTransfer.files?.[0]); }}
            className="w-full rounded-2xl border-2 border-dashed border-primary/25 hover:border-primary/60 bg-gradient-to-b from-primary/10 to-transparent py-16 flex flex-col items-center gap-3 transition-colors">
            <div className="rounded-full bg-primary/15 p-4"><Upload className="h-8 w-8 text-primary" /></div>
            <span className="text-lg font-semibold">Arraste seu vídeo longo aqui</span>
            <span className="text-xs text-muted-foreground">MP4, MOV, WEBM · até {MAX_DURATION_MIN} min · {MAX_FILE_GB}GB · o vídeo não sai do seu dispositivo</span>
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
              {["Transcrição por palavra", "Score viral 0–100", "Reenquadramento 9:16", "Legendas animadas", "Exporta em MP4"].map((f) => (
                <span key={f} className="rounded-full border border-border/20 px-2.5 py-1">{f}</span>
              ))}
            </div>
          </button>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={importUrl} disabled={importing} onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void importFromUrl()}
                placeholder="Ou cole um link do YouTube, Instagram, TikTok…" className="pl-9 bg-background/50" />
            </div>
            <Button variant="outline" disabled={importing || !importUrl.trim()} onClick={() => void importFromUrl()}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />} Importar (2 créditos)
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <Card className="p-5 bg-background/40 border-border/10 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(duration)} · 1 crédito por corte</p>
                </div>
                <Button size="icon" variant="ghost" disabled={busy} onClick={reset} aria-label="Trocar vídeo"><X className="h-4 w-4" /></Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Duração dos cortes</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(CLIP_LENGTHS) as ClipLengthKey[]).map((k) => (
                    <Button key={k} size="sm" variant={lengthKey === k ? "default" : "outline"} disabled={busy} onClick={() => setLengthKey(k)}>{CLIP_LENGTHS[k].label}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Quantidade: {count}</Label>
                <Slider min={1} max={15} step={1} value={[count]} disabled={busy} onValueChange={([v]) => setCount(v)} />
              </div>

              {busy ? (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" /> {phaseLabel[phase]}</p>
                  <Progress value={progress} />
                </div>
              ) : (
                <Button className="w-full h-11 font-bold" onClick={() => void run()}>
                  {phase === "ready" ? <><RotateCw className="h-4 w-4 mr-2" /> Gerar novamente (até {quote} créditos)</> : <><Wand2 className="h-4 w-4 mr-2" /> Gerar {count} cortes virais · até {quote} créditos</>}
                </Button>
              )}
            </Card>

            {clips.length > 0 && (
              <Card className="p-3 bg-background/40 border-border/10 space-y-2 max-h-[560px] overflow-y-auto">
                {clips.map((c, i) => (
                  <button key={c.id} type="button" onClick={() => setSelected(c.id)}
                    className={cn("w-full rounded-xl border p-3 text-left transition-colors flex gap-3 items-start",
                      selected === c.id ? "border-primary/60 bg-primary/10" : "border-border/10 hover:border-primary/30")}>
                    <div className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border font-orbitron", scoreTone(c.score))}>
                      <span className="text-base font-bold leading-none">{c.score}</span>
                      <Flame className="h-3 w-3 mt-0.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold">{i + 1}. {c.title}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(c.start)} – {formatTime(c.end)} · {Math.round(c.end - c.start)}s</p>
                    </div>
                    {exported.has(c.id) && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {clip && transcript && src ? (
              <>
                <Card className="p-5 bg-background/40 border-border/10">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <ClipPreview src={src} clip={clip} transcript={transcript} frame={frame} />
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Título / gancho</Label>
                        <Input value={clip.title} maxLength={90} onChange={(e) => updateClip(clip.id, { title: e.target.value })} />
                      </div>
                      {clip.reason && <p className="text-sm text-muted-foreground"><Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />{clip.reason}</p>}
                      <div className="grid grid-cols-4 gap-2">
                        {(["hook", "flow", "value", "trend"] as const).map((k) => (
                          <div key={k} className="rounded-lg border border-border/10 bg-background/40 p-2 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{{ hook: "Gancho", flow: "Ritmo", value: "Valor", trend: "Tendência" }[k]}</p>
                            <p className="font-orbitron font-bold">{clip.scores[k].toFixed(1)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Ajuste fino: {formatTime(clip.start)} – {formatTime(clip.end)}</Label>
                        <Slider min={bounds[clip.id]?.min ?? 0} max={bounds[clip.id]?.max ?? transcript.duration} step={0.1}
                          value={[clip.start, clip.end]} minStepsBetweenThumbs={30}
                          onValueChange={([s, e]) => updateClip(clip.id, { start: s, end: e })} />
                      </div>
                      {clip.hashtags.length > 0 && <p className="text-xs text-primary">{clip.hashtags.join(" ")}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button className="flex-1 font-bold" disabled={!!exporting} onClick={() => void exportClip(clip).catch(() => {})}>
                          {exporting?.id === clip.id
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {Math.round(exporting.progress * 100)}%</>
                            : <><Download className="h-4 w-4 mr-2" /> Exportar corte</>}
                        </Button>
                        <Button variant="outline" onClick={() => copyCaption(clip)}><Copy className="h-4 w-4 mr-2" /> Legenda</Button>
                      </div>
                      {exporting && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => abortRef.current?.abort()}>Cancelar exportação</Button>
                      )}
                      <p className="text-[11px] text-muted-foreground">A exportação acontece em tempo real no seu navegador, sem custo extra. Mantenha esta aba aberta.</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 bg-background/40 border-border/10 space-y-5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider opacity-70"><Captions className="inline h-4 w-4 mr-1" /> Estilo e formato</Label>
                    <Button size="sm" variant="outline" disabled={!!exporting} onClick={() => void exportAll()}>
                      <Download className="h-4 w-4 mr-1" /> Exportar todos ({clips.length})
                    </Button>
                  </div>
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                    {(Object.keys(CLIP_ASPECTS) as ClipAspectKey[]).map((k) => (
                      <Button key={k} size="sm" variant={aspect === k ? "default" : "outline"} onClick={() => setAspect(k)}>{CLIP_ASPECTS[k].label}</Button>
                    ))}
                  </div>
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                    {(Object.keys(CAPTION_STYLES) as CaptionStyleKey[]).map((k) => (
                      <button key={k} type="button" onClick={() => setCaptionStyle(k)}
                        className={cn("rounded-xl border p-3 text-left transition-colors", captionStyle === k ? "border-primary/60 bg-primary/10" : "border-border/10 hover:border-primary/30")}>
                        <p className="text-sm font-bold">{CAPTION_STYLES[k].label}</p>
                        <p className="text-[11px] text-muted-foreground">{CAPTION_STYLES[k].desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs opacity-70">Enquadramento</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" variant={useTrack ? "default" : "outline"} onClick={() => { setLayout("fill"); setAutoTrack(true); }}>
                          <Crosshair className="h-3.5 w-3.5 mr-1" /> Auto
                        </Button>
                        <Button size="sm" variant={layout === "fill" && !autoTrack ? "default" : "outline"} onClick={() => { setLayout("fill"); setAutoTrack(false); }}>Manual</Button>
                        <Button size="sm" variant={layout === "fit" ? "default" : "outline"} onClick={() => setLayout("fit")}>Inteiro + blur</Button>
                      </div>
                      {useTrack && (
                        <p className="text-[11px] text-muted-foreground">
                          {tracking ? <><Loader2 className="inline h-3 w-3 mr-1 animate-spin" />Vertal Track seguindo quem fala…</> : "Vertal Track: a câmera segue o rosto de quem fala automaticamente."}
                        </p>
                      )}
                    </div>
                    {layout === "fill" && !autoTrack && (
                      <div className="space-y-2">
                        <Label className="text-xs opacity-70">Foco horizontal (mova até o rosto)</Label>
                        <Slider min={0} max={1} step={0.01} value={[focusX]} onValueChange={([v]) => setFocusX(v)} />
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ["Legendas animadas", captions, setCaptions],
                      ["Título-gancho no início", hookTitle, setHookTitle],
                      ["Emojis automáticos", emojis, setEmojis],
                      ["Barra de progresso", progressBar, setProgressBar],
                      ["Marca vertal.dev", watermark, setWatermark],
                    ] as const).map(([label, value, set]) => (
                      <label key={label} className="flex items-center justify-between rounded-lg border border-border/10 px-3 py-2 text-sm">
                        {label}
                        <Switch checked={value} onCheckedChange={set} />
                      </label>
                    ))}
                  </div>
                </Card>
              </>
            ) : (
              <Card className="p-10 bg-background/40 border-border/10 flex flex-col items-center justify-center text-center gap-3 min-h-[420px]">
                <video src={src} controls playsInline className="max-h-72 rounded-xl bg-black" />
                <p className="text-sm text-muted-foreground max-w-md">
                  {busy ? phaseLabel[phase] : "Escolha a duração e a quantidade e clique em “Gerar cortes virais”. Você revisa cada corte antes de exportar."}
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
