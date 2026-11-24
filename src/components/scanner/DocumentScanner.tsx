// Scanner de documentos do Vertal Chat (painel criativo). Fotografe ou envie uma foto, ajuste os cantos,
// escolha o filtro e exporte um PDF. O processamento roda no seu navegador: a imagem não é enviada a servidores.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Camera, Check, Download, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { buildScanPdf } from '@/lib/scanner/pdf';
import { deliverPdf, isNativeApp, takeNativePhoto } from '@/lib/scanner/platform';
import { SCANNER_PDF_CREDITS, scannerChargeMessage } from '@/lib/scanner/pricing';
import { supabase } from '@/integrations/supabase/client';
import { enhance, insetQuad, outputSize, warpPerspective, type Pt, type Quad, type ScanMode } from '@/lib/scanner/geometry';
import { cn } from '@/lib/utils';

/** Cantos em coordenadas 0..1 da imagem, para o tamanho da tela não importar. */
type NormQuad = [Pt, Pt, Pt, Pt];

interface ScanPage {
  id: string;
  source: HTMLCanvasElement;
  quad: NormQuad;
  thumb: string | null;
}

const MAX_INPUT_SIDE = 2400;
const MODES: { key: ScanMode; label: string; hint: string }[] = [
  { key: 'bw', label: 'P&B (texto)', hint: 'Melhor para contratos e recibos' },
  { key: 'gray', label: 'Cinza', hint: 'Mantém sombras e fotos' },
  { key: 'color', label: 'Colorida', hint: 'Sem filtro' },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const defaultQuad = (): NormQuad => insetQuad(1, 1, 0.06) as NormQuad;

function toPixelQuad(q: NormQuad, w: number, h: number): Quad {
  return q.map((p) => ({ x: p.x * (w - 1), y: p.y * (h - 1) })) as Quad;
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Retifica e filtra uma página no tamanho real da foto. */
function processPage(page: ScanPage, mode: ScanMode): HTMLCanvasElement {
  const { source, quad } = page;
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não permitiu processar a imagem.');
  const raw = ctx.getImageData(0, 0, source.width, source.height);
  const pixelQuad = toPixelQuad(quad, source.width, source.height);
  const { width, height } = outputSize(pixelQuad);
  const warped = enhance(warpPerspective({ data: raw.data, width: source.width, height: source.height }, pixelQuad, width, height), mode);
  const out = document.createElement('canvas');
  out.width = warped.width;
  out.height = warped.height;
  out.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(warped.data), warped.width, warped.height), 0, 0);
  return out;
}

const canvasToJpeg = (canvas: HTMLCanvasElement, quality = 0.9) =>
  new Promise<Uint8Array>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b))) : reject(new Error('Não consegui gerar a imagem.'))),
      'image/jpeg',
      quality,
    ),
  );

export function DocumentScanner() {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanMode>('bw');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const dragIndex = useRef<number | null>(null);

  const active = pages.find((p) => p.id === activeId) ?? null;

  // Desenha a foto ativa no canvas de exibição (a área de ajuste dos cantos fica por cima).
  useEffect(() => {
    const canvas = displayRef.current;
    if (!active || !canvas) return;
    canvas.width = active.source.width;
    canvas.height = active.source.height;
    canvas.getContext('2d')?.drawImage(active.source, 0, 0);
  }, [active]);

  async function addPhotos(input: FileList | File[] | null) {
    if (!input || input.length === 0) return;
    setBusy(true);
    try {
      const added: ScanPage[] = [];
      for (const file of Array.from(input)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`"${file.name}" não é uma imagem.`);
          continue;
        }
        const source = await fileToCanvas(file);
        added.push({ id: crypto.randomUUID(), source, quad: defaultQuad(), thumb: null });
      }
      if (added.length) {
        setPages((prev) => [...prev, ...added]);
        setActiveId(added[added.length - 1].id);
      }
    } catch {
      toast.error('Não consegui abrir essa foto. Tente outra imagem.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function takePhoto() {
    try {
      const file = await takeNativePhoto();
      if (file) await addPhotos([file]);
    } catch {
      toast.error('Não consegui abrir a câmera. Confira a permissão de câmera do aparelho.');
    }
  }

  function updateActive(mutate: (p: ScanPage) => ScanPage) {
    if (!activeId) return;
    setPages((prev) => prev.map((p) => (p.id === activeId ? mutate(p) : p)));
  }

  function confirmActive() {
    if (!active) return;
    try {
      const out = processPage(active, mode);
      const thumb = out.toDataURL('image/jpeg', 0.7);
      updateActive((p) => ({ ...p, thumb }));
      toast.success('Página pronta.');
    } catch {
      toast.error('Não consegui recortar esta página. Ajuste os cantos e tente de novo.');
    }
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }

  function onHandleDown(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIndex.current = index;
  }

  function onHandleMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const i = dragIndex.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (i === null || !rect || !activeId) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    updateActive((p) => {
      const quad = [...p.quad] as NormQuad;
      quad[i] = { x, y };
      return { ...p, quad, thumb: null };
    });
  }

  async function exportPdf() {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      // Cobra antes de montar o PDF: se faltar saldo, nada é entregue.
      const { data, error } = await supabase.functions.invoke('scanner-export', {
        body: { pages: pages.length },
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
      });
      if (error || !data?.ok) {
        // Em erro HTTP o corpo (com o código, ex.: insufficient_credits) vem em error.context.
        let code: string | undefined;
        try {
          code = (await (error as { context?: Response } | null)?.context?.json())?.error;
        } catch {
          code = undefined;
        }
        toast.error(scannerChargeMessage(code));
        return;
      }
      const jpegs = [];
      for (const page of pages) {
        const out = processPage(page, mode);
        jpegs.push({ jpeg: await canvasToJpeg(out), width: out.width, height: out.height });
      }
      const bytes = await buildScanPdf(jpegs);
      const result = await deliverPdf(bytes, `documento-escaneado-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(result === 'shared' ? `PDF com ${pages.length} página(s) pronto para salvar ou enviar.` : `PDF com ${pages.length} página(s) baixado.`);
    } catch {
      toast.error('Não consegui gerar o PDF. Revise os cantos das páginas.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Scanner de documentos">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Scanner de documentos</h2>
        <p className="text-sm text-muted-foreground">
          Transforme fotos de papéis em um PDF limpo e nítido. Tudo acontece no seu navegador: a foto não sai do aparelho.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {isNativeApp() ? (
          <Button onClick={() => void takePhoto()} disabled={busy}>
            <Camera className="mr-2 h-4 w-4" /> Fotografar
          </Button>
        ) : null}
        <Button onClick={() => fileRef.current?.click()} disabled={busy} variant={isNativeApp() ? 'outline' : 'default'}>
          <Plus className="mr-2 h-4 w-4" /> {isNativeApp() ? 'Galeria' : 'Adicionar foto'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => void addPhotos(e.target.files)}
          aria-label="Escolher fotos do documento"
        />
        <Button variant="secondary" onClick={() => void exportPdf()} disabled={busy || pages.length === 0}>
          <Download className="mr-2 h-4 w-4" /> {isNativeApp() ? 'Salvar PDF' : 'Exportar PDF'} · {SCANNER_PDF_CREDITS} créditos
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtro do documento">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={mode === m.key}
            title={m.hint}
            onClick={() => setMode(m.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition',
              mode === m.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {active ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Arraste os quatro cantos até a borda da folha e confirme.</p>
          <div ref={stageRef} className="relative w-full select-none overflow-hidden rounded-lg border bg-muted touch-none">
            <canvas ref={displayRef} className="block h-auto w-full" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
              <polygon
                points={active.quad.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(0,160,255,0.15)"
                stroke="rgb(0,160,255)"
                strokeWidth={0.004}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {active.quad.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Canto ${['superior esquerdo', 'superior direito', 'inferior direito', 'inferior esquerdo'][i]}`}
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={() => (dragIndex.current = null)}
                onPointerCancel={() => (dragIndex.current = null)}
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[rgb(0,160,255)] shadow touch-none"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmActive} disabled={busy}>
              <Check className="mr-2 h-4 w-4" /> Confirmar página
            </Button>
            <Button variant="outline" onClick={() => updateActive((p) => ({ ...p, quad: defaultQuad(), thumb: null }))}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restaurar cantos
            </Button>
            <Button variant="ghost" onClick={() => removePage(active.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover página
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p className="text-sm">Adicione uma foto de documento para começar.</p>
        </div>
      )}

      {pages.length > 0 && (
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Páginas do documento">
          {pages.map((p, idx) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setActiveId(p.id)}
                aria-current={p.id === activeId}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-md border p-1 text-xs',
                  p.id === activeId ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                )}
              >
                {p.thumb ? (
                  <img src={p.thumb} alt={`Página ${idx + 1} recortada`} className="h-24 w-full rounded object-contain bg-white" />
                ) : (
                  <span className="flex h-24 w-full items-center justify-center rounded bg-muted">Página {idx + 1}</span>
                )}
                <span>{p.thumb ? `Página ${idx + 1} · pronta` : `Página ${idx + 1} · ajustar`}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default DocumentScanner;
