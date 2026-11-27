// Vertal · Clonador de voz — painel reutilizável (Vertal Chat e Studio de Música).
// Grava no navegador (ou envia um arquivo), pede o consentimento explícito, salva a voz na conta do usuário
// e permite testar falando um texto. Só aparece funcional para contas liberadas (flag no servidor).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, Trash2, Upload, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import {
  VoiceCloneError, audioDuration, browserVoiceLang, createVoice, deleteVoice, getVoiceConfig, listVoiceJobs, listVoices,
  startSpeak, waitVoiceJob, type SavedVoice, type VoiceCloneConfig, type VoiceJob,
} from '@/lib/voiceClone/client';

const T = {
  pt: {
    title: 'Clonador de voz', intro: 'Grave de 10 a 60 segundos falando normalmente, num lugar silencioso. Quanto mais natural, melhor fica.',
    disabled: 'O Clonador de voz ainda não está liberado para a sua conta.', engineOff: 'O motor de voz ainda está sendo ligado. Você já pode salvar a voz; falar e cantar ficam disponíveis em breve.',
    record: 'Gravar', stop: 'Parar', upload: 'Enviar arquivo', name: 'Nome da voz', save: 'Salvar minha voz',
    consent: 'Confirmo que esta voz é minha ou que tenho autorização por escrito do dono para cloná-la.',
    saved: 'Suas vozes', none: 'Nenhuma voz salva ainda.', del: 'Apagar', test: 'Testar: escreva algo para a sua voz falar',
    speak: 'Falar com esta voz', short: 'A amostra precisa ter pelo menos {s} segundos.', long: 'A amostra pode ter no máximo {s} segundos.',
    ok: 'Voz salva. Agora é só pedir no chat: "canta essa música com a minha voz".', history: 'Últimos áudios',
    micErr: 'Não consegui acessar o microfone. Libere o microfone no navegador ou envie um arquivo.', free: 'grátis', credits: 'crédito(s)',
    waiting: 'Gerando… ({s}s)', processing: 'processando', failed: 'falhou (crédito devolvido)',
  },
  en: {
    title: 'Voice cloner', intro: 'Record 10 to 60 seconds speaking normally, in a quiet place. The more natural, the better.',
    disabled: "The voice cloner isn't enabled for your account yet.", engineOff: 'The voice engine is still being switched on. You can save your voice now; speaking and singing come soon.',
    record: 'Record', stop: 'Stop', upload: 'Upload file', name: 'Voice name', save: 'Save my voice',
    consent: "I confirm this voice is mine or that I have the owner's written permission to clone it.",
    saved: 'Your voices', none: 'No saved voices yet.', del: 'Delete', test: 'Test: type something for your voice to say',
    speak: 'Speak with this voice', short: 'The sample needs at least {s} seconds.', long: 'The sample can be at most {s} seconds.',
    ok: 'Voice saved. Now just ask in the chat: "sing this song with my voice".', history: 'Latest audio',
    micErr: "Couldn't access the microphone. Allow it in the browser or upload a file.", free: 'free', credits: 'credit(s)',
    waiting: 'Generating… ({s}s)', processing: 'processing', failed: 'failed (credit refunded)',
  },
  es: {
    title: 'Clonador de voz', intro: 'Graba de 10 a 60 segundos hablando normalmente, en un lugar silencioso. Cuanto más natural, mejor.',
    disabled: 'El clonador de voz aún no está habilitado para tu cuenta.', engineOff: 'El motor de voz aún se está activando. Ya puedes guardar tu voz; hablar y cantar llegan pronto.',
    record: 'Grabar', stop: 'Parar', upload: 'Subir archivo', name: 'Nombre de la voz', save: 'Guardar mi voz',
    consent: 'Confirmo que esta voz es mía o que tengo autorización escrita del titular para clonarla.',
    saved: 'Tus voces', none: 'Aún no hay voces guardadas.', del: 'Borrar', test: 'Prueba: escribe algo para que tu voz lo diga',
    speak: 'Hablar con esta voz', short: 'La muestra necesita al menos {s} segundos.', long: 'La muestra puede tener como máximo {s} segundos.',
    ok: 'Voz guardada. Ahora pídelo en el chat: "canta esta canción con mi voz".', history: 'Últimos audios',
    micErr: 'No pude acceder al micrófono. Permítelo en el navegador o sube un archivo.', free: 'gratis', credits: 'crédito(s)',
    waiting: 'Generando… ({s}s)', processing: 'procesando', failed: 'falló (crédito devuelto)',
  },
} as const;

export function VoiceClonerPanel({ onVoicesChange }: { onVoicesChange?: (voices: SavedVoice[]) => void }) {
  const lang = browserVoiceLang();
  const t = T[lang];
  const { user } = useAuth();
  const [config, setConfig] = useState<VoiceCloneConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [sample, setSample] = useState<{ blob: Blob; seconds: number; url: string } | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [testText, setTestText] = useState('');
  const [testVoice, setTestVoice] = useState<string>('');
  const [speaking, setSpeaking] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [v, js] = await Promise.all([listVoices(), listVoiceJobs().catch(() => [])]);
      setVoices(v);
      setJobs(js);
      onVoicesChange?.(v);
      if (v.length && !v.some((x) => x.id === testVoice)) setTestVoice(v[0].id);
    } catch (e) {
      if (e instanceof VoiceCloneError) setMsg({ kind: 'err', text: e.message });
    }
  }, [onVoicesChange, testVoice]);

  useEffect(() => {
    let alive = true;
    getVoiceConfig()
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        if (c.enabled) void refresh();
      })
      .catch(() => alive && setConfig(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      recRef.current?.stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSampleBlob = (blob: Blob, seconds: number) => {
    if (sample) URL.revokeObjectURL(sample.url);
    setSample({ blob, seconds, url: URL.createObjectURL(blob) });
  };

  const startRec = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const seconds = (Date.now() - startedAt.current) / 1000;
        setSampleBlob(new Blob(chunks.current, { type: (rec.mimeType || 'audio/webm').split(';')[0] }), seconds);
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      rec.start(1000);
      setRecording(true);
      setRecSeconds(0);
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setRecSeconds(s);
        if (config && s >= config.limits.max_seconds) stopRec();
      }, 250);
    } catch {
      setMsg({ kind: 'err', text: t.micErr });
    }
  };

  const stopRec = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    setRecording(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    setSampleBlob(file, await audioDuration(file));
  };

  const save = async () => {
    if (!config || !sample || !user?.id) return;
    if (sample.seconds < config.limits.min_seconds) return setMsg({ kind: 'err', text: t.short.replace('{s}', String(config.limits.min_seconds)) });
    if (sample.seconds > config.limits.max_seconds) return setMsg({ kind: 'err', text: t.long.replace('{s}', String(config.limits.max_seconds)) });
    setBusy(true);
    setMsg(null);
    try {
      await createVoice({ userId: user.id, name: name.trim(), sample: sample.blob, seconds: sample.seconds, consentVersion: config.consent_version });
      setMsg({ kind: 'ok', text: t.ok });
      URL.revokeObjectURL(sample.url);
      setSample(null);
      setName('');
      setConsent(false);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteVoice(id);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const speak = async () => {
    if (!testText.trim() || !testVoice) return;
    setMsg(null);
    setSpeaking(t.waiting.replace('{s}', '0'));
    try {
      const started = await startSpeak(testText.trim(), testVoice);
      const job = await waitVoiceJob(started.job_id, { deadlineMs: 180_000, onTick: (s) => setSpeaking(t.waiting.replace('{s}', String(s))) });
      if (job.status !== 'completed') setMsg({ kind: 'err', text: job.message ?? t.failed });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSpeaking(null);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t.title}</div>;
  if (!config?.enabled) return <div className="p-6 text-sm text-muted-foreground">{t.disabled}</div>;
  const cost = (n: number) => (n === 0 ? t.free : `${n} ${t.credits}`);
  const canSave = !!sample && consent && !busy && voices.length < config.limits.max_voices;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <div>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        {!config.engine && <p className="mt-1 text-xs text-amber-600">{t.engineOff}</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button type="button" variant="destructive" onClick={stopRec}><Square className="mr-2 h-4 w-4" /> {t.stop} · {recSeconds}s</Button>
          ) : (
            <Button type="button" onClick={startRec} disabled={busy}><Mic className="mr-2 h-4 w-4" /> {t.record}</Button>
          )}
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
            <Upload className="mr-2 h-4 w-4" /> {t.upload}
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} disabled={recording || busy} />
          </label>
          <span className="text-xs text-muted-foreground">{config.limits.min_seconds}–{config.limits.max_seconds}s · {cost(config.costs.create)}</span>
        </div>
        {sample && <audio controls src={sample.url} className="w-full" />}
        <Input placeholder={t.name} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
          <span>{t.consent} <span className="block text-xs text-muted-foreground">{config.consent_text}</span></span>
        </label>
        <Button type="button" onClick={save} disabled={!canSave}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t.save}
        </Button>
      </div>

      {msg && <p className={msg.kind === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>{msg.text}</p>}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.saved} ({voices.length}/{config.limits.max_voices})</h3>
        {voices.length === 0 && <p className="text-sm text-muted-foreground">{t.none}</p>}
        {voices.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="vertal-test-voice" checked={testVoice === v.id} onChange={() => setTestVoice(v.id)} />
              {v.name} <span className="text-xs text-muted-foreground">· {Math.round(v.sample_seconds)}s</span>
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => remove(v.id)} disabled={busy} aria-label={t.del}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      {voices.length > 0 && config.engine && (
        <div className="flex flex-col gap-2">
          <Textarea placeholder={t.test} value={testText} maxLength={config.limits.max_text} onChange={(e) => setTestText(e.target.value)} rows={3} />
          <Button type="button" variant="secondary" onClick={speak} disabled={!!speaking || !testText.trim()}>
            {speaking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {speaking}</> : <><Volume2 className="mr-2 h-4 w-4" /> {t.speak} · {cost(config.costs.speak)}</>}
          </Button>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t.history}</h3>
          {jobs.map((j) => (
            <div key={j.job_id} className="rounded-lg border border-border/60 p-2 text-xs">
              <div className="mb-1 text-muted-foreground">{j.kind === 'sing' ? '🎤' : '🗣️'} {j.title || j.text || ''} {j.status === 'processing' ? `· ${t.processing}` : j.status === 'failed' ? `· ${t.failed}` : ''}</div>
              {j.audio_url && <audio controls src={j.audio_url} className="w-full" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VoiceClonerPanel;
