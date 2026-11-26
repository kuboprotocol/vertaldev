// VERTAL Code AI · Vertal Visão / Vertal Ouvir / Vertal Novela (painel aditivo da página /vertal-code-ai).
// Câmera e microfone: só abrem no toque, com o pedido de permissão do próprio navegador a cada uso, indicador
// visível enquanto ligados, e são desligados ao capturar, ao fechar o painel ou quando a aba vai para o fundo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Clapperboard, Ear, Eye, Film, ImagePlus, Loader2, Mic, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
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
  calcados: 'Calçados', roupas: 'Roupas e acessórios', eletronicos: 'Eletrônicos', casa: 'Casa', beleza: 'Beleza',
  alimentos: 'Alimentos', brinquedos: 'Brinquedos', esporte: 'Esporte', veiculos: 'Veículos', outros: 'Outros',
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
      setErr('Sem acesso à câmera. Libere a permissão no navegador ou envie uma foto.');
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
      setErr('Sem acesso ao microfone. Libere a permissão no navegador.');
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
        if (s.status === 'failed' || s.status === 'expired') setErr('Não consegui montar a novela. Tente outra premissa.');
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
    <div role="dialog" aria-label="Sentidos Vertal" className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <h2 className="flex-1 text-sm font-semibold">Visão · Ouvir · Novela</h2>
        {(camOn || recording) && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-500" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {camOn ? 'Câmera ligada' : 'Gravando'}
          </span>
        )}
        <button type="button" aria-label="Fechar" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </header>

      {!features ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !any ? (
        <p className="p-6 text-sm text-muted-foreground">Esses recursos ainda não foram liberados na sua conta.</p>
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
                <p className="text-xs text-muted-foreground">Mande a foto de um produto: eu identifico na hora e escrevo o anúncio.</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-3 py-2 text-xs">
                    <ImagePlus className="h-4 w-4" /> Enviar foto
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && analyzePhoto(await fileToJpeg(e.target.files[0]))} />
                  </label>
                  {!camOn ? (
                    <Button size="sm" variant="outline" onClick={openCamera} disabled={busy}><Camera className="mr-1 h-4 w-4" /> Usar câmera</Button>
                  ) : (
                    <Button size="sm" onClick={capture}><Camera className="mr-1 h-4 w-4" /> Capturar</Button>
                  )}
                  {features.decide && (
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-3 py-2 text-xs">
                      <Film className="h-4 w-4" /> Analisar vídeo
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && analyzeVideo(e.target.files[0])} />
                    </label>
                  )}
                </div>
                {camOn && <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black" />}
                {photo && !camOn && <img src={photo} alt="Foto enviada" className="max-h-64 rounded-lg object-contain" />}
                {busy && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Analisando…</p>}
                {photoReply && (
                  <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                    {photoReply.decision?.answers.category?.choice && (
                      <p className="text-xs text-muted-foreground">
                        {photoReply.decision.model.label}: {CATEGORY_LABEL[photoReply.decision.answers.category.choice] ?? photoReply.decision.answers.category.choice}
                        {' '}({Math.round((photoReply.decision.answers.category.confidence ?? 0) * 100)}%) · {(photoReply.decision.ms / 1000).toFixed(1)} s
                      </p>
                    )}
                    {!photoReply.route.describe && <p>{ROUTE_TEXT[photoReply.route.reason] ?? 'Não consegui analisar essa foto.'}</p>}
                    {photoReply.product && (
                      <>
                        <p className="font-semibold">{photoReply.product.titulo_anuncio || photoReply.product.nome}</p>
                        {photoReply.product.preco_sugerido_brl && (
                          <p className="text-xs">Preço sugerido: R$ {photoReply.product.preco_sugerido_brl.min} – R$ {photoReply.product.preco_sugerido_brl.max} (estimativa)</p>
                        )}
                        <p className="whitespace-pre-wrap text-xs">{photoReply.product.descricao_venda}</p>
                        {photoReply.product.caracteristicas.length > 0 && <p className="text-xs text-muted-foreground">{photoReply.product.caracteristicas.join(' · ')}</p>}
                      </>
                    )}
                    {photoReply.raw && <p className="whitespace-pre-wrap text-xs">{photoReply.raw}</p>}
                    <p className="text-[11px] text-muted-foreground">{photoReply.model?.label} · ~{photoReply.estimate.credits} créditos (não cobrado)</p>
                  </div>
                )}
                {framesReply && (
                  <div className="space-y-1 rounded-lg border border-border/60 p-3 text-xs">
                    <p>Cenas-chave em: {framesReply.top.map((t) => `${t.toFixed(1)} s`).join(', ') || '—'}</p>
                    {framesReply.frames.some((f) => (f.answers?.unsafe?.noul ?? 0) >= 0.7) && <p className="text-red-500">Atenção: há trechos possivelmente impróprios.</p>}
                    <p className="text-muted-foreground">{framesReply.model.label} · {framesReply.frames.length} quadros em {(framesReply.ms / 1000).toFixed(1)} s</p>
                  </div>
                )}
              </>
            )}

            {tab === 'ouvir' && (
              <>
                <p className="text-xs text-muted-foreground">Toque para gravar (até {MAX_RECORD_SECONDS} s). Eu transcrevo, entendo e respondo — posso responder em voz.</p>
                {!recording ? (
                  <Button onClick={startRecording} disabled={busy}><Mic className="mr-1 h-4 w-4" /> Gravar</Button>
                ) : (
                  <Button variant="destructive" onClick={stopMic}><Square className="mr-1 h-4 w-4" /> Parar</Button>
                )}
                {busy && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Ouvindo…</p>}
                {hearReply?.hear && (
                  <div className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Você disse:</p>
                    <p>“{hearReply.hear.transcricao}”</p>
                    {hearReply.hear.resposta && (
                      <>
                        <p className="text-xs text-muted-foreground">Resposta:</p>
                        <p>{hearReply.hear.resposta}</p>
                        {features.novela && (
                          <Button size="sm" variant="outline" onClick={() => speak(hearReply.hear!.resposta)} disabled={busy}>
                            <Volume2 className="mr-1 h-4 w-4" /> Ouvir resposta
                          </Button>
                        )}
                      </>
                    )}
                    {voiceUrl && <audio src={voiceUrl} controls autoPlay className="w-full" />}
                    <p className="text-[11px] text-muted-foreground">{hearReply.model.label} · ~{hearReply.estimate.credits} créditos (não cobrado)</p>
                  </div>
                )}
              </>
            )}

            {tab === 'novela' && (
              <>
                <p className="text-xs text-muted-foreground">Conte a ideia em uma ou duas frases. Eu escrevo, ilustro, narro e monto uma novelinha vertical de ~2 minutos.</p>
                <Textarea value={premise} onChange={(e) => setPremise(e.target.value)} rows={3} placeholder="Ex.: Uma confeiteira descobre que o cliente misterioso é o irmão que ela não vê há 20 anos." />
                <div className="flex items-center gap-2">
                  <select aria-label="Voz" value={voice} onChange={(e) => setVoice(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
                    <option value="pf_dora">Voz feminina</option>
                    <option value="pm_alex">Voz masculina</option>
                    <option value="pm_santa">Voz masculina grave</option>
                  </select>
                  <Button onClick={createNovela} disabled={busy || premise.trim().length < 8 || novela?.status === 'pending'}>
                    <Clapperboard className="mr-1 h-4 w-4" /> Criar novela
                  </Button>
                </div>
                {novela?.status === 'pending' && (
                  <p className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> {NOVELA_STAGE_TEXT[novela.stage ?? 'queued'] ?? 'Trabalhando…'} (leva alguns minutos)</p>
                )}
                {novelaUrl && (
                  <div className="space-y-1">
                    {novela?.titulo && <p className="text-sm font-semibold">{novela.titulo}</p>}
                    <video src={novelaUrl} controls playsInline className="max-h-[70vh] rounded-lg bg-black" />
                    <p className="text-[11px] text-muted-foreground">Vertal Novela · Própria{novela?.credits ? ` · ~${novela.credits} créditos (não cobrado)` : ''}</p>
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
