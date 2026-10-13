import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Download, Loader2, RotateCw, Sparkles, Upload, User2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { uploadFile } from "@/lib/fileUpload";
import {
  AVATAR_ASPECTS, AVATAR_DURATIONS, AVATAR_LIMITS, countWords, maxWordsFor, quoteAvatar,
  type AvatarAspectKey, type AvatarDuration,
} from "@/config/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_MB = 20;
const POLL_MS = 8000;

type Phase = "edit" | "uploading" | "generating" | "done";

const ERRORS: Record<string, string> = {
  deduction_failed: "Créditos insuficientes para este avatar.",
  avatar_ai_not_configured: "A IA de avatares ainda não está ativa. Tente novamente mais tarde.",
  invalid_image_url: "Falha ao validar a foto enviada. Tente novamente.",
  script_too_long_for_duration: "O texto é longo demais para a duração escolhida.",
  timeout: "A geração demorou demais.",
};
const friendly = (code: string) => ERRORS[code] ?? (code.startsWith("rate_limit") ? "Muitas solicitações. Aguarde um minuto." : code);

interface AvatarJob {
  asset_id: string;
  status: "processing" | "completed" | "failed";
  video_url: string | null;
  refunded: boolean;
  error: string | null;
}

async function invokeAvatar(body: Record<string, unknown>, idempotencyKey?: string) {
  const { data, error } = await supabase.functions.invoke("creative-avatar", {
    body,
    headers: idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : undefined,
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = await ctx?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as AvatarJob;
}

export function AvatarStudio() {
  const { user } = useAuth();
  const { editsRemaining, refetch } = useSubscription();
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [script, setScript] = useState("");
  const [duration, setDuration] = useState<AvatarDuration>(30);
  const [aspect, setAspect] = useState<AvatarAspectKey>("9:16");
  const [phase, setPhase] = useState<Phase>("edit");
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const alive = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);
  useEffect(() => {
    if (phase !== "generating") return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const quote = useMemo(() => quoteAvatar(duration), [duration]);
  const words = countWords(script);
  const maxWords = maxWordsFor(duration);
  const busy = phase === "uploading" || phase === "generating";

  const pickPhoto = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPTED_IMAGES.includes(f.type)) return void toast.error("Use JPG, PNG ou WEBP");
    if (f.size > MAX_FILE_MB * 1024 * 1024) return void toast.error(`Máximo ${MAX_FILE_MB}MB`);
    setPhoto({ file: f, preview: URL.createObjectURL(f) });
  };

  const pollUntilDone = async (assetId: string): Promise<AvatarJob> => {
    for (;;) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) throw new Error("cancelled");
      const s = await invokeAvatar({ action: "status", asset_id: assetId });
      if (s.status !== "processing") return s;
    }
  };

  const generate = async () => {
    if (!user) return void toast.error("Entre na sua conta para criar avatares");
    if (!photo) return void toast.error("Envie uma foto do rosto");
    if (!script.trim()) return void toast.error("Escreva o texto que o avatar vai falar");
    if (words > maxWords) return void toast.error(`Para ${duration}s use no máximo ${maxWords} palavras`);
    if (quote.credits > editsRemaining) return void toast.error(`Você precisa de ${quote.credits} créditos (saldo: ${editsRemaining})`);

    setVideoUrl(null);
    try {
      setPhase("uploading");
      const { url } = await uploadFile(photo.file, user.id);
      setPhase("generating");
      setElapsed(0);
      const sub = await invokeAvatar({ action: "submit", image_url: url, script: script.trim(), duration, aspect }, crypto.randomUUID());
      void refetch();
      const done = sub.status === "processing" ? await pollUntilDone(sub.asset_id) : sub;
      void refetch();
      if (!alive.current) return;
      if (done.status !== "completed" || !done.video_url) {
        setPhase("edit");
        return void toast.error("Não foi possível gerar o avatar", {
          description: `${friendly(done.error ?? "generation_failed")}${done.refunded ? " Seus créditos foram devolvidos." : ""}`,
        });
      }
      setVideoUrl(done.video_url);
      setPhase("done");
      toast.success("Seu avatar falante está pronto!");
    } catch (e) {
      if (!alive.current) return;
      setPhase("edit");
      toast.error("Não foi possível gerar o avatar", { description: friendly((e as Error).message) });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><User2 className="h-6 w-6" /></div>
          <div className="flex-1">
            <h3 className="text-lg font-orbitron font-bold tracking-tight">Vertal Avatar AI</h3>
            <p className="text-sm text-muted-foreground">Uma foto + seu texto = avatar falante com lip-sync realista (HeyGen Avatar IV).</p>
          </div>
          <Badge variant="outline" className="hidden sm:flex gap-1 border-primary/30 text-primary"><Coins className="h-3 w-3" /> {editsRemaining} créditos</Badge>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">1. Foto do rosto</Label>
            <input ref={photoInput} type="file" accept={ACCEPTED_IMAGES.join(",")} className="hidden"
              onChange={(e) => { pickPhoto(e.target.files); e.target.value = ""; }} />
            {photo ? (
              <div className="flex items-center gap-4">
                <div className="relative h-32 w-28 overflow-hidden rounded-xl bg-black">
                  <img src={photo.preview} alt="Foto do avatar" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => photoInput.current?.click()}><RotateCw className="h-4 w-4 mr-1" /> Trocar foto</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setPhoto(null)}><X className="h-4 w-4 mr-1" /> Remover</Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => photoInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickPhoto(e.dataTransfer.files); }}
                className="w-full rounded-xl border-2 border-dashed border-primary/25 hover:border-primary/60 bg-primary/5 py-12 flex flex-col items-center gap-2 transition-colors">
                <Upload className="h-8 w-8 text-primary" />
                <span className="font-semibold">Arraste ou toque para escolher uma foto</span>
                <span className="text-xs text-muted-foreground">Rosto de frente, bem iluminado · JPG, PNG ou WEBP · até {MAX_FILE_MB}MB</span>
              </button>
            )}
          </Card>

          <Card className="p-5 bg-background/40 border-border/10 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">2. Texto que o avatar vai falar</Label>
              <span className={cn("text-xs", words > maxWords ? "text-destructive font-bold" : "text-muted-foreground")}>{words}/{maxWords} palavras</span>
            </div>
            <Textarea value={script} disabled={busy} maxLength={AVATAR_LIMITS.maxScriptChars}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Olá! Eu sou o assistente da KUBO e vou te mostrar como criar conteúdo com IA em segundos…"
              className="min-h-[140px] bg-background/50 border-border/10 resize-none text-sm" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 bg-background/40 border-border/10 space-y-4">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">3. Duração</Label>
            <div className="grid grid-cols-3 gap-2">
              {AVATAR_DURATIONS.map((d) => (
                <button key={d} type="button" disabled={busy} onClick={() => setDuration(d)}
                  className={cn("rounded-xl border p-3 text-center transition-colors",
                    duration === d ? "border-primary bg-primary/10 text-primary" : "border-border/20 hover:border-primary/40")}>
                  <div className="font-bold">{d}s</div>
                  <div className="text-[10px] opacity-70">{quoteAvatar(d).credits} créditos</div>
                </button>
              ))}
            </div>
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Formato</Label>
            <div className="grid gap-2">
              {(Object.keys(AVATAR_ASPECTS) as AvatarAspectKey[]).map((a) => (
                <button key={a} type="button" disabled={busy} onClick={() => setAspect(a)}
                  className={cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    aspect === a ? "border-primary bg-primary/10 text-primary" : "border-border/20 hover:border-primary/40")}>
                  <span className="font-bold mr-2">{a}</span>{AVATAR_ASPECTS[a]}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-background/60 border border-border/10 px-3 py-2">
              <span className="flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-amber-500" /> Custo</span>
              <span className="font-bold text-amber-500">{quote.credits} créditos</span>
            </div>

            <Button onClick={generate} disabled={busy}
              className="w-full h-12 font-orbitron font-bold shadow-[0_0_20px_rgba(201,148,26,0.3)]">
              {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Sparkles className="h-5 w-5 mr-2" />}
              {phase === "uploading" ? "ENVIANDO FOTO…" : phase === "generating" ? "GERANDO AVATAR…" : "GERAR AVATAR FALANTE"}
            </Button>

            {phase === "generating" && (
              <div className="space-y-2">
                <Progress value={Math.min(95, (elapsed / 120) * 100)} />
                <p className="text-xs text-muted-foreground text-center">IA dando vida à sua foto… normalmente 1–3 min ({elapsed}s)</p>
              </div>
            )}
          </Card>

          {videoUrl && (
            <Card className="p-4 bg-background/40 border-primary/20 space-y-3">
              <video src={videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
              <Button asChild variant="outline" className="w-full">
                <a href={videoUrl} download={`vertal-avatar-${Date.now()}.mp4`} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" /> Baixar vídeo
                </a>
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
