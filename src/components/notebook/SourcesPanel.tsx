import { useRef, useState, type ReactNode } from 'react';
import {
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Globe,
  Link2,
  Loader2,
  MoreVertical,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  makeNote,
  makeSource,
  type ContextMode,
  type Insight,
  type Notebook,
  type Source,
  type SourceKind,
  type Transformation,
} from '@/lib/notebook/model';
import { FILE_ACCEPT, importSourceFile, importSourceText, importSourceUrl, isYoutubeUrl } from '@/lib/notebook/sourceImport';
import { runTransformation } from '@/lib/notebook/transform';
import { NOTEBOOK_AI_COSTS, creditsLabel, notebookAiCost } from '@/services/notebookAiService';
import { NotebookMarkdown } from './NotebookMarkdown';
import type { UpdateWorkspace } from './useNotebookWorkspace';

const MODE_INFO: Record<ContextMode, { label: string; hint: string; icon: ReactNode; cls: string }> = {
  full: { label: 'Completo', hint: 'O texto inteiro entra no contexto da IA', icon: <Eye className="h-3.5 w-3.5" />, cls: 'text-emerald-300 bg-emerald-400/10 ring-emerald-300/30' },
  insights: { label: 'Insights', hint: 'Só os insights (resumos) entram no contexto, mais barato e rápido', icon: <Brain className="h-3.5 w-3.5" />, cls: 'text-sky-300 bg-sky-400/10 ring-sky-300/30' },
  off: { label: 'Fora', hint: 'A IA não vê esta fonte', icon: <EyeOff className="h-3.5 w-3.5" />, cls: 'text-slate-400 bg-white/5 ring-white/10' },
};
const NEXT_MODE: Record<ContextMode, ContextMode> = { full: 'insights', insights: 'off', off: 'full' };

const KIND_ICON: Record<SourceKind, ReactNode> = {
  link: <Globe className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
  file: <FileText className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
};

interface PanelProps {
  notebook: Notebook;
  sources: Source[];
  transformations: Transformation[];
  update: UpdateWorkspace;
  onOpenSource: (id: string) => void;
}

export function SourcesPanel({ notebook, sources, transformations, update, onOpenSource }: PanelProps) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});

  const setMode = (id: string, mode: ContextMode) =>
    update((ws) => ({ ...ws, sources: ws.sources.map((s) => (s.id === id ? { ...s, contextMode: mode } : s)) }));
  const setAll = (mode: ContextMode) =>
    update((ws) => ({ ...ws, sources: ws.sources.map((s) => (s.notebookId === notebook.id ? { ...s, contextMode: mode } : s)) }));

  const remove = (s: Source) => {
    if (!window.confirm(`Excluir a fonte "${s.title}"?`)) return;
    update((ws) => ({ ...ws, sources: ws.sources.filter((x) => x.id !== s.id) }));
  };

  const apply = async (s: Source, t: Transformation) => {
    setBusy((b) => ({ ...b, [s.id]: t.name }));
    try {
      const insight = await runTransformation(s, t, notebook);
      update((ws) => ({ ...ws, sources: ws.sources.map((x) => (x.id === s.id ? { ...x, insights: [insight, ...x.insights] } : x)) }));
      toast.success(`${t.name} pronto`, { description: s.title });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy((b) => {
        const { [s.id]: _, ...rest } = b;
        return rest;
      });
    }
  };

  const onAdded = async (s: Source, autoApply: boolean) => {
    update((ws) => ({ ...ws, sources: [s, ...ws.sources] }));
    if (!autoApply) return;
    for (const t of transformations.filter((x) => x.autoApply)) await apply(s, t);
  };

  const inContext = sources.filter((s) => s.contextMode !== 'off').length;

  return (
    <section aria-label="Fontes" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Fontes</h3>
          <p className="text-xs text-slate-400">
            {sources.length === 0 ? 'Nenhuma ainda' : `${inContext} de ${sources.length} no contexto`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {sources.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300" aria-label="Contexto de todas as fontes">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Todas as fontes</DropdownMenuLabel>
                {(Object.keys(MODE_INFO) as ContextMode[]).map((m) => (
                  <DropdownMenuItem key={m} onClick={() => setAll(m)}>
                    {MODE_INFO[m].icon}
                    <span className="ml-2">{MODE_INFO[m].label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" onClick={() => setAdding(true)} className="h-8 gap-1 bg-amber-400 text-slate-950 hover:bg-amber-300">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {sources.length === 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center transition hover:border-amber-300/50 hover:bg-amber-400/5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg shadow-amber-500/20 transition group-hover:scale-105">
              <FileUp className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium text-white">Adicione sua primeira fonte</span>
            <span className="text-xs text-slate-400">PDF, Word, slides, planilhas, links, YouTube ou texto</span>
          </button>
        )}
        {sources.map((s) => {
          const info = MODE_INFO[s.contextMode];
          return (
            <article
              key={s.id}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300">{KIND_ICON[s.kind]}</span>
                <button type="button" onClick={() => onOpenSource(s.id)} className="min-w-0 flex-1 text-left">
                  <p className="line-clamp-2 text-sm font-medium text-slate-100 group-hover:text-white">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {Math.max(1, Math.round(s.content.length / 1000))}k caracteres
                    {s.insights.length > 0 && ` · ${s.insights.length} insight${s.insights.length > 1 ? 's' : ''}`}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-slate-400" aria-label={`Ações de ${s.title}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => onOpenSource(s.id)}>
                      <Eye className="mr-2 h-4 w-4" /> Abrir fonte
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Transformar · {creditsLabel(notebookAiCost({ action: 'transform', context: [{ id: `source:${s.id}`, title: s.title, content: s.content }] }))}</DropdownMenuLabel>
                    {transformations.map((t) => (
                      <DropdownMenuItem key={t.id} onClick={() => apply(s, t)} disabled={!!busy[s.id]}>
                        <Wand2 className="mr-2 h-4 w-4" /> {t.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => remove(s)} className="text-rose-300 focus:text-rose-200">
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMode(s.id, NEXT_MODE[s.contextMode])}
                  title={`${info.hint}. Clique para trocar.`}
                  aria-label={`Contexto: ${info.label}. Trocar`}
                  className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition', info.cls)}
                >
                  {info.icon} {info.label}
                </button>
                {busy[s.id] && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-200">
                    <Loader2 className="h-3 w-3 animate-spin" /> {busy[s.id]}…
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <AddSourceDialog
        open={adding}
        onOpenChange={setAdding}
        notebookId={notebook.id}
        autoTransformations={transformations.filter((t) => t.autoApply)}
        onAdded={onAdded}
      />
    </section>
  );
}

// ─── Adicionar fonte ────────────────────────────────────────────────────────

type AddTab = 'link' | 'file' | 'text';

function AddSourceDialog({
  open,
  onOpenChange,
  notebookId,
  autoTransformations,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notebookId: string;
  autoTransformations: Transformation[];
  onAdded: (s: Source, autoApply: boolean) => void;
}) {
  const [tab, setTab] = useState<AddTab>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoCost = autoTransformations.length * NOTEBOOK_AI_COSTS.transform;

  const reset = () => {
    setUrl('');
    setTitle('');
    setText('');
  };

  const finish = (s: Source) => {
    onAdded(s, auto && autoTransformations.length > 0);
    reset();
    onOpenChange(false);
  };

  const addLink = async () => {
    setLoading(true);
    try {
      const r = await importSourceUrl(url);
      finish(makeSource(notebookId, { kind: isYoutubeUrl(r.url) ? 'youtube' : 'link', title: r.title, content: r.content, url: r.url }));
      toast.success('Link adicionado', { description: r.title });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 10);
    if (list.length === 0) return;
    setLoading(true);
    let ok = 0;
    for (const f of list) {
      try {
        const r = await importSourceFile(f);
        onAdded(makeSource(notebookId, { kind: 'file', title: r.title, content: r.content, fileName: f.name }), auto && autoTransformations.length > 0);
        ok += 1;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    setLoading(false);
    if (ok > 0) {
      toast.success(ok === 1 ? 'Arquivo adicionado' : `${ok} arquivos adicionados`);
      onOpenChange(false);
    }
  };

  const addText = () => {
    if (text.trim().length < 20) {
      toast.error('Cole pelo menos algumas frases.');
      return;
    }
    const r = importSourceText(title, text);
    finish(makeSource(notebookId, { kind: 'text', title: r.title, content: r.content }));
  };

  const tabs: Array<{ key: AddTab; label: string; icon: ReactNode }> = [
    { key: 'link', label: 'Link ou YouTube', icon: <Link2 className="h-4 w-4" /> },
    { key: 'file', label: 'Arquivos', icon: <FileUp className="h-4 w-4" /> },
    { key: 'text', label: 'Texto', icon: <Type className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-lg border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-amber-300" /> Adicionar fonte
          </DialogTitle>
          <DialogDescription className="text-slate-400">O conteúdo fica salvo no seu navegador. A IA só lê o que estiver no contexto.</DialogDescription>
        </DialogHeader>

        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition',
                tab === t.key ? 'bg-white/10 text-white shadow' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'link' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addLink();
            }}
          >
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://site.com/artigo ou link do YouTube"
              aria-label="Endereço do link"
              className="border-white/10 bg-white/5"
            />
            <p className="text-xs text-slate-500">Lemos o texto principal da página. Para vídeos, entra o que a página do vídeo mostra (título, descrição e legenda quando disponível).</p>
            <Button type="submit" disabled={loading || !url.trim()} className="w-full bg-amber-400 text-slate-950 hover:bg-amber-300">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />} Importar link
            </Button>
          </form>
        )}

        {tab === 'file' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center transition',
              drag ? 'border-amber-300 bg-amber-400/10' : 'border-white/15 bg-white/[0.02]',
            )}
          >
            <FileUp className="h-8 w-8 text-amber-300" />
            <p className="text-sm text-slate-200">Arraste arquivos aqui ou</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => fileRef.current?.click()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Escolher arquivos
            </Button>
            <p className="text-xs text-slate-500">PDF, Word, PowerPoint, Excel/CSV, Markdown, HTML e texto · até 10 MB cada</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={FILE_ACCEPT}
              data-testid="notebook-file-input"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {tab === 'text' && (
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" aria-label="Título do texto" className="border-white/10 bg-white/5" />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui anotações, transcrições, artigos…"
              aria-label="Texto da fonte"
              className="min-h-[180px] border-white/10 bg-white/5"
            />
            <Button type="button" onClick={addText} className="w-full bg-amber-400 text-slate-950 hover:bg-amber-300">
              <Plus className="mr-2 h-4 w-4" /> Adicionar texto
            </Button>
          </div>
        )}

        {autoTransformations.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/5 p-3 text-xs text-slate-300">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 accent-amber-400" />
            <span>
              Gerar insights automáticos: <strong className="text-white">{autoTransformations.map((t) => t.name).join(', ')}</strong>{' '}
              <span className="text-amber-200">· a partir de {autoCost} crédito{autoCost > 1 ? 's' : ''} por fonte</span>
            </span>
          </label>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Leitor de fonte ────────────────────────────────────────────────────────

export function SourceViewer({
  source,
  notebook,
  transformations,
  update,
  onClose,
}: {
  source: Source | null;
  notebook: Notebook;
  transformations: Transformation[];
  update: UpdateWorkspace;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'insights' | 'content'>('insights');
  const [running, setRunning] = useState<string | null>(null);

  if (!source) return null;

  const run = async (t: Transformation) => {
    setRunning(t.id);
    try {
      const insight = await runTransformation(source, t, notebook);
      update((ws) => ({ ...ws, sources: ws.sources.map((x) => (x.id === source.id ? { ...x, insights: [insight, ...x.insights] } : x)) }));
      setTab('insights');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const removeInsight = (id: string) =>
    update((ws) => ({ ...ws, sources: ws.sources.map((x) => (x.id === source.id ? { ...x, insights: x.insights.filter((i) => i.id !== id) } : x)) }));

  const saveAsNote = (i: Insight) => {
    update((ws) => ({ ...ws, notes: [makeNote(notebook.id, `${i.title} · ${source.title}`, i.content, 'ai'), ...ws.notes] }));
    toast.success('Salvo nas notas');
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden border-white/10 bg-slate-950/95 p-0 text-slate-100 backdrop-blur-xl">
        <DialogHeader className="border-b border-white/10 p-5 pb-4">
          <DialogTitle className="pr-6 text-left text-lg text-white">{source.title}</DialogTitle>
          <DialogDescription className="text-left text-slate-400">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-sky-300 hover:underline">
                {source.url}
              </a>
            ) : (
              source.fileName ?? 'Texto colado'
            )}
          </DialogDescription>
          <div className="mt-3 flex gap-1">
            {(['insights', 'content'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition', tab === k ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10')}
              >
                {k === 'insights' ? `Insights (${source.insights.length})` : 'Conteúdo'}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'content' ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{source.content}</pre>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {transformations.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!!running}
                    onClick={() => run(t)}
                    title={t.description}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-amber-300/50 hover:text-white disabled:opacity-50"
                  >
                    {running === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-amber-300" />} {t.name}
                  </button>
                ))}
              </div>
              {source.insights.length === 0 && !running && (
                <p className="rounded-xl bg-white/5 p-4 text-sm text-slate-400">
                  Nenhum insight ainda. Escolha uma transformação acima ({creditsLabel(notebookAiCost({ action: 'transform', context: [{ id: `source:${source.id}`, title: source.title, content: source.content }] }))} cada). Fontes no modo <strong>Insights</strong> mandam só isso para a IA.
                </p>
              )}
              {source.insights.map((i) => (
                <article key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                      <CheckCircle2 className="h-4 w-4" /> {i.title}
                    </h4>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveAsNote(i)}>
                        Salvar como nota
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" aria-label="Excluir insight" onClick={() => removeInsight(i.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </header>
                  <NotebookMarkdown text={i.content} />
                </article>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
