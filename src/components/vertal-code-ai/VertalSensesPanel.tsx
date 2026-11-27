// VERTAL Code AI · Vertal Visão / Vertal Ouvir / Vertal Novela (painel aditivo da página /vertal-code-ai).
// Câmera e microfone: só abrem no toque, com o pedido de permissão do próprio navegador a cada uso, indicador
// visível enquanto ligados, e são desligados ao capturar, ao fechar o painel ou quando a aba vai para o fundo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Clapperboard, Ear, Eye, Film, ImagePlus, Loader2, Mic, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { surface } from '@/components/site/siteUi';
import {
  callNovela,
  callSenses,
  drawToJpeg,
  fetchBinaryAction,
  fileToJpeg,
  MAX_RECORD_SECONDS,
  NOVELA_STAGE_TEXT,
  recordingToWavDataUrl,
  ROUTE_TEXT,
  sampleVideoFrames,
  sensesErrorText as errorText,
  stopStream,
  type SensesFeatures,
} from '@/lib/vertalCodeAi/senses';

type Tab = 'visao' | 'ouvir' | 'novela';
type Estimate = { credits: number; charged: boolean };
type Product = {
  nome: string;
  tipo: string;
  caracteristicas: string[];
  cores: string[];
  preco_sugerido_brl: { min: number; max: number } | null;
  titulo_anuncio: string;
  descricao_venda: string;
  tags: string[];
};
type Answer = { choice?: string; noul?: number; score?: number; confidence?: number };
type PhotoReply = {
  decision: { answers: Record<string, Answer>; model: { label: string }; ms: number } | null;
  route: { describe: boolean; reason: string };
  product: Product | null;
  raw?: string;
  model?: { label: string };
  ms?: number;
  estimate: Estimate;
};
type HearReply = { hear: { transcricao: string; resumo: string; resposta: string } | null; model: { label: string }; ms: number; estimate: Estimate };
type FramesReply = { frames: Array<{ t: number; answers: Record<string, Answer> | null }>; top: number[]; model: { label: string }; ms: number; estimate: Estimate };

const CATEGORY_LABEL: Record<string, string> = {
  calcados: 'Shoes', roupas: 'Clothing and accessories', eletronicos: 'Electronics', casa: 'Home', beleza: 'Beauty',
  alimentos: 'Food', brinquedos: 'Toys', esporte: 'Sports', veiculos: 'Vehicles', outros: 'Other',
};

const FRAME_QUESTIONS = {
  key_scene: { type: 'noul', instructions: 'Is this frame a key moment of the video (something important or eye-catching happens)?' },
  unsafe: { type: 'noul', instructions: 'Does this frame show nudity, graphic violence, weapons or drugs?' },
};

export function VertalSensesPanel({ token, onClose }: { token: () => Promise<string>; onClose: () => void }) {
  const [features, setFeatures] = useState<SensesFeatures | null>(null);
  const [tab, setTab] = useState<Tab>('visao');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ── câmera / microfone (sempre desligados ao sair) ──
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [recording, setRecording] = useState(false);

  const stopCamera = useCallback(() => {
    stopStream(camRef.current);
    camRef.current = null;
    setCamOn(false);
  }, []);
  const stopMic = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    stopStream(micRef.current);
    micRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        stopCamera();
        stopMic();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      stopCamera();
      stopMic();
    };
  }, [stopCamera, stopMic]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await callSenses<{ features: SensesFeatures }>(await token(), { op: 'status' });
        if (alive) setFeatures(r.features);
      } catch {
        if (alive) setFeatures({ decide: false, vision: false, hear: false, novela: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // ── Visão ──
  const [photo, setPhoto] = useState('');
  const [photoReply, setPhotoReply] = useState<PhotoReply | null>(null);
  const [framesReply, setFramesReply] = useState<FramesReply | null>(null);

  const analyzePhoto = async (dataUrl: string) => {
    setPhoto(dataUrl);
    setPhotoReply(null);
    setFramesReply(null);
    setErr('');
    setBusy(true);
    try {
      setPhotoReply(await callSenses<PhotoReply>(await token(), { op: 'photo', image: dataUrl }));
    } catch (e) {
      setErr(errorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const openCamera = async () => {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      camRef.current = s;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      });
    } catch {
      setErr('No camera access. Allow it in your browser or send a photo.');
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const shot = drawToJpeg(v);
    stopCamera(); // desliga logo após a foto
    void analyzePhoto(shot);
  };

  const analyzeVideo = async (file: File) => {
    setErr('');
    setPhotoReply(null);
    setFramesReply(null);
    setBusy(true);
    try {
      const frames = await sampleVideoFrames(file);
      setPhoto(frames[0]?.image ?? '');
      setFramesReply(await callSenses<FramesReply>(await token(), { op: 'frames', frames, questions: FRAME_QUESTIONS, rank_by: 'key_scene' }));
    } catch (e) {
      setErr(errorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  // ── Ouvir ──
  const [hearReply, setHearReply] = useState<HearReply | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');

  const startRecording = async () => {
    setErr('');
    setHearReply(null);
    setVoiceUrl('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micRef.current = s;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(s);
      recRef.current = rec;
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = async () => {
        stopStream(s);
        micRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        setBusy(true);
        try {
          const audio = await recordingToWavDataUrl(new Blob(chunks, { type: rec.mimeType }));
          setHearReply(await callSenses<HearReply>(await token(), { op: 'hear', audio }));
        } catch (e) {
          setErr(errorText(e instanceof Error ? e.message : ''));
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      setRecording(true);
      timerRef.current = setTimeout(() => stopMic(), MAX_RECORD_SECONDS * 1000);
    } catch {
      setErr('No microphone access. Allow it in your browser.');
    }
  };

  const speak = async (text: string) => {
    setBusy(true);
    try {
      setVoiceUrl(await fetchBinaryAction(await token(), { action: 'senses', op: 'speak', text }));
    } catch (e) {
      setErr(errorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  // ── Novela ──
  const [premise, setPremise] = useState('');
  const [voice, setVoice] = useState('pf_dora');
  const [novela, setNovela] = useState<{ job: string; status: string; stage?: string; titulo?: string; credits?: number } | null>(null);
  const [novelaUrl, setNovelaUrl] = useState('');

  useEffect(() => {
    if (!novela || novela.status !== 'pending') return;
    const id = setTimeout(async () => {
      try {
        const t = await token();
        const s = await callNovela<{ status: string; stage?: string; titulo?: string; estimate?: Estimate }>(t, { op: 'status', job: novela.job });
        setNovela({ ...novela, status: s.status, stage: s.stage, titulo: s.titulo, credits: s.estimate?.credits });
        if (s.status === 'completed') setNovelaUrl(await fetchBinaryAction(t, { action: 'novela', op: 'result', job: novela.job }));
        if (s.status === 'failed' || s.status === 'expired') setErr('Could not create the story. Try another idea.');
      } catch {
        setNovela({ ...novela });
      }
    }, 8_000);
    return () => clearTimeout(id);
  }, [novela, token]);

  const createNovela = async () => {
    setErr('');
    setNovelaUrl('');
    setBusy(true);
    try {
      const r = await callNovela<{ job: string; status: string }>(await token(), { op: 'submit', premise, voice });
      setNovela({ job: r.job, status: 'pending', stage: 'queued' });
    } catch (e) {
      setErr(errorText(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const any = features && (features.vision || features.hear || features.novela);
  const tabs: Array<{ id: Tab; label: string; icon: typeof Eye; on: boolean }> = [
    { id: 'visao', label: 'Vertal Visão', icon: Eye, on: !!features?.vision },
    { id: 'ouvir', label: 'Vertal Ouvir', icon: Ear, on: !!features?.hear },
    { id: 'novela', label: 'Vertal Novela', icon: Clapperboard, on: !!features?.novela },
  ];

  return (
    <div role="dialog" aria-label="Vertal Senses" className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className={cn('flex h-14 shrink-0 items-center gap-2 border-b px-3', surface.bar)}>
        <h2 className="flex-1 text-[15px] font-semibold">Vision · Listen · Story</h2>
        {(camOn || recording) && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-500" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {camOn ? 'Camera on' : 'Recording'}
          </span>
        )}
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </header>

      {!features ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !any ? (
        <p className="p-6 text-sm text-muted-foreground">These features are not turned on for your account yet.</p>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <nav className="flex gap-1 border-b border-border/50 p-2">
            {tabs.filter((t) => t.on).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  stopCamera();
                  stopMic();
                  setTab(t.id);
                }}
                className={cn('flex items-center gap-1 rounded-md px-3 py-1.5 text-xs', tab === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>

          <div className="space-y-3 p-4">
            {err && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-500">{err}</p>}

            {tab === 'visao' && (
              <>
                <p className="text-xs text-muted-foreground">Send a photo of a product. It is identified and an ad text is written for it.</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-3 py-2 text-xs">
                    <ImagePlus className="h-4 w-4" /> Send photo
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && analyzePhoto(await fileToJpeg(e.target.files[0]))} />
                  </label>
                  {!camOn ? (
                    <Button size="sm" variant="outline" onClick={openCamera} disabled={busy}><Camera className="mr-1 h-4 w-4" /> Use camera</Button>
                  ) : (
                    <Button size="sm" onClick={capture}><Camera className="mr-1 h-4 w-4" /> Take photo</Button>
                  )}
                  {features.decide && (
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-3 py-2 text-xs">
                      <Film className="h-4 w-4" /> Analyze video
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && analyzeVideo(e.target.files[0])} />
                    </label>
                  )}
                </div>
                {camOn && <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black" />}
                {photo && !camOn && <img src={photo} alt="Photo sent" className="max-h-64 rounded-lg object-contain" />}
                {busy && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</p>}
                {photoReply && (
                  <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                    {photoReply.decision?.answers.category?.choice && (
                      <p className="text-xs text-muted-foreground">
                        {photoReply.decision.model.label}: {CATEGORY_LABEL[photoReply.decision.answers.category.choice] ?? photoReply.decision.answers.category.choice}
                        {' '}({Math.round((photoReply.decision.answers.category.confidence ?? 0) * 100)}%) · {(photoReply.decision.ms / 1000).toFixed(1)} s
                      </p>
                    )}
                    {!photoReply.route.describe && <p>{ROUTE_TEXT[photoReply.route.reason] ?? 'Could not analyze this photo.'}</p>}
                    {photoReply.product && (
                      <>
                        <p className="font-semibold">{photoReply.product.titulo_anuncio || photoReply.product.nome}</p>
                        {photoReply.product.preco_sugerido_brl && (
                          <p className="text-xs">Suggested price: R$ {photoReply.product.preco_sugerido_brl.min} to R$ {photoReply.product.preco_sugerido_brl.max} (estimate)</p>
                        )}
                        <p className="whitespace-pre-wrap text-xs">{photoReply.product.descricao_venda}</p>
                        {photoReply.product.caracteristicas.length > 0 && <p className="text-xs text-muted-foreground">{photoReply.product.caracteristicas.join(' · ')}</p>}
                      </>
                    )}
                    {photoReply.raw && <p className="whitespace-pre-wrap text-xs">{photoReply.raw}</p>}
                    <p className="text-[11px] text-muted-foreground">{photoReply.model?.label} · ~{photoReply.estimate.credits} credits (not charged)</p>
                  </div>
                )}
                {framesReply && (
                  <div className="space-y-1 rounded-lg border border-border/60 p-3 text-xs">
                    <p>Key scenes at: {framesReply.top.map((t) => `${t.toFixed(1)} s`).join(', ') || '—'}</p>
                    {framesReply.frames.some((f) => (f.answers?.unsafe?.noul ?? 0) >= 0.7) && <p className="text-red-500">Note: some parts may be inappropriate.</p>}
                    <p className="text-muted-foreground">{framesReply.model.label} · {framesReply.frames.length} frames in {(framesReply.ms / 1000).toFixed(1)} s</p>
                  </div>
                )}
              </>
            )}

            {tab === 'ouvir' && (
              <>
                <p className="text-xs text-muted-foreground">Tap to record (up to {MAX_RECORD_SECONDS} s). Your audio is transcribed and answered, and the answer can be read out loud.</p>
                {!recording ? (
                  <Button onClick={startRecording} disabled={busy}><Mic className="mr-1 h-4 w-4" /> Record</Button>
                ) : (
                  <Button variant="destructive" onClick={stopMic}><Square className="mr-1 h-4 w-4" /> Stop</Button>
                )}
                {busy && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Listening…</p>}
                {hearReply?.hear && (
                  <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">You said:</p>
                    <p>“{hearReply.hear.transcricao}”</p>
                    {hearReply.hear.resposta && (
                      <>
                        <p className="text-xs text-muted-foreground">Answer:</p>
                        <p>{hearReply.hear.resposta}</p>
                        {features.novela && (
                          <Button size="sm" variant="outline" onClick={() => speak(hearReply.hear!.resposta)} disabled={busy}>
                            <Volume2 className="mr-1 h-4 w-4" /> Play answer
                          </Button>
                        )}
                      </>
                    )}
                    {voiceUrl && <audio src={voiceUrl} controls autoPlay className="w-full" />}
                    <p className="text-[11px] text-muted-foreground">{hearReply.model.label} · ~{hearReply.estimate.credits} credits (not charged)</p>
                  </div>
                )}
              </>
            )}

            {tab === 'novela' && (
              <>
                <p className="text-xs text-muted-foreground">Describe the idea in one or two sentences. A short vertical story of about 2 minutes is written, illustrated, narrated and put together for you.</p>
                <Textarea value={premise} onChange={(e) => setPremise(e.target.value)} rows={3} placeholder="For example: A baker finds out that her mystery customer is the brother she has not seen in 20 years." />
                <div className="flex items-center gap-2">
                  <select aria-label="Voice" value={voice} onChange={(e) => setVoice(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
                    <option value="pf_dora">Female voice (Portuguese)</option>
                    <option value="pm_alex">Male voice (Portuguese)</option>
                    <option value="pm_santa">Deep male voice (Portuguese)</option>
                  </select>
                  <Button onClick={createNovela} disabled={busy || premise.trim().length < 8 || novela?.status === 'pending'}>
                    <Clapperboard className="mr-1 h-4 w-4" /> Create story
                  </Button>
                </div>
                {novela?.status === 'pending' && (
                  <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> {NOVELA_STAGE_TEXT[novela.stage ?? 'queued'] ?? 'Working…'} (takes a few minutes)</p>
                )}
                {novelaUrl && (
                  <div className="space-y-1">
                    {novela?.titulo && <p className="text-sm font-semibold">{novela.titulo}</p>}
                    <video src={novelaUrl} controls playsInline className="max-h-[70vh] rounded-lg bg-black" />
                    <p className="text-[11px] text-muted-foreground">Vertal Novela · own model{novela?.credits ? ` · ~${novela.credits} credits (not charged)` : ''}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
