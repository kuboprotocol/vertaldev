import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Mic2, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  PODCAST_PROFILES,
  newId,
  nowIso,
  podcastToMarkdown,
  type ContextItem,
  type Notebook,
  type PodcastEpisode,
  type PodcastLength,
  type SpeakerProfile,
} from '@/lib/notebook/model';
import { creditsLabel, notebookAiCost, runNotebookAi } from '@/services/notebookAiService';
import { downloadText, safeFileName } from '@/lib/notebook/download';
import type { UpdateWorkspace } from './useNotebookWorkspace';

const SPEAKER_COLORS = ['from-amber-400 to-orange-500', 'from-violet-500 to-fuchsia-500', 'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-500'];
const LENGTHS: Array<{ key: PodcastLength; label: string; hint: string }> = [
  { key: 'short', label: 'Curto', hint: '~3 min' },
  { key: 'medium', label: 'Médio', hint: '~7 min' },
  { key: 'long', label: 'Longo', hint: '~12 min' },
];

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);
  // Português primeiro.
  return useMemo(() => [...voices].sort((a, b) => Number(b.lang.startsWith('pt')) - Number(a.lang.startsWith('pt'))), [voices]);
}

// ─── Gerar episódio ─────────────────────────────────────────────────────────

export function GeneratePodcastDialog({
  open,
  onOpenChange,
  notebook,
  context,
  update,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notebook: Notebook;
  context: ContextItem[];
  update: UpdateWorkspace;
  onCreated: (id: string) => void;
}) {
  const voices = useVoices();
  const [profileId, setProfileId] = useState(PODCAST_PROFILES[0].id);
  const [speakers, setSpeakers] = useState<SpeakerProfile[]>(PODCAST_PROFILES[0].speakers.map((s) => ({ ...s })));
  const [briefing, setBriefing] = useState(PODCAST_PROFILES[0].briefing);
  const [length, setLength] = useState<PodcastLength>(PODCAST_PROFILES[0].length);
  const cost = notebookAiCost({ action: 'podcast', context, podcast: { speakers: [], length } });
  const [loading, setLoading] = useState(false);

  const pick = (id: string) => {
    const p = PODCAST_PROFILES.find((x) => x.id === id)!;
    setProfileId(id);
    setSpeakers(p.speakers.map((s) => ({ ...s })));
    setBriefing(p.briefing);
    setLength(p.length);
  };

  const setSpeaker = (i: number, patch: Partial<SpeakerProfile>) => setSpeakers((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const generate = async () => {
    const cast = speakers.filter((s) => s.name.trim());
    if (cast.length === 0) return toast.error('Dê nome a pelo menos um locutor.');
    if (context.length === 0) return toast.error('Coloque fontes no contexto antes de gerar o podcast.');
    setLoading(true);
    try {
      const out = await runNotebookAi({
        action: 'podcast',
        notebook: { name: notebook.name, description: notebook.description },
        context,
        podcast: { briefing, speakers: cast.map(({ name, backstory, personality }) => ({ name, backstory, personality })), length },
      });
      const ep: PodcastEpisode = { id: newId('p'), notebookId: notebook.id, title: out.title, profileId, speakers: cast, lines: out.lines, createdAt: nowIso() };
      update((ws) => ({ ...ws, episodes: [ep, ...ws.episodes] }));
      toast.success('Episódio pronto', { description: out.title });
      onCreated(ep.id);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Mic2 className="h-5 w-5 text-amber-300" /> Gerar podcast
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            De 1 a 4 locutores conversam sobre as {context.length} fonte(s) e nota(s) do contexto. O preço vai de 3 a 5 créditos conforme a duração (+1 com muito material); a narração roda grátis no seu navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {PODCAST_PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              className={cn(
                'rounded-2xl border p-3 text-left transition',
                profileId === p.id ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25',
              )}
            >
              <p className="flex items-center justify-between text-sm font-semibold text-white">
                {p.name}
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400">
                  <Users className="h-3 w-3" /> {p.speakers.length}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{p.description}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Locutores</h4>
            {speakers.length < 4 && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setSpeakers((l) => [...l, { name: `Voz ${l.length + 1}`, backstory: '', personality: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            )}
          </div>
          {speakers.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[auto_1fr_1fr]">
              <span className={cn('hidden h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white sm:flex', SPEAKER_COLORS[i])}>
                {s.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <Input value={s.name} onChange={(e) => setSpeaker(i, { name: e.target.value })} placeholder="Nome" aria-label={`Nome do locutor ${i + 1}`} className="border-white/10 bg-white/5" />
              <div className="flex gap-2">
                <select
                  value={s.voiceURI ?? ''}
                  onChange={(e) => setSpeaker(i, { voiceURI: e.target.value || undefined })}
                  aria-label={`Voz do locutor ${i + 1}`}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-slate-200"
                >
                  <option value="">Voz automática</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                {speakers.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-slate-400" aria-label={`Remover ${s.name}`} onClick={() => setSpeakers((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Input value={s.backstory ?? ''} onChange={(e) => setSpeaker(i, { backstory: e.target.value })} placeholder="Quem é (ex.: especialista em IA)" aria-label={`Papel do locutor ${i + 1}`} className="border-white/10 bg-white/5 sm:col-span-2 sm:col-start-2" />
              <Input value={s.personality ?? ''} onChange={(e) => setSpeaker(i, { personality: e.target.value })} placeholder="Personalidade (ex.: bem-humorada)" aria-label={`Personalidade do locutor ${i + 1}`} className="border-white/10 bg-white/5 sm:col-span-2 sm:col-start-2" />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Briefing</h4>
          <Textarea value={briefing} onChange={(e) => setBriefing(e.target.value)} className="min-h-[80px] border-white/10 bg-white/5" aria-label="Briefing do episódio" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Duração">
            {LENGTHS.map((l) => (
              <button
                key={l.key}
                type="button"
                role="radio"
                aria-checked={length === l.key}
                onClick={() => setLength(l.key)}
                className={cn('rounded-lg px-3 py-1.5 text-xs transition', length === l.key ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white')}
              >
                {l.label} <span className="opacity-60">{l.hint}</span>
              </button>
            ))}
          </div>
          <Button onClick={generate} disabled={loading} className="bg-gradient-to-r from-amber-400 to-rose-500 text-white hover:opacity-90">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic2 className="mr-2 h-4 w-4" />}
            {loading ? 'Escrevendo o roteiro…' : `Gerar · ${creditsLabel(cost)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Player ─────────────────────────────────────────────────────────────────

export function PodcastPlayer({ episode, update }: { episode: PodcastEpisode; update?: UpdateWorkspace }) {
  const voices = useVoices();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const playingRef = useRef(false);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

  const speakerIndex = useMemo(() => new Map(episode.speakers.map((s, i) => [s.name, i])), [episode.speakers]);

  const voiceFor = useCallback(
    (name: string): { voice?: SpeechSynthesisVoice; pitch: number } => {
      const i = speakerIndex.get(name) ?? 0;
      const chosen = episode.speakers[i]?.voiceURI;
      const byUri = chosen ? voices.find((v) => v.voiceURI === chosen) : undefined;
      if (byUri) return { voice: byUri, pitch: 1 };
      const pt = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
      const pool = pt.length ? pt : voices;
      // Sem vozes suficientes, muda o tom para diferenciar quem fala.
      return { voice: pool.length ? pool[i % pool.length] : undefined, pitch: pool.length > i ? 1 : [1, 0.8, 1.2, 0.95][i % 4] };
    },
    [episode.speakers, speakerIndex, voices],
  );

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  useEffect(() => stop, [stop, episode.id]);

  const speakFrom = useCallback(
    (index: number) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      if (index >= episode.lines.length) {
        stop();
        setCurrent(0);
        return;
      }
      const line = episode.lines[index];
      const u = new SpeechSynthesisUtterance(line.text);
      const { voice, pitch } = voiceFor(line.speaker);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'pt-BR';
      u.pitch = pitch;
      u.rate = rate;
      u.onend = () => {
        if (playingRef.current) speakFrom(index + 1);
      };
      setCurrent(index);
      lineRefs.current[index]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      window.speechSynthesis.speak(u);
    },
    [episode.lines, rate, stop, supported, voiceFor],
  );

  const toggle = () => {
    if (playing) return stop();
    playingRef.current = true;
    setPlaying(true);
    speakFrom(current);
  };

  const jump = (i: number) => {
    const next = Math.max(0, Math.min(episode.lines.length - 1, i));
    setCurrent(next);
    if (playingRef.current) speakFrom(next);
  };

  const progress = episode.lines.length ? ((current + (playing ? 0.5 : 0)) / episode.lines.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex -space-x-2">
            {episode.speakers.map((s, i) => (
              <span key={s.name} className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ring-2 ring-slate-950', SPEAKER_COLORS[i % 4])}>
                {s.name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{episode.title}</p>
            <p className="text-xs text-slate-400">
              {episode.speakers.map((s) => s.name).join(', ')} · {episode.lines.length} falas
            </p>
          </div>
        </div>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => jump(current - 1)} aria-label="Fala anterior" className="text-slate-300">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={toggle}
              disabled={!supported}
              aria-label={playing ? 'Pausar' : 'Ouvir'}
              className="h-12 w-12 rounded-full bg-white text-slate-950 shadow-lg hover:bg-amber-100"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => jump(current + 1)} aria-label="Próxima fala" className="text-slate-300">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={rate}
              onChange={(e) => {
                setRate(Number(e.target.value));
                if (playingRef.current) stop();
              }}
              aria-label="Velocidade"
              className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              {[0.8, 1, 1.15, 1.3, 1.5].map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" className="h-8 gap-1 text-xs" onClick={() => downloadText(`${safeFileName(episode.title)}.md`, podcastToMarkdown(episode))}>
              <Download className="h-3.5 w-3.5" /> Roteiro
            </Button>
            {update && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-slate-400"
                aria-label="Excluir episódio"
                onClick={() => {
                  if (!window.confirm('Excluir este episódio?')) return;
                  stop();
                  update((ws) => ({ ...ws, episodes: ws.episodes.filter((e) => e.id !== episode.id) }));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {!supported && <p className="relative mt-3 text-xs text-amber-200">Este navegador não narra texto. Baixe o roteiro para usar em outro app de voz.</p>}
      </div>

      <ol className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {episode.lines.map((l, i) => {
          const si = speakerIndex.get(l.speaker) ?? 0;
          return (
            <li key={i} ref={(el) => { lineRefs.current[i] = el; }}>
              <button
                type="button"
                onClick={() => jump(i)}
                className={cn(
                  'flex w-full gap-3 rounded-2xl px-3 py-2 text-left transition',
                  i === current ? 'bg-white/10 ring-1 ring-amber-300/40' : 'hover:bg-white/[0.04]',
                )}
              >
                <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white', SPEAKER_COLORS[si % 4])}>
                  {l.speaker.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-300">{l.speaker}</span>
                  <span className={cn('block text-sm leading-relaxed', i === current ? 'text-white' : 'text-slate-400')}>{l.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
