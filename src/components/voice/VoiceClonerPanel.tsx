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
import { VOICE_PANEL_TEXT, voiceUiDict } from '@/lib/voiceClone/i18n';
import {
  VoiceCloneError, audioDuration, createVoice, deleteVoice, getVoiceConfig, listVoiceJobs, listVoices,
  startSpeak, waitVoiceJob, type SavedVoice, type VoiceCloneConfig, type VoiceJob,
} from '@/lib/voiceClone/client';


export function VoiceClonerPanel({ onVoicesChange }: { onVoicesChange?: (voices: SavedVoice[]) => void }) {
  // Idioma do app (Ajustes → último pedido no chat → navegador → perfil → pt-BR), não só o do navegador.
  const t = VOICE_PANEL_TEXT[voiceUiDict()];
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
  const [sampleLang, setSampleLang] = useState('');
  const [speechLang, setSpeechLang] = useState('auto');
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
      await createVoice({ userId: user.id, name: name.trim(), sample: sample.blob, seconds: sample.seconds, consentVersion: config.consent_version, voiceLanguage: sampleLang || undefined });
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
      const started = await startSpeak(testText.trim(), testVoice, speechLang);
      if (started.language_fallback && started.speech_language) {
        setMsg({ kind: 'ok', text: t.fallback.replace('{l}', config?.speech_languages?.[started.speech_language] ?? started.speech_language) });
      }
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
  const langs = Object.entries(config.speech_languages ?? {});
  const langSelect = (value: string, onChange: (v: string) => void, label: string, autoLabel: string) => (
    <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select aria-label={label} className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={value === '' ? '' : 'auto'}>{autoLabel}</option>
        {langs.map(([code, native]) => <option key={code} value={code}>{native}</option>)}
      </select>
    </label>
  );

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
        {langs.length > 0 && langSelect(sampleLang, setSampleLang, t.sampleLang, t.auto)}
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
          {langs.length > 0 && langSelect(speechLang, setSpeechLang, t.speechLang, t.auto)}
          {langs.length > 0 && <p className="text-xs text-muted-foreground">{t.langNote.replace('{n}', String(langs.length))}</p>}
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
