import { useState, type ReactNode } from 'react';
import {
  BookMarked,
  Brain,
  CalendarRange,
  Download,
  GitBranch,
  Layers3,
  ListChecks,
  Loader2,
  Mic2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  STUDY_LABELS,
  makeNote,
  newId,
  nowIso,
  studyTitle,
  studyToMarkdown,
  type ContextItem,
  type Note,
  type Notebook,
  type PodcastEpisode,
  type StudyItem,
  type StudyKind,
} from '@/lib/notebook/model';
import { NOTEBOOK_AI_COSTS, runNotebookAi } from '@/services/notebookAiService';
import { NotebookMarkdown } from './NotebookMarkdown';
import { downloadText, safeFileName } from '@/lib/notebook/download';
import { GeneratePodcastDialog, PodcastPlayer } from './PodcastStudio';
import { StudyViewer } from './StudyViewer';
import type { UpdateWorkspace } from './useNotebookWorkspace';

const STUDY_TOOLS: Array<{ kind: StudyKind; icon: ReactNode; gradient: string; hint: string }> = [
  { kind: 'flashcards', icon: <Layers3 className="h-4 w-4" />, gradient: 'from-violet-500 to-fuchsia-500', hint: 'Cartões para memorizar' },
  { kind: 'quiz', icon: <ListChecks className="h-4 w-4" />, gradient: 'from-emerald-400 to-teal-600', hint: 'Teste com correção' },
  { kind: 'mindmap', icon: <GitBranch className="h-4 w-4" />, gradient: 'from-sky-400 to-indigo-500', hint: 'Mapa das ideias' },
  { kind: 'timeline', icon: <CalendarRange className="h-4 w-4" />, gradient: 'from-rose-400 to-orange-500', hint: 'Fatos em ordem' },
];

type Viewing = { type: 'study'; id: string } | { type: 'episode'; id: string } | { type: 'note'; id: string | null } | null;

interface Props {
  notebook: Notebook;
  notes: Note[];
  studies: StudyItem[];
  episodes: PodcastEpisode[];
  context: ContextItem[];
  titles: Record<string, string>;
  update: UpdateWorkspace;
  onCite: (id: string) => void;
  /** Nota aberta de fora (ex.: clique numa citação). */
  openNoteId?: string | null;
  onNoteOpened?: () => void;
}

export function StudioPanel({ notebook, notes, studies, episodes, context, titles, update, onCite, openNoteId, onNoteOpened }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [podcastOpen, setPodcastOpen] = useState(false);
  const [viewing, setViewing] = useState<Viewing>(null);

  const effectiveViewing: Viewing = openNoteId ? { type: 'note', id: openNoteId } : viewing;
  const close = () => {
    setViewing(null);
    onNoteOpened?.();
  };

  const needContext = () => {
    if (context.length > 0) return false;
    toast.error('Coloque ao menos uma fonte ou nota no contexto.');
    return true;
  };

  const generateGuide = async () => {
    if (needContext()) return;
    setBusy('guide');
    try {
      const out = await runNotebookAi({ action: 'guide', notebook: { name: notebook.name, description: notebook.description }, context });
      update((ws) => ({ ...ws, notebooks: ws.notebooks.map((n) => (n.id === notebook.id ? { ...n, guide: { ...out, createdAt: nowIso() } } : n)) }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generateStudy = async (kind: StudyKind) => {
    if (needContext()) return;
    setBusy(kind);
    try {
      const output = await runNotebookAi({ action: 'study', study: kind, notebook: { name: notebook.name, description: notebook.description }, context });
      const item: StudyItem = { id: newId('st'), notebookId: notebook.id, title: studyTitle(kind, notebook.name), output, createdAt: nowIso() };
      update((ws) => ({ ...ws, studies: [item, ...ws.studies] }));
      setViewing({ type: 'study', id: item.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleNoteContext = (n: Note) =>
    update((ws) => ({ ...ws, notes: ws.notes.map((x) => (x.id === n.id ? { ...x, inContext: !x.inContext } : x)) }));

  const guide = notebook.guide;
  const study = effectiveViewing?.type === 'study' ? studies.find((s) => s.id === effectiveViewing.id) : undefined;
  const episode = effectiveViewing?.type === 'episode' ? episodes.find((e) => e.id === effectiveViewing.id) : undefined;
  const outputs = [
    ...studies.map((s) => ({ type: 'study' as const, id: s.id, title: s.title, createdAt: s.createdAt, kind: s.output.kind as string })),
    ...episodes.map((e) => ({ type: 'episode' as const, id: e.id, title: e.title, createdAt: e.createdAt, kind: 'podcast' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section aria-label="Estúdio" className="flex h-full min-h-0 flex-col">
      <header className="px-4 pb-3 pt-4">
        <h3 className="text-sm font-semibold text-white">Estúdio</h3>
        <p className="text-xs text-slate-400">Guia, estudo, podcast e notas</p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {/* Guia do caderno */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-white/[0.02] to-rose-500/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-100">
              <BookMarked className="h-4 w-4" /> Guia do caderno
            </p>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-amber-100" onClick={generateGuide} disabled={busy === 'guide'}>
              {busy === 'guide' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : guide ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {guide ? 'Atualizar' : `Gerar · ${NOTEBOOK_AI_COSTS.guide}`}
            </Button>
          </div>
          {guide ? (
            <div className="mt-3 space-y-3">
              <NotebookMarkdown text={guide.summary} titles={titles} onCite={onCite} className="text-[13px]" />
              {guide.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {guide.topics.map((t) => (
                    <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Resumo de tudo, temas principais e perguntas sugeridas para o chat.</p>
          )}
        </div>

        {/* Ferramentas */}
        <div>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Criar</p>
          <button
            type="button"
            onClick={() => (needContext() ? null : setPodcastOpen(true))}
            className="group mb-2 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 to-slate-900/40 p-3 text-left transition hover:border-amber-300/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg shadow-rose-500/20 transition group-hover:scale-105">
              <Mic2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">Podcast com IA</span>
              <span className="block text-xs text-slate-400">1 a 4 vozes · {NOTEBOOK_AI_COSTS.podcast} créditos</span>
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            {STUDY_TOOLS.map((t) => (
              <button
                key={t.kind}
                type="button"
                disabled={!!busy}
                onClick={() => generateStudy(t.kind)}
                className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white', t.gradient)}>
                  {busy === t.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : t.icon}
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{STUDY_LABELS[t.kind]}</span>
                  <span className="block text-[11px] text-slate-500">
                    {t.hint} · {NOTEBOOK_AI_COSTS.study}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Gerados */}
        {outputs.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gerados</p>
            <ul className="space-y-1.5">
              {outputs.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setViewing({ type: o.type, id: o.id })}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                  >
                    {o.type === 'episode' ? <Mic2 className="h-4 w-4 text-amber-300" /> : <Brain className="h-4 w-4 text-violet-300" />}
                    <span className="truncate">{o.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notas */}
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notas ({notes.length})</p>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setViewing({ type: 'note', id: null })}>
              <Plus className="h-3.5 w-3.5" /> Nota
            </Button>
          </div>
          {notes.length === 0 && <p className="rounded-xl bg-white/[0.03] p-3 text-xs text-slate-500">Escreva suas notas ou salve respostas do chat aqui.</p>}
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start gap-2">
                  {n.origin === 'ai' ? <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" /> : <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />}
                  <button type="button" onClick={() => setViewing({ type: 'note', id: n.id })} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-slate-100">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{n.content.replace(/[#*_`>[\]]/g, '')}</p>
                  </button>
                </div>
                <label className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  Usar no contexto
                  <Switch checked={n.inContext} onCheckedChange={() => toggleNoteContext(n)} aria-label={`Usar ${n.title} no contexto`} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <GeneratePodcastDialog
        open={podcastOpen}
        onOpenChange={setPodcastOpen}
        notebook={notebook}
        context={context}
        update={update}
        onCreated={(id) => setViewing({ type: 'episode', id })}
      />

      {study && (
        <Dialog open onOpenChange={(v) => !v && close()}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-white">{study.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-slate-400">
                {STUDY_LABELS[study.output.kind]} gerado de {context.length} item(ns) do contexto
              </DialogDescription>
            </DialogHeader>
            <StudyViewer output={study.output} />
            <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
              <Button size="sm" variant="secondary" className="gap-1" onClick={() => downloadText(`${safeFileName(study.title)}.md`, studyToMarkdown(study))}>
                <Download className="h-3.5 w-3.5" /> Baixar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-rose-300"
                onClick={() => {
                  update((ws) => ({ ...ws, studies: ws.studies.filter((s) => s.id !== study.id) }));
                  close();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {episode && (
        <Dialog open onOpenChange={(v) => !v && close()}>
          <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="text-white">Podcast</DialogTitle>
              <DialogDescription className="text-slate-400">Narrado no seu navegador. Toque numa fala para pular até ela.</DialogDescription>
            </DialogHeader>
            <PodcastPlayer
              episode={episode}
              update={(fn) => {
                update(fn);
                close();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {effectiveViewing?.type === 'note' && (
        <NoteEditor
          key={effectiveViewing.id ?? 'new'}
          note={effectiveViewing.id ? notes.find((n) => n.id === effectiveViewing.id) ?? null : null}
          notebookId={notebook.id}
          titles={titles}
          update={update}
          onCite={onCite}
          onClose={close}
        />
      )}
    </section>
  );
}

function NoteEditor({
  note,
  notebookId,
  titles,
  update,
  onCite,
  onClose,
}: {
  note: Note | null;
  notebookId: string;
  titles: Record<string, string>;
  update: UpdateWorkspace;
  onCite: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!note || note.origin === 'human');
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');

  const save = () => {
    if (!content.trim()) return toast.error('A nota está vazia.');
    if (note) {
      update((ws) => ({ ...ws, notes: ws.notes.map((n) => (n.id === note.id ? { ...n, title: title.trim() || n.title, content, updatedAt: nowIso() } : n)) }));
    } else {
      const created = makeNote(notebookId, title || content.split('\n')[0].slice(0, 60), content, 'human');
      update((ws) => ({ ...ws, notes: [created, ...ws.notes] }));
    }
    onClose();
  };

  const remove = () => {
    if (!note || !window.confirm('Excluir esta nota?')) return;
    update((ws) => ({ ...ws, notes: ws.notes.filter((n) => n.id !== note.id) }));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-white">{note ? 'Nota' : 'Nova nota'}</DialogTitle>
          <DialogDescription className="text-slate-400">Markdown funciona: **negrito**, listas com -, títulos com #.</DialogDescription>
        </DialogHeader>
        {editing ? (
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título da nota" className="border-white/10 bg-white/5" />
            <Textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escreva aqui…"
              aria-label="Conteúdo da nota"
              className="min-h-[260px] border-white/10 bg-white/5 font-mono text-sm"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h4 className="mb-2 font-semibold text-white">{note?.title}</h4>
            <NotebookMarkdown text={content} titles={titles} onCite={onCite} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <div>
            {note && (
              <Button size="sm" variant="ghost" className="gap-1 text-rose-300" onClick={remove}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!editing && (
              <Button size="sm" variant="secondary" className="gap-1" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
            {editing && (
              <Button size="sm" onClick={save} className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                Salvar nota
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
