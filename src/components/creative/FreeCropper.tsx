import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { moveRect, rectFromPoints, resizeRect, MIN_CROP, type CropRect, type Handle } from "@/lib/cropGeometry";

interface Props {
  src: string;
  rect: CropRect;
  onChange: (rect: CropRect) => void;
  /** width/height in image fractions; undefined = free */
  ratio?: number;
  imageStyle?: CSSProperties;
}

type Drag =
  | { kind: "move"; start: { x: number; y: number }; rect: CropRect }
  | { kind: "resize"; handle: Handle; start: { x: number; y: number }; rect: CropRect }
  | { kind: "draw"; start: { x: number; y: number }; rect: CropRect };

const HANDLES: { h: Handle; style: CSSProperties; cursor: string }[] = [
  { h: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { h: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { h: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { h: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
  { h: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { h: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { h: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { h: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
];

const pct = (v: number) => `${v * 100}%`;

/**
 * Crop box you drag with a finger or mouse: drag inside to move it, drag the handles to resize,
 * or drag on the image outside the box to draw a new one.
 */
export function FreeCropper({ src, rect, onChange, ratio, imageStyle }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const point = (e: PointerEvent) => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const begin = (e: PointerEvent, d: Drag) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = d;
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.kind === "move") onChange(moveRect(d.rect, dx, dy));
    else if (d.kind === "resize") onChange(resizeRect(d.rect, d.handle, dx, dy, ratio));
    else {
      const next = rectFromPoints(d.start, p, ratio);
      // Ignore taps and tiny drags so a stray touch doesn't wipe the current crop.
      if (next.w >= MIN_CROP && next.h >= MIN_CROP) onChange(next);
    }
  };

  const end = (e: PointerEvent) => {
    if (stageRef.current?.hasPointerCapture?.(e.pointerId)) stageRef.current.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.altKey ? 0.002 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(e.shiftKey ? resizeRect(rect, "se", d[0], d[1], ratio) : moveRect(rect, d[0], d[1]));
  };

  return (
    <div
      ref={stageRef}
      data-testid="crop-stage"
      className="relative inline-block max-w-full select-none touch-none"
      onPointerDown={(e) => begin(e, { kind: "draw", start: point(e), rect })}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <img
        src={src}
        alt="Imagem para cortar"
        draggable={false}
        className="block max-w-full max-h-[55vh] pointer-events-none"
        style={imageStyle}
      />
      <div
        role="slider"
        aria-label="Área de corte (arraste para mover, setas do teclado também funcionam; Shift+setas redimensiona)"
        aria-valuetext={`${Math.round(rect.w * 100)}% × ${Math.round(rect.h * 100)}%`}
        tabIndex={0}
        data-testid="crop-box"
        onKeyDown={onKey}
        onPointerDown={(e) => {
          // A box covering the whole image can't move, so dragging on it draws a new crop instead.
          const full = rect.w > 0.999 && rect.h > 0.999;
          begin(e, { kind: full ? "draw" : "move", start: point(e), rect });
        }}
        className="absolute cursor-move outline-none ring-primary/60 focus-visible:ring-2"
        style={{
          left: pct(rect.x),
          top: pct(rect.y),
          width: pct(rect.w),
          height: pct(rect.h),
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          border: "2px solid hsl(var(--primary))",
        }}
      >
        {/* rule of thirds */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/15" />
          ))}
        </div>
        {HANDLES.map(({ h, style, cursor }) => (
          <span
            key={h}
            data-handle={h}
            onPointerDown={(e) => begin(e, { kind: "resize", handle: h, start: point(e), rect })}
            className="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ ...style, cursor }}
          >
            <span className={`block rounded-sm bg-primary shadow ${h.length === 2 ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`} />
          </span>
        ))}
      </div>
    </div>
  );
}
