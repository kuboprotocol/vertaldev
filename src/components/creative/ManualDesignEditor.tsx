import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ArrowDown, ArrowUp, Circle, Download, Image as ImageIcon, Square, Trash2, Type, X } from 'lucide-react';
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
// Alças de redimensionar: tamanho visual e área de toque, em pixels do canvas.
const HANDLE_SIZE = 28;
const HANDLE_HIT = 56;
// Menor tamanho de uma camada ao redimensionar (evita sumir com a camada).
const MIN_SIZE = 24;

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
      const frame = frameOf(layerBounds(ctx, selected));
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      // Alças nos cantos: tamanho fixo na tela, para puxar e redimensionar.
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      for (const point of Object.values(cornersOf(frame))) {
        const x = point.x - HANDLE_SIZE / 2;
        const y = point.y - HANDLE_SIZE / 2;
        ctx.fillRect(x, y, HANDLE_SIZE, HANDLE_SIZE);
        ctx.strokeRect(x, y, HANDLE_SIZE, HANDLE_SIZE);
      }
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

/** Leva uma camada de um formato para outro. Posição e tamanho acompanham o canvas; imagens e texto mantêm a proporção. */
function fitLayerToSize(layer: Layer, from: Size, to: Size): Layer {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const uniform = Math.min(sx, sy);
  const x = Math.min(Math.max(layer.x * sx, 0), to.width);
  const y = Math.min(Math.max(layer.y * sy, 0), to.height);
  if (layer.kind === 'text') return { ...layer, x, y, fontSize: (layer.fontSize ?? 64) * uniform };
  if (layer.kind === 'image') return { ...layer, x, y, w: layer.w * uniform, h: layer.h * uniform };
  return { ...layer, x, y, w: layer.w * sx, h: layer.h * sy };
}

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Corner = 'nw' | 'ne' | 'sw' | 'se';

// Gesto em andamento: arrastar, puxar uma alça de canto ou pinçar com dois dedos.
type Gesture =
  | { type: 'drag'; id: string; dx: number; dy: number }
  | { type: 'resize'; id: string; base: Layer; baseBox: Box; anchor: Point; grab: Point }
  | { type: 'pinch'; id: string; base: Layer; baseBox: Box; startDist: number; startCenter: Point };

const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

/** Moldura de seleção: a caixa da camada com a folga de 6px usada no traço tracejado. */
function frameOf(box: Box): Box {
  return { x: box.x - 6, y: box.y - 6, w: box.w + 12, h: box.h + 12 };
}

function cornersOf(box: Box): Record<Corner, Point> {
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    sw: { x: box.x, y: box.y + box.h },
    se: { x: box.x + box.w, y: box.y + box.h },
  };
}

/** Qual alça de canto da moldura está sob o ponto, se alguma. */
function cornerAt(box: Box, point: Point): Corner | null {
  const corners = cornersOf(frameOf(box));
  const keys = Object.keys(corners) as Corner[];
  return keys.find((key) => Math.hypot(corners[key].x - point.x, corners[key].y - point.y) <= HANDLE_HIT) ?? null;
}

/** Escala de uma camada com a âncora parada: o canto oposto ao que foi puxado, ou o centro do pinça. */
function scaleLayer(base: Layer, anchor: Point, sx: number, sy: number): Layer {
  const x = anchor.x + (base.x - anchor.x) * sx;
  const y = anchor.y + (base.y - anchor.y) * sy;
  if (base.kind === 'text') return { ...base, x, y, fontSize: Math.max(8, (base.fontSize ?? 64) * sx) };
  return { ...base, x, y, w: base.w * sx, h: base.h * sy };
}

/** Menor escala que ainda deixa a camada com MIN_SIZE no lado mais curto. */
function minScaleFor(box: Box): number {
  return MIN_SIZE / Math.max(1, Math.min(box.w, box.h));
}

export function ManualDesignEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFieldRef = useRef<HTMLTextAreaElement>(null);
  const focusTextOnAddRef = useRef(false);
  const gestureRef = useRef<Gesture | null>(null);
  // Ponteiros ativos sobre o canvas, em coordenadas do design (um por dedo ou mouse).
  const pointersRef = useRef(new Map<number, Point>());

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

  // No celular o campo de texto fica abaixo do canvas: focar e selecionar o texto faz o teclado abrir já editável.
  useEffect(() => {
    const field = textFieldRef.current;
    if (!focusTextOnAddRef.current || !field) return;
    focusTextOnAddRef.current = false;
    field.focus();
    field.select();
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedId]);

  const addLayer = (layer: Layer) => {
    setLayers((current) => [...current, layer]);
    setSelectedId(layer.id);
  };

  const handleFormatChange = (next: DesignFormat) => {
    if (next === format) return;
    const from = CANVAS_SIZE[format];
    const to = CANVAS_SIZE[next];
    setLayers((current) => current.map((layer) => fitLayerToSize(layer, from, to)));
    setFormat(next);
  };

  const addText = () => {
    focusTextOnAddRef.current = true;
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

  const replaceLayer = (next: Layer) => {
    setLayers((current) => current.map((layer) => (layer.id === next.id ? next : layer)));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    canvas.setPointerCapture(event.pointerId);
    const selectedLayer = selectedId ? layers.find((layer) => layer.id === selectedId) : undefined;

    // Dois dedos: pinça na camada selecionada (aumenta, diminui e move junto).
    if (pointersRef.current.size === 2) {
      if (selectedLayer) {
        const [a, b] = [...pointersRef.current.values()];
        gestureRef.current = {
          type: 'pinch',
          id: selectedLayer.id,
          base: selectedLayer,
          baseBox: layerBounds(ctx, selectedLayer),
          startDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      } else {
        gestureRef.current = null;
      }
      return;
    }
    if (pointersRef.current.size > 2) return;

    // Alça de canto da camada selecionada: a âncora é o canto oposto, que fica parado.
    if (selectedLayer) {
      const baseBox = layerBounds(ctx, selectedLayer);
      const corner = cornerAt(baseBox, point);
      if (corner) {
        const corners = cornersOf(baseBox);
        gestureRef.current = {
          type: 'resize',
          id: selectedLayer.id,
          base: selectedLayer,
          baseBox,
          anchor: corners[OPPOSITE[corner]],
          grab: corners[corner],
        };
        return;
      }
    }

    // Do topo para o fundo: a camada mais alta é a primeira a ser atingida.
    const hit = [...layers].reverse().find((layer) => {
      const box = layerBounds(ctx, layer);
      return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
    });
    if (!hit) {
      gestureRef.current = null;
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    gestureRef.current = { type: 'drag', id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.type === 'drag') {
      setLayers((current) =>
        current.map((layer) =>
          layer.id === gesture.id ? { ...layer, x: point.x - gesture.dx, y: point.y - gesture.dy } : layer,
        ),
      );
      return;
    }

    if (gesture.type === 'resize') {
      const { base, baseBox, anchor, grab } = gesture;
      // Quanto o ponteiro se afastou da âncora, em relação à distância original do canto puxado.
      const rawX = (point.x - anchor.x) / (grab.x - anchor.x || 1);
      const rawY = (point.y - anchor.y) / (grab.y - anchor.y || 1);
      if (base.kind === 'shape') {
        replaceLayer(
          scaleLayer(
            base,
            anchor,
            Math.max(rawX, MIN_SIZE / Math.max(1, baseBox.w)),
            Math.max(rawY, MIN_SIZE / Math.max(1, baseBox.h)),
          ),
        );
      } else {
        // Imagem e texto mantêm a proporção: o maior dos dois eixos manda.
        const s = Math.max(rawX, rawY, minScaleFor(baseBox));
        replaceLayer(scaleLayer(base, anchor, s, s));
      }
      return;
    }

    // Pinça: o tamanho segue a distância entre os dedos; o meio dos dedos também arrasta a camada.
    if (pointersRef.current.size < 2) return;
    const [a, b] = [...pointersRef.current.values()];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = Math.max(dist / gesture.startDist, minScaleFor(gesture.baseBox));
    const scaled = scaleLayer(gesture.base, gesture.startCenter, s, s);
    replaceLayer({
      ...scaled,
      x: scaled.x + (center.x - gesture.startCenter.x),
      y: scaled.y + (center.y - gesture.startCenter.y),
    });
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    // Ao soltar um dedo, o gesto termina: o dedo que sobrou não arrasta sozinho.
    gestureRef.current = null;
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
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {DESIGN_FORMATS.map((f) => {
              const info = DESIGN_FORMATS_INFO[f];
              const chosen = format === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => handleFormatChange(f)}
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
            {/* Largura flexível: no celular o canvas acompanha a tela em vez de estourar o cartão. */}
            <canvas
              ref={canvasRef}
              width={size.width}
              height={size.height}
              aria-label="Área de edição do design"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              // Com camada selecionada, o toque é do editor (alças e pinça). Sem seleção, o dedo rola a página.
              style={{
                width: '100%',
                maxWidth: size.width * scale,
                height: 'auto',
                aspectRatio: `${size.width} / ${size.height}`,
                touchAction: selectedId ? 'none' : 'pan-y',
              }}
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
                  ref={textFieldRef}
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
                <ToolButton icon={<X className="w-4 h-4" />} label="Desselecionar" onClick={() => setSelectedId(null)} />
                <ToolButton icon={<Trash2 className="w-4 h-4" />} label="Excluir" onClick={deleteSelected} />
              </div>
            )}
            {!selected && <p className="text-xs text-slate-500">Clique em uma camada no canvas para editar. Arraste para mover.</p>}
            {selected && (
              <p className="text-xs text-slate-500">
                Puxe uma alça de canto para redimensionar, ou use dois dedos para aumentar ou diminuir. Toque em Desselecionar para rolar a página.
              </p>
            )}
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
