import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FilePlus2, FolderOpen, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { FIGCRAFT_BASE, figcraftFrameSrc, isFromFrame, parseFigcraftMessage, postOpenToFigcraft } from '@/lib/figcraft/bridge';
import {
  FIGCRAFT_TEMPLATES,
  designFileName,
  designTitleFromFileName,
  isFigcraftDocumentName,
  type FigcraftTemplateId,
} from '@/lib/figcraft/contract';
import {
  createDesign,
  deleteDesign,
  downloadDesignBytes,
  getDesign,
  listDesigns,
  renameDesign,
  saveDesignBytes,
  type DesignRecord,
} from '@/lib/figcraft/designStore';
import {
  registerActiveFigcraft,
  takeQueuedFigcraftCommands,
  type ActiveHandle,
  type FigcraftCommand,
  type FigcraftCommandResult,
} from '@/lib/figcraft/activeEditor';

// figCraft: editor de interface e protótipos (MIT ou Apache-2.0, storytold/figcraft), em Rust e
// WebAssembly. O build fica em /figcraft/ (public/figcraft, gerado por packaging/web/package.sh), na
// mesma origem do site: o iframe conversa com o Vertal por postMessage (src/lib/figcraft/bridge.ts)
// e, por ser mesma origem, o Vertal também chama window.figcraft (comandos do engine).

const SOURCE_URL = 'https://github.com/storytold/figcraft';
/** Espera o figCraft processar o arquivo aberto antes de rodar comandos em cima dele. */
const OPEN_SETTLE_MS = 600;

interface FigcraftPageApi {
  execute: (command: string, params?: Record<string, unknown>) => Promise<unknown>;
}
type FigcraftWindow = Window & { figcraft?: FigcraftPageApi };

type Status = { tone: 'info' | 'ok' | 'error'; text: string } | null;

interface Props {
  /** Abre este design (vindo do chat ou de um link). Muda a cada pedido com `openNonce`. */
  openDesignId?: string | null;
  openNonce?: number;
  /** Quem está usando, para os comentários do figCraft. */
  author?: string;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function downloadBytes(name: string, bytes: ArrayBuffer) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/]/g, '_').slice(0, 200) || 'figcraft-export';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FigcraftEditor({ openDesignId = null, openNonce = 0, author }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const displayName = author ?? (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0];
  const frameSrc = useMemo(() => figcraftFrameSrc(displayName), [displayName]);

  const [designs, setDesigns] = useState<DesignRecord[] | null>(null);
  const [current, setCurrent] = useState<DesignRecord | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentRef = useRef<DesignRecord | null>(null);
  const pendingBytesRef = useRef<Uint8Array | null>(null);
  /** Comandos do chat para este design, guardados até o editor estar pronto e o arquivo aberto. */
  const pendingCommandsRef = useRef<FigcraftCommand[]>([]);
  const frameReadyRef = useRef(false);
  const handleRef = useRef<ActiveHandle | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setDesigns(await listDesigns());
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível carregar seus designs.' });
      setDesigns((d) => d ?? []);
    }
  }, []);

  useEffect(() => {
    if (userId) void refreshList();
  }, [userId, refreshList]);

  const setCurrentDesign = useCallback((record: DesignRecord | null) => {
    currentRef.current = record;
    setCurrent(record);
    handleRef.current?.setDesignId(record?.id ?? null);
  }, []);

  /** Abre um design: baixa o arquivo e recarrega o iframe; o arquivo é enviado quando o editor ficar pronto. */
  const openDesign = useCallback(
    async (record: DesignRecord) => {
      setBusy(true);
      setStatus({ tone: 'info', text: `Abrindo "${record.title}"…` });
      try {
        const bytes = await downloadDesignBytes(record);
        pendingBytesRef.current = bytes;
        pendingCommandsRef.current = takeQueuedFigcraftCommands(record.id);
        frameReadyRef.current = false;
        setFrameReady(false);
        setDirty(false);
        setCurrentDesign(record);
        setFrameKey((k) => k + 1);
        setStatus(null);
      } catch (e) {
        setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível abrir este design.' });
      } finally {
        setBusy(false);
      }
    },
    [setCurrentDesign],
  );

  /** Editor em branco: a tela inicial do figCraft, com os modelos dele. */
  const openBlank = useCallback(() => {
    pendingBytesRef.current = null;
    pendingCommandsRef.current = [];
    frameReadyRef.current = false;
    setFrameReady(false);
    setDirty(false);
    setCurrentDesign(null);
    setFrameKey((k) => k + 1);
    setStatus(null);
  }, [setCurrentDesign]);

  const createFromTemplate = useCallback(
    async (templateId: FigcraftTemplateId) => {
      if (!userId) return;
      const template = FIGCRAFT_TEMPLATES.find((t) => t.id === templateId);
      setBusy(true);
      setStatus({ tone: 'info', text: `Criando "${template?.label ?? templateId}"…` });
      try {
        const res = await fetch(`${FIGCRAFT_BASE.replace(/\/?$/, '/')}templates/${templateId}.figcraft`);
        if (!res.ok) throw new Error('modelo indisponível');
        const bytes = new Uint8Array(await res.arrayBuffer());
        const record = await createDesign(userId, template?.label ?? 'Design', bytes);
        setDesigns((list) => [record, ...(list ?? [])]);
        await openDesign(record);
      } catch {
        setStatus({ tone: 'error', text: 'Este modelo não está disponível agora. Abra o figCraft e escolha um modelo lá.' });
      } finally {
        setBusy(false);
      }
    },
    [openDesign, userId],
  );

  /** Comandos do engine no editor aberto, um por um, com o resultado de cada um. */
  const runCommands = useCallback(async (commands: FigcraftCommand[]): Promise<FigcraftCommandResult[]> => {
    const win = iframeRef.current?.contentWindow as FigcraftWindow | null | undefined;
    if (!win?.figcraft || !frameReadyRef.current) {
      return commands.map((c) => ({ command: c.command, ok: false, error: 'o editor ainda não está pronto' }));
    }
    const results: FigcraftCommandResult[] = [];
    for (const c of commands) {
      try {
        const value = await win.figcraft.execute(c.command, c.params ?? {});
        results.push({ command: c.command, ok: true, result: value });
      } catch (e) {
        results.push({ command: c.command, ok: false, error: e instanceof Error ? e.message.slice(0, 300) : 'erro' });
      }
    }
    return results;
  }, []);

  // Registra o editor para o Vertal Chat: comandos para o design aberto rodam direto aqui.
  useEffect(() => {
    handleRef.current = registerActiveFigcraft(currentRef.current?.id ?? null, runCommands);
    return () => {
      handleRef.current?.unregister();
      handleRef.current = null;
    };
  }, [runCommands]);

  // O chat pediu um design específico (ou o link trouxe um id).
  useEffect(() => {
    if (!openDesignId || !userId || openNonce === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const record = await getDesign(openDesignId);
        if (cancelled) return;
        if (!record) {
          setStatus({ tone: 'error', text: 'Este design não existe mais ou não é seu.' });
          return;
        }
        await openDesign(record);
      } catch (e) {
        if (!cancelled) setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível abrir este design.' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // openNonce muda a cada pedido, mesmo que o id seja o mesmo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDesignId, openNonce, userId]);

  /** Salva o que o figCraft mandou: documento vira design (novo ou atualizado); exportação baixa. */
  const handleSave = useCallback(
    async (name: string, bytes: ArrayBuffer, saveAs: boolean) => {
      if (!isFigcraftDocumentName(name)) {
        downloadBytes(name, bytes);
        setStatus({ tone: 'ok', text: `Exportado: ${name}` });
        return;
      }
      if (!userId) {
        setStatus({ tone: 'error', text: 'Entre na sua conta para salvar o design.' });
        return;
      }
      const data = new Uint8Array(bytes);
      const doc = currentRef.current;
      try {
        if (!doc || saveAs) {
          const record = await createDesign(userId, designTitleFromFileName(name), data);
          setDesigns((list) => [record, ...(list ?? []).filter((d) => d.id !== record.id)]);
          setCurrentDesign(record);
        } else {
          const record = await saveDesignBytes(doc, data);
          setDesigns((list) => (list ?? []).map((d) => (d.id === record.id ? record : d)));
          setCurrentDesign(record);
        }
        setDirty(false);
        setStatus({ tone: 'ok', text: 'Design salvo.' });
      } catch (e) {
        setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível salvar.' });
      }
    },
    [setCurrentDesign, userId],
  );

  // Mensagens do figCraft (só do próprio iframe, mesma origem).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFromFrame(event, iframeRef.current)) return;
      const msg = parseFigcraftMessage(event.data);
      if (!msg) return;
      switch (msg.type) {
        case 'ready': {
          frameReadyRef.current = true;
          setFrameReady(true);
          const doc = currentRef.current;
          const bytes = pendingBytesRef.current;
          const frame = iframeRef.current;
          if (doc && bytes && frame) {
            pendingBytesRef.current = null;
            postOpenToFigcraft(frame, designFileName(doc.title), bytes);
          }
          const queued = pendingCommandsRef.current;
          pendingCommandsRef.current = [];
          if (queued.length > 0) {
            window.setTimeout(() => {
              void runCommands(queued).then((results) => {
                const failed = results.filter((r) => !r.ok).length;
                setStatus(
                  failed === 0
                    ? { tone: 'ok', text: `${results.length} comando(s) do chat aplicado(s).` }
                    : { tone: 'error', text: `${failed} de ${results.length} comando(s) falharam.` },
                );
              });
            }, OPEN_SETTLE_MS);
          }
          break;
        }
        case 'save':
          void handleSave(msg.name, msg.bytes, msg.saveAs);
          break;
        case 'dirty':
          setDirty(msg.dirty);
          break;
        case 'failed':
          setStatus({ tone: 'error', text: `O figCraft não conseguiu iniciar: ${msg.error}` });
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleSave, runCommands]);

  const renameRecord = async (record: DesignRecord) => {
    const title = window.prompt('Novo nome do design', record.title)?.trim();
    if (!title || title === record.title) return;
    try {
      const updated = await renameDesign(record.id, title);
      setDesigns((list) => (list ?? []).map((d) => (d.id === updated.id ? updated : d)));
      if (currentRef.current?.id === updated.id) setCurrentDesign(updated);
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível renomear.' });
    }
  };

  const removeDesign = async (record: DesignRecord) => {
    if (!window.confirm(`Apagar "${record.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteDesign(record);
      setDesigns((list) => (list ?? []).filter((d) => d.id !== record.id));
      if (currentRef.current?.id === record.id) openBlank();
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Não foi possível apagar.' });
    }
  };

  const chatLink = current ? `/creative/chat?tool=figcraft&design=${current.id}` : '/creative/chat?tool=figcraft';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Design e protótipos</p>
          <h2 className="mt-2 text-3xl font-bold text-white">figCraft</h2>
          <p className="mt-2 max-w-2xl text-slate-400">
            Telas, componentes, auto layout e protótipos. Seus designs ficam salvos na sua conta e o Vertal Chat pode editá-los.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a href={chatLink} className="inline-flex items-center gap-2 text-amber-300 hover:text-amber-200">
            Abrir no Vertal Chat
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <a href={`${FIGCRAFT_BASE.replace(/\/?$/, '/')}index.html`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-amber-300 hover:text-amber-200">
            Tela cheia
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section aria-labelledby="figcraft-templates-title" className="space-y-3">
            <h3 id="figcraft-templates-title" className="text-sm font-semibold text-white">Novo design</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {FIGCRAFT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy || !userId}
                  onClick={() => void createFromTemplate(t.id)}
                  className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 text-left transition-colors hover:border-slate-500 disabled:opacity-50"
                >
                  <FilePlus2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white">{t.label}</span>
                    <span className="block truncate text-xs text-slate-400">{t.description}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={openBlank}
                disabled={busy}
                className="flex items-center gap-3 rounded-xl border border-dashed border-slate-600 p-3 text-left text-sm text-slate-300 hover:border-slate-400 disabled:opacity-50"
              >
                <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
                Começar na tela inicial do figCraft
              </button>
            </div>
          </section>

          <section aria-labelledby="figcraft-designs-title" className="space-y-3">
            <h3 id="figcraft-designs-title" className="text-sm font-semibold text-white">Meus designs</h3>
            {designs === null && (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
              </p>
            )}
            {designs?.length === 0 && <p className="text-sm text-slate-400">Nenhum design salvo ainda. Crie um modelo ou salve um design no editor.</p>}
            <ul className="space-y-2">
              {(designs ?? []).map((d) => {
                const open = current?.id === d.id;
                return (
                  <li
                    key={d.id}
                    className={`rounded-xl border p-3 ${open ? 'border-emerald-400/60 bg-emerald-400/5' : 'border-slate-700/60 bg-slate-800/50'}`}
                  >
                    <button type="button" onClick={() => void openDesign(d)} disabled={busy} className="block w-full min-w-0 text-left">
                      <span className="block truncate text-sm font-medium text-white">{d.title}</span>
                      <span className="block text-xs text-slate-500">{dateLabel(d.updatedAt)}</span>
                    </button>
                    <div className="mt-2 flex gap-3 text-xs">
                      <button type="button" onClick={() => void renameRecord(d)} className="inline-flex items-center gap-1 text-slate-300 hover:text-white">
                        <Pencil className="h-3 w-3" aria-hidden /> Renomear
                      </button>
                      <button type="button" onClick={() => void removeDesign(d)} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200">
                        <Trash2 className="h-3 w-3" aria-hidden /> Apagar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="flex min-h-6 flex-wrap items-center gap-x-3 text-sm">
            {current && <span className="font-medium text-white">{current.title}</span>}
            {dirty && <span className="text-amber-300">• alterações não salvas (Ctrl+S salva no design)</span>}
            {status && (
              <span role="status" className={status.tone === 'error' ? 'text-rose-300' : status.tone === 'ok' ? 'text-emerald-300' : 'text-slate-400'}>
                {status.text}
              </span>
            )}
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-[#2c2c2c]">
            {!frameReady && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando o figCraft…
              </div>
            )}
            <iframe
              key={frameKey}
              ref={iframeRef}
              src={frameSrc}
              title="figCraft, editor de interface e protótipos"
              allow="clipboard-read; clipboard-write; fullscreen"
              className="block h-[78vh] min-h-[560px] w-full border-0"
            />
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-500">
        figCraft é um projeto open-source (MIT ou Apache-2.0) da ArtCraft.{' '}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
          Código e créditos
        </a>
        . Está em fase alfa. Requer um navegador com WebGPU ou WebGL2.
      </p>
    </div>
  );
}

export default FigcraftEditor;
