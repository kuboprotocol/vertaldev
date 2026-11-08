// Aba PDF do Vertal Office: abrir, anexar, editar e baixar PDF; criar PDF em branco ou a partir de texto.
// Cada ação grava o PDF na hora, então a tela é sempre o arquivo que será baixado. "Desfazer" volta uma ação.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Download,
  FilePlus,
  FileText,
  Highlighter,
  Eraser,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  Undo2,
  Upload,
  Layers,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { download, safeName } from '@/lib/office/download';
import {
  PDF_MAX_BYTES,
  pdfTooBigMessage,
  PDF_THUMB_LIMIT,
  PdfOp,
  VisualPoint,
  VisualRect,
  appendPdf,
  applyOp,
  addBlankPage,
  deletePage,
  inspectPdf,
  rotatePage,
} from '@/lib/office/pdfEdit';
import { blankPdf, textToPdf } from '@/lib/office/pdfGenerate';
import { RibbonButton } from './Ribbon';

/** Quantas ações de desfazer ficam guardadas (cada uma é uma cópia do PDF). */
const UNDO_LIMIT = 15;
const TEXT_SIZES = [10, 12, 14, 18, 24, 36];
const INK_COLORS = [
  { label: 'Preto', hex: '#1e293b' },
  { label: 'Vermelho', hex: '#dc2626' },
  { label: 'Azul', hex: '#2563eb' },
  { label: 'Verde', hex: '#16a34a' },
];
const HIGHLIGHT_HEX = '#facc15';

type Tool = 'select' | 'text' | 'highlight' | 'cover';

type PdfJsDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy: () => void;
};
type PdfJsPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; transform?: number[] }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};

/** Decodificadores e fontes do pdf.js servidos junto com o app (ver vite-plugins/pdfjs-assets.ts). */
function pdfjsSupportUrls() {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return {
    wasmUrl: `${base}pdfjs/wasm/`,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  };
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist/build/pdf.mjs')> | null = null;
/** pdf.js (leitura e miniaturas), carregado só quando a aba PDF é usada. */
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Desenha uma página num canvas com a largura pedida. Devolve a função de cancelamento. */
function renderPage(doc: PdfJsDocument, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): () => void {
  let task: { cancel: () => void } | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const running = page.render({ canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      task = running;
      await running.promise;
    } catch {
      /* render cancelado (página trocada ou PDF substituído): nada a fazer */
    }
  })();
  return () => {
    cancelled = true;
    task?.cancel();
  };
}

function PageThumb({ doc, pageNumber, active, onSelect }: { doc: PdfJsDocument; pageNumber: number; active: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return renderPage(doc, pageNumber, ref.current, 92);
  }, [doc, pageNumber]);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Ir para a página ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-md p-1 text-[11px] text-slate-600 transition ${
        active ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-slate-200'
      }`}
    >
      <canvas ref={ref} className="rounded bg-white shadow-sm" />
      <span>{pageNumber}</span>
    </button>
  );
}

async function readBytes(file: File): Promise<Uint8Array> {
  if (file.size > PDF_MAX_BYTES) throw new Error(pdfTooBigMessage());
  return new Uint8Array(await file.arrayBuffer());
}

export interface PdfSeed {
  name: string;
  bytes: Uint8Array;
}

export function PdfTab({
  seed,
  onChange,
}: {
  seed?: PdfSeed | null;
  /** Avisa o aplicativo sempre que o PDF muda (para salvar na galeria). */
  onChange?: (state: { name: string; bytes: Uint8Array | null }) => void;
}) {
  const [name, setName] = useState(seed?.name.replace(/\.pdf$/i, '') ?? '');
  const [original, setOriginal] = useState<Uint8Array | null>(seed?.bytes ?? null);
  const [bytes, setBytes] = useState<Uint8Array | null>(seed?.bytes ?? null);
  const [undo, setUndo] = useState<Uint8Array[]>([]);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState<{ page: number; at: VisualPoint } | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [pendingSize, setPendingSize] = useState(14);
  const [pendingColor, setPendingColor] = useState(INK_COLORS[0].hex);
  const [drag, setDrag] = useState<{ start: VisualPoint; end: VisualPoint } | null>(null);
  const [stageWidth, setStageWidth] = useState(640);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const lastTaskRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.({ name, bytes });
  }, [name, bytes]);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const appendRef = useRef<HTMLInputElement>(null);

  const pageCount = pdfDoc?.numPages ?? 0;
  const ok = (text: string) => setNotice({ kind: 'ok', text });
  const fail = (e: unknown) => setNotice({ kind: 'err', text: (e as Error).message || 'Algo deu errado.' });

  // Carrega o documento de leitura sempre que os bytes mudam.
  useEffect(() => {
    if (!bytes) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        // pdf.js pode transferir o buffer: entrega uma cópia para não invalidar os bytes da tela.
        const task = pdfjs.getDocument({ data: bytes.slice(), ...pdfjsSupportUrls() });
        const loaded = (await task.promise) as unknown as PdfJsDocument;
        if (cancelled) {
          void task.destroy();
          return;
        }
        // Libera a leitura anterior (memória do leitor) antes de mostrar a nova.
        void lastTaskRef.current?.destroy();
        lastTaskRef.current = task;
        setPdfDoc(loaded);
      } catch {
        if (!cancelled) fail(new Error('Não consegui exibir este PDF.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  // Mantém a página atual válida e limpa a marcação pendente ao trocar de página.
  useEffect(() => {
    if (!pdfDoc) return;
    setPageIndex((i) => Math.min(i, pdfDoc.numPages - 1));
  }, [pdfDoc]);

  useEffect(() => {
    setPending(null);
    setDrag(null);
  }, [pageIndex]);

  // Largura disponível para a página (responsivo).
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageWidth(Math.max(240, Math.min(900, el.clientWidth - 24)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bytes]);

  // Página principal.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    return renderPage(pdfDoc, pageIndex + 1, canvasRef.current, stageWidth);
  }, [pdfDoc, pageIndex, stageWidth]);

  /** Aplica uma mudança no PDF, guarda a versão anterior para "Desfazer" e mostra o resultado. */
  const run = async (label: string, change: (current: Uint8Array) => Promise<Uint8Array>) => {
    if (!bytes || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await change(bytes);
      setUndo((u) => [...u.slice(-(UNDO_LIMIT - 1)), bytes]);
      setBytes(next);
      ok(label);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const openNew = (data: Uint8Array, title: string) => {
    setName(title);
    setOriginal(data);
    setBytes(data);
    setUndo([]);
    setPageIndex(0);
    setPending(null);
    setTool('select');
  };

  const onOpenFile = async (file: File | undefined) => {
    if (!file) return;
    if (bytes && undo.length > 0 && !window.confirm('Abrir outro PDF descarta as alterações não baixadas. Continuar?')) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await readBytes(file);
      await inspectPdf(data);
      openNew(data, file.name.replace(/\.pdf$/i, ''));
      ok(`${file.name} aberto.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      if (openRef.current) openRef.current.value = '';
    }
  };

  const onAppendFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await readBytes(file);
      await inspectPdf(data);
      await run(`${file.name} anexado ao fim do PDF.`, (b) => appendPdf(b, data));
    } catch (e) {
      fail(e);
    } finally {
      if (appendRef.current) appendRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!file) {
      setNotice({ kind: 'err', text: 'Solte um arquivo .pdf.' });
      return;
    }
    void onOpenFile(file);
  };

  const createBlank = async () => {
    try {
      openNew(await blankPdf(), 'PDF em branco');
      ok('PDF em branco criado.');
    } catch (e) {
      fail(e);
    }
  };

  const createFromText = async () => {
    if (!newBody.trim()) {
      setNotice({ kind: 'err', text: 'Escreva o texto que vai para o PDF.' });
      return;
    }
    setBusy(true);
    try {
      const title = newTitle.trim() || 'Documento';
      openNew(await textToPdf(title, newBody), title);
      setNewTitle('');
      setNewBody('');
      ok('PDF gerado a partir do texto.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** Ponto relativo à página visível, entre 0 e 1. */
  const pointOf = (e: React.PointerEvent): VisualPoint => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const onSurfaceDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bytes || busy) return;
    const at = pointOf(e);
    if (tool === 'text') {
      setPending({ page: pageIndex, at });
      setPendingText('');
      return;
    }
    if (tool === 'highlight' || tool === 'cover') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ start: at, end: at });
    }
  };

  const onSurfaceMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) setDrag({ start: drag.start, end: pointOf(e) });
  };

  const onSurfaceUp = () => {
    if (!drag) return;
    const { start, end } = drag;
    setDrag(null);
    const rect: VisualRect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
    if (rect.w < 0.01 || rect.h < 0.01) return;
    const op: PdfOp =
      tool === 'highlight'
        ? { kind: 'highlight', page: pageIndex, rect, color: HIGHLIGHT_HEX }
        : { kind: 'cover', page: pageIndex, rect, color: '#ffffff' };
    void run(tool === 'highlight' ? 'Trecho destacado.' : 'Área coberta.', (b) => applyOp(b, op));
  };

  const commitText = async () => {
    if (!pending) return;
    const text = pendingText.trim();
    if (!text) {
      setNotice({ kind: 'err', text: 'Digite o texto antes de inserir.' });
      return;
    }
    const op: PdfOp = { kind: 'text', page: pending.page, at: pending.at, text, size: pendingSize, color: pendingColor };
    setPending(null);
    setPendingText('');
    await run('Texto inserido.', (b) => applyOp(b, op));
  };

  const download1 = () => {
    if (!bytes) return;
    download(bytes, `${safeName(name) || 'documento'}-editado.pdf`, 'application/pdf');
  };

  const downloadOriginal = () => {
    if (!original) return;
    download(original, `${safeName(name) || 'documento'}-original.pdf`, 'application/pdf');
  };

  const doUndo = () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    setBytes(prev);
    setPending(null);
    ok('Última ação desfeita.');
  };

  const confirmDelete = () => {
    if (pageCount <= 1) {
      setNotice({ kind: 'err', text: 'O PDF precisa ter pelo menos uma página.' });
      return;
    }
    if (!window.confirm(`Apagar a página ${pageIndex + 1}?`)) return;
    void run(`Página ${pageIndex + 1} apagada.`, (b) => deletePage(b, pageIndex));
  };

  // Tela inicial: nada aberto ainda.
  if (!bytes) {
    return (
      <section className="flex-1 bg-[#e9ecef] p-4 sm:p-8" aria-label="Aplicativo PDF">
        {notice?.kind === 'err' && (
          <div role="alert" className="mx-auto mb-4 flex max-w-4xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="rounded p-0.5 text-red-700 hover:bg-red-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white p-8 text-center transition ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white">
              <Upload className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="font-semibold text-slate-900">Abrir um PDF</h3>
            <p className="text-sm text-slate-600">Arraste um arquivo .pdf para cá ou escolha no seu aparelho. Até 50 MB.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => openRef.current?.click()}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? 'Abrindo…' : 'Escolher PDF'}
            </button>
            <input
              ref={openRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              aria-label="Escolher PDF para abrir"
              onChange={(e) => void onOpenFile(e.target.files?.[0])}
            />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6">
            <div>
              <h3 className="font-semibold text-slate-900">Criar um PDF</h3>
              <p className="text-sm text-slate-600">Comece em branco ou escreva o texto que vira um PDF com paginação e número de página.</p>
            </div>
            <button
              type="button"
              onClick={() => void createBlank()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FilePlus className="h-4 w-4" aria-hidden /> PDF em branco
            </button>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Título
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Proposta comercial"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Texto
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={6}
                placeholder="Cole ou escreva o conteúdo. Linhas em branco separam os parágrafos."
                className="resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createFromText()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" aria-hidden /> Gerar PDF
            </button>
          </div>
        </div>
        {notice?.kind === 'ok' && (
          <p role="status" className="mx-auto mt-4 max-w-4xl text-sm text-emerald-700">
            {notice.text}
          </p>
        )}
      </section>
    );
  }

  const tools: Array<{ id: Tool; label: string; icon: React.ReactNode }> = [
    { id: 'select', label: 'Selecionar', icon: <MousePointer2 className="h-4 w-4" /> },
    { id: 'text', label: 'Texto', icon: <Type className="h-4 w-4" /> },
    { id: 'highlight', label: 'Destacar', icon: <Highlighter className="h-4 w-4" /> },
    { id: 'cover', label: 'Cobrir', icon: <Eraser className="h-4 w-4" /> },
  ];
  const toolHint: Record<Tool, string> = {
    select: 'Escolha uma ferramenta para editar a página.',
    text: 'Clique na página onde o texto começa.',
    highlight: 'Arraste sobre o trecho a destacar.',
    cover: 'Arraste sobre a área a cobrir com branco.',
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white" aria-label="Aplicativo PDF">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome do PDF"
          placeholder="Nome do PDF"
          className="order-first min-w-0 basis-full rounded-md sm:order-none sm:flex-1 sm:basis-auto bg-transparent px-2 py-1 text-base font-semibold text-slate-900 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 sm:text-lg"
        />
        <button
          type="button"
          onClick={() => openRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden /> Abrir outro
        </button>
        <input ref={openRef} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Escolher PDF para abrir" onChange={(e) => void onOpenFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => appendRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden /> Anexar PDF
        </button>
        <input ref={appendRef} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="Escolher PDF para anexar" onChange={(e) => void onAppendFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={downloadOriginal}
          disabled={!original}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Original
        </button>
        <button
          type="button"
          onClick={download1}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Baixar PDF editado
        </button>
      </div>

      {notice?.kind === 'err' && (
        <div role="alert" className="mx-auto mb-4 flex max-w-4xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="rounded p-0.5 text-red-700 hover:bg-red-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Ferramentas de edição e de página. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2" role="toolbar" aria-label="Ferramentas do PDF">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => {
              setTool(t.id);
              setPending(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              tool === t.id ? 'bg-white text-blue-800 shadow-sm ring-1 ring-slate-300' : 'text-slate-600 hover:bg-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
        <RibbonButton icon={<RotateCcw className="h-4 w-4" />} label="Girar à esquerda" onClick={() => void run('Página girada.', (b) => rotatePage(b, pageIndex, -90))} />
        <RibbonButton icon={<RotateCw className="h-4 w-4" />} label="Girar à direita" onClick={() => void run('Página girada.', (b) => rotatePage(b, pageIndex, 90))} />
        <RibbonButton icon={<FilePlus className="h-4 w-4" />} label="Página em branco depois desta" onClick={() => void run('Página em branco adicionada.', (b) => addBlankPage(b, pageIndex))} />
        <RibbonButton icon={<Trash2 className="h-4 w-4" />} label="Apagar esta página" onClick={confirmDelete} />
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
        <RibbonButton icon={<Undo2 className="h-4 w-4" />} label="Desfazer" onClick={doUndo} />
      </div>

      {pending && (
        <form
          className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-blue-50 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void commitText();
          }}
        >
          <label className="flex min-w-[180px] flex-1 flex-col text-[11px] font-medium text-slate-600">
            Texto na página {pending.page + 1}
            <input
              autoFocus
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              aria-label="Texto a inserir"
              placeholder="Digite o texto"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Tamanho
            <select
              value={pendingSize}
              onChange={(e) => setPendingSize(Number(e.target.value))}
              aria-label="Tamanho do texto"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {TEXT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} pt
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col text-[11px] font-medium text-slate-600">
            Cor
            <div className="flex gap-1 py-1" role="radiogroup" aria-label="Cor do texto">
              {INK_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={pendingColor === c.hex}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setPendingColor(c.hex)}
                  className={`h-6 w-6 rounded-full ring-offset-1 ${pendingColor === c.hex ? 'ring-2 ring-blue-600' : 'ring-1 ring-slate-300'}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            Inserir
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
          </button>
        </form>
      )}

      <div className="flex min-h-[520px] min-w-0 flex-1 flex-col md:flex-row">
        {/* Miniaturas: linha no celular, coluna no computador. */}
        <aside
          aria-label="Páginas do PDF"
          className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-slate-100 p-2 md:w-28 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r"
        >
          {pdfDoc && pageCount <= PDF_THUMB_LIMIT ? (
            Array.from({ length: pageCount }, (_, i) => (
              <PageThumb key={`${i}-${bytes.byteLength}`} doc={pdfDoc} pageNumber={i + 1} active={i === pageIndex} onSelect={() => setPageIndex(i)} />
            ))
          ) : (
            <span className="p-2 text-xs text-slate-500">{pageCount} páginas</span>
          )}
        </aside>

        <div ref={stageRef} className="flex min-w-0 flex-1 flex-col bg-[#e9ecef]">
          <div className="flex items-center justify-center gap-3 px-3 pt-3 text-xs text-slate-700">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              className="rounded p-1 hover:bg-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Página {pageIndex + 1} de {pageCount}
            </span>
            <button
              type="button"
              aria-label="Próxima página"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
              className="rounded p-1 hover:bg-white disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="hidden text-slate-500 sm:inline">· {toolHint[tool]}</span>
          </div>
          <div className="flex justify-center p-3">
            <div
              ref={surfaceRef}
              onPointerDown={onSurfaceDown}
              onPointerMove={onSurfaceMove}
              onPointerUp={onSurfaceUp}
              onPointerCancel={() => setDrag(null)}
              className={`relative bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2),0_6px_24px_-4px_rgba(15,23,42,0.22)] ${
                tool === 'select' ? '' : 'cursor-crosshair'
              }`}
              style={{ touchAction: tool === 'select' ? 'auto' : 'none' }}
              aria-label={`Página ${pageIndex + 1} do PDF`}
            >
              <canvas ref={canvasRef} className="block" />
              {pending && pending.page === pageIndex && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-white/70"
                  style={{ left: `${pending.at.x * 100}%`, top: `${pending.at.y * 100}%` }}
                />
              )}
              {drag && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute border ${
                    tool === 'highlight' ? 'border-amber-500 bg-yellow-300/40' : 'border-slate-400 bg-white'
                  }`}
                  style={{
                    left: `${Math.min(drag.start.x, drag.end.x) * 100}%`,
                    top: `${Math.min(drag.start.y, drag.end.y) * 100}%`,
                    width: `${Math.abs(drag.end.x - drag.start.x) * 100}%`,
                    height: `${Math.abs(drag.end.y - drag.start.y) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
          <p className="mx-auto max-w-xl px-4 pb-4 text-center text-[11px] text-slate-500">
            Cobrir põe uma área branca por cima e não apaga o texto que já estava ali. Para remover o conteúdo de verdade, use outra ferramenta antes de enviar o arquivo.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#f3f4f6] px-3 py-1.5 text-[12px] text-slate-600">
        <span role="status" className={notice?.kind === 'err' ? 'text-red-700' : notice ? 'text-emerald-700' : ''}>
          {busy ? 'Salvando alteração…' : notice?.text ?? `${pageCount} ${pageCount === 1 ? 'página' : 'páginas'} · ${undo.length} ${undo.length === 1 ? 'ação' : 'ações'} desfazíveis`}
        </span>
        <span>Grátis. Nada é enviado para fora: o PDF é editado no seu navegador.</span>
      </div>
    </section>
  );
}

export default PdfTab;
