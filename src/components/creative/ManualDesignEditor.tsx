import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ArrowDown, ArrowUp, Circle, Download, Image as ImageIcon, Square, Trash2, Type } from 'lucide-react';
import { DESIGN_FORMATS, DESIGN_FORMATS_INFO, type DesignFormat } from '@/config/designPricing';

// Editor manual de design: monta a arte camada por camada, sem IA e sem créditos.
// Tudo roda no navegador; o PNG é gerado localmente ao baixar.

const CANVAS_SIZE: Record<DesignFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  banner: { width: 1920, height: 1080 },
  poster: { width: 1080, height: 1350 },
};

const FONTS = {
  sans: { label: 'Sans', family: 'Inter, system-ui, sans-serif' },
  serif: { label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  mono: { label: 'Mono', family: 'ui-monospace, Menlo, monospace' },
} as const;
type FontKey = keyof typeof FONTS;

const LINE_HEIGHT = 1.2;
const PREVIEW_MAX = { width: 560, height: 640 };

interface Layer {
  id: string;
  kind: 'text' | 'shape' | 'image';
  x: number;
  y: number;
  // Texto mede a si mesmo; formas e imagens usam w/h.
  w: number;
  h: number;
  text?: string;
  fontKey?: FontKey;
  fontSize?: number;
  color?: string;
  shape?: 'rect' | 'ellipse';
  fill?: string;
  image?: HTMLImageElement;
}

interface Size {
  width: number;
  height: number;
}

function textLines(layer: Layer): string[] {
  return (layer.text ?? '').split('\n');
}

function setTextFont(ctx: CanvasRenderingContext2D, layer: Layer) {
  const fontSize = layer.fontSize ?? 64;
  const family = FONTS[layer.fontKey ?? 'sans'].family;
  ctx.font = `${fontSize}px ${family}`;
}

/** Caixa que ocupa a camada no canvas (x, y no topo esquerdo). */
function layerBounds(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (layer.kind !== 'text') return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
  setTextFont(ctx, layer);
  const lines = textLines(layer);
  const w = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  const h = lines.length * (layer.fontSize ?? 64) * LINE_HEIGHT;
  return { x: layer.x, y: layer.y, w, h };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  size: Size,
  background: string,
  layers: Layer[],
  selectedId: string | null,
  showSelection: boolean,
) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size.width, size.height);

  for (const layer of layers) {
    if (layer.kind === 'image' && layer.image) {
      ctx.drawImage(layer.image, layer.x, layer.y, layer.w, layer.h);
    } else if (layer.kind === 'shape') {
      ctx.fillStyle = layer.fill ?? '#f59e0b';
      ctx.beginPath();
      if (layer.shape === 'ellipse') {
        ctx.ellipse(layer.x + layer.w / 2, layer.y + layer.h / 2, layer.w / 2, layer.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.rect(layer.x, layer.y, layer.w, layer.h);
      }
      ctx.fill();
    } else if (layer.kind === 'text') {
      setTextFont(ctx, layer);
      ctx.fillStyle = layer.color ?? '#ffffff';
      ctx.textBaseline = 'top';
      const fontSize = layer.fontSize ?? 64;
      textLines(layer).forEach((line, index) => {
        ctx.fillText(line, layer.x, layer.y + index * fontSize * LINE_HEIGHT);
      });
    }
  }

  if (showSelection && selectedId) {
    const selected = layers.find((layer) => layer.id === selectedId);
    if (selected) {
      const box = layerBounds(ctx, selected);
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
      ctx.restore();
    }
  }
}

function fitImage(image: HTMLImageElement, size: Size) {
  const maxWidth = size.width * 0.6;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  return { w, h, x: (size.width - w) / 2, y: (size.height - h) / 2 };
}

export function ManualDesignEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const [format, setFormat] = useState<DesignFormat>('post');
  const [background, setBackground] = useState('#0f172a');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const size = CANVAS_SIZE[format];
  const scale = Math.min(PREVIEW_MAX.width / size.width, PREVIEW_MAX.height / size.height);
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawScene(ctx, size, background, layers, selectedId, true);
  }, [size, background, layers, selectedId]);

  const addLayer = (layer: Layer) => {
    setLayers((current) => [...current, layer]);
    setSelectedId(layer.id);
  };

  const addText = () => {
    addLayer({
      id: crypto.randomUUID(),
      kind: 'text',
      x: size.width * 0.1,
      y: size.height * 0.4,
      w: 0,
      h: 0,
      text: 'Seu título',
      fontKey: 'sans',
      fontSize: Math.round(size.width * 0.07),
      color: '#ffffff',
    });
  };

  const addShape = (shape: 'rect' | 'ellipse') => {
    addLayer({
      id: crypto.randomUUID(),
      kind: 'shape',
      shape,
      x: size.width * 0.25,
      y: size.height * 0.25,
      w: size.width * 0.5,
      h: size.height * 0.3,
      fill: '#f59e0b',
    });
  };

  const handleImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const box = fitImage(image, size);
      addLayer({ id: crypto.randomUUID(), kind: 'image', ...box, image });
    };
    image.src = url;
  };

  const updateSelected = (patch: Partial<Layer>) => {
    if (!selectedId) return;
    setLayers((current) => current.map((layer) => (layer.id === selectedId ? { ...layer, ...patch } : layer)));
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selectedId) return;
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === selectedId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setLayers((current) => current.filter((layer) => layer.id !== selectedId));
    setSelectedId(null);
  };

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * size.width,
      y: ((event.clientY - rect.top) / rect.height) * size.height,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const point = pointFromEvent(event);
    // Do topo para o fundo: a camada mais alta é a primeira a ser atingida.
    const hit = [...layers].reverse().find((layer) => {
      const box = layerBounds(ctx, layer);
      return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
    });
    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    dragRef.current = { id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    setLayers((current) =>
      current.map((layer) =>
        layer.id === drag.id ? { ...layer, x: point.x - drag.dx, y: point.y - drag.dy } : layer,
      ),
    );
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  const handleDownload = () => {
    const offscreen = document.createElement('canvas');
    offscreen.width = size.width;
    offscreen.height = size.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    drawScene(ctx, size, background, layers, null, false);
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `design-manual-${format}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const selectedIndex = selected ? layers.findIndex((layer) => layer.id === selected.id) : -1;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">Editor manual</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Monte sua arte à mão</h2>
        <p className="mt-2 text-slate-400">
          Adicione textos, formas e imagens, arraste cada camada e baixe o PNG. Sem IA e sem créditos.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {DESIGN_FORMATS.map((f) => {
              const info = DESIGN_FORMATS_INFO[f];
              const chosen = format === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                    chosen
                      ? 'border-slate-200 bg-white text-slate-900'
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {info.label} <span className="opacity-60">{info.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-center rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
            <canvas
              ref={canvasRef}
              width={size.width}
              height={size.height}
              aria-label="Área de edição do design"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              style={{ width: size.width * scale, height: size.height * scale, touchAction: 'none' }}
              className="rounded-lg shadow-lg shadow-black/40"
            />
          </div>
        </div>

        <aside className="space-y-6">
          <section aria-label="Adicionar elemento" className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Adicionar</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton icon={<Type className="w-4 h-4" />} label="Texto" onClick={addText} />
              <ToolButton icon={<ImageIcon className="w-4 h-4" />} label="Imagem" onClick={() => fileInputRef.current?.click()} />
              <ToolButton icon={<Square className="w-4 h-4" />} label="Retângulo" onClick={() => addShape('rect')} />
              <ToolButton icon={<Circle className="w-4 h-4" />} label="Elipse" onClick={() => addShape('ellipse')} />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          </section>

          <section aria-label="Fundo" className="space-y-2">
            <label htmlFor="manual-background" className="block text-sm font-semibold text-slate-200">
              Cor de fundo
            </label>
            <input
              id="manual-background"
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900/60"
            />
          </section>

          <section aria-label="Camada selecionada" className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              {selected ? `Camada selecionada: ${labelFor(selected)}` : 'Nenhuma camada selecionada'}
            </h3>

            {selected?.kind === 'text' && (
              <>
                <textarea
                  aria-label="Texto da camada"
                  value={selected.text ?? ''}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-white focus:border-amber-300/60 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-slate-400">
                    Tamanho
                    <input
                      type="number"
                      min={8}
                      max={400}
                      value={selected.fontSize ?? 64}
                      onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 8 })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-slate-400">
                    Cor do texto
                    <input
                      type="color"
                      value={selected.color ?? '#ffffff'}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      className="h-[38px] w-full rounded-lg border border-slate-700 bg-slate-900/60"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-xs text-slate-400">
                  Fonte
                  <select
                    value={selected.fontKey ?? 'sans'}
                    onChange={(e) => updateSelected({ fontKey: e.target.value as FontKey })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-sm text-white"
                  >
                    {(Object.keys(FONTS) as FontKey[]).map((key) => (
                      <option key={key} value={key}>
                        {FONTS[key].label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {selected?.kind === 'shape' && (
              <label className="block space-y-1 text-xs text-slate-400">
                Cor de preenchimento
                <input
                  type="color"
                  value={selected.fill ?? '#f59e0b'}
                  onChange={(e) => updateSelected({ fill: e.target.value })}
                  className="h-[38px] w-full rounded-lg border border-slate-700 bg-slate-900/60"
                />
              </label>
            )}

            {selected && (
              <div className="flex flex-wrap gap-2">
                <ToolButton
                  icon={<ArrowUp className="w-4 h-4" />}
                  label="Para frente"
                  disabled={selectedIndex >= layers.length - 1}
                  onClick={() => moveSelected(1)}
                />
                <ToolButton
                  icon={<ArrowDown className="w-4 h-4" />}
                  label="Para trás"
                  disabled={selectedIndex <= 0}
                  onClick={() => moveSelected(-1)}
                />
                <ToolButton icon={<Trash2 className="w-4 h-4" />} label="Excluir" onClick={deleteSelected} />
              </div>
            )}
            {!selected && <p className="text-xs text-slate-500">Clique em uma camada no canvas para editar. Arraste para mover.</p>}
          </section>

          <button
            type="button"
            onClick={handleDownload}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 font-semibold transition-all hover:shadow-lg hover:shadow-amber-500/20"
          >
            <Download className="w-4 h-4" aria-hidden />
            Baixar PNG
          </button>
        </aside>
      </div>
    </div>
  );
}

function labelFor(layer: Layer): string {
  if (layer.kind === 'text') return 'Texto';
  if (layer.kind === 'image') return 'Imagem';
  return layer.shape === 'ellipse' ? 'Elipse' : 'Retângulo';
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {icon}
      {label}
    </button>
  );
}
