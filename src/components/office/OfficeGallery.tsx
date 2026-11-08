// Galeria do Vertal Office: os documentos salvos do usuário, com busca, filtro e ações.
// Componente de apresentação: quem chama cuida dos dados (ver OfficeGalleryPanel).
import React, { useMemo, useState } from 'react';
import { Copy, Download, FileSpreadsheet, FileText, FolderOpen, Pencil, Plus, Presentation, Search, Trash2, FileType, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  KIND_META,
  OFFICE_KINDS,
  countByKind,
  filterAndSortItems,
  formatItemDate,
  formatSize,
  type GallerySort,
  type OfficeItem,
  type OfficeKind,
} from '@/lib/office/galleryModel';

const KIND_ICON: Record<OfficeKind, React.ComponentType<{ className?: string }>> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  pdf: FileType,
};

export interface OfficeGalleryProps {
  items: OfficeItem[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onRetry: () => void;
  onOpen: (item: OfficeItem) => void;
  onNew: (kind: OfficeKind) => void;
  onRename: (item: OfficeItem, title: string) => Promise<void> | void;
  onDuplicate: (item: OfficeItem) => void;
  onDownload: (item: OfficeItem) => void;
  onDelete: (item: OfficeItem) => Promise<void> | void;
}

/** Miniatura de cada tipo: lembra a página, a planilha, o slide ou o PDF. */
function Preview({ item }: { item: OfficeItem }) {
  if (item.kind === 'sheet') {
    return (
      <div className="grid h-full w-full grid-cols-5 content-center gap-px bg-slate-200 p-3 pt-12">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className={`${i < 5 ? 'bg-slate-300' : 'bg-white'} h-5`} />
        ))}
      </div>
    );
  }
  if (item.kind === 'slides') {
    const headline = item.excerpt.split(' · ')[0] || item.title;
    return (
      <div className="flex h-full w-full items-center justify-center p-5 pt-12">
        <div className="flex aspect-video w-[86%] flex-col justify-center rounded-md bg-white p-4 shadow-lg">
          <div className="h-1 w-10 rounded bg-amber-500" />
          <p className="mt-3 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{headline}</p>
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-4/5 rounded bg-slate-200" />
            <div className="h-1.5 w-3/5 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }
  if (item.kind === 'pdf') {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="relative flex aspect-[3/4] w-[58%] flex-col items-center justify-center overflow-hidden rounded-md bg-white shadow-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-rose-500" />
          <span className="font-['Unbounded'] text-lg font-bold text-rose-600">PDF</span>
          <span className="mt-1 text-[10px] text-slate-400">{formatSize(item.sizeBytes)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-end justify-center px-5 pb-0 pt-12">
      <div className="flex h-[80%] w-[64%] flex-col gap-2 overflow-hidden rounded-md bg-white p-4 shadow-lg">
        <p className="font-serif text-[13px] font-semibold text-slate-900 line-clamp-1">{item.title}</p>
        <p className="font-serif text-[11px] leading-relaxed text-slate-500 line-clamp-6">{item.excerpt || 'Documento em branco'}</p>
      </div>
    </div>
  );
}

const ACCENT_BG: Record<OfficeKind, string> = {
  doc: 'from-sky-500/30 via-indigo-500/10 to-transparent',
  sheet: 'from-emerald-500/30 via-teal-500/10 to-transparent',
  slides: 'from-amber-500/30 via-orange-500/10 to-transparent',
  pdf: 'from-rose-500/30 via-red-500/10 to-transparent',
};

export function OfficeGallery(props: OfficeGalleryProps) {
  const { items, loading, error, busyId } = props;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<OfficeKind | 'all'>('all');
  const [sort, setSort] = useState<GallerySort>('recent');
  const [renaming, setRenaming] = useState<OfficeItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<OfficeItem | null>(null);

  const counts = useMemo(() => countByKind(items), [items]);
  const visible = useMemo(() => filterAndSortItems(items, { query, kind, sort }), [items, query, kind, sort]);
  const hasFilter = query.trim() !== '' || kind !== 'all';

  const openRename = (item: OfficeItem) => {
    setRenaming(item);
    setRenameValue(item.title);
  };

  const submitRename = async () => {
    if (!renaming || renameValue.trim() === '') return;
    await props.onRename(renaming, renameValue.trim());
    setRenaming(null);
  };

  return (
    <section aria-label="Galeria de documentos" className="relative isolate min-h-[640px] overflow-hidden bg-slate-950 text-slate-100">
      {/* Luz de fundo: dá profundidade sem distrair do conteúdo. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-120px] top-72 -z-10 h-[300px] w-[300px] rounded-full bg-sky-500/10 blur-3xl" />

      <div className="px-4 pb-10 pt-8 sm:px-8">
        {/* Cabeçalho */}
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-300">Vertal Office · Galeria</p>
            <h2 className="mt-2 font-['Unbounded'] text-2xl font-bold tracking-tight text-white sm:text-3xl">Seus documentos</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Tudo o que você salvou, em um só lugar. Abra, edite, duplique ou baixe quando quiser.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Criar novo">
            {OFFICE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => props.onNew(k)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-200 backdrop-blur transition hover:-translate-y-px hover:border-white/25 hover:bg-white/10 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  <Icon className={`h-3.5 w-3.5 ${KIND_META[k].accent}`} aria-hidden />
                  {KIND_META[k].singular}
                </button>
              );
            })}
          </div>
        </header>

        {/* Resumo e filtros */}
        <div className="mt-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            {(['all', ...OFFICE_KINDS] as const).map((k) => {
              const on = kind === k;
              const count = k === 'all' ? items.length : counts[k];
              const label = k === 'all' ? 'Todos' : KIND_META[k].label;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    on ? 'bg-white text-slate-900 shadow-[0_0_24px_-6px_rgba(255,255,255,0.6)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {label} <span className={on ? 'text-slate-500' : 'text-slate-500'}>· {count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-[240px]">
              <span className="sr-only">Buscar na galeria</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título ou conteúdo"
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-9 pr-9 text-sm text-white placeholder:text-slate-500 backdrop-blur focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </label>
            <select
              aria-label="Ordenar"
              value={sort}
              onChange={(e) => setSort(e.target.value as GallerySort)}
              className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-200 focus:border-sky-400/60 focus:outline-none"
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="name">Nome (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="mt-8">
          {error && (
            <div role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              </span>
              <Button variant="outline" size="sm" onClick={props.onRetry} className="border-red-300/40 bg-transparent text-red-100 hover:bg-red-500/20">
                Tentar de novo
              </Button>
            </div>
          )}

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Carregando galeria">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Skeleton className="aspect-[4/3] w-full bg-white/10" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-3/4 bg-white/10" />
                    <Skeleton className="h-3 w-1/2 bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 && !error ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-[0_0_50px_-5px_rgba(56,189,248,0.6)]">
                <FolderOpen className="h-7 w-7 text-white" aria-hidden />
              </span>
              <h3 className="mt-6 font-['Unbounded'] text-lg font-bold text-white">Nenhum documento salvo ainda</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                Crie um documento, uma planilha, uma apresentação ou um PDF e clique em <strong className="text-slate-200">Salvar na galeria</strong>. Ele aparece aqui para você abrir sempre que precisar.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {OFFICE_KINDS.map((k) => (
                  <Button key={k} onClick={() => props.onNew(k)} className="bg-white text-slate-900 hover:bg-slate-200">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden /> {KIND_META[k].singular}
                  </Button>
                ))}
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-14 text-center">
              <p className="text-sm text-slate-300">
                Nada encontrado{query.trim() ? <> para <span className="text-white">“{query.trim()}”</span></> : ' neste filtro'}.
              </p>
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-sky-300 hover:bg-white/5 hover:text-sky-200"
                  onClick={() => {
                    setQuery('');
                    setKind('all');
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Documentos salvos">
              {visible.map((item) => {
                const meta = KIND_META[item.kind];
                const busy = busyId === item.id;
                return (
                  <li key={item.id}>
                    <article
                      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] hover:shadow-[0_24px_60px_-24px_rgba(56,189,248,0.45)] ${
                        busy ? 'opacity-60' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => props.onOpen(item)}
                        aria-label={`Abrir ${item.title}`}
                        className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br ${ACCENT_BG[item.kind]} bg-slate-900/60 text-left`}
                      >
                        <Preview item={item} />
                        <span className={`absolute left-3 top-3 z-10 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg ring-1 ring-white/10 ${meta.accent}`}>
                          {meta.singular}
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <h3 className="truncate font-semibold text-white" title={item.title}>
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {formatItemDate(item.updatedAt)}
                          {item.sizeBytes > 0 && <> · {formatSize(item.sizeBytes)}</>}
                        </p>
                        <div className="mt-auto flex items-center gap-1 pt-4">
                          <Button size="sm" onClick={() => props.onOpen(item)} disabled={busy} className="h-8 bg-white text-slate-900 hover:bg-slate-200">
                            Abrir
                          </Button>
                          <div className="ml-auto flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
                            <IconAction label="Renomear" onClick={() => openRename(item)} disabled={busy}>
                              <Pencil className="h-3.5 w-3.5" />
                            </IconAction>
                            <IconAction label="Duplicar" onClick={() => props.onDuplicate(item)} disabled={busy}>
                              <Copy className="h-3.5 w-3.5" />
                            </IconAction>
                            <IconAction label="Baixar" onClick={() => props.onDownload(item)} disabled={busy}>
                              <Download className="h-3.5 w-3.5" />
                            </IconAction>
                            <IconAction label="Excluir" onClick={() => setDeleting(item)} disabled={busy} danger>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconAction>
                          </div>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Renomear */}
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="border-white/10 bg-slate-900 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['Unbounded'] text-base">Renomear</DialogTitle>
            <DialogDescription className="text-slate-400">Escolha um nome para este item.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitRename();
            }}
          >
            <Input
              autoFocus
              aria-label="Novo nome"
              value={renameValue}
              maxLength={120}
              onChange={(e) => setRenameValue(e.target.value)}
              className="border-white/15 bg-white/5 text-white"
            />
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)} className="text-slate-300 hover:bg-white/10 hover:text-white">
                Cancelar
              </Button>
              <Button type="submit" disabled={renameValue.trim() === ''} className="bg-white text-slate-900 hover:bg-slate-200">
                Salvar nome
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excluir: pede confirmação antes de apagar. */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="border-white/10 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-['Unbounded'] text-base">Excluir “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              O item sai da sua galeria e não pode ser recuperado. Se você tiver baixado uma cópia, ela continua no seu aparelho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/15 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleting) void props.onDelete(deleting);
                setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 text-slate-400 transition disabled:opacity-40 ${
        danger ? 'hover:bg-red-500/15 hover:text-red-300' : 'hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export default OfficeGallery;
