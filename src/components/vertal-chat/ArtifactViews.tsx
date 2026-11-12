// O que o agente entrega dentro da conversa: cartão na mensagem e visualização completa no painel lateral.
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  AppWindow, BookMarked, BookOpen, Check, Code2, Copy, Download, ExternalLink, FileText, Film, Sparkles, Globe, Image as ImageIcon,
  LayoutTemplate, Loader2, Mail, Music, Palette, Presentation, Radio, Scissors, Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { KIND_LABEL, type Artifact, type ArtifactKind, type StoredImage } from '@/lib/chatAgent/artifacts';
import type { CanvasSpec } from '@/lib/chatAgent/contract';
import { CANVAS_HEX, CANVAS_LINE_HEIGHT, describeCanvas, wrapCanvasText } from '@/lib/chatAgent/canvasSpec';
import { resolveStoredImage } from '@/lib/chatAgent/runAction';
import { previewHtml } from '@/lib/chatAgent/previewHtml';

const KIND_ICON: Record<ArtifactKind, typeof FileText> = {
  image: ImageIcon,
  design: Palette,
  doc: FileText,
  sheet: Table2,
  slides: Presentation,
  email: Mail,
  canvas: LayoutTemplate,
  app: AppWindow,
  music: Music,
  ebook: BookOpen,
  notebook: BookMarked,
  video_studio: Film,
  clips: Scissors,
  emo: Sparkles,
  podcast_studio: Radio,
  download: Download,
  api: Globe,
};

/** Imagem guardada no bucket privado: renova a URL assinada quando a conversa é reaberta. */
function StoredImg({ image, alt, className }: { image: StoredImage; alt: string; className?: string }) {
  const [url, setUrl] = useState(image.url);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (image.url) {
      setUrl(image.url);
      return;
    }
    resolveStoredImage(image).then((resolved) => {
      if (!alive) return;
      if (resolved.url) setUrl(resolved.url);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [image]);
  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-xs text-muted-foreground', className)}>
        Imagem indisponível
      </div>
    );
  }
  if (!url) return <div className={cn('animate-pulse bg-muted', className)} aria-label="Carregando imagem" />;
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}

/** Prévia do layout de Canvas: mesmas cores e posições que o editor recebe. */
export const CanvasPreview = memo(function CanvasPreview({ spec, className }: { spec: CanvasSpec; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      role="img"
      aria-label={describeCanvas(spec)}
      className={className}
      style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
    >
      <rect width={spec.width} height={spec.height} fill={CANVAS_HEX[spec.background]} />
      {spec.elements.map((el, i) => {
        if (el.type !== 'text') {
          return el.type === 'rect' ? (
            <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} fill={CANVAS_HEX[el.color]} />
          ) : (
            <ellipse key={i} cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={CANVAS_HEX[el.color]} />
          );
        }
        const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
        const x = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
        return (
          <text
            key={i}
            x={x}
            y={el.y}
            fontSize={el.size}
            fontWeight={el.bold ? 700 : 400}
            fontFamily="Inter, system-ui, sans-serif"
            textAnchor={anchor}
            fill={CANVAS_HEX[el.color]}
          >
            {wrapCanvasText(el).map((line, n) => (
              <tspan key={n} x={x} dy={n === 0 ? el.size : el.size * CANVAS_LINE_HEIGHT}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
});

function summary(a: Artifact): string {
  switch (a.kind) {
    case 'doc': return `${a.doc.blocks.length} blocos`;
    case 'sheet': return `${Object.keys(a.sheet.cells).length} células`;
    case 'slides': return `${a.deck.slides.length} slides`;
    case 'canvas': return `${a.spec.width}×${a.spec.height} · ${a.spec.elements.length} elementos`;
    case 'app': return 'Prévia interativa';
    case 'music': return `${a.tracks.length} faixa${a.tracks.length === 1 ? '' : 's'}`;
    case 'ebook': return `${Math.max(1, Math.round(a.content.split(/\s+/).length / 250))} páginas aprox.`;
    case 'notebook': return 'Notas, PDFs e links';
    case 'video_studio': return `${a.aspect} · ${a.style}`;
    case 'clips': return `${a.theme} · ${a.mood}`;
    case 'emo': return 'Animar foto com movimento';
    case 'podcast_studio': return `${a.duration}min · ${a.style}`;
    case 'api': return `HTTP ${a.status}`;
    case 'download': return a.format.toUpperCase();
    case 'email': return 'Rascunho';
    case 'design': return `${a.images.length} variação${a.images.length === 1 ? '' : 'ões'}`;
    default: return '';
  }
}

/** Cartão do artefato dentro da mensagem. Clicar abre a visualização completa ao lado. */
export function ArtifactCard({ artifact, onOpen, active }: { artifact: Artifact; onOpen: () => void; active?: boolean }) {
  const Icon = KIND_ICON[artifact.kind];
  const visual =
    artifact.kind === 'image' ? [artifact.image] : artifact.kind === 'design' ? artifact.images : null;

  if (visual) {
    return (
      <div className={cn('grid gap-2', visual.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {visual.map((image, i) => (
          <button
            key={i}
            type="button"
            onClick={onOpen}
            aria-label={`Abrir ${KIND_LABEL[artifact.kind].toLowerCase()}: ${artifact.title}`}
            className="group overflow-hidden rounded-2xl border border-border/60 bg-card transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StoredImg image={image} alt={artifact.title} className="max-h-[420px] w-full object-cover transition group-hover:scale-[1.01]" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-card transition',
        active ? 'border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]' : 'border-border/60 hover:border-primary/40',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{artifact.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {KIND_LABEL[artifact.kind]}
            {summary(artifact) ? ` · ${summary(artifact)}` : ''}
          </span>
        </span>
        <span className="shrink-0 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium text-foreground/80">Abrir</span>
      </button>
      {artifact.kind === 'canvas' && (
        <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden className="block w-full border-t border-border/50 bg-muted/30 p-3">
          <CanvasPreview spec={artifact.spec} className="mx-auto max-h-64 w-auto max-w-full rounded-lg shadow-lg" />
        </button>
      )}
      {artifact.kind === 'music' && (
        <div className="space-y-2 border-t border-border/50 px-4 py-3">
          {artifact.tracks.map((t) => (
            <div key={t.audioUrl}>
              <p className="mb-1 truncate text-xs text-muted-foreground">{t.title}</p>
              <audio controls preload="none" src={t.audioUrl} className="h-9 w-full" />
            </div>
          ))}
        </div>
      )}
      {artifact.kind === 'notebook' && (
        <div className="border-t border-border/50 p-4 text-center">
          <div className="text-4xl">{artifact.emoji || '📓'}</div>
        </div>
      )}
      {artifact.kind === 'video_studio' && (
        <div className="border-t border-border/50 p-4 text-center">
          <div className="text-4xl">🎬</div>
          <p className="mt-2 text-xs text-muted-foreground">{artifact.aspect} · {artifact.style}</p>
        </div>
      )}
    </div>
  );
}

// ─── Visualização completa ───────────────────────────────────────────────

export interface ViewerActions {
  openInOffice: (artifact: Extract<Artifact, { kind: 'doc' | 'sheet' | 'slides' }>) => void;
  openInCanvas: (artifact: Extract<Artifact, { kind: 'canvas' }>) => void;
  openInBuilder: (artifact: Extract<Artifact, { kind: 'app' }>) => void;
}

const actionBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-primary/50 hover:text-foreground disabled:opacity-50';
const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50';

function saveBlob(data: BlobPart | Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (title: string) => title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'vertal';

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={actionBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error('Não foi possível copiar.');
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copiado' : label}
    </button>
  );
}

/** Botão que gera o arquivo sob demanda (as bibliotecas de exportação só carregam no clique). */
function ExportButton({ label, run }: { label: string; run: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  return (
    <button
      type="button"
      className={actionBtn}
      disabled={working}
      onClick={async () => {
        setWorking(true);
        try {
          await run();
        } catch {
          toast.error('Não foi possível exportar o arquivo.');
        } finally {
          setWorking(false);
        }
      }}
    >
      {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

async function downloadImage(image: StoredImage, title: string) {
  const resolved = await resolveStoredImage(image);
  try {
    const blob = await (await fetch(resolved.url)).blob();
    saveBlob(blob, `${fileName(title)}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`, blob.type || 'image/png');
  } catch {
    // Servidor da imagem sem CORS: abre em outra aba para salvar por lá.
    window.open(resolved.url, '_blank', 'noopener');
  }
}

const proseComponents = {
  h1: ({ children }: { children?: ReactNode }) => <h2 className="mb-3 mt-6 text-xl font-semibold first:mt-0">{children}</h2>,
  h2: ({ children }: { children?: ReactNode }) => <h3 className="mb-2 mt-5 text-lg font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }: { children?: ReactNode }) => <h4 className="mb-2 mt-4 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }: { children?: ReactNode }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">{children}</a>
  ),
  code: ({ children }: { children?: ReactNode }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }: { children?: ReactNode }) => <pre className="mb-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs">{children}</pre>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-3 border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>
  ),
};

/** Markdown das respostas do agente e do ebook. HTML bruto não é interpretado. */
export const ChatMarkdown = memo(function ChatMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('text-[15px] text-foreground/90', className)}>
      <ReactMarkdown components={proseComponents}>{text}</ReactMarkdown>
    </div>
  );
});

function Paper({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl rounded-xl bg-white px-6 py-8 text-slate-900 shadow-xl sm:px-10">{children}</div>;
}

function SheetTable({ artifact }: { artifact: Extract<Artifact, { kind: 'sheet' }> }) {
  const grid = useMemo(() => {
    let rows = 0;
    let cols = 0;
    const cells = new Map<string, string>();
    for (const [ref, raw] of Object.entries(artifact.sheet.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(ref);
      if (!m) continue;
      const col = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const row = Number(m[2]) - 1;
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
      cells.set(`${row}:${col}`, String(raw));
    }
    return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cells.get(`${r}:${c}`) ?? ''));
  }, [artifact.sheet.cells]);
  if (grid.length === 0) return <p className="text-sm text-muted-foreground">Planilha vazia.</p>;
  const [head, ...body] = grid;
  return (
    <div className="overflow-auto rounded-xl border border-border/60">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60">
            {head.map((h, i) => (
              <th key={i} scope="col" className="border-b border-border/60 px-3 py-2 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="odd:bg-background even:bg-muted/20">
              {row.map((cell, c) => (
                <td key={c} className={cn('border-b border-border/30 px-3 py-1.5', /^-?[\d.,]+%?$/.test(cell) && 'text-right tabular-nums')}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppView({ html }: { html: string }) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="mb-3 inline-flex self-start rounded-lg border border-border/60 p-0.5 text-xs">
        {(['preview', 'code'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium', tab === t ? 'bg-secondary text-foreground' : 'text-muted-foreground')}
          >
            {t === 'preview' ? <AppWindow className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
            {t === 'preview' ? 'Prévia' : 'Código'}
          </button>
        ))}
      </div>
      {tab === 'preview' ? (
        // Sem allow-same-origin: o app gerado roda isolado, sem acesso à sessão do usuário.
        <iframe
          title="Prévia do aplicativo"
          srcDoc={previewHtml(html)}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          className="min-h-[60vh] w-full flex-1 rounded-xl border border-border/60 bg-white"
        />
      ) : (
        <pre className="flex-1 overflow-auto rounded-xl bg-black/50 p-4 text-xs leading-relaxed text-foreground/90">{html}</pre>
      )}
    </div>
  );
}

/** Cabeçalho de ações + conteúdo do artefato aberto no painel lateral. */
export function ArtifactViewer({ artifact, actions }: { artifact: Artifact; actions: ViewerActions }) {
  const a = artifact;
  let toolbar: ReactNode = null;
  let body: ReactNode = null;

  switch (a.kind) {
    case 'image':
    case 'design': {
      const images = a.kind === 'image' ? [a.image] : a.images;
      toolbar = images.map((img, i) => (
        <button key={i} type="button" className={actionBtn} onClick={() => void downloadImage(img, `${a.title}${images.length > 1 ? `-${i + 1}` : ''}`)}>
          <Download className="h-3.5 w-3.5" /> Baixar{images.length > 1 ? ` ${i + 1}` : ''}
        </button>
      ));
      body = (
        <div className="space-y-4">
          {images.map((img, i) => (
            <StoredImg key={i} image={img} alt={a.title} className="mx-auto max-h-[75vh] w-auto max-w-full rounded-xl shadow-2xl" />
          ))}
          <p className="text-xs text-muted-foreground">Pedido: {a.prompt}</p>
        </div>
      );
      break;
    }
    case 'doc':
      toolbar = (
        <>
          <button type="button" className={primaryBtn} onClick={() => actions.openInOffice(a)}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir no Office
          </button>
          <ExportButton label="Word" run={async () => {
            const { docToDocx } = await import('@/lib/office/officeFiles');
            saveBlob(await docToDocx(a.doc), `${fileName(a.title)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          }} />
          <ExportButton label="PDF" run={async () => {
            const { docToPdf } = await import('@/lib/office/pdfGenerate');
            saveBlob(await docToPdf(a.doc), `${fileName(a.title)}.pdf`, 'application/pdf');
          }} />
        </>
      );
      body = (
        <Paper>
          <h1 className="mb-5 text-2xl font-bold">{a.doc.title}</h1>
          {a.doc.blocks.map((b) =>
            b.type === 'heading' ? (
              <h2 key={b.id} className="mb-2 mt-6 text-lg font-semibold">{b.text}</h2>
            ) : b.type === 'bullet' ? (
              <p key={b.id} className="mb-1.5 flex gap-2 leading-relaxed"><span aria-hidden>•</span><span>{b.text}</span></p>
            ) : (
              <p key={b.id} className="mb-3 leading-relaxed">{b.text}</p>
            ),
          )}
        </Paper>
      );
      break;
    case 'sheet':
      toolbar = (
        <>
          <button type="button" className={primaryBtn} onClick={() => actions.openInOffice(a)}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir no Office
          </button>
          <ExportButton label="Excel" run={async () => {
            const { sheetToXlsx } = await import('@/lib/office/sheetModel');
            saveBlob(sheetToXlsx(a.sheet), `${fileName(a.title)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          }} />
          <ExportButton label="CSV" run={async () => {
            const { sheetToCsv } = await import('@/lib/office/sheetModel');
            saveBlob(sheetToCsv(a.sheet.cells), `${fileName(a.title)}.csv`, 'text/csv;charset=utf-8');
          }} />
        </>
      );
      body = <SheetTable artifact={a} />;
      break;
    case 'slides':
      toolbar = (
        <>
          <button type="button" className={primaryBtn} onClick={() => actions.openInOffice(a)}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir no Office
          </button>
          <ExportButton label="PowerPoint" run={async () => {
            const { deckToPptx } = await import('@/lib/office/officeFiles');
            saveBlob(await deckToPptx(a.deck), `${fileName(a.title)}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
          }} />
        </>
      );
      body = (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
          {a.deck.slides.map((s, i) => (
            <li key={s.id} className="flex aspect-video flex-col overflow-hidden rounded-xl bg-white p-5 text-slate-900 shadow-xl">
              <span className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-600">Slide {i + 1}</span>
              <h3 className="mb-2 text-base font-bold leading-snug">{s.title}</h3>
              <ul className="min-h-0 flex-1 space-y-1 overflow-hidden text-xs leading-snug text-slate-700">
                {s.bullets.map((b, n) => (
                  <li key={n} className="flex gap-1.5"><span aria-hidden className="text-blue-600">•</span><span>{b}</span></li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      );
      break;
    case 'email':
      toolbar = (
        <>
          <CopyButton text={`${a.subject}\n\n${a.body}`} />
          <a className={actionBtn} href={`mailto:?subject=${encodeURIComponent(a.subject)}&body=${encodeURIComponent(a.body)}`}>
            <Mail className="h-3.5 w-3.5" /> Abrir no e-mail
          </a>
        </>
      );
      body = (
        <Paper>
          <p className="mb-4 border-b border-slate-200 pb-3 text-sm"><span className="text-slate-500">Assunto: </span><strong>{a.subject}</strong></p>
          <p className="whitespace-pre-wrap leading-relaxed">{a.body}</p>
        </Paper>
      );
      break;
    case 'canvas':
      toolbar = (
        <button type="button" className={primaryBtn} onClick={() => actions.openInCanvas(a)}>
          <ExternalLink className="h-3.5 w-3.5" /> Abrir no Canvas para editar
        </button>
      );
      body = (
        <div className="space-y-3">
          <CanvasPreview spec={a.spec} className="mx-auto max-h-[72vh] w-auto max-w-full rounded-xl shadow-2xl" />
          <p className="text-center text-xs text-muted-foreground">No Canvas cada texto e forma é editável, e dá para exportar em PNG.</p>
        </div>
      );
      break;
    case 'app':
      toolbar = (
        <>
          {a.projectId && (
            <button type="button" className={primaryBtn} onClick={() => actions.openInBuilder(a)}>
              <ExternalLink className="h-3.5 w-3.5" /> Abrir no Dev Code
            </button>
          )}
          <button type="button" className={actionBtn} onClick={() => saveBlob(a.html, `${fileName(a.title)}.html`, 'text/html')}>
            <Download className="h-3.5 w-3.5" /> Baixar HTML
          </button>
        </>
      );
      body = a.html ? <AppView html={a.html} /> : <p className="text-sm text-muted-foreground">Este app está salvo no Dev Code. Abra por lá para ver a prévia.</p>;
      break;
    case 'music':
      body = (
        <ul className="space-y-4">
          {a.tracks.map((t) => (
            <li key={t.audioUrl} className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
              {t.imageUrl && <img src={t.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="mb-2 truncate text-sm font-semibold">{t.title}</p>
                <audio controls preload="none" src={t.audioUrl} className="w-full" />
              </div>
              <a href={t.audioUrl} target="_blank" rel="noreferrer noopener" className={actionBtn} aria-label={`Baixar ${t.title}`}>
                <Download className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      );
      break;
    case 'ebook':
      toolbar = (
        <>
          <button type="button" className={actionBtn} onClick={() => saveBlob(a.content, `${fileName(a.title)}.md`, 'text/markdown')}>
            <Download className="h-3.5 w-3.5" /> Baixar texto
          </button>
          <CopyButton text={a.content} />
        </>
      );
      body = (
        <div className="mx-auto max-w-3xl space-y-6">
          {a.cover && <img src={a.cover} alt={`Capa de ${a.title}`} className="mx-auto max-h-96 rounded-xl shadow-2xl" />}
          <ChatMarkdown text={a.content} />
        </div>
      );
      break;
    case 'notebook':
      body = (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">{a.emoji || '📓'}</div>
          <h3 className="text-lg font-semibold">{a.title}</h3>
          {a.description && <p className="max-w-xs text-sm text-muted-foreground">{a.description}</p>}
          <p className="mt-4 text-sm text-muted-foreground">Abra o painel do Notebook para começar a adicionar notas, PDFs e links.</p>
        </div>
      );
      break;
    case 'video_studio':
      body = (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">🎬</div>
          <h3 className="text-lg font-semibold">{a.title}</h3>
          {a.description && <p className="max-w-xs text-sm text-muted-foreground">{a.description}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 px-3 py-1">{a.tier}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">{a.aspect}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">{a.style}</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Abra o painel do Estúdio de Vídeo para fazer upload das imagens e gerar seu vídeo.</p>
        </div>
      );
      break;
    case 'clips':
      body = (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">✂️</div>
          <h3 className="text-lg font-semibold">{a.title}</h3>
          {a.description && <p className="max-w-xs text-sm text-muted-foreground">{a.description}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 px-3 py-1">{a.theme}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">{a.mood}</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Abra o painel de Cortes para fazer upload do vídeo e gerar seus cortes virais em 9:16.</p>
        </div>
      );
      break;
    case 'emo':
      body = (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">✨</div>
          <h3 className="text-lg font-semibold">{a.title}</h3>
          {a.description && <p className="max-w-xs text-sm text-muted-foreground">{a.description}</p>}
          <p className="mt-4 text-sm text-muted-foreground">Abra o painel EMO para carregar uma foto e um vídeo de referência de movimento.</p>
        </div>
      );
      break;
    case 'podcast_studio':
      body = (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">🎙️</div>
          <h3 className="text-lg font-semibold">{a.title}</h3>
          <p className="text-sm text-muted-foreground">Duração: {a.duration || 20} min · Estilo: {a.style || 'conversacional'}</p>
          <p className="mt-4 text-sm text-muted-foreground">Abra o painel Podcast Studio para gerar seu episódio original com IA.</p>
        </div>
      );
      break;
    case 'download':
      body = (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <Download className="h-10 w-10 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Seu arquivo {a.format.toUpperCase()} está pronto.</p>
          <a href={a.url} target="_blank" rel="noreferrer noopener" className={primaryBtn}>Baixar arquivo</a>
        </div>
      );
      break;
    case 'api':
      toolbar = <CopyButton text={a.body} label="Copiar resposta" />;
      body = (
        <div className="space-y-3">
          <p className="text-sm">
            <span className={cn('mr-2 rounded-md px-2 py-0.5 text-xs font-semibold', a.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-destructive/15 text-destructive')}>
              HTTP {a.status || 'sem resposta'}
            </span>
            <span className="text-muted-foreground">{a.method} {a.host}</span>
          </p>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/50 p-4 text-xs leading-relaxed">{prettyJson(a.body)}</pre>
        </div>
      );
      break;
  }

  return (
    <div className="flex h-full flex-col">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2.5">{toolbar}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">{body}</div>
    </div>
  );
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
