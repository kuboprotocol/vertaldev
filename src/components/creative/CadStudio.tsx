// Auto Cadê: desenho técnico no Painel Criativo. Desenha à mão (grátis) ou pede a planta à IA
// (texto ou voz). Exporta folha A3 em SVG e PNG e arquivo DXF para AutoCAD.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AppWindow, DoorOpen, Download, Eraser, Hand, Magnet, Minus, MousePointer2, Redo2, Ruler, Slash, Sparkles, Square, Trash2, Type, Undo2, Maximize2, Mic, MicOff, FileDown,
  type LucideIcon,
} from 'lucide-react';
import { CadCanvas, type CadTool, type CadView, type CadCreateTool } from './cad/CadCanvas';
import { useDictation } from '@/lib/voice/useDictation';
import { cadSheetLayout, cadToDxf, cadToSvg } from '@/lib/cad/export';
import { estimateCadCredits, generateCad } from '@/lib/cad/cadService';
import { publishCadDraft, subscribeCad, takePendingCad } from '@/lib/cad/cadBridge';
import { CAD_SCALES, cadElementCount, emptyCadDocument } from '@/lib/cad/model';
import type { CadDimension, CadDocument, CadLine, CadOpening, CadRoom, CadText, CadWall, Pt } from '@/lib/cad/model';
import { formatArea, formatM, newId, polygonArea, removeEntity, type CadEntityRef } from '@/lib/cad/geometry';

const DRAFT_KEY = 'vertal-cad-draft-v1';
const HISTORY_LIMIT = 200;

const TOOLS: { id: CadTool; label: string; key: string; icon: LucideIcon }[] = [
  { id: 'select', label: 'Selecionar', key: 'V', icon: MousePointer2 },
  { id: 'wall', label: 'Parede', key: 'W', icon: Minus },
  { id: 'line', label: 'Linha', key: 'L', icon: Slash },
  { id: 'room', label: 'Ambiente', key: 'R', icon: Square },
  { id: 'door', label: 'Porta', key: 'D', icon: DoorOpen },
  { id: 'window', label: 'Janela', key: 'J', icon: AppWindow },
  { id: 'dimension', label: 'Cota', key: 'C', icon: Ruler },
  { id: 'text', label: 'Texto', key: 'T', icon: Type },
  { id: 'erase', label: 'Apagar', key: 'E', icon: Eraser },
  { id: 'pan', label: 'Mover folha', key: 'H', icon: Hand },
];

const EXAMPLES = [
  'Apartamento de 2 quartos, 1 suíte, sala e cozinha integradas, 62 m², área de serviço e varanda na frente',
  'Casa térrea de 3 quartos com garagem coberta para 2 carros, terreno de 10 x 20 m',
  'Escritório com 4 salas, copa e 2 banheiros, corredor central de 1,2 m',
];

type Panel = 'props' | 'sheet' | 'ai';

export function CadStudio({ creditsAvailable = 0 }: { creditsAvailable?: number }) {
  const [doc, setDoc] = useState<CadDocument>(() => loadDraft() ?? emptyCadDocument());
  const docRef = useRef(doc);
  docRef.current = doc;
  const [past, setPast] = useState<CadDocument[]>([]);
  const [future, setFuture] = useState<CadDocument[]>([]);
  const baseRef = useRef<CadDocument | null>(null);
  const [tool, setTool] = useState<CadTool>('wall');
  const [selected, setSelected] = useState<CadEntityRef | null>(null);
  const [view, setView] = useState<CadView>({ ppm: 40, ox: 0, oy: 0 });
  const [fitKey, setFitKey] = useState(0);
  const [snapOn, setSnapOn] = useState(true);
  const [grid, setGrid] = useState(0.1);
  const [panel, setPanel] = useState<Panel>('props');
  const [notice, setNotice] = useState<string | null>(null);

  // ─── Histórico ───────────────────────────────────────────────────────

  const commit = (next: CadDocument, prev: CadDocument = docRef.current) => {
    if (next === prev) return;
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), prev]);
    setFuture([]);
    setDoc(next);
    docRef.current = next;
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [docRef.current, ...f]);
    setDoc(prev);
    docRef.current = prev;
    setSelected(null);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, docRef.current]);
    setDoc(next);
    docRef.current = next;
    setSelected(null);
  };

  // ─── Chat: planta pendente e ponte com o editor ───────────────────────

  useEffect(() => {
    const pending = takePendingCad();
    if (pending) commit(pending);
    return subscribeCad((incoming) => commit(incoming));
  }, []);

  // Rascunho local (por navegador) e publicação para o chat pedir ajustes sobre o desenho aberto.
  useEffect(() => {
    publishCadDraft(doc);
    const t = window.setTimeout(() => saveDraft(doc), 400);
    return () => window.clearTimeout(t);
  }, [doc]);

  // ─── Criação e edição ────────────────────────────────────────────────

  const create = (kind: CadCreateTool, a: Pt, b: Pt | null) => {
    const current = docRef.current;
    if (kind === 'text') {
      const item: CadText = { id: newId('t'), at: a, text: 'Texto', height: 0.25 };
      commit({ ...current, texts: [...current.texts, item] }, current);
      setSelected({ kind: 'text', id: item.id });
      return;
    }
    const end = b ?? a;
    if (kind === 'wall') {
      const item: CadWall = { id: newId('w'), a, b: end, thickness: 0.15 };
      commit({ ...current, walls: [...current.walls, item] }, current);
      setSelected({ kind: 'wall', id: item.id });
    } else if (kind === 'line') {
      const item: CadLine = { id: newId('l'), a, b: end };
      commit({ ...current, lines: [...current.lines, item] }, current);
      setSelected({ kind: 'line', id: item.id });
    } else if (kind === 'room') {
      const item: CadRoom = {
        id: newId('r'),
        name: 'Ambiente',
        points: [a, { x: end.x, y: a.y }, end, { x: a.x, y: end.y }],
      };
      commit({ ...current, rooms: [...current.rooms, item] }, current);
      setSelected({ kind: 'room', id: item.id });
    } else if (kind === 'door' || kind === 'window') {
      const item: CadOpening = { id: newId('o'), kind, a, b: end };
      commit({ ...current, openings: [...current.openings, item] }, current);
      setSelected({ kind: 'opening', id: item.id });
    } else {
      const item: CadDimension = { id: newId('d'), a, b: end, offset: 0.6 };
      commit({ ...current, dimensions: [...current.dimensions, item] }, current);
      setSelected({ kind: 'dimension', id: item.id });
    }
  };

  const erase = (ref: CadEntityRef) => {
    commit(removeEntity(docRef.current, ref));
    setSelected(null);
  };

  const deleteSelected = () => {
    if (selected) erase(selected);
  };

  const patch = (ref: CadEntityRef, values: Record<string, unknown>) => {
    commit(patchEntity(docRef.current, ref, values));
  };

  const selectedItem = useMemo(() => (selected ? findEntity(doc, selected) : null), [doc, selected]);

  // ─── Atalhos ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) { e.preventDefault(); deleteSelected(); }
        return;
      }
      if (e.key === 'Escape') { setSelected(null); setTool('select'); return; }
      const hit = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (hit) setTool(hit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ─── Exportação ───────────────────────────────────────────────────────

  const fileBase = slug(doc.titleBlock.project) || 'planta';

  const exportSvg = () => download(`${fileBase}.svg`, cadToSvg(doc), 'image/svg+xml');
  const exportDxf = () => download(`${fileBase}.dxf`, cadToDxf(doc), 'application/dxf');
  const exportPng = async () => {
    try {
      const blob = await svgToPng(cadToSvg(doc));
      downloadBlob(`${fileBase}.png`, blob);
    } catch {
      setNotice('Não consegui gerar o PNG neste navegador. Use o SVG ou o DXF.');
    }
  };

  // ─── IA ───────────────────────────────────────────────────────────────

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<'new' | 'edit' | null>(null);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dictBase = useRef('');
  const hasDrawing = cadElementCount(doc) > 0;
  const credits = estimateCadCredits(prompt.trim().length >= 3 ? prompt : 'x'.repeat(3), hasDrawing ? doc : undefined);
  const canAfford = creditsAvailable >= credits;

  const { supported: micSupported, listening, toggle: toggleMic } = useDictation({
    lang: 'pt-BR',
    onText: (text) => setPrompt(joinText(dictBase.current, text)),
    onError: () => setAiMsg({ ok: false, text: 'Não consegui usar o microfone. Verifique a permissão do navegador.' }),
  });

  const runAi = async (mode: 'new' | 'edit') => {
    setBusy(mode);
    setAiMsg(null);
    try {
      const result = await generateCad({ prompt, mode, current: mode === 'edit' ? docRef.current : undefined });
      commit(result.document);
      setFitKey((k) => k + 1);
      const rooms = result.document.rooms.length;
      setAiMsg({
        ok: true,
        text: `Planta pronta: ${result.document.walls.length} paredes, ${rooms} ${rooms === 1 ? 'ambiente' : 'ambientes'}. Gastou ${result.creditsSpent} crédito(s). Ctrl+Z desfaz; você edita tudo à mão.`,
      });
    } catch (e) {
      setAiMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível gerar o desenho agora.' });
    } finally {
      setBusy(null);
    }
  };

  const area = useMemo(() => doc.rooms.reduce((sum, r) => sum + polygonArea(r.points), 0), [doc.rooms]);
  const sheet = useMemo(() => cadSheetLayout(doc), [doc]);

  return (
    <div className="flex flex-col gap-4 text-white" data-testid="cad-studio">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-3">
        <div className="mr-auto min-w-0">
          <input
            aria-label="Nome do projeto"
            value={doc.titleBlock.project}
            onChange={(e) => commit({ ...doc, titleBlock: { ...doc.titleBlock, project: e.target.value.slice(0, 120) } })}
            className="w-full min-w-[12rem] bg-transparent text-base font-bold text-white outline-none placeholder:text-slate-500"
            placeholder="Nome do projeto"
          />
          <p className="text-xs text-slate-400">Auto Cadê · {cadElementCount(doc)} itens · área de ambientes {formatArea(area)}</p>
        </div>
        <IconButton label="Desfazer (Ctrl+Z)" onClick={undo} disabled={past.length === 0}><Undo2 className="h-4 w-4" /></IconButton>
        <IconButton label="Refazer (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0}><Redo2 className="h-4 w-4" /></IconButton>
        <IconButton label="Centralizar o desenho" onClick={() => setFitKey((k) => k + 1)}><Maximize2 className="h-4 w-4" /></IconButton>
        <button
          type="button"
          onClick={() => setSnapOn((v) => !v)}
          aria-pressed={snapOn}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${snapOn ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 text-slate-300'}`}
        >
          <Magnet className="h-3.5 w-3.5" /> Acerto
        </button>
        <select
          aria-label="Grade"
          value={grid}
          onChange={(e) => setGrid(Number(e.target.value))}
          className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-200"
        >
          {[0.05, 0.1, 0.25, 0.5].map((g) => <option key={g} value={g}>Grade {formatM(g)} m</option>)}
        </select>
        <button type="button" onClick={exportSvg} className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-600">
          <Download className="h-3.5 w-3.5" /> SVG
        </button>
        <button type="button" onClick={exportPng} className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-600">
          <FileDown className="h-3.5 w-3.5" /> PNG
        </button>
        <button type="button" onClick={exportDxf} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-2 text-xs font-semibold text-white hover:shadow-lg hover:shadow-blue-500/20">
          <FileDown className="h-3.5 w-3.5" /> DXF (AutoCAD)
        </button>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          {notice}
          <button type="button" className="ml-3 underline" onClick={() => setNotice(null)}>Fechar</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_320px]">
        {/* Ferramentas */}
        <nav aria-label="Ferramentas de desenho" className="flex flex-row flex-wrap gap-1.5 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-2 lg:flex-col">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                aria-pressed={active}
                title={`${t.label} (${t.key})`}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors sm:w-auto sm:px-3 sm:gap-2 ${active ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden text-xs font-medium sm:inline">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Folha */}
        <section aria-label="Folha do desenho" className="h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-700/60 shadow-xl shadow-black/30">
          <CadCanvas
            doc={doc}
            tool={tool}
            selected={selected}
            view={view}
            onView={setView}
            snapOn={snapOn}
            grid={grid}
            fitKey={fitKey}
            onSelect={setSelected}
            onGestureStart={() => { baseRef.current = docRef.current; }}
            onLive={(d) => { docRef.current = d; setDoc(d); }}
            onCommit={(d) => {
              // Fim de um arrasto: o histórico guarda o desenho de antes do gesto.
              const base = baseRef.current ?? d;
              baseRef.current = null;
              if (base !== d) commit(d, base);
            }}
            onCreate={create}
            onErase={erase}
          />
        </section>

        {/* Painel lateral */}
        <aside className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4">
          <div role="tablist" aria-label="Painel do desenho" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/60 p-1 text-xs">
            {([['props', 'Item'], ['sheet', 'Folha'], ['ai', 'IA']] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={panel === id}
                type="button"
                onClick={() => setPanel(id)}
                className={`rounded-lg px-2 py-1.5 font-medium ${panel === id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {panel === 'props' && (
            <div className="space-y-3 text-sm">
              {selectedItem && selected ? (
                <ItemProperties item={selectedItem} kind={selected.kind} onPatch={(values) => patch(selected, values)} onDelete={deleteSelected} />
              ) : (
                <div className="space-y-2 text-slate-300">
                  <p>Escolha uma ferramenta à esquerda e desenhe na folha. Clique num item com a ferramenta Selecionar para editar.</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
                    <li>Arraste para criar paredes, linhas, ambientes e cotas.</li>
                    <li>Segure Shift para travar em horizontal ou vertical.</li>
                    <li>Portas e janelas encaixam na parede mais próxima.</li>
                    <li>Roda do mouse dá zoom; a ferramenta Mover folha arrasta a folha.</li>
                  </ul>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-2 border-t border-slate-700/60 pt-3 text-xs">
                <Stat label="Paredes" value={doc.walls.length} />
                <Stat label="Ambientes" value={doc.rooms.length} />
                <Stat label="Portas e janelas" value={doc.openings.length} />
                <Stat label="Área (m²)" value={formatM(area)} />
              </dl>
            </div>
          )}

          {panel === 'sheet' && (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-slate-400">Escala declarada</span>
                <select
                  value={doc.scale}
                  onChange={(e) => commit({ ...doc, scale: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-2"
                >
                  {CAD_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  Escala de impressão: 1:{sheet.scaleDenominator}{sheet.adjusted ? ' (ajustada para caber na A3)' : ''}
                </span>
              </label>
              {([
                ['project', 'Projeto'],
                ['drawing', 'Desenho'],
                ['architect', 'Arquiteto(a) responsável'],
                ['registration', 'Registro (CAU/CREA)'],
                ['date', 'Data'],
                ['sheet', 'Folha (ex.: 01/03)'],
              ] as const).map(([field, label]) => (
                <label key={field} className="block">
                  <span className="text-xs text-slate-400">{label}</span>
                  <input
                    value={doc.titleBlock[field]}
                    onChange={(e) => commit({ ...doc, titleBlock: { ...doc.titleBlock, [field]: e.target.value.slice(0, 120) } })}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-2"
                  />
                </label>
              ))}
              <p className="text-xs text-slate-500">Esses campos saem no carimbo da folha A3 (SVG e PNG).</p>
            </div>
          )}

          {panel === 'ai' && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4 text-cyan-300" /> Planta com IA</p>
                  <p className="text-xs text-slate-400">Escreva ou dite o que o arquiteto quer. A IA desenha a planta; você ajusta à mão.</p>
                </div>
              </div>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
                  rows={5}
                  aria-label="Pedido para a IA"
                  placeholder="Ex.: casa de 3 quartos, 1 suíte, sala e cozinha integradas, garagem para 2 carros"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 pr-11 text-sm outline-none focus:border-cyan-400"
                />
                {micSupported && (
                  <button
                    type="button"
                    onClick={() => { if (!listening) dictBase.current = prompt; toggleMic(); }}
                    aria-label={listening ? 'Parar de ditar' : 'Ditar o pedido'}
                    className={`absolute right-2 top-2 rounded-lg p-2 ${listening ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-left text-xs text-slate-300 hover:border-slate-500">
                    {ex}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${canAfford ? 'text-slate-400' : 'text-red-300'}`}>
                Custo: {credits} crédito{credits === 1 ? '' : 's'} · saldo {creditsAvailable}
                {!canAfford && ' · créditos insuficientes'}
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => runAi('new')}
                  disabled={busy !== null || prompt.trim().length < 3 || !canAfford}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'new' ? 'Desenhando…' : 'Gerar planta nova'}
                </button>
                <button
                  type="button"
                  onClick={() => runAi('edit')}
                  disabled={busy !== null || !hasDrawing || prompt.trim().length < 3 || !canAfford}
                  className="rounded-xl border border-slate-600 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {busy === 'edit' ? 'Ajustando…' : 'Ajustar o desenho atual'}
                </button>
              </div>
              {aiMsg && (
                <p role="status" className={`rounded-lg px-3 py-2 text-xs ${aiMsg.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>
                  {aiMsg.text}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      <p className="text-xs text-slate-500">
        Desenho à mão é grátis. A IA cobra no servidor: custo do uso + 75%, em créditos. Seu desenho fica salvo neste navegador enquanto você trabalha.
      </p>
    </div>
  );
}

// ─── Painel do item selecionado ─────────────────────────────────────────

function ItemProperties({
  item,
  kind,
  onPatch,
  onDelete,
}: {
  item: Record<string, unknown>;
  kind: CadEntityRef['kind'];
  onPatch: (values: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const names: Record<CadEntityRef['kind'], string> = {
    wall: 'Parede', line: 'Linha', room: 'Ambiente', opening: 'Abertura', dimension: 'Cota', text: 'Texto',
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{names[kind]}</p>
        <button type="button" onClick={onDelete} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">
          <Trash2 className="h-3.5 w-3.5" /> Apagar
        </button>
      </div>
      {kind === 'wall' && (
        <>
          <NumberField label="Espessura (m)" value={Number(item.thickness)} step={0.01} min={0.05} max={1} onChange={(v) => onPatch({ thickness: v })} />
          <p className="text-xs text-slate-400">Comprimento: {formatM(segLength(item as unknown as { a: Pt; b: Pt }))} m</p>
        </>
      )}
      {kind === 'room' && (
        <>
          <label className="block">
            <span className="text-xs text-slate-400">Nome</span>
            <input value={String(item.name)} onChange={(e) => onPatch({ name: e.target.value.slice(0, 120) })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-2" />
          </label>
          <p className="text-xs text-slate-400">Área: {formatArea(polygonArea((item as unknown as CadRoom).points))}</p>
        </>
      )}
      {kind === 'text' && (
        <>
          <label className="block">
            <span className="text-xs text-slate-400">Texto</span>
            <input value={String(item.text)} onChange={(e) => onPatch({ text: e.target.value.slice(0, 120) })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-2" />
          </label>
          <NumberField label="Altura (m)" value={Number(item.height)} step={0.05} min={0.1} max={1} onChange={(v) => onPatch({ height: v })} />
        </>
      )}
      {kind === 'opening' && (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/60 p-1 text-xs">
            {(['door', 'window'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPatch({ kind: k })}
                className={`rounded-lg px-2 py-1.5 ${item.kind === k ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                {k === 'door' ? 'Porta' : 'Janela'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Vão: {formatM(segLength(item as unknown as { a: Pt; b: Pt }))} m</p>
        </>
      )}
      {kind === 'dimension' && (
        <>
          <p className="text-xs text-slate-400">Medida: {formatM(segLength(item as unknown as { a: Pt; b: Pt }))} m</p>
          <NumberField label="Afastamento da linha (m)" value={Number(item.offset)} step={0.1} min={-5} max={5} onChange={(v) => onPatch({ offset: v })} />
        </>
      )}
      {kind === 'line' && <p className="text-xs text-slate-400">Comprimento: {formatM(segLength(item as unknown as { a: Pt; b: Pt }))} m</p>}
    </div>
  );
}

function NumberField({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-2"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-2.5 py-2">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="font-semibold text-white">{value}</dd>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-lg border border-slate-600 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40">
      {children}
    </button>
  );
}

// ─── Funções auxiliares ──────────────────────────────────────────────────

function segLength(s: { a: Pt; b: Pt }): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

function findEntity(doc: CadDocument, ref: CadEntityRef): Record<string, unknown> | null {
  const find = <T extends { id: string }>(list: T[]) => (list.find((i) => i.id === ref.id) ?? null) as unknown as Record<string, unknown> | null;
  switch (ref.kind) {
    case 'wall': return find(doc.walls);
    case 'line': return find(doc.lines);
    case 'room': return find(doc.rooms);
    case 'opening': return find(doc.openings);
    case 'dimension': return find(doc.dimensions);
    case 'text': return find(doc.texts);
  }
}

function patchEntity(doc: CadDocument, ref: CadEntityRef, values: Record<string, unknown>): CadDocument {
  const apply = <T extends { id: string }>(list: T[]): T[] => list.map((i) => (i.id === ref.id ? ({ ...i, ...values } as T) : i));
  switch (ref.kind) {
    case 'wall': return { ...doc, walls: apply(doc.walls) };
    case 'line': return { ...doc, lines: apply(doc.lines) };
    case 'room': return { ...doc, rooms: apply(doc.rooms) };
    case 'opening': return { ...doc, openings: apply(doc.openings) };
    case 'dimension': return { ...doc, dimensions: apply(doc.dimensions) };
    case 'text': return { ...doc, texts: apply(doc.texts) };
  }
}

function joinText(base: string, dictated: string): string {
  const b = base.trim();
  const d = dictated.trim();
  return b ? `${b} ${d}` : d;
}

function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function download(name: string, text: string, mime: string) {
  downloadBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG da folha → PNG (2480 px de largura, ~150 dpi em A3). */
function svgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2480;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no-2d')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error('no-blob'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}

function loadDraft(): CadDocument | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CadDocument;
    if (parsed?.version !== 1 || !Array.isArray(parsed.walls)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(doc: CadDocument) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
  } catch {
    /* sem armazenamento local: o desenho continua na tela */
  }
}
