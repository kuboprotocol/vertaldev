// Studio de Música · "Usar minha voz": refaz uma música criada cantada com a voz clonada do usuário.
// Só aparece para contas liberadas (flag VERTAL_OWN_VOICE_ENABLED no servidor); para os demais renderiza nada,
// então o Studio fica exatamente como antes.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VoiceClonerPanel } from '@/components/voice/VoiceClonerPanel';
import {
  VoiceCloneError, browserVoiceLang, getVoiceConfig, listVoices, startSing, waitVoiceJob,
  type SavedVoice, type VoiceCloneConfig,
} from '@/lib/voiceClone/client';
import { voiceMessage } from '../../../supabase/functions/_shared/voiceClone';

const AUTO_KEY = 'vertal-music-voice-auto';

// Uma consulta de configuração por visita (cada faixa monta este componente).
let configOnce: Promise<VoiceCloneConfig | null> | null = null;
const loadConfig = () => (configOnce ??= getVoiceConfig().catch(() => null));

const T = {
  pt: { use: 'Usar minha voz', sing: 'Cantar com minha voz', clone: 'Clonar minha voz', auto: 'Cantar com minha voz automaticamente nas próximas músicas', working: 'Cantando com a sua voz… ({s}s)', done: 'Versão com a sua voz', credits: 'crédito(s)' },
  en: { use: 'Use my voice', sing: 'Sing with my voice', clone: 'Clone my voice', auto: 'Sing new songs with my voice automatically', working: 'Singing with your voice… ({s}s)', done: 'Version with your voice', credits: 'credit(s)' },
  es: { use: 'Usar mi voz', sing: 'Cantar con mi voz', clone: 'Clonar mi voz', auto: 'Cantar automáticamente las próximas canciones con mi voz', working: 'Cantando con tu voz… ({s}s)', done: 'Versión con tu voz', credits: 'crédito(s)' },
} as const;

export function MusicVoiceClone({ audioUrl, title, autoId }: { audioUrl: string; title: string; autoId?: string }) {
  const lang = browserVoiceLang();
  const t = T[lang];
  const [config, setConfig] = useState<VoiceCloneConfig | null>(null);
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => {
    try { return localStorage.getItem(AUTO_KEY) === 'on'; } catch { return false; }
  });
  const autoDone = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadConfig().then(async (c) => {
      if (!alive || !c?.enabled) return;
      setConfig(c);
      try {
        const v = await listVoices();
        if (alive) {
          setVoices(v);
          if (v[0]) setVoiceId(v[0].id);
        }
      } catch { /* sem vozes */ }
    });
    return () => { alive = false; };
  }, []);

  const sing = async () => {
    if (!voiceId || working) return;
    setError(null);
    setWorking(t.working.replace('{s}', '0'));
    try {
      const started = await startSing(audioUrl, voiceId, `${title} · ${voices.find((v) => v.id === voiceId)?.name ?? ''}`.trim());
      const job = await waitVoiceJob(started.job_id, { deadlineMs: 600_000, onTick: (s) => setWorking(t.working.replace('{s}', String(s))) });
      if (job.status === 'completed' && job.audio_url) setResult(job.audio_url);
      else setError(job.message ?? voiceMessage('failed', lang));
    } catch (e) {
      setError(e instanceof VoiceCloneError && e.code === 'timeout' ? voiceMessage('timeout', lang) : e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(null);
    }
  };

  // "Cantar automaticamente": uma vez por música nova, só se o usuário ligou e já tem voz.
  useEffect(() => {
    if (!auto || !autoId || autoDone.current || !voiceId || !config?.engine) return;
    const key = `vertal-music-voice-done:${autoId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* segue */ }
    autoDone.current = true;
    void sing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoId, voiceId, config?.engine]);

  if (!config?.enabled) return null;

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm" data-testid="music-voice-clone">
      <div className="flex flex-wrap items-center gap-2">
        <Mic className="h-4 w-4 text-primary" />
        <span className="font-medium">{t.use}</span>
        {voices.length > 0 ? (
          <>
            <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <Button size="sm" onClick={sing} disabled={!!working || !config.engine}>
              {working ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{working}</> : `${t.sing} · ${config.costs.sing} ${t.credits}`}
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t.clone}</Button>
      </div>
      {autoId && voices.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              try { localStorage.setItem(AUTO_KEY, e.target.checked ? 'on' : 'off'); } catch { /* só nesta visita */ }
            }}
          />
          {t.auto}
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <div className="space-y-1">
          <p className="text-xs font-medium">{t.done}</p>
          <audio controls src={result} className="w-full" />
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle className="sr-only">{t.clone}</DialogTitle>
          <VoiceClonerPanel onVoicesChange={(v) => { setVoices(v); if (v[0] && !v.some((x) => x.id === voiceId)) setVoiceId(v[0].id); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MusicVoiceClone;
