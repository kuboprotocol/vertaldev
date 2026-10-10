import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Clapperboard, Coins, Download, ImagePlus, Laugh, Loader2, Megaphone,
  Music2, RotateCw, Sparkles, Trash2, Type, Upload, Video, Wand2, X, BookOpen, Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { uploadFile } from "@/lib/fileUpload";
import { composeVideo, type ComposerScene } from "@/lib/videoComposer";
import {
  VIDEO_ASPECTS, VIDEO_LIMITS, VIDEO_STYLES, VIDEO_TIERS, quoteVideo,
  type VideoAspectKey, type VideoStyleKey, type VideoTierKey,
} from "@/config/videoStudio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_AUDIO = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/x-m4a", "audio/mp4", "audio/aac"];
const MAX_FILE_MB = 20;
const POLL_MS = 5000;

const STYLE_ICONS: Record<VideoStyleKey, typeof Music2> = { music: Music2, meme: Laugh, promo: Megaphone, story: BookOpen };
const TITLE_LABEL: Record<VideoStyleKey, { label: string; placeholder: string }> = {
  music: { label: "Título da música (abertura)", placeholder: "Noite de Verão — MC Vertal" },
  meme: { label: "Texto de baixo (todas as cenas)", placeholder: "E NINGUÉM ACREDITOU" },
  promo: { label: "Título / chamada principal", placeholder: "50% OFF só hoje — link na bio" },
  story: { label: "Frase final", placeholder: "Siga para ver a parte 2" },
};
const CAPTION_PLACEHOLDER: Record<VideoStyleKey, string> = {
  music: "Trecho da letra nesta cena",
  meme: "TEXTO DE CIMA",
  promo: "Benefício ou preço",
  story: "O que acontece nesta cena",
};

interface StudioImage {
  id: string;
  file: File;
  preview: string;
  caption: string;
}
interface ClipState {
  index: number;
  status: "queued" | "completed" | "failed";
  video_url: string | null;
  refunded: boolean;
}
type Phase = "edit" | "uploading" | "generating" | "composing" | "done";

const ERRORS: Record<string, string> = {
  deduction_failed: "Créditos insuficientes para este vídeo.",
  video_ai_not_configured: "A IA de vídeo ainda não está ativa. Use o modo Express enquanto isso.",
  invalid_image_url: "Falha ao validar as imagens enviadas. Tente novamente.",
  media_recorder_unsupported: "Seu navegador não suporta gravação de vídeo. Use Chrome, Edge ou Safari atualizados.",
  no_supported_video_format: "Seu navegador não suporta gravação de vídeo. Use Chrome, Edge ou Safari atualizados.",
};
const friendly = (code: string) => ERRORS[code] ?? (code.startsWith("rate_limit") ? "Muitas solicitações. Aguarde um minuto." : code);

async function invokeStudio(body: Record<string, unknown>, idempotencyKey?: string) {
  const { data, error } = await supabase.functions.invoke("creative-video-studio", {
    body,
    headers: idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : undefined,
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = await ctx?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as { asset_id: string; status: string; clips: ClipState[]; credits_charged?: number };
}

export function VideoStudio() {
  const { user } = useAuth();
  const { editsRemaining, refetch } = useSubscription();
  const [images, setImages] = useState<StudioImage[]>([]);
  const [style, setStyle] = useState<VideoStyleKey>("music");
  const [aspect, setAspect] = useState<VideoAspectKey>("9:16");
  const [tier, setTier] = useState<VideoTierKey>("express");
  const [title, setTitle] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [secondsPerImage, setSecondsPerImage] = useState(3);
  const [audio, setAudio] = useState<{ file: File; url: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [progress, setProgress] = useState(0);
  const [clips, setClips] = useState<ClipState[]>([]);
  const [lastScenes, setLastScenes] = useState<ComposerScene[] | null>(null);
  const [result, setResult] = useState<{ url: string; ext: string; sizeMb: number; seconds: number } | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const alive = useRef(true);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [result]);

  const quote = useMemo(() => quoteVideo(tier, Math.max(1, images.length)), [tier, images.length]);
  const busy = phase !== "edit" && phase !== "done";
  const t = VIDEO_TIERS[tier];
  const estSeconds = t.engine === "local" ? images.length * secondsPerImage : images.length * t.clipSeconds;

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const room = VIDEO_LIMITS.maxImages - images.length;
    const picked = Array.from(files).filter((f) => {
      if (!ACCEPTED_IMAGES.includes(f.type)) {
        toast.error(`${f.name}: use JPG, PNG ou WEBP`);
        return false;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name}: máximo ${MAX_FILE_MB}MB`);
        return false;
      }
      return true;
    });
    if (picked.length > room) toast.warning(`Máximo de ${VIDEO_LIMITS.maxImages} imagens por vídeo`);
    const next = picked.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: "" }));
    setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (id: string) =>
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });

  const move = (idx: number, dir: -1 | 1) =>
    setImages((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const pickAudio = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPTED_AUDIO.includes(f.type)) return void toast.error("Use MP3, WAV, OGG ou M4A");
    if (f.size > MAX_FILE_MB * 1024 * 1024) return void toast.error(`Máximo ${MAX_FILE_MB}MB`);
    if (audio) URL.revokeObjectURL(audio.url);
    setAudio({ file: f, url: URL.createObjectURL(f) });
  };

  const render = async (scenes: ComposerScene[]) => {
    setLastScenes(scenes);
    setRenderFailed(false);
    setPhase("composing");
    setProgress(0);
    try {
      const out = await composeVideo({
        scenes,
        style,
        aspect,
        secondsPerImage,
        title,
        audioSrc: audio?.url,
        watermark: t.watermark,
        onProgress: (p) => alive.current && setProgress(Math.round(p * 100)),
      });
      if (!alive.current) return;
      setResult({ url: URL.createObjectURL(out.blob), ext: out.extension, sizeMb: out.blob.size / 1024 / 1024, seconds: out.durationSec });
      setPhase("done");
    } catch (e) {
      if (!alive.current) return;
      setRenderFailed(true);
      setPhase("edit");
      toast.error("Falha ao montar o vídeo", { description: friendly((e as Error).message) });
    }
  };

  const pollUntilDone = async (assetId: string): Promise<ClipState[]> => {
    for (;;) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) throw new Error("cancelled");
      const s = await invokeStudio({ action: "status", asset_id: assetId });
      setClips(s.clips);
      const done = s.clips.filter((c) => c.status !== "queued").length;
      setProgress(Math.round((done / s.clips.length) * 100));
      if (s.status !== "processing") return s.clips;
    }
  };

  const generate = async () => {
    if (!user) return void toast.error("Entre na sua conta para criar vídeos");
    if (images.length < VIDEO_LIMITS.minImages) return void toast.error("Adicione pelo menos 1 imagem");
    if (quote.credits > editsRemaining) return void toast.error(`Você precisa de ${quote.credits} créditos (saldo: ${editsRemaining})`);

    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setClips([]);
    const idem = crypto.randomUUID();
    const captions = images.map((i) => i.caption.slice(0, VIDEO_LIMITS.maxCaptionChars));
    const stills: ComposerScene[] = images.map((i) => ({ kind: "image", src: i.preview, caption: i.caption }));

    try {
      if (t.engine === "local") {
        setPhase("generating");
        await invokeStudio({ action: "submit", tier, style, aspect, image_count: images.length }, idem);
        void refetch();
        return await render(stills);
      }

      setPhase("uploading");
      setProgress(0);
      const urls: string[] = [];
      for (const [n, img] of images.entries()) {
        urls.push((await uploadFile(img.file, user.id)).url);
        setProgress(Math.round(((n + 1) / images.length) * 100));
      }

      setPhase("generating");
      setProgress(0);
      const sub = await invokeStudio({ action: "submit", tier, style, aspect, images: urls, captions, prompt: motionPrompt }, idem);
      setClips(sub.clips);
      void refetch();
      const finalClips = sub.status === "processing" ? await pollUntilDone(sub.asset_id) : sub.clips;
      void refetch();

      const failed = finalClips.filter((c) => c.status === "failed").length;
      if (failed === finalClips.length) {
        setPhase("edit");
        return void toast.error("A IA não conseguiu animar as imagens", { description: "Seus créditos foram devolvidos." });
      }
      if (failed) toast.warning(`${failed} cena(s) não foram animadas e usarão movimento cinematográfico. Créditos devolvidos.`);

      await render(
        stills.map((s, i) => {
          const c = finalClips.find((x) => x.index === i);
          return c?.status === "completed" && c.video_url ? { ...s, kind: "video", src: c.video_url } : s;
        }),
      );
    } catch (e) {
      if (!alive.current) return;
      setPhase("edit");
      toast.error("Não foi possível gerar o vídeo", { description: friendly((e as Error).message) });
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `vertal-${style}-${Date.now()}.${result.ext}`;
    a.click();
  };

  const phaseLabel: Record<Phase, string> = {
    edit: "",
    uploading: "Enviando imagens…",
    generating: t.engine === "local" ? "Preparando…" : "IA animando suas fotos… (1–4 min)",
    composing: "Montando o vídeo com texto e música… mantenha esta aba aberta",
    done: "Pronto",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Clapperboard className="h-6 w-6" /></div>
          <div className="flex-1">
            <h3 className="text-lg font-orbitron font-bold tracking-tight">Vertal Video Studio</h3>
            <p className="text-sm text-muted-foreground">De 1 a 10 fotos para clipe musical, meme, anúncio ou story, com texto, música e IA realista.</p>
          </div>
          <Badge variant="outline" className="hidden sm:flex gap-1 border-primary/30 text-primary"><Coins className="h-3 w-3" /> {editsRemaining} créditos</Badge>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">1. Imagens ({images.length}/{VIDEO_LIMITS.maxImages})</Label>
              {images.length > 0 && images.length < VIDEO_LIMITS.maxImages && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => imageInput.current?.click()}><ImagePlus className="h-4 w-4 mr-1" /> Adicionar</Button>
              )}
            </div>
            <input ref={imageInput} type="file" accept={ACCEPTED_IMAGES.join(",")} multiple className="hidden"
              onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />

            {images.length === 0 ? (
              <button type="button" onClick={() => imageInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer.files); }}
                className="w-full rounded-xl border-2 border-dashed border-primary/25 hover:border-primary/60 bg-primary/5 py-12 flex flex-col items-center gap-2 transition-colors">
                <Upload className="h-8 w-8 text-primary" />
                <span className="font-semibold">Arraste ou toque para escolher fotos</span>
                <span className="text-xs text-muted-foreground">JPG, PNG ou WEBP · até {VIDEO_LIMITS.maxImages} imagens · {MAX_FILE_MB}MB cada</span>
              </button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((img, i) => (
                  <div key={img.id} className="flex gap-3 rounded-xl border border-border/10 bg-background/40 p-2">
                    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                      <img src={img.preview} alt={`Cena ${i + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-primary">{i + 1}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input value={img.caption} disabled={busy} maxLength={VIDEO_LIMITS.maxCaptionChars}
                        placeholder={CAPTION_PLACEHOLDER[style]} className="h-9 text-xs bg-background/50"
                        onChange={(e) => setImages((prev) => prev.map((p) => (p.id === img.id ? { ...p, caption: e.target.value } : p)))} />
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Mover para trás"><ArrowLeft className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)} aria-label="Mover para frente"><ArrowRight className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-destructive" disabled={busy} onClick={() => removeImage(img.id)} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">2. Tipo de vídeo</Label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(Object.keys(VIDEO_STYLES) as VideoStyleKey[]).map((k) => {
                const Icon = STYLE_ICONS[k];
                return (
                  <button key={k} type="button" disabled={busy} onClick={() => { setStyle(k); if (k === "music") setSecondsPerImage(2.5); }}
                    className={cn("rounded-xl border p-3 text-left transition-all",
                      style === k ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(201,148,26,0.15)]" : "border-border/10 hover:border-primary/40")}>
                    <Icon className={cn("h-5 w-5 mb-2", style === k ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-sm font-semibold">{VIDEO_STYLES[k].label}</div>
                    <div className="text-[11px] leading-snug text-muted-foreground">{VIDEO_STYLES[k].description}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center gap-2"><Type className="h-3.5 w-3.5" /> 3. Texto e música</Label>
            <div className="space-y-2">
              <Label className="text-xs">{TITLE_LABEL[style].label}</Label>
              <Input value={title} disabled={busy} maxLength={VIDEO_LIMITS.maxTitleChars} placeholder={TITLE_LABEL[style].placeholder}
                onChange={(e) => setTitle(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Trilha sonora (opcional)</Label>
              <input ref={audioInput} type="file" accept={ACCEPTED_AUDIO.join(",")} className="hidden"
                onChange={(e) => { pickAudio(e.target.files); e.target.value = ""; }} />
              {audio ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/10 bg-background/50 p-2">
                  <Music2 className="h-4 w-4 text-primary shrink-0" />
                  <audio src={audio.url} controls className="h-8 min-w-0 flex-1" />
                  <Button size="icon" variant="ghost" disabled={busy} onClick={() => { URL.revokeObjectURL(audio.url); setAudio(null); }} aria-label="Remover música"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" disabled={busy} onClick={() => audioInput.current?.click()}>
                  <Music2 className="h-4 w-4 mr-2" /> Enviar música (MP3, WAV, M4A)
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">Use apenas músicas que você tem direito de usar. A trilha termina com fade-out automático.</p>
            </div>
            {t.engine === "fal" && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" /> Direção do movimento (opcional)</Label>
                <Textarea value={motionPrompt} disabled={busy} maxLength={VIDEO_LIMITS.maxPromptChars}
                  placeholder="Ex.: a pessoa sorri e olha para a câmera, cabelo ao vento" className="min-h-[70px] text-sm bg-background/50 resize-none"
                  onChange={(e) => setMotionPrompt(e.target.value)} />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 self-start">
          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">4. Formato</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(VIDEO_ASPECTS) as VideoAspectKey[]).map((k) => (
                <button key={k} type="button" disabled={busy} onClick={() => setAspect(k)} title={VIDEO_ASPECTS[k].label}
                  className={cn("rounded-lg border py-2 text-sm font-bold transition-all", aspect === k ? "border-primary bg-primary/10 text-primary" : "border-border/10 hover:border-primary/40")}>
                  {k}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{VIDEO_ASPECTS[aspect].label}</p>
            {t.engine === "local" && (
              <div className="space-y-2">
                <Label className="text-xs">Duração por foto: {secondsPerImage.toFixed(1)}s</Label>
                <Slider value={[secondsPerImage]} min={1.5} max={6} step={0.5} disabled={busy} onValueChange={([v]) => setSecondsPerImage(v)} />
              </div>
            )}
          </Card>

          <Card className="p-5 bg-background/40 border-border/10 space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">5. Qualidade</Label>
            {(Object.keys(VIDEO_TIERS) as VideoTierKey[]).map((k) => {
              const tt = VIDEO_TIERS[k];
              const q = quoteVideo(k, Math.max(1, images.length));
              return (
                <button key={k} type="button" disabled={busy} onClick={() => setTier(k)}
                  className={cn("w-full rounded-xl border p-3 text-left transition-all", tier === k ? "border-primary bg-primary/10" : "border-border/10 hover:border-primary/40")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm flex items-center gap-1.5">
                      {k === "express" ? <Video className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-primary" />} {tt.label}
                    </span>
                    <span className="text-xs font-bold text-primary">{q.credits} créditos</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{tt.tagline}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {tt.engine === "local" ? "Preço fixo · com marca d'água vertal.dev" : `${tt.creditsPerClip} créditos por foto · sem marca d'água · uso comercial`}
                  </p>
                </button>
              );
            })}
          </Card>

          <Card className="p-5 bg-background/60 border-primary/20 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Duração estimada</span>
              <span className="font-semibold">{images.length ? `~${Math.round(estSeconds)}s` : "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Custo total</span>
              <span className="font-bold text-primary flex items-center gap-1"><Coins className="h-4 w-4" /> {quote.credits} créditos</span>
            </div>

            {busy && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {phaseLabel[phase]}</div>
                <Progress value={progress} />
                {clips.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {clips.map((c) => (
                      <span key={c.index} className={cn("h-2 w-6 rounded-full",
                        c.status === "completed" ? "bg-emerald-500" : c.status === "failed" ? "bg-destructive" : "bg-muted animate-pulse")} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button onClick={generate} disabled={busy || images.length === 0}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold font-orbitron shadow-[0_0_20px_rgba(201,148,26,0.3)]">
              {busy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
              {busy ? "CRIANDO…" : result ? "CRIAR NOVO VÍDEO" : "GERAR VÍDEO"}
            </Button>
            {renderFailed && lastScenes && !busy && (
              <Button variant="outline" className="w-full" onClick={() => render(lastScenes)}>
                <RotateCw className="h-4 w-4 mr-2" /> Tentar montar de novo (sem cobrar)
              </Button>
            )}
          </Card>

          {result && (
            <Card ref={resultRef} className="p-4 bg-background/60 border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400"><Check className="h-4 w-4" /> Seu vídeo está pronto</div>
              <video src={result.url} controls playsInline className={cn("w-full rounded-lg bg-black", aspect === "9:16" ? "max-h-[520px]" : "")} />
              <div className="text-[11px] text-muted-foreground">{result.ext.toUpperCase()} · {Math.round(result.seconds)}s · {result.sizeMb.toFixed(1)}MB</div>
              <Button onClick={download} className="w-full"><Download className="h-4 w-4 mr-2" /> Baixar vídeo</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
