import { useMemo, useState } from 'react';
import { ArrowLeft, Check, FileStack, MessageSquareText, Pencil, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { NOTEBOOK_COLORS, buildContext, nowIso, type Notebook, type Workspace } from '@/lib/notebook/model';
import { ChatPanel } from './ChatPanel';
import { SourceViewer, SourcesPanel } from './SourcesPanel';
import { StudioPanel } from './StudioPanel';
import type { UpdateWorkspace } from './useNotebookWorkspace';

type MobileTab = 'sources' | 'chat' | 'studio';

export function NotebookWorkspace({
  notebook,
  ws,
  update,
  onBack,
}: {
  notebook: Notebook;
  ws: Workspace;
  update: UpdateWorkspace;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<MobileTab>('chat');
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(notebook.name);
  const [description, setDescription] = useState(notebook.description);

  const sources = useMemo(() => ws.sources.filter((s) => s.notebookId === notebook.id), [ws.sources, notebook.id]);
  const notes = useMemo(() => ws.notes.filter((n) => n.notebookId === notebook.id), [ws.notes, notebook.id]);
  const chats = useMemo(() => ws.chats.filter((c) => c.notebookId === notebook.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [ws.chats, notebook.id]);
  const studies = useMemo(() => ws.studies.filter((s) => s.notebookId === notebook.id), [ws.studies, notebook.id]);
  const episodes = useMemo(() => ws.episodes.filter((e) => e.notebookId === notebook.id), [ws.episodes, notebook.id]);
  const context = useMemo(() => buildContext(sources, notes), [sources, notes]);
  const titles = useMemo(() => {
    const t: Record<string, string> = {};
    sources.forEach((s) => (t[`source:${s.id}`] = s.title));
    notes.forEach((n) => (t[`note:${n.id}`] = n.title));
    return t;
  }, [sources, notes]);

  const onCite = (id: string) => {
    const [type, raw] = id.split(':');
    if (type === 'source') {
      if (sources.some((s) => s.id === raw)) setOpenSource(raw);
      else toast.error('Essa fonte foi excluída.');
    } else if (notes.some((n) => n.id === raw)) {
      setOpenNote(raw);
      setTab('studio');
    } else toast.error('Essa nota foi excluída.');
  };

  const saveMeta = () => {
    update((w) => ({
      ...w,
      notebooks: w.notebooks.map((n) => (n.id === notebook.id ? { ...n, name: name.trim() || n.name, description: description.trim(), updatedAt: nowIso() } : n)),
    }));
    setEditing(false);
  };

  const tabs: Array<{ key: MobileTab; label: string; icon: JSX.Element; count?: number }> = [
    { key: 'sources', label: 'Fontes', icon: <FileStack className="h-4 w-4" />, count: sources.length },
    { key: 'chat', label: 'Chat', icon: <MessageSquareText className="h-4 w-4" /> },
    { key: 'studio', label: 'Estúdio', icon: <Sparkles className="h-4 w-4" /> },
  ];

  const panel = 'min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl';

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="Voltar aos cadernos" className="text-slate-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl shadow-lg', NOTEBOOK_COLORS[notebook.color % NOTEBOOK_COLORS.length])}>
          {notebook.emoji}
        </span>
        {editing ? (
          <form
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveMeta();
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do caderno" className="h-9 max-w-xs border-white/10 bg-white/5" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (ajuda a IA a entender o objetivo)" aria-label="Descrição do caderno" className="h-9 min-w-[200px] flex-1 border-white/10 bg-white/5" />
            <Button type="submit" size="sm" className="bg-amber-400 text-slate-950 hover:bg-amber-300">
              <Check className="mr-1 h-4 w-4" /> Salvar
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 truncate font-['Unbounded'] text-lg font-bold text-white sm:text-xl">
              {notebook.name}
              <button type="button" onClick={() => setEditing(true)} aria-label="Editar caderno" className="rounded p-1 text-slate-500 hover:text-white">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </h2>
            <p className="truncate text-xs text-slate-400">{notebook.description || 'Sem descrição · clique no lápis para descrever o objetivo deste caderno'}</p>
          </div>
        )}
      </header>

      {/* Celular: uma coluna por vez */}
      <div role="tablist" aria-label="Seções do caderno" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1 lg:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm transition', tab === t.key ? 'bg-white text-slate-950 shadow' : 'text-slate-300')}
          >
            {t.icon} {t.label}
            {t.count ? <span className="text-xs opacity-60">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid min-h-[70vh] gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[560px] lg:grid-cols-[minmax(240px,300px)_1fr_minmax(260px,320px)] lg:grid-rows-[minmax(0,1fr)]">
        <div className={cn(panel, tab !== 'sources' && 'hidden lg:block')}>
          <SourcesPanel notebook={notebook} sources={sources} transformations={ws.transformations} update={update} onOpenSource={setOpenSource} />
        </div>
        <div className={cn(panel, 'min-h-[70vh] lg:min-h-0', tab !== 'chat' && 'hidden lg:block')}>
          <ChatPanel notebook={notebook} chats={chats} context={context} titles={titles} update={update} onCite={onCite} />
        </div>
        <div className={cn(panel, tab !== 'studio' && 'hidden lg:block')}>
          <StudioPanel
            notebook={notebook}
            notes={notes}
            studies={studies}
            episodes={episodes}
            context={context}
            titles={titles}
            update={update}
            onCite={onCite}
            openNoteId={openNote}
            onNoteOpened={() => setOpenNote(null)}
          />
        </div>
      </div>

      <SourceViewer
        key={openSource ?? 'none'}
        source={sources.find((s) => s.id === openSource) ?? null}
        notebook={notebook}
        transformations={ws.transformations}
        update={update}
        onClose={() => setOpenSource(null)}
      />
    </div>
  );
}
