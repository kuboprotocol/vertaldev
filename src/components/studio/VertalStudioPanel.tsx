import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clapperboard, Download, Fingerprint, Loader2, Mic, Music2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AVATAR_LIMITS, AVATAR_VOICES, quoteAvatar, type AvatarVoice } from '@/config/avatarPricing';
import { MUSIC_STYLES } from '@/config/musicPricing';

/**
 * Vertal Studio — painel unificado de voz, avatar, música e clonagem de voz.
 * Reúne os fluxos que já existem no Painel Criativo (creative-video, creative-music)
 * e a clonagem com consentimento (voice-clone). Cobrança sempre no backend.
 */

type Tab = 'voz' | 'avatar' | 'musica' | 'clonar';

const TABS: { key: Tab; label: string; icon: typeof Mic; hint: string }[] = [
  { key: 'voz', label: 'Voz', icon: Mic, hint: 'Narração com vozes do catálogo' },
  { key: 'avatar', label: 'Avatar', icon: Clapperboard, hint: 'Vídeo falante a partir de uma foto' },
  { key: 'musica', label: 'Música', icon: Music2, hint: 'Canções geradas a partir de um prompt' },
  { key: 'clonar', label: 'Clonar voz', icon: Fingerprint, hint: 'Sua voz, com consentimento verificado' },
];

const VOICE_LABEL: Record<AvatarVoice, string> = { Male: 'Masculina', Female: 'Feminina', Neutral: 'Neutra' };

/** Mesma versão usada pelo backend (voice-clone). Mudar o texto exige nova versão. */
const CONSENT_VERSION = 'voice-consent-v1';
const CONSENT_TEXT =
  'Declaro que sou o titular desta voz ou tenho autorização escrita do titular para cloná-la. ' +
  'Entendo que o áudio gerado é sintético e será identificado como tal. ' +
  'Não usarei esta voz para se passar por outra pessoa, enganar ou aplicar fraude.';

const MAX_SAMPLE_BYTES = 5 * 1024 * 1024;
const POLL_MS = 8000;
const FINAL_AVATAR = ['completed', 'failed'];

const ERROR_LABEL: Record<string, string> = {
  Unauthorized: 'Entre na sua conta para usar o Vertal Studio.',
  avatar_ai_not_configured: 'Geração de avatar indisponível no momento.',
  voice_generation_failed: 'Não foi possível gerar a voz. Tente novamente.',
  avatar_submit_failed: 'Não foi possível enfileirar o vídeo. Tente novamente.',
  voice_clone_provider_not_configured: 'A clonagem de voz ainda não está ativa neste ambiente.',
  voice_clone_adapter_not_implemented: 'O provedor de clonagem está configurado, mas o adaptador ainda não foi implementado.',
  consent_required: 'Confirme o consentimento antes de continuar.',
  sample_too_large: 'O áudio passa do limite de 5 MB.',
};

function errorText(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  return ERROR_LABEL[code] ?? code;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // Erros não-2xx trazem o corpo JSON em error.context (Response).
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json();
        if (payload?.error) throw new Error(String(payload.error));
      } catch (inner) {
        if (inner instanceof Error && inner.message !== 'Unexpected end of JSON input') throw inner;
      }
    }
    throw new Error(error.message || 'request_failed');
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

interface AvatarAsset {
  asset_id: string;
  status: string;
  audio_url: string | null;
  video_url: string | null;
  error: string | null;
}

interface MusicItem {
  audioUrl?: string;
  title?: string;
  duration?: number;
}

interface MusicStatus {
  status?: string;
  items?: MusicItem[];
}

type Feedback = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function VertalStudioPanel() {
  const [tab, setTab] = useState<Tab>('voz');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 md:px-6">
      <header className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Vertal Studio</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Voz, avatar, música e clonagem de voz em um só lugar. Cada geração mostra o custo antes de começar.
        </p>
      </header>

      <nav role="tablist" aria-label="Ferramentas do Studio" className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {TABS.map(({ key, label, icon: Icon, hint }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </nav>

      <main role="tabpanel">
        {tab === 'voz' && <VoiceTab />}
        {tab === 'avatar' && <AvatarTab />}
        {tab === 'musica' && <MusicTab />}
        {tab === 'clonar' && <CloneTab />}
      </main>
    </div>
  );
}

function StatusLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const Icon = feedback.kind === 'error' ? AlertTriangle : feedback.kind === 'ok' ? CheckCircle2 : Loader2;
  const color =
    feedback.kind === 'error' ? 'text-destructive' : feedback.kind === 'ok' ? 'text-emerald-500' : 'text-muted-foreground';
  return (
    <p role="status" className={`flex items-start gap-2 text-sm ${color}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${feedback.kind === 'info' ? 'animate-spin' : ''}`} aria-hidden />
      <span>{feedback.text}</span>
    </p>
  );
}

function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function CostBadge({ credits }: { credits: number }) {
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {credits} créditos
    </Badge>
  );
}

function ScriptField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const remaining = AVATAR_LIMITS.maxTextChars - value.length;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="studio-text">Texto</Label>
      <Textarea
        id="studio-text"
        rows={6}
        value={value}
        maxLength={AVATAR_LIMITS.maxTextChars}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escreva o que a voz deve dizer…"
      />
      <span className={`text-xs ${remaining < 50 ? 'text-amber-500' : 'text-muted-foreground'}`}>
        {value.length}/{AVATAR_LIMITS.maxTextChars} caracteres
      </span>
    </div>
  );
}

function useAvatarPolling(asset: AvatarAsset | null, onUpdate: (a: AvatarAsset) => void, onError: (msg: string) => void) {
  const id = asset?.asset_id;
  const status = asset?.status;
  useEffect(() => {
    if (!id || !status || FINAL_AVATAR.includes(status)) return;
    const timer = setInterval(async () => {
      try {
        const next = await invoke<AvatarAsset>('creative-video', { mode: 'avatar', action: 'status', asset_id: id });
        onUpdate(next);
      } catch (err) {
        onError(errorText(err));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // Só reinicia quando o item ou o estado mudam, não a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status]);
}

function VoiceTab() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<AvatarVoice>('Neutral');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [audio, setAudio] = useState<string | null>(null);

  const quote = useMemo(() => quoteAvatar(text, false), [text]);
  const canSubmit = text.trim().length > 0 && text.length <= AVATAR_LIMITS.maxTextChars && !busy;

  async function generate() {
    setBusy(true);
    setAudio(null);
    setFeedback({ kind: 'info', text: 'Gerando a narração…' });
    try {
      const res = await invoke<AvatarAsset>('creative-video', { mode: 'avatar', prompt: text.trim(), voice });
      if (!res.audio_url) throw new Error('voice_generation_failed');
      setAudio(res.audio_url);
      setFeedback({ kind: 'ok', text: 'Narração pronta.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
        <ScriptField value={text} onChange={setText} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="studio-voice">Voz do catálogo</Label>
          <select
            id="studio-voice"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={voice}
            onChange={(e) => setVoice(e.target.value as AvatarVoice)}
          >
            {(Object.keys(AVATAR_VOICES) as AvatarVoice[]).map((v) => (
              <option key={v} value={v}>
                {VOICE_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <CostBadge credits={quote.credits} />
          <Button onClick={generate} disabled={!canSubmit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
            Gerar narração
          </Button>
        </div>
        <StatusLine feedback={feedback} />
      </div>

      <ResultCard title="Resultado">
        {audio ? (
          <>
            <audio controls src={audio} className="w-full" />
            <a href={audio} download className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
              <Download className="h-4 w-4" aria-hidden /> Baixar MP3
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">A narração aparece aqui quando ficar pronta.</p>
        )}
      </ResultCard>
    </div>
  );
}

function AvatarTab() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<AvatarVoice>('Neutral');
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [asset, setAsset] = useState<AvatarAsset | null>(null);

  const quote = useMemo(() => quoteAvatar(text, true), [text]);
  const canSubmit = text.trim().length > 0 && text.length <= AVATAR_LIMITS.maxTextChars && /^https:\/\//.test(photoUrl) && !busy;

  useAvatarPolling(
    asset,
    (next) => {
      setAsset(next);
      if (next.status === 'completed') setFeedback({ kind: 'ok', text: 'Vídeo pronto.' });
      if (next.status === 'failed') setFeedback({ kind: 'error', text: `Falhou (${next.error ?? 'erro'}). Créditos reembolsados.` });
    },
    (msg) => setFeedback({ kind: 'error', text: msg }),
  );

  async function generate() {
    setBusy(true);
    setAsset(null);
    setFeedback({ kind: 'info', text: 'Enviando para a fila de avatar…' });
    try {
      const res = await invoke<AvatarAsset>('creative-video', {
        mode: 'avatar',
        prompt: text.trim(),
        voice,
        image_url: photoUrl.trim(),
      });
      setAsset(res);
      setFeedback({ kind: 'info', text: 'Gerando o vídeo. Isso pode levar alguns minutos.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
        <ScriptField value={text} onChange={setText} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="studio-voice-av">Voz</Label>
            <select
              id="studio-voice-av"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={voice}
              onChange={(e) => setVoice(e.target.value as AvatarVoice)}
            >
              {(Object.keys(AVATAR_VOICES) as AvatarVoice[]).map((v) => (
                <option key={v} value={v}>
                  {VOICE_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="studio-photo">Foto (URL https)</Label>
            <Input
              id="studio-photo"
              type="url"
              placeholder="https://…/rosto.jpg"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Use uma foto frontal, com boa luz, de alguém que autorizou o uso. A foto precisa estar em um endereço https público.
        </p>
        <div className="flex items-center justify-between gap-3">
          <CostBadge credits={quote.credits} />
          <Button onClick={generate} disabled={!canSubmit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
            Gerar avatar
          </Button>
        </div>
        <StatusLine feedback={feedback} />
      </div>

      <ResultCard title="Resultado">
        {asset?.video_url ? (
          <>
            <video controls src={asset.video_url} className="w-full rounded-lg bg-black" />
            <a href={asset.video_url} download className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
              <Download className="h-4 w-4" aria-hidden /> Baixar MP4
            </a>
          </>
        ) : asset ? (
          <p className="text-sm text-muted-foreground">Status: {asset.status}. Não feche esta tela até o vídeo ficar pronto.</p>
        ) : (
          <p className="text-sm text-muted-foreground">O vídeo aparece aqui quando ficar pronto.</p>
        )}
      </ResultCard>
    </div>
  );
}

function MusicTab() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<string>('pop');
  const [instrumental, setInstrumental] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [job, setJob] = useState<{ taskId: string; assetId: string } | null>(null);
  const [items, setItems] = useState<MusicItem[]>([]);

  const styleOptions = useMemo(() => Object.entries(MUSIC_STYLES), []);
  const canSubmit = prompt.trim().length > 0 && !busy;

  useEffect(() => {
    if (!job || items.some((i) => i.audioUrl)) return;
    const timer = setInterval(async () => {
      try {
        const res = await invoke<MusicStatus>('creative-music', { action: 'status', task_id: job.taskId, asset_id: job.assetId });
        const ready = (res.items ?? []).filter((i) => i.audioUrl);
        if (ready.length > 0) {
          setItems(ready);
          setFeedback({ kind: 'ok', text: 'Música pronta.' });
        } else if (res.status && /FAILED|ERROR/.test(res.status)) {
          setFeedback({ kind: 'error', text: `A geração falhou (${res.status}).` });
          setJob(null);
        }
      } catch (err) {
        setFeedback({ kind: 'error', text: errorText(err) });
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, items]);

  async function generate() {
    setBusy(true);
    setItems([]);
    setFeedback({ kind: 'info', text: 'Enviando para a geração de música…' });
    try {
      const res = await invoke<{ task_id: string; asset_id: string }>('creative-music', {
        action: 'generate',
        prompt: prompt.trim(),
        style,
        instrumental,
      });
      setJob({ taskId: res.task_id, assetId: res.asset_id });
      setFeedback({ kind: 'info', text: 'Compondo. Isso leva alguns minutos.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="studio-music">Descreva a música</Label>
          <Textarea
            id="studio-music"
            rows={5}
            maxLength={1000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex.: batida lo-fi tranquila para estudar, piano e chuva ao fundo"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="studio-style">Estilo</Label>
            <select
              id="studio-style"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {styleOptions.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 self-end">
            <Label htmlFor="studio-instr">Só instrumental</Label>
            <Switch id="studio-instr" checked={instrumental} onCheckedChange={setInstrumental} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <CostBadge credits={1} />
          <Button onClick={generate} disabled={!canSubmit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music2 className="mr-2 h-4 w-4" />}
            Compor música
          </Button>
        </div>
        <StatusLine feedback={feedback} />
      </div>

      <ResultCard title="Faixas">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <div key={item.audioUrl ?? idx} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-sm font-medium">{item.title ?? `Faixa ${idx + 1}`}</span>
              <audio controls src={item.audioUrl} className="w-full" />
              {item.audioUrl && (
                <a href={item.audioUrl} download className="inline-flex items-center gap-2 text-xs text-primary underline-offset-4 hover:underline">
                  <Download className="h-3.5 w-3.5" aria-hidden /> Baixar
                </a>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">As faixas aparecem aqui quando ficarem prontas.</p>
        )}
      </ResultCard>
    </div>
  );
}

function CloneTab() {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const canSubmit = name.trim().length > 0 && !!file && agreed && !busy;

  function pickFile(f: File | null) {
    if (f && f.size > MAX_SAMPLE_BYTES) {
      setFile(null);
      setFeedback({ kind: 'error', text: errorText(new Error('sample_too_large')) });
      return;
    }
    if (f && !f.type.startsWith('audio/')) {
      setFile(null);
      setFeedback({ kind: 'error', text: 'Envie um arquivo de áudio (mp3, wav, m4a, webm).' });
      return;
    }
    setFile(f);
    setFeedback(null);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setFeedback({ kind: 'info', text: 'Verificando consentimento e enviando a amostra…' });
    try {
      const sample_base64 = await readAsBase64(file);
      const res = await invoke<{ status: string }>('voice-clone', {
        action: 'create',
        name: name.trim(),
        sample_base64,
        sample_mime: file.type,
        consent: { accepted: true, owner_confirmed: true, version: CONSENT_VERSION },
      });
      setFeedback({ kind: 'ok', text: `Solicitação registrada (${res.status}).` });
    } catch (err) {
      setFeedback({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="voice-name">Nome da voz</Label>
          <Input id="voice-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Minha voz principal" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="voice-file">Amostra de áudio (até 5 MB, 30 a 60 segundos de fala limpa)</Label>
          <Input id="voice-file" type="file" accept="audio/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Consentimento
            </span>
            <p className="text-xs text-muted-foreground">{CONSENT_TEXT}</p>
          </div>
          <Switch aria-label="Aceito o consentimento" checked={agreed} onCheckedChange={setAgreed} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">Versão {CONSENT_VERSION}</Badge>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
            Criar voz clonada
          </Button>
        </div>
        <StatusLine feedback={feedback} />
      </div>

      <ResultCard title="Regras">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Só clone a sua voz ou uma voz com autorização escrita do titular.</li>
          <li>Todo áudio gerado é identificado como sintético.</li>
          <li>O aceite fica registrado com versão, data e identificação da amostra.</li>
          <li>Clonagem fica indisponível até o provedor ser configurado no servidor.</li>
        </ul>
      </ResultCard>
    </div>
  );
}

export default VertalStudioPanel;
