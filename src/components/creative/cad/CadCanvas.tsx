// Área de desenho do Auto Cadê: folha de papel, grade, acerto (snap), seleção e gestos de desenho.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  dist,
  documentBounds,
  formatArea,
  formatM,
  hitTest,
  nearestEndpoint,
  orthoConstrain,
  polygonArea,
  polygonCentroid,
  projectOntoWall,
  snapToGrid,
  translateEntity,
  wallQuad,
  wallThicknessNear,
  type CadEntityRef,
} from '@/lib/cad/geometry';
import type { CadDocument, Pt } from '@/lib/cad/model';

export type CadTool = 'select' | 'pan' | 'wall' | 'line' | 'room' | 'door' | 'window' | 'dimension' | 'text' | 'erase';
/** Ferramentas que criam um item arrastando (ou clicando, no caso do texto). */
export type CadCreateTool = 'wall' | 'line' | 'room' | 'door' | 'window' | 'dimension' | 'text';

export interface CadView {
  /** Pixels por metro. */
  ppm: number;
  /** Posição, na tela, da origem (0,0) do desenho. */
  ox: number;
  oy: number;
}

interface Props {
  doc: CadDocument;
  tool: CadTool;
  selected: CadEntityRef | null;
  view: CadView;
  onView: (view: CadView) => void;
  snapOn: boolean;
  grid: number;
  onSelect: (ref: CadEntityRef | null) => void;
  /** Início de um gesto que pode virar histórico (movimento). */
  onGestureStart: () => void;
  /** Mudança ao vivo, sem histórico (durante o arrasto). */
  onLive: (doc: CadDocument) => void;
  /** Gesto concluído: entra no histórico. */
  onCommit: (doc: CadDocument) => void;
  onCreate: (tool: CadCreateTool, a: Pt, b: Pt | null) => void;
  onErase: (ref: CadEntityRef) => void;
  /** Muda para enquadrar o desenho de novo. */
  fitKey: number;
}

type Gesture =
  | { type: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { type: 'move'; ref: CadEntityRef; start: Pt; base: CadDocument; moved: boolean }
  | { type: 'draw'; tool: CadCreateTool; start: Pt; cur: Pt };

const HIT_PX = 7;
const ENDPOINT_TOL_M = 0.25;
const WALL_PAPER = '#0f172a';

export function CadCanvas(props: Props) {
  const { doc, tool, selected, view, onView, snapOn, grid } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(200, Math.floor(width)), h: Math.max(320, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Enquadra o desenho ao abrir, ao redimensionar e quando o pai pede (fitKey).
  useEffect(() => {
    const b = documentBounds(doc);
    const { w, h } = size;
    if (!b) {
      onView({ ppm: 40, ox: w / 2, oy: h / 2 });
      return;
    }
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const ppm = Math.min(400, Math.max(4, Math.min((w - 80) / bw, (h - 80) / bh)));
    onView({
      ppm,
      ox: (w - bw * ppm) / 2 - b.minX * ppm,
      oy: (h - bh * ppm) / 2 + b.maxY * ppm,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, size.w, size.h]);

  const toScreen = (p: Pt) => ({ x: view.ox + p.x * view.ppm, y: view.oy - p.y * view.ppm });
  const toWorld = (sx: number, sy: number): Pt => ({ x: (sx - view.ox) / view.ppm, y: (view.oy - sy) / view.ppm });
  const localPoint = (e: ReactPointerEvent | WheelEvent | globalThis.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return { sx: e.clientX - (rect?.left ?? 0), sy: e.clientY - (rect?.top ?? 0) };
  };

  /** Acerto: vão sobre a parede; senão, ponta existente; senão, grade. Shift trava ortogonal. */
  const snapFor = (tool: CadCreateTool | null, world: Pt, start?: Pt, ortho = false): Pt => {
    let p = world;
    if (tool === 'door' || tool === 'window') {
      p = projectOntoWall(world, doc, 0.3);
    } else if (snapOn) {
      const end = nearestEndpoint(world, doc, ENDPOINT_TOL_M);
      p = end ?? snapToGrid(world, grid);
    }
    if (ortho && start) p = orthoConstrain(start, p);
    return p;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { sx, sy } = localPoint(e);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tool === 'pan' || e.button === 1) {
      setGesture({ type: 'pan', sx, sy, ox: view.ox, oy: view.oy });
      return;
    }
    const world = toWorld(sx, sy);
    const tolM = HIT_PX / view.ppm;
    if (tool === 'select') {
      const ref = hitTest(doc, world, tolM);
      props.onSelect(ref);
      if (ref) {
        props.onGestureStart();
        setGesture({ type: 'move', ref, start: snapFor(null, world), base: doc, moved: false });
      }
      return;
    }
    if (tool === 'erase') {
      const ref = hitTest(doc, world, tolM);
      if (ref) props.onErase(ref);
      return;
    }
    if (tool === 'text') {
      props.onCreate('text', snapFor(null, world), null);
      return;
    }
    const createTool = tool as CadCreateTool;
    const start = snapFor(createTool, world);
    setGesture({ type: 'draw', tool: createTool, start, cur: start });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { sx, sy } = localPoint(e);
    const world = toWorld(sx, sy);
    setCursor(world);
    if (!gesture) return;
    if (gesture.type === 'pan') {
      onView({ ...view, ox: gesture.ox + (sx - gesture.sx), oy: gesture.oy + (sy - gesture.sy) });
      return;
    }
    if (gesture.type === 'move') {
      const from = snapFor(null, gesture.start);
      const to = snapFor(null, world);
      const delta = { x: to.x - from.x, y: to.y - from.y };
      if (!gesture.moved && Math.hypot(delta.x, delta.y) === 0) return;
      props.onLive(translateEntity(gesture.base, gesture.ref, delta));
      setGesture({ ...gesture, moved: true, start: gesture.start });
      return;
    }
    const cur = snapFor(gesture.tool, world, gesture.start, e.shiftKey);
    setGesture({ ...gesture, cur });
  };

  const onPointerUp = () => {
    if (!gesture) return;
    if (gesture.type === 'move' && gesture.moved) {
      // `doc` já é o documento ao vivo do arrasto (última renderização); o estúdio grava o histórico.
      props.onCommit(doc);
    }
    if (gesture.type === 'draw') {
      const len = dist(gesture.start, gesture.cur);
      const minLen = gesture.tool === 'door' || gesture.tool === 'window' ? 0.4 : 0.05;
      if (len >= minLen) props.onCreate(gesture.tool, gesture.start, gesture.cur);
    }
    setGesture(null);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { sx, sy } = localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const ppm = Math.min(400, Math.max(4, view.ppm * factor));
    const k = ppm / view.ppm;
    onView({ ppm, ox: sx - (sx - view.ox) * k, oy: sy - (sy - view.oy) * k });
  };

  // Roda do mouse dá zoom: precisa de listener não passivo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  // ─── Desenho (SVG em pixels) ───────────────────────────────────────────

  const gridLines = gridPaths(view, size, grid, toWorld);
  const cursorClass = tool === 'pan' || gesture?.type === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair';
  const preview = gesture?.type === 'draw' ? previewShape(gesture, view, toScreen) : null;
  const pxWall = (t: number) => Math.max(1, t * view.ppm);

  return (
    <div
      ref={wrapRef}
      className={`relative h-full min-h-[320px] w-full touch-none select-none overflow-hidden bg-white ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      role="application"
      aria-label="Área de desenho do Auto Cadê"
      data-testid="cad-canvas"
    >
      <svg width={size.w} height={size.h} className="absolute inset-0" aria-hidden="true">
        <defs>
          <pattern id="cad-paper" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="#ffffff" />
        <rect width={size.w} height={size.h} fill="url(#cad-paper)" />
        <path d={gridLines.minor} stroke="#e2e8f0" strokeWidth={1} fill="none" />
        <path d={gridLines.major} stroke="#cbd5e1" strokeWidth={1} fill="none" />
        <line x1={view.ox} y1={0} x2={view.ox} y2={size.h} stroke="#fca5a5" strokeWidth={0.6} />
        <line x1={0} y1={view.oy} x2={size.w} y2={view.oy} stroke="#fca5a5" strokeWidth={0.6} />

        {/* Ambientes */}
        {doc.rooms.map((r) => {
          const pts = r.points.map(toScreen);
          const c = toScreen(polygonCentroid(r.points));
          const isSel = selected?.kind === 'room' && selected.id === r.id;
          return (
            <g key={r.id}>
              <polygon
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="#f8fafc"
                stroke={isSel ? '#2563eb' : '#64748b'}
                strokeWidth={isSel ? 2 : 1}
                strokeDasharray={isSel ? undefined : '6 4'}
              />
              <text x={c.x} y={c.y - 4} textAnchor="middle" fontSize={Math.max(9, 0.28 * view.ppm)} fontWeight={600} fill="#0f172a">
                {r.name}
              </text>
              <text x={c.x} y={c.y + Math.max(11, 0.3 * view.ppm)} textAnchor="middle" fontSize={Math.max(8, 0.22 * view.ppm)} fill="#334155">
                {formatArea(polygonArea(r.points))}
              </text>
            </g>
          );
        })}

        {/* Paredes */}
        {doc.walls.map((w) => {
          const isSel = selected?.kind === 'wall' && selected.id === w.id;
          return (
            <polygon
              key={w.id}
              points={wallQuad(w).map((p) => toScreen(p)).map((p) => `${p.x},${p.y}`).join(' ')}
              fill={isSel ? '#1d4ed8' : WALL_PAPER}
            />
          );
        })}

        {/* Linhas */}
        {doc.lines.map((l) => {
          const a = toScreen(l.a);
          const b = toScreen(l.b);
          const isSel = selected?.kind === 'line' && selected.id === l.id;
          return <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isSel ? '#2563eb' : WALL_PAPER} strokeWidth={isSel ? 2.5 : 1.4} />;
        })}

        {/* Portas e janelas */}
        {doc.openings.map((o) => (
          <OpeningShape
            key={o.id}
            kind={o.kind}
            a={toScreen(o.a)}
            b={toScreen(o.b)}
            aWorld={o.a}
            bWorld={o.b}
            gapPx={pxWall(wallThicknessNear(doc, midpoint(o.a, o.b), 0.15))}
            halfWallPx={pxWall(wallThicknessNear(doc, midpoint(o.a, o.b), 0.15) / 2)}
            selected={selected?.kind === 'opening' && selected.id === o.id}
            ppm={view.ppm}
          />
        ))}

        {/* Cotas */}
        {doc.dimensions.map((d) => (
          <DimensionShape
            key={d.id}
            aWorld={d.a}
            bWorld={d.b}
            offset={d.offset}
            toScreen={toScreen}
            selected={selected?.kind === 'dimension' && selected.id === d.id}
            fontPx={Math.max(10, 0.26 * view.ppm)}
          />
        ))}

        {/* Textos */}
        {doc.texts.map((t) => {
          const p = toScreen(t.at);
          const isSel = selected?.kind === 'text' && selected.id === t.id;
          const fs = Math.max(10, t.height * view.ppm);
          return (
            <text key={t.id} x={p.x} y={p.y} fontSize={fs} fill={isSel ? '#2563eb' : WALL_PAPER} fontWeight={isSel ? 700 : 400}>
              {t.text}
            </text>
          );
        })}

        {/* Prévia do que está sendo desenhado */}
        {preview}

        {/* Cursor do acerto */}
        {cursor && (tool !== 'select' && tool !== 'pan') && (() => {
          const p = toScreen(snapFor(tool as CadCreateTool, cursor));
          return (
            <g pointerEvents="none">
              <line x1={p.x - 6} y1={p.y} x2={p.x + 6} y2={p.y} stroke="#0ea5e9" strokeWidth={1} />
              <line x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y + 6} stroke="#0ea5e9" strokeWidth={1} />
            </g>
          );
        })()}
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-600 shadow-sm">
        {cursor ? `x ${formatM(cursor.x)} m · y ${formatM(cursor.y)} m` : 'Passe o mouse sobre a folha'} · 1 m = {Math.round(view.ppm)} px
      </div>
      {doc.walls.length + doc.lines.length + doc.rooms.length + doc.openings.length + doc.dimensions.length + doc.texts.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-sm rounded-xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow">
            Folha em branco. Escolha uma ferramenta à esquerda e desenhe, ou peça uma planta à IA na aba IA.
          </p>
        </div>
      )}
    </div>
  );
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function previewShape(
  g: Extract<Gesture, { type: 'draw' }>,
  view: CadView,
  toScreen: (p: Pt) => { x: number; y: number },
) {
  const a = toScreen(g.start);
  const b = toScreen(g.cur);
  const len = dist(g.start, g.cur);
  const label = `${formatM(len)} m`;
  if (g.tool === 'room') {
    const pts = [g.start, { x: g.cur.x, y: g.start.y }, g.cur, { x: g.start.x, y: g.cur.y }].map(toScreen);
    return <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(14,165,233,0.12)" stroke="#0ea5e9" strokeDasharray="6 4" strokeWidth={1.5} />;
  }
  if (g.tool === 'wall') {
    const t = 0.15 * view.ppm;
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={Math.max(2, t)} strokeOpacity={0.35} />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" fontSize={12} fill="#0369a1">{label}</text>
      </g>
    );
  }
  if (g.tool === 'door' || g.tool === 'window') {
    return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={3} strokeDasharray="4 3" />;
  }
  if (g.tool === 'dimension') {
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={1.5} />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" fontSize={12} fill="#0369a1">{label}</text>
      </g>
    );
  }
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="5 4" />;
}

function gridPaths(
  view: CadView,
  size: { w: number; h: number },
  grid: number,
  toWorld: (sx: number, sy: number) => Pt,
): { minor: string; major: string } {
  let step = grid;
  while (step * view.ppm < 6) step *= 5;
  const major = step * 5;
  const tl = toWorld(0, 0);
  const br = toWorld(size.w, size.h);
  const minX = Math.min(tl.x, br.x);
  const maxX = Math.max(tl.x, br.x);
  const minY = Math.min(br.y, tl.y);
  const maxY = Math.max(br.y, tl.y);
  const minorParts: string[] = [];
  const majorParts: string[] = [];
  const addLines = (target: string[], st: number) => {
    const x0 = Math.floor(minX / st) * st;
    const y0 = Math.floor(minY / st) * st;
    if ((maxX - minX) / st > 400 || (maxY - minY) / st > 400) return;
    for (let x = x0; x <= maxX; x += st) {
      const sx = view.ox + x * view.ppm;
      target.push(`M${sx.toFixed(1)} 0V${size.h}`);
    }
    for (let y = y0; y <= maxY; y += st) {
      const sy = view.oy - y * view.ppm;
      target.push(`M0 ${sy.toFixed(1)}H${size.w}`);
    }
  };
  addLines(minorParts, step);
  addLines(majorParts, major);
  return { minor: minorParts.join(''), major: majorParts.join('') };
}

function OpeningShape({
  kind,
  a,
  b,
  aWorld,
  bWorld,
  gapPx,
  halfWallPx,
  selected,
  ppm,
}: {
  kind: 'door' | 'window';
  a: { x: number; y: number };
  b: { x: number; y: number };
  aWorld: Pt;
  bWorld: Pt;
  gapPx: number;
  halfWallPx: number;
  selected: boolean;
  ppm: number;
}) {
  const span = dist(aWorld, bWorld) || 1;
  const dx = bWorld.x - aWorld.x;
  const dy = bWorld.y - aWorld.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal (metros) do lado esquerdo do vão, em pixels de tela (y invertido).
  const nxW = -dy / len;
  const nyW = dx / len;
  const nS = { x: nxW, y: -nyW };
  const stroke = selected ? '#2563eb' : WALL_PAPER;
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth={gapPx} />
      {kind === 'window' ? (
        <polygon
          points={[
            { x: a.x + nS.x * halfWallPx, y: a.y + nS.y * halfWallPx },
            { x: b.x + nS.x * halfWallPx, y: b.y + nS.y * halfWallPx },
            { x: b.x - nS.x * halfWallPx, y: b.y - nS.y * halfWallPx },
            { x: a.x - nS.x * halfWallPx, y: a.y - nS.y * halfWallPx },
          ].map((p) => `${p.x},${p.y}`).join(' ')}
          fill="#e0f2fe"
          stroke={stroke}
          strokeWidth={selected ? 2 : 1}
        />
      ) : (
        (() => {
          const leaf = { x: a.x + nS.x * span * ppm, y: a.y + nS.y * span * ppm };
          const r = span * ppm;
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={leaf.x} y2={leaf.y} stroke={stroke} strokeWidth={selected ? 3 : 2} />
              <path
                d={`M ${leaf.x} ${leaf.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`}
                fill="none"
                stroke={selected ? '#2563eb' : '#64748b'}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          );
        })()
      )}
    </g>
  );
}

function DimensionShape({
  aWorld,
  bWorld,
  offset,
  toScreen,
  selected,
  fontPx,
}: {
  aWorld: Pt;
  bWorld: Pt;
  offset: number;
  toScreen: (p: Pt) => { x: number; y: number };
  selected: boolean;
  fontPx: number;
}) {
  const len = dist(aWorld, bWorld) || 1;
  const n = { x: -(bWorld.y - aWorld.y) / len, y: (bWorld.x - aWorld.x) / len };
  const a2 = { x: aWorld.x + n.x * offset, y: aWorld.y + n.y * offset };
  const b2 = { x: bWorld.x + n.x * offset, y: bWorld.y + n.y * offset };
  const A = toScreen(aWorld);
  const B = toScreen(bWorld);
  const A2 = toScreen(a2);
  const B2 = toScreen(b2);
  const mid = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
  const ang = (Math.atan2(B2.y - A2.y, B2.x - A2.x) * 180) / Math.PI;
  const readable = ang > 90 || ang < -90 ? ang + 180 : ang;
  const color = selected ? '#2563eb' : '#dc2626';
  return (
    <g>
      <line x1={A.x} y1={A.y} x2={A2.x} y2={A2.y} stroke={color} strokeWidth={0.8} />
      <line x1={B.x} y1={B.y} x2={B2.x} y2={B2.y} stroke={color} strokeWidth={0.8} />
      <line x1={A2.x} y1={A2.y} x2={B2.x} y2={B2.y} stroke={color} strokeWidth={selected ? 2 : 1} />
      <text transform={`translate(${mid.x},${mid.y - 4}) rotate(${readable})`} textAnchor="middle" fontSize={fontPx} fill={color}>
        {`${formatM(len)} m`}
      </text>
    </g>
  );
}
