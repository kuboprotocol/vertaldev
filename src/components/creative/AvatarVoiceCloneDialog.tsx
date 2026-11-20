import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AVATAR_CLONE_LIMITS, AVATAR_CLONE_SCRIPT, avatarVoiceCloneCredits } from "@/config/avatarPricing";
import { functionErrorCode } from "@/lib/functionError";
import { pickRecorderMimeType, toWavSample } from "@/lib/avatarVoiceAudio";
import type { AvatarUserVoice } from "./avatarVoices";
import { voiceErrorMessage } from "./avatarVoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: (voice: AvatarUserVoice) => void;
}

interface Sample {
  wav: Blob;
  seconds: number;
  previewUrl: string;
}

export const CONSENT_LABEL = "Esta é a minha voz ou tenho autorização do dono da voz";

export function AvatarVoiceCloneDialog({ open, onOpenChange, onCloned }: Props) {
  const [name, setName] = useState("Minha voz");
  const [consent, setConsent] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [result, setResult] = useState<AvatarUserVoice | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const replaceSample = (next: Sample | null) => {
    setSample((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
  };

  // Reset when the dialog closes.
  useEffect(() => {
    if (open) return;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null; // closing discards the take
      recorder.stop();
    }
    stopStream();
    setRecording(false);
    setElapsed(0);
    setConsent(false);
    setResult(null);
    setName("Minha voz");
    replaceSample(null);
  }, [open]);

  useEffect(() => () => stopStream(), []);

  const acceptBlob = async (blob: Blob) => {
    setProcessing(true);
    try {
      const { wav, seconds } = await toWavSample(blob);
      if (seconds < AVATAR_CLONE_LIMITS.minSampleSeconds) {
        toast.error(`A amostra precisa ter pelo menos ${AVATAR_CLONE_LIMITS.minSampleSeconds} segundos (tem ${seconds.toFixed(1)} s).`);
        return;
      }
      if (seconds > AVATAR_CLONE_LIMITS.maxSampleSeconds) {
        toast.error(`A amostra pode ter no máximo ${AVATAR_CLONE_LIMITS.maxSampleSeconds / 60} minutos.`);
        return;
      }
      if (wav.size > AVATAR_CLONE_LIMITS.maxSampleBytes) {
        toast.error("A amostra ficou grande demais. Envie um trecho mais curto.");
        return;
      }
      replaceSample({ wav, seconds, previewUrl: URL.createObjectURL(wav) });
    } catch {
      toast.error("Não foi possível ler esse áudio. Tente MP3, WAV ou M4A.");
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Seu navegador não permite gravar áudio. Envie um arquivo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stopStream();
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size > 0) void acceptBlob(blob);
      };
      recorderRef.current = recorder;
      replaceSample(null);
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000;
        setElapsed(secs);
        if (secs >= AVATAR_CLONE_LIMITS.maxSampleSeconds && recorder.state === "recording") recorder.stop();
      }, 250);
      recorder.start(1000);
      setRecording(true);
    } catch {
      stopStream();
      toast.error("Não conseguimos acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)) {
      toast.error("Selecione um arquivo de áudio (MP3, WAV, M4A, OGG).");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 50 MB).");
      return;
    }
    void acceptBlob(file);
  };

  const handleClone = async () => {
    if (!sample || !consent || !name.trim() || cloning) return;
    setCloning(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Faça login para clonar a sua voz.");
      const path = `${uid}/voices/${crypto.randomUUID()}.wav`;
      const { error: upErr } = await supabase.storage.from("uploads").upload(path, sample.wav, {
        cacheControl: "3600", upsert: false, contentType: "audio/wav",
      });
      if (upErr) throw new Error("Falha ao enviar a amostra de voz.");
      const { data: signed, error: signErr } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60);
      if (signErr || !signed?.signedUrl) throw new Error("Falha ao gerar o link da amostra.");

      const { data, error } = await supabase.functions.invoke("creative-video", {
        body: { mode: "avatar", action: "clone_voice", name: name.trim(), sample_url: signed.signedUrl, consent: true },
        headers: { "X-Idempotency-Key": `clone_voice:${path}` },
      });
      if (error) throw new Error(voiceErrorMessage(await functionErrorCode(error)));
      const voice = data?.voice as AvatarUserVoice | undefined;
      if (!voice?.id) throw new Error(voiceErrorMessage(null));
      setResult(voice);
      onCloned(voice);
      toast.success("Sua voz foi clonada! Ouça a prévia.");
    } catch (err) {
      toast.error("Não foi possível clonar a voz", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setCloning(false);
    }
  };

  const ready = !!sample && consent && !!name.trim() && !cloning && !processing && !recording;

  return (
    <Dialog open={open} onOpenChange={(o) => !cloning && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clonar minha voz</DialogTitle>
          <DialogDescription>
            Grave ou envie pelo menos {AVATAR_CLONE_LIMITS.minSampleSeconds} segundos da sua voz, em um lugar silencioso.
            Custo: {avatarVoiceCloneCredits()} créditos por voz (até {AVATAR_CLONE_LIMITS.maxVoicesPerUser} vozes).
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <strong>{result.name}</strong> está pronta e já aparece em “Minhas vozes”.
            </p>
            {result.preview_url && <audio src={result.preview_url} controls autoPlay className="w-full" />}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="voice-clone-name" className="text-xs font-bold uppercase tracking-wider opacity-60">Nome da voz</Label>
              <Input
                id="voice-clone-name"
                value={name}
                maxLength={AVATAR_CLONE_LIMITS.maxNameChars}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Leia em voz alta</Label>
              <p className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm leading-relaxed text-foreground/90">
                {AVATAR_CLONE_SCRIPT}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {recording ? (
                <Button type="button" variant="destructive" onClick={stopRecording}>
                  <Square className="h-4 w-4 mr-2" /> Parar ({Math.floor(elapsed)} s)
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={startRecording} disabled={processing || cloning}>
                  <Mic className="h-4 w-4 mr-2 text-primary" /> Gravar
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={recording || processing || cloning}>
                <Upload className="h-4 w-4 mr-2 text-primary" /> Enviar arquivo
              </Button>
              <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm" className="hidden" onChange={handleFile} />
            </div>

            {recording && elapsed < AVATAR_CLONE_LIMITS.minSampleSeconds && (
              <p className="text-xs text-muted-foreground">
                Continue lendo… faltam {Math.ceil(AVATAR_CLONE_LIMITS.minSampleSeconds - elapsed)} s para o mínimo.
              </p>
            )}
            {processing && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Preparando a amostra…
              </p>
            )}
            {sample && (
              <div className="flex items-center gap-2">
                <audio src={sample.previewUrl} controls className="flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{sample.seconds.toFixed(1)} s</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => replaceSample(null)} aria-label="Descartar amostra">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-label={CONSENT_LABEL} />
              <span>{CONSENT_LABEL}</span>
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={cloning}>Cancelar</Button>
              <Button type="button" onClick={handleClone} disabled={!ready}>
                {cloning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {cloning ? "Clonando…" : "Clonar voz"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
