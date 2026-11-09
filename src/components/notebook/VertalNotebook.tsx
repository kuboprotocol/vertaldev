import { useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Brain,
  Cloud,
  FileStack,
  Loader2,
  Mic2,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  NOTEBOOK_COLORS,
  NOTEBOOK_EMOJIS,
  contextFromHits,
  makeNotebook,
  makeTransformation,
  nowIso,
  searchWorkspace,
  type Notebook,
  type Transformation,
  type Workspace,
} from '@/lib/notebook/model';
import { NOTEBOOK_AI_COSTS, runNotebookAi } from '@/services/notebookAiService';
import { NotebookMarkdown } from './NotebookMarkdown';
import { NotebookWorkspace } from './NotebookWorkspace';
import { PodcastPlayer } from './PodcastStudio';
import { useNotebookWorkspace, type UpdateWorkspace } from './useNotebookWorkspace';

type Page = 'notebooks' | 'ask' | 'podcasts' | 'transformations';

const PAGES: Array<{ key: Page; label: string; icon: ReactNode }> = [
  { key: 'notebooks', label: 'Cadernos', icon: <BookOpen className="h-4 w-4" /> },
  { key: 'ask', label: 'Pergunte', icon: <Search className="h-4 w-4" /> },
  { key: 'podcasts', label: 'Podcasts', icon: <Mic2 className="h-4 w-4" /> },
  { key: 'transformations', label: 'Transformações', icon: <Wand2 className="h-4 w-4" /> },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} d` : new Date(iso).toLocaleDateString('pt-BR');
}

/** Vertal Notebook: a versão Vertal do Open Notebook (alternativa aberta ao Google NotebookLM). */
export function VertalNotebook() {
  const { ws, ready, saving, update } = useNotebookWorkspace();
  const [page, setPage] = useState<Page>('notebooks');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = ws.notebooks.find((n) => n.id === openId) ?? null;

  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-amber-300" aria-label="Carregando cadernos" />
      </div>
    );
  }

  return (
    <div className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#07080d] p-4 text-slate-100 sm:p-6">
      {/* Fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute -right-24 top-24 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-rose-500/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      </div>

      {open ? (
        <NotebookWorkspace key={open.id} notebook={open} ws={ws} update={update} onBack={() => setOpenId(null)} />
      ) : (
        <div className="space-y-8">
          <Hero ws={ws} saving={saving} />
          <nav aria-label="Seções do Notebook" className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            {PAGES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPage(p.key)}
                aria-current={page === p.key ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                  page === p.key ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                )}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </nav>
          {page === 'notebooks' && <NotebooksPage ws={ws} update={update} onOpen={setOpenId} />}
          {page === 'ask' && <AskPage ws={ws} onOpen={setOpenId} />}
          {page === 'podcasts' && <PodcastsPage ws={ws} update={update} onOpen={setOpenId} />}
          {page === 'transformations' && <TransformationsPage ws={ws} update={update} />}
        </div>
      )}
    </div>
  );
}

function Hero({ ws, saving }: { ws: Workspace; saving: boolean }) {
  const stats = [
    { label: 'Cadernos', value: ws.notebooks.filter((n) => !n.archived).length },
    { label: 'Fontes', value: ws.sources.length },
    { label: 'Notas', value: ws.notes.length },
    { label: 'Podcasts', value: ws.episodes.length },
  ];
  return (
    <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-200">
          <Sparkles className="h-3.5 w-3.5" /> KUBO IA · Pesquisa e estudo
        </div>
        <h2 className="mt-4 font-['Unbounded'] text-3xl font-bold leading-tight text-white sm:text-4xl">
          Vertal{' '}
          <span className="bg-gradient-to-r from-amber-200 via-orange-400 to-rose-500 bg-clip-text text-transparent">Notebook</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
          Junte PDFs, links, vídeos e anotações. Converse com tudo com citações, gere podcasts com até 4 vozes, flashcards, quiz e mapas mentais.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Fontes salvas no seu aparelho
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
            <Cloud className={cn('h-3.5 w-3.5', saving ? 'animate-pulse text-amber-300' : 'text-sky-300')} /> {saving ? 'Salvando…' : 'Tudo salvo'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
            <Brain className="h-3.5 w-3.5 text-violet-300" /> Baseado no Open Notebook (MIT)
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center backdrop-blur">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-white">{s.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

// ─── Cadernos ───────────────────────────────────────────────────────────────

function NotebooksPage({ ws, update, onOpen }: { ws: Workspace; update: UpdateWorkspace; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, { sources: number; notes: number }> = {};
    ws.sources.forEach((s) => ((c[s.notebookId] ??= { sources: 0, notes: 0 }).sources += 1));
    ws.notes.forEach((n) => ((c[n.notebookId] ??= { sources: 0, notes: 0 }).notes += 1));
    return c;
  }, [ws.sources, ws.notes]);

  const list = ws.notebooks
    .filter((n) => n.archived === showArchived)
    .filter((n) => !filter.trim() || `${n.name} ${n.description}`.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const archivedCount = ws.notebooks.filter((n) => n.archived).length;

  const setArchived = (n: Notebook, archived: boolean) =>
    update((w) => ({ ...w, notebooks: w.notebooks.map((x) => (x.id === n.id ? { ...x, archived, updatedAt: nowIso() } : x)) }));

  const remove = (n: Notebook) => {
    if (!window.confirm(`Excluir "${n.name}" com todas as fontes, notas, conversas e podcasts?`)) return;
    update((w) => ({
      ...w,
      notebooks: w.notebooks.filter((x) => x.id !== n.id),
      sources: w.sources.filter((x) => x.notebookId !== n.id),
      notes: w.notes.filter((x) => x.notebookId !== n.id),
      chats: w.chats.filter((x) => x.notebookId !== n.id),
      episodes: w.episodes.filter((x) => x.notebookId !== n.id),
      studies: w.studies.filter((x) => x.notebookId !== n.id),
    }));
  };

  return (
    <section aria-label="Cadernos" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar cadernos" aria-label="Filtrar cadernos" className="border-white/10 bg-white/5 pl-9" />
        </div>
        {archivedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)} className="gap-1 text-slate-300">
            {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? 'Ver ativos' : `Arquivados (${archivedCount})`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!showArchived && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="group relative flex min-h-[176px] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition hover:border-amber-300/60 hover:bg-amber-400/5"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/25 transition duration-300 group-hover:scale-110 group-hover:rotate-3">
              <Plus className="h-7 w-7" />
            </span>
            <span className="text-base font-semibold text-white">Novo caderno</span>
            <span className="text-xs text-slate-400">Um projeto de pesquisa, curso ou ideia</span>
          </button>
        )}
        {list.map((n) => {
          const c = counts[n.id] ?? { sources: 0, notes: 0 };
          return (
            <article
              key={n.id}
              className="group relative flex min-h-[176px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-2xl hover:shadow-black/40"
            >
              <div className={cn('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl transition group-hover:opacity-50', NOTEBOOK_COLORS[n.color % NOTEBOOK_COLORS.length])} />
              <div className="relative flex items-start justify-between gap-2">
                <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl shadow-lg', NOTEBOOK_COLORS[n.color % NOTEBOOK_COLORS.length])}>{n.emoji}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" aria-label={`Ações de ${n.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setArchived(n, !n.archived)}>
                      {n.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                      {n.archived ? 'Desarquivar' : 'Arquivar'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => remove(n)} className="text-rose-300 focus:text-rose-200">
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <button type="button" onClick={() => onOpen(n.id)} className="relative mt-4 flex flex-1 flex-col text-left">
                <h3 className="line-clamp-1 text-lg font-semibold text-white">{n.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{n.description || 'Sem descrição'}</p>
                <p className="mt-auto flex items-center gap-3 pt-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <FileStack className="h-3.5 w-3.5" /> {c.sources} fonte{c.sources === 1 ? '' : 's'}
                  </span>
                  <span>{c.notes} nota{c.notes === 1 ? '' : 's'}</span>
                  <span className="ml-auto">{timeAgo(n.updatedAt)}</span>
                </p>
              </button>
            </article>
          );
        })}
      </div>

      {list.length === 0 && showArchived && <p className="text-center text-sm text-slate-500">Nenhum caderno arquivado.</p>}

      <CreateNotebookDialog
        open={creating}
        onOpenChange={setCreating}
        index={ws.notebooks.length}
        onCreate={(nb) => {
          update((w) => ({ ...w, notebooks: [nb, ...w.notebooks] }));
          onOpen(nb.id);
        }}
      />
    </section>
  );
}

function CreateNotebookDialog({
  open,
  onOpenChange,
  index,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  index: number;
  onCreate: (nb: Notebook) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState(NOTEBOOK_EMOJIS[index % NOTEBOOK_EMOJIS.length]);
  const [color, setColor] = useState(index % NOTEBOOK_COLORS.length);

  const submit = () => {
    if (!name.trim()) return toast.error('Dê um nome ao caderno.');
    const nb = { ...makeNotebook(name, description, index), emoji, color };
    onCreate(nb);
    setName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-white">Novo caderno</DialogTitle>
          <DialogDescription className="text-slate-400">A descrição ajuda a IA a entender o objetivo da pesquisa.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-3">
            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg', NOTEBOOK_COLORS[color])}>{emoji}</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Tokenomics do Vibe Bank" aria-label="Nome do caderno" className="border-white/10 bg-white/5" />
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Objetivo, público, perguntas que quer responder…" aria-label="Descrição do caderno" className="min-h-[80px] border-white/10 bg-white/5" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ícone">
            {NOTEBOOK_EMOJIS.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={emoji === e} onClick={() => setEmoji(e)} className={cn('flex h-9 w-9 items-center justify-center rounded-xl text-lg transition', emoji === e ? 'bg-white/15 ring-1 ring-amber-300/60' : 'bg-white/5 hover:bg-white/10')}>
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Cor">
            {NOTEBOOK_COLORS.map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={color === i} aria-label={`Cor ${i + 1}`} onClick={() => setColor(i)} className={cn('h-7 w-7 rounded-full bg-gradient-to-br transition', c, color === i ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'opacity-70 hover:opacity-100')} />
            ))}
          </div>
          <Button type="submit" className="w-full bg-gradient-to-r from-amber-400 to-rose-500 text-white hover:opacity-90">
            Criar caderno
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pergunte (busca + IA em todos os cadernos) ─────────────────────────────

function AskPage({ ws, onOpen }: { ws: Workspace; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const hits = useMemo(() => searchWorkspace(ws, submitted), [ws, submitted]);
  const nbName = (id: string) => ws.notebooks.find((n) => n.id === id)?.name ?? 'Caderno';
  const titles = useMemo(() => {
    const t: Record<string, string> = {};
    ws.sources.forEach((s) => (t[`source:${s.id}`] = s.title));
    ws.notes.forEach((n) => (t[`note:${n.id}`] = n.title));
    return t;
  }, [ws.sources, ws.notes]);

  const ask = async () => {
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
    const context = contextFromHits(ws, searchWorkspace(ws, q));
    if (context.length === 0) {
      setAnswer(null);
      return toast.error('Nada encontrado nas suas fontes para essa pergunta. Tente outras palavras.');
    }
    setAsking(true);
    try {
      const out = await runNotebookAi({ action: 'chat', notebook: { name: 'Todos os cadernos' }, context, messages: [{ role: 'user', content: q }] });
      setAnswer(out.answer);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  const openCited = (id: string) => {
    const [type, raw] = id.split(':');
    const nbId = type === 'source' ? ws.sources.find((s) => s.id === raw)?.notebookId : ws.notes.find((n) => n.id === raw)?.notebookId;
    if (nbId) onOpen(nbId);
  };

  return (
    <section aria-label="Pergunte" className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
          setAnswer(null);
        }}
        className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque ou pergunte em todos os seus cadernos"
            aria-label="Busca em todos os cadernos"
            className="h-12 w-full rounded-2xl bg-transparent pl-12 pr-4 text-white outline-none placeholder:text-slate-500"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-12 rounded-2xl">
          Buscar
        </Button>
        <Button type="button" onClick={ask} disabled={asking || !query.trim()} className="h-12 gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 text-white hover:opacity-90">
          {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Perguntar à IA · {NOTEBOOK_AI_COSTS.chat}
        </Button>
      </form>

      {answer && (
        <article className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-transparent to-violet-500/10 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-100">
            <Sparkles className="h-4 w-4" /> Resposta da KUBO IA
          </p>
          <NotebookMarkdown text={answer} titles={titles} onCite={openCited} />
        </article>
      )}

      {submitted && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {hits.length} resultado{hits.length === 1 ? '' : 's'} para “{submitted}”
          </p>
          {hits.map((h) => (
            <button
              key={`${h.type}:${h.id}`}
              type="button"
              onClick={() => onOpen(h.notebookId)}
              className="block w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/25 hover:bg-white/[0.06]"
            >
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                <span className={cn('rounded-full px-2 py-0.5', h.type === 'note' ? 'bg-sky-400/10 text-sky-300' : h.type === 'insight' ? 'bg-violet-400/10 text-violet-300' : 'bg-amber-400/10 text-amber-300')}>
                  {h.type === 'note' ? 'Nota' : h.type === 'insight' ? 'Insight' : 'Fonte'}
                </span>
                {nbName(h.notebookId)}
              </p>
              <p className="mt-1.5 font-medium text-white">{h.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{h.snippet}</p>
            </button>
          ))}
        </div>
      )}

      {!submitted && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: 'Busca sem acento', d: 'Encontra “informação” buscando “informacao”, em fontes, insights e notas.' },
            { t: 'Pergunte a tudo', d: 'A IA lê os trechos mais relevantes de todos os cadernos e cita cada um.' },
            { t: 'Vá direto ao ponto', d: 'Clique num resultado ou numa citação para abrir o caderno.' },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm font-semibold text-white">{x.t}</p>
              <p className="mt-1 text-xs text-slate-400">{x.d}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Podcasts ───────────────────────────────────────────────────────────────

function PodcastsPage({ ws, update, onOpen }: { ws: Workspace; update: UpdateWorkspace; onOpen: (id: string) => void }) {
  const [playing, setPlaying] = useState<string | null>(ws.episodes[0]?.id ?? null);
  const ep = ws.episodes.find((e) => e.id === playing);
  if (ws.episodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/15 py-16 text-center">
        <Mic2 className="h-10 w-10 text-amber-300" />
        <p className="font-semibold text-white">Nenhum podcast ainda</p>
        <p className="max-w-sm text-sm text-slate-400">Abra um caderno e use “Podcast com IA” no Estúdio para transformar suas fontes num episódio com até 4 vozes.</p>
      </div>
    );
  }
  return (
    <section aria-label="Podcasts" className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <ul className="space-y-2">
        {ws.episodes.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setPlaying(e.id)}
              className={cn('w-full rounded-2xl border p-3 text-left transition', e.id === playing ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25')}
            >
              <p className="line-clamp-2 text-sm font-medium text-white">{e.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {ws.notebooks.find((n) => n.id === e.notebookId)?.name ?? 'Caderno'} · {e.speakers.length} voz{e.speakers.length > 1 ? 'es' : ''} · {timeAgo(e.createdAt)}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {ep && (
        <div className="space-y-2">
          <PodcastPlayer key={ep.id} episode={ep} update={update} />
          <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => onOpen(ep.notebookId)}>
            Abrir caderno do episódio
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── Transformações ─────────────────────────────────────────────────────────

function TransformationsPage({ ws, update }: { ws: Workspace; update: UpdateWorkspace }) {
  const [editing, setEditing] = useState<Transformation | 'new' | null>(null);
  const setAuto = (t: Transformation, autoApply: boolean) =>
    update((w) => ({ ...w, transformations: w.transformations.map((x) => (x.id === t.id ? { ...x, autoApply } : x)) }));
  const remove = (t: Transformation) => update((w) => ({ ...w, transformations: w.transformations.filter((x) => x.id !== t.id) }));

  return (
    <section aria-label="Transformações" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Transformações são prompts reutilizáveis que viram insights em cada fonte ({NOTEBOOK_AI_COSTS.transform} crédito por uso). As marcadas como automáticas rodam ao adicionar uma fonte.
        </p>
        <Button onClick={() => setEditing('new')} className="gap-1 bg-amber-400 text-slate-950 hover:bg-amber-300">
          <Plus className="h-4 w-4" /> Nova transformação
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ws.transformations.map((t) => (
          <article key={t.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-amber-400 text-white">
                <Wand2 className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">{t.builtin ? 'Embutida' : 'Sua'}</span>
            </div>
            <h3 className="mt-3 font-semibold text-white">{t.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{t.description}</p>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <Switch checked={t.autoApply} onCheckedChange={(v) => setAuto(t, v)} aria-label={`Aplicar ${t.name} automaticamente`} /> Automática
              </label>
              {!t.builtin && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(t)}>
                    Editar
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" aria-label={`Excluir ${t.name}`} onClick={() => remove(t)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <TransformationEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            update((w) => ({
              ...w,
              transformations: w.transformations.some((x) => x.id === t.id) ? w.transformations.map((x) => (x.id === t.id ? t : x)) : [...w.transformations, t],
            }));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function TransformationEditor({ initial, onClose, onSave }: { initial: Transformation | null; onClose: () => void; onSave: (t: Transformation) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const save = () => {
    if (!name.trim() || prompt.trim().length < 10) return toast.error('Dê um nome e escreva o prompt (mín. 10 caracteres).');
    const base = { name: name.trim(), title: name.trim(), description: description.trim(), prompt: prompt.trim() };
    onSave(initial ? { ...initial, ...base } : makeTransformation(base));
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-white">{initial ? 'Editar transformação' : 'Nova transformação'}</DialogTitle>
          <DialogDescription className="text-slate-400">Escreva como pediria a um assistente. O material da fonte é anexado automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Pitch para investidores)" aria-label="Nome da transformação" className="border-white/10 bg-white/5" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição curta" aria-label="Descrição da transformação" className="border-white/10 bg-white/5" />
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Transforme o material em…" aria-label="Prompt da transformação" className="min-h-[160px] border-white/10 bg-white/5" />
          <Button onClick={save} className="w-full bg-amber-400 text-slate-950 hover:bg-amber-300">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
