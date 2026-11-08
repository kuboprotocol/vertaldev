// Vertal Office do Painel Criativo: Documento, Planilha e Apresentação.
// Editor e exportação são grátis. Cada uso da IA custa 1 crédito.
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Sheet as SheetIcon,
  Presentation,
  Sparkles,
  Trash2,
  Mail,
  Heading,
  AlignLeft,
  List,
  Bold,
  Italic,
  Underline,
  AlignCenter,
  AlignRight,
  Eraser,
  Sigma,
  Upload,
  Youtube,
  FileType,
} from 'lucide-react';
import {
  BlockAlign,
  BlockSize,
  BlockType,
  DocBlock,
  DocData,
  DOC_MAX_BLOCKS,
  createEmptyDoc,
  docFromAi,
  docToHtml,
  docToMarkdown,
  docToText,
  formatBlock,
  insertBlockAfter,
  makeBlock,
  removeBlockById,
  setBlockType,
  wordCount,
} from '@/lib/office/documentModel';
import {
  CELL_FILLS,
  CellAlign,
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  SheetData,
  SheetFunction,
  createEmptySheet,
  setCell,
  sheetFromTable,
  sheetToCsv,
  sheetToXlsx,
  styleCells,
  suggestFormula,
  usedBounds,
} from '@/lib/office/sheetModel';
import { columnLetters, evaluateAll, toRef } from '@/lib/office/formulas';
import { OFFICE_AI_CREDIT_COST, runOfficeAi } from '@/services/officeAiService';
import { OfficeEmailDialog } from './OfficeEmailDialog';
import { AiPanel } from './AiPanel';
import { AppFrame } from './AppFrame';
import { RibbonButton, RibbonGroup, RibbonSelect, RibbonTab } from './Ribbon';
import { docToDocx } from '@/lib/office/officeFiles';
import { OFFICE_KEYS, importFile } from '@/lib/office/importers';
import { SlidesTab } from './SlidesTab';
import { MiniWindow } from './MiniWindow';
import { docToPdf, sheetToPdf } from '@/lib/office/pdfGenerate';
import { inspectPdf } from '@/lib/office/pdfEdit';
import { PdfTab, type PdfSeed } from './PdfTab';
import { download, safeName } from '@/lib/office/download';
import { SHEET_TEMPLATES, DOC_TEMPLATES, docTemplateBlocks } from '@/lib/office/templates';

const DOC_KEY = OFFICE_KEYS.doc;
const SHEET_KEY = OFFICE_KEYS.sheet;
const DECK_KEY = OFFICE_KEYS.deck;

/** Rascunho local (por navegador). Falha de armazenamento nunca quebra a tela. */
function loadLocal<T>(key: string, fallback: () => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    return fallback();
  }
}

function saveLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o trabalho segue na sessão */
  }
}

type Notice = { kind: 'ok' | 'err'; text: string } | null;

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Título',
  paragraph: 'Parágrafo',
  bullet: 'Item de lista',
};

const SIZE_LABELS: Array<{ value: BlockSize; label: string }> = [
  { value: 'sm', label: 'Pequeno' },
  { value: 'md', label: 'Normal' },
  { value: 'lg', label: 'Grande' },
];
const SIZE_PX: Record<BlockSize, string> = { sm: '13px', md: '15px', lg: '20px' };

const APPS = [
  { id: 'doc', label: 'Documento', icon: FileText, tile: 'from-blue-600 to-indigo-600' },
  { id: 'sheet', label: 'Planilha', icon: SheetIcon, tile: 'from-emerald-600 to-teal-600' },
  { id: 'slides', label: 'Apresentação', icon: Presentation, tile: 'from-orange-500 to-amber-500' },
  { id: 'pdf', label: 'PDF', icon: FileType, tile: 'from-rose-500 to-red-600' },
] as const;

type AppId = (typeof APPS)[number]['id'];

/** Ação de IA compartilhada: roda o pedido e devolve o aviso de resultado. */
function useAiRunner(setMessage: (m: Notice) => void, setBusy: (b: boolean) => void) {
  return async <T,>(run: () => Promise<T>, onOk: (res: T) => void, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      onOk(await run());
      setMessage({ kind: 'ok', text: okText });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
}

/** Textarea que cresce com o texto, como um parágrafo de editor. */
function AutoTextarea({
  value,
  onChange,
  onFocus,
  ariaLabel,
  style,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  ariaLabel: string;
  style: React.CSSProperties;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, style.fontSize]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      aria-label={ariaLabel}
      style={style}
      className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent leading-relaxed text-slate-900 placeholder:text-slate-300 focus:outline-none"
    />
  );
}

function DocumentTab({ creditsAvailable, assistantOpen }: { creditsAvailable: number; assistantOpen: boolean }) {
  const [doc, setDoc] = useState<DocData>(() => loadLocal(DOC_KEY, () => createEmptyDoc()));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<Notice>(null);
  const runAi = useAiRunner(setMessage, setBusy);

  const update = (next: DocData) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDoc(stamped);
    saveLocal(DOC_KEY, stamped);
  };

  const active: DocBlock | undefined = doc.blocks.find((b) => b.id === activeId) ?? doc.blocks[0];
  const fmt = active?.format ?? {};

  const applyFormat = (patch: Parameters<typeof formatBlock>[2]) => {
    if (active) update(formatBlock(doc, active.id, patch));
  };

  const generate = (prompt: string, source: string) =>
    runAi(
      () => runOfficeAi({ action: 'doc', prompt, source: source || undefined }),
      (res) => {
        if (res.action !== 'doc') throw new Error('Resposta inesperada da IA.');
        const generated = docFromAi(res.output.title, res.output.blocks);
        const isEmpty = doc.blocks.every((b) => b.text.trim() === '');
        update({
          ...doc,
          title: isEmpty || doc.title.startsWith('Documento sem') ? generated.title : doc.title,
          blocks: isEmpty ? generated.blocks : [...doc.blocks, ...generated.blocks],
        });
      },
      `Texto gerado com IA (${OFFICE_AI_CREDIT_COST} crédito).`,
    );

  const setText = (id: string, text: string) =>
    update({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, text } : b)) });

  const insert = (type: BlockType) => {
    const before = new Set(doc.blocks.map((b) => b.id));
    const next = insertBlockAfter(doc, active?.id ?? null, type);
    const added = next.blocks.find((b) => !before.has(b.id));
    if (added) setActiveId(added.id);
    update(next);
  };

  /** Ditado: preenche o último parágrafo vazio ou acrescenta um novo no fim do documento. */
  const dictate = (text: string) => {
    const last = doc.blocks[doc.blocks.length - 1];
    if (last && last.type === 'paragraph' && last.text.trim() === '') {
      update({ ...doc, blocks: doc.blocks.map((b) => (b.id === last.id ? { ...b, text } : b)) });
      return;
    }
    update({ ...doc, blocks: [...doc.blocks, makeBlock('paragraph', text)] });
  };

  /** Modelo: preenche um documento vazio ou insere o modelo depois do bloco atual. */
  const applyDocTemplate = (id: string) => {
    const tpl = DOC_TEMPLATES.find((t) => t.id === id);
    const blocks = docTemplateBlocks(id);
    if (!tpl || blocks.length === 0) return;
    if (doc.blocks.every((b) => b.text.trim() === '')) {
      update({ ...doc, title: doc.title.startsWith('Documento sem') ? tpl.label : doc.title, blocks: blocks.slice(0, DOC_MAX_BLOCKS) });
      return;
    }
    const at = active ? doc.blocks.findIndex((b) => b.id === active.id) : doc.blocks.length - 1;
    update({ ...doc, blocks: [...doc.blocks.slice(0, at + 1), ...blocks, ...doc.blocks.slice(at + 1)].slice(0, DOC_MAX_BLOCKS) });
  };

  const exportAs = (kind: 'html' | 'md' | 'txt') => {
    const name = safeName(doc.title);
    if (kind === 'html') download(docToHtml(doc), `${name}.html`, 'text/html;charset=utf-8');
    if (kind === 'md') download(docToMarkdown(doc), `${name}.md`, 'text/markdown;charset=utf-8');
    if (kind === 'txt') download(docToText(doc), `${name}.txt`, 'text/plain;charset=utf-8');
  };

  const words = wordCount(doc);
  const pageSize = doc.blocks.reduce((n, b) => n + b.text.length, 0);

  const ribbons: Record<string, React.ReactNode> = {
    home: (
      <>
        <RibbonGroup label="Estilo">
          <RibbonSelect
            label="Estilo do bloco"
            width="w-36"
            value={active?.type ?? 'paragraph'}
            options={(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => ({ value: t, label: BLOCK_LABELS[t] }))}
            onChange={(v) => active && update(setBlockType(doc, active.id, v as BlockType))}
          />
        </RibbonGroup>
        <RibbonGroup label="Fonte">
          <RibbonSelect
            label="Tamanho da fonte"
            width="w-28"
            value={fmt.size ?? 'md'}
            options={SIZE_LABELS}
            onChange={(v) => applyFormat({ size: v as BlockSize })}
          />
          <RibbonButton icon={<Bold className="h-4 w-4" />} label="Negrito" pressed={!!fmt.bold} onClick={() => applyFormat({ bold: !fmt.bold })} />
          <RibbonButton icon={<Italic className="h-4 w-4" />} label="Itálico" pressed={!!fmt.italic} onClick={() => applyFormat({ italic: !fmt.italic })} />
          <RibbonButton icon={<Underline className="h-4 w-4" />} label="Sublinhado" pressed={!!fmt.underline} onClick={() => applyFormat({ underline: !fmt.underline })} />
        </RibbonGroup>
        <RibbonGroup label="Parágrafo">
          {(
            [
              { v: 'left', icon: <AlignLeft className="h-4 w-4" />, label: 'Alinhar à esquerda' },
              { v: 'center', icon: <AlignCenter className="h-4 w-4" />, label: 'Centralizar' },
              { v: 'right', icon: <AlignRight className="h-4 w-4" />, label: 'Alinhar à direita' },
            ] as Array<{ v: BlockAlign; icon: React.ReactNode; label: string }>
          ).map((a) => (
            <RibbonButton
              key={a.v}
              icon={a.icon}
              label={a.label}
              pressed={(fmt.align ?? 'left') === a.v}
              onClick={() => applyFormat({ align: a.v })}
            />
          ))}
        </RibbonGroup>
      </>
    ),
    insert: (
      <>
        <RibbonGroup label="Blocos">
          <RibbonButton wide icon={<Heading className="h-4 w-4" />} label="Título" onClick={() => insert('heading')} />
          <RibbonButton wide icon={<AlignLeft className="h-4 w-4" />} label="Parágrafo" onClick={() => insert('paragraph')} />
          <RibbonButton wide icon={<List className="h-4 w-4" />} label="Item de lista" onClick={() => insert('bullet')} />
        </RibbonGroup>
        <RibbonGroup label="Modelos">
          <RibbonSelect
            label="Modelo de documento"
            width="w-44"
            value=""
            options={[{ value: '', label: 'Escolher modelo…' }, ...DOC_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))]}
            onChange={(v) => v && applyDocTemplate(v)}
          />
        </RibbonGroup>
      </>
    ),
    share: (
      <>
        <RibbonGroup label="Exportar">
          <RibbonButton wide icon={<span className="text-[10px] font-bold">HTML</span>} label="HTML" onClick={() => exportAs('html')} />
          <RibbonButton wide icon={<span className="text-[10px] font-bold">MD</span>} label="Markdown" onClick={() => exportAs('md')} />
          <RibbonButton wide icon={<span className="text-[10px] font-bold">TXT</span>} label="Texto" onClick={() => exportAs('txt')} />
          <RibbonButton
            wide
            icon={<span className="text-[10px] font-bold">DOCX</span>}
            label="Word (.docx)"
            onClick={() =>
              docToDocx(doc).then((b) =>
                download(b, `${safeName(doc.title)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
              )
            }
          />
          <RibbonButton
            wide
            icon={<span className="text-[10px] font-bold">PDF</span>}
            label="PDF"
            onClick={() => void docToPdf(doc).then((b) => download(b, `${safeName(doc.title)}.pdf`, 'application/pdf'))}
          />
        </RibbonGroup>
        <RibbonGroup label="Enviar">
          <RibbonButton wide primary icon={<Mail className="h-4 w-4" />} label="Enviar por e-mail" onClick={() => setEmailOpen(true)} />
        </RibbonGroup>
      </>
    ),
  };

  const tabs: RibbonTab[] = [
    { id: 'home', label: 'Início' },
    { id: 'insert', label: 'Inserir' },
    { id: 'share', label: 'Compartilhar' },
  ];

  return (
    <>
      <AppFrame
        title={doc.title}
        titleLabel="Título do documento"
        titlePlaceholder="Documento sem título"
        onTitle={(title) => update({ ...doc, title })}
        tabs={tabs}
        activeTab={tab}
        onTab={setTab}
        ribbons={ribbons}
        workspaceClass="bg-[#e9ecef]"
        canvas={
          <div className="px-3 py-8 sm:px-8">
            {/* Página em formato carta: margens de 2,5 cm, sombra de papel. */}
            <article
              className="mx-auto w-full max-w-[816px] bg-white px-6 py-10 shadow-[0_1px_2px_rgba(15,23,42,0.2),0_6px_24px_-4px_rgba(15,23,42,0.22)] sm:min-h-[1056px] sm:px-[96px] sm:py-[96px]"
              aria-label="Página do documento"
            >
              <div className="space-y-1">
                {doc.blocks.map((b) => {
                  const f = b.format ?? {};
                  const isHeading = b.type === 'heading';
                  const style: React.CSSProperties = {
                    fontSize: f.size && f.size !== 'md' ? SIZE_PX[f.size] : isHeading ? '22px' : '15px',
                    fontWeight: f.bold || isHeading ? 700 : 400,
                    fontStyle: f.italic ? 'italic' : 'normal',
                    textDecoration: f.underline ? 'underline' : 'none',
                    textAlign: f.align ?? 'left',
                  };
                  return (
                    <div
                      key={b.id}
                      className={`group relative flex items-start gap-2 rounded px-1 transition hover:bg-slate-50 focus-within:bg-slate-50 ${
                        isHeading ? 'mt-4 first:mt-0' : ''
                      } ${active?.id === b.id ? 'ring-1 ring-blue-200' : ''}`}
                    >
                      {b.type === 'bullet' && (
                        <span className="mt-[0.35em] select-none text-slate-700" aria-hidden>
                          •
                        </span>
                      )}
                      <AutoTextarea
                        value={b.text}
                        onChange={(text) => setText(b.id, text)}
                        onFocus={() => setActiveId(b.id)}
                        ariaLabel="Texto do bloco"
                        style={style}
                      />
                      <button
                        type="button"
                        onClick={() => update(removeBlockById(doc, b.id))}
                        aria-label="Remover bloco"
                        className="mt-0.5 shrink-0 rounded p-1 text-slate-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-xs text-slate-400 sm:hidden">{pageSize} caracteres</p>
            </article>
          </div>
        }
        assistant={
          assistantOpen ? (
            <AiPanel
              placeholder="Ex.: Escreva uma proposta comercial curta para uma loja de café de bairro."
              creditsAvailable={creditsAvailable}
              busy={busy}
              onRun={generate}
              actionLabel={`Escrever com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
              onDictate={dictate}
            />
          ) : null
        }
        status={
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span>Página 1 de 1</span>
              <span>{words} palavras</span>
              <NoticeInline notice={message} />
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Salvo neste navegador
              </span>
              <span>Português (Brasil)</span>
            </div>
          </>
        }
      />
      <OfficeEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={doc.title}
        creditsAvailable={creditsAvailable}
        formats={[
          { id: 'html', label: 'HTML', ext: 'html' },
          { id: 'md', label: 'Markdown', ext: 'md' },
          { id: 'txt', label: 'Texto', ext: 'txt' },
        ]}
        buildFile={(id) => {
          const text = id === 'html' ? docToHtml(doc) : id === 'md' ? docToMarkdown(doc) : docToText(doc);
          return { bytes: new TextEncoder().encode(text) };
        }}
        sourceText={() => docToText(doc)}
      />
    </>
  );
}

/** Aviso curto na barra de status (resultado da IA ou erro). */
function NoticeInline({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <span role="status" className={notice.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'}>
      {notice.text}
    </span>
  );
}

function columnOf(ref: string): string {
  return ref.replace(/\d+$/, '');
}

function SheetTab({ creditsAvailable, assistantOpen }: { creditsAvailable: number; assistantOpen: boolean }) {
  const [sheet, setSheet] = useState<SheetData>(() => loadLocal(SHEET_KEY, () => createEmptySheet()));
  const [selected, setSelected] = useState('A1');
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<Notice>(null);
  const runAi = useAiRunner(setMessage, setBusy);

  const values = useMemo(() => evaluateAll(sheet.cells), [sheet.cells]);
  const bounds = usedBounds(sheet.cells);
  const rowCount = Math.min(SHEET_MAX_ROWS, Math.max(bounds.rows + 10, 20));
  const colCount = Math.min(SHEET_MAX_COLS, Math.max(bounds.cols + 2, 10));

  const commit = (next: SheetData) => {
    setSheet(next);
    saveLocal(SHEET_KEY, next);
  };

  const generate = (prompt: string, source: string) => {
    const hasData = Object.keys(sheet.cells).length > 0;
    if (hasData && !window.confirm('A IA vai substituir o conteúdo atual da planilha. Continuar?')) return Promise.resolve();
    return runAi(
      () => runOfficeAi({ action: 'sheet', prompt, source: source || undefined }),
      (res) => {
        if (res.action !== 'sheet') throw new Error('Resposta inesperada da IA.');
        commit(sheetFromTable(sheet.title, res.output.headers, res.output.rows));
      },
      `Planilha preenchida com IA (${OFFICE_AI_CREDIT_COST} crédito).`,
    );
  };

  const rawSelected = sheet.cells[selected] ?? '';
  const selStyle = sheet.styles?.[selected] ?? {};
  const selectedCol = columnOf(selected);
  const selectedRow = Number(selected.replace(/^[A-Z]+/, ''));
  const exportName = safeName(sheet.title);
  const filled = Object.keys(sheet.cells).length;

  const moveTo = (ref: string) => {
    setSelected(ref);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-cell="${ref}"]`)?.focus());
  };

  /** Modelo de planilha: ocupa a grade toda, então pede confirmação quando já há conteúdo. */
  const applySheetTemplate = (id: string) => {
    const tpl = SHEET_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (Object.keys(sheet.cells).length > 0 && !window.confirm(`Substituir o conteúdo atual da planilha pelo modelo "${tpl.label}"?`)) return;
    const title = sheet.title.startsWith('Planilha sem') ? tpl.label : sheet.title;
    commit(tpl.build(title));
  };

  const addFormula = (fn: SheetFunction) => {
    commit(setCell(sheet, selected, suggestFormula(fn, selected)));
  };

  const ribbons: Record<string, React.ReactNode> = {
    home: (
      <>
        <RibbonGroup label="Fonte">
          <RibbonButton icon={<Bold className="h-4 w-4" />} label="Negrito" pressed={!!selStyle.bold} onClick={() => commit(styleCells(sheet, [selected], { bold: !selStyle.bold }))} />
          <RibbonButton icon={<Italic className="h-4 w-4" />} label="Itálico" pressed={!!selStyle.italic} onClick={() => commit(styleCells(sheet, [selected], { italic: !selStyle.italic }))} />
        </RibbonGroup>
        <RibbonGroup label="Alinhamento">
          {(
            [
              { v: 'left', icon: <AlignLeft className="h-4 w-4" />, label: 'Alinhar à esquerda' },
              { v: 'center', icon: <AlignCenter className="h-4 w-4" />, label: 'Centralizar' },
              { v: 'right', icon: <AlignRight className="h-4 w-4" />, label: 'Alinhar à direita' },
            ] as Array<{ v: CellAlign; icon: React.ReactNode; label: string }>
          ).map((a) => (
            <RibbonButton
              key={a.v}
              icon={a.icon}
              label={a.label}
              pressed={(selStyle.align ?? 'left') === a.v}
              onClick={() => commit(styleCells(sheet, [selected], { align: a.v }))}
            />
          ))}
        </RibbonGroup>
        <RibbonGroup label="Preenchimento">
          <div className="flex items-center gap-1">
            {CELL_FILLS.map((f) => (
              <button
                key={f.label}
                type="button"
                title={f.label}
                aria-label={`Preencher: ${f.label}`}
                onClick={() => commit(styleCells(sheet, [selected], { fill: f.color }))}
                className={`h-6 w-6 rounded border ${f.color ? 'border-slate-300' : 'border-slate-300 bg-[linear-gradient(135deg,#fff_45%,#ef4444_45%,#ef4444_55%,#fff_55%)]'} transition hover:scale-110`}
                style={f.color ? { background: f.color } : undefined}
              />
            ))}
          </div>
        </RibbonGroup>
        <RibbonGroup label="Editar">
          <RibbonButton
            wide
            icon={<Eraser className="h-4 w-4" />}
            label="Limpar"
            onClick={() => {
              const cleared = setCell(sheet, selected, '');
              commit(styleCells(cleared, [selected], { bold: false, italic: false, align: 'left', fill: null }));
            }}
          />
        </RibbonGroup>
      </>
    ),
    insert: (
      <>
        <RibbonGroup label="Fórmulas">
          <RibbonButton wide icon={<Sigma className="h-4 w-4" />} label="Soma" onClick={() => addFormula('SUM')} />
          <RibbonButton wide icon={<span className="text-[13px] font-bold">x̄</span>} label="Média" onClick={() => addFormula('AVERAGE')} />
          <RibbonButton wide icon={<span className="text-[11px] font-bold">#</span>} label="Contar" onClick={() => addFormula('COUNT')} />
        </RibbonGroup>
        <RibbonGroup label="Modelos">
          <RibbonSelect
            label="Modelo de planilha"
            width="w-44"
            value=""
            options={[{ value: '', label: 'Escolher modelo…' }, ...SHEET_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))]}
            onChange={(v) => v && applySheetTemplate(v)}
          />
        </RibbonGroup>
      </>
    ),
    share: (
      <>
        <RibbonGroup label="Exportar">
          <RibbonButton wide icon={<span className="text-[10px] font-bold">CSV</span>} label="CSV" onClick={() => download(sheetToCsv(sheet.cells), `${exportName}.csv`, 'text/csv;charset=utf-8')} />
          <RibbonButton
            wide
            icon={<span className="text-[10px] font-bold">XLSX</span>}
            label="Excel (.xlsx)"
            onClick={() =>
              download(sheetToXlsx(sheet), `${exportName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            }
          />
          <RibbonButton
            wide
            icon={<span className="text-[10px] font-bold">PDF</span>}
            label="PDF"
            onClick={() => void sheetToPdf(sheet).then((b) => download(b, `${exportName}.pdf`, 'application/pdf'))}
          />
        </RibbonGroup>
        <RibbonGroup label="Enviar">
          <RibbonButton wide primary icon={<Mail className="h-4 w-4" />} label="Enviar por e-mail" onClick={() => setEmailOpen(true)} />
        </RibbonGroup>
      </>
    ),
  };

  const tabs: RibbonTab[] = [
    { id: 'home', label: 'Início' },
    { id: 'insert', label: 'Inserir' },
    { id: 'share', label: 'Compartilhar' },
  ];

  return (
    <>
      <AppFrame
        title={sheet.title}
        titleLabel="Título da planilha"
        titlePlaceholder="Planilha sem título"
        onTitle={(title) => commit({ ...sheet, title })}
        tabs={tabs}
        activeTab={tab}
        onTab={setTab}
        ribbons={ribbons}
        workspaceClass="bg-white"
        canvasTop={
          <div className="flex items-stretch border-b border-slate-200 bg-white">
            <span className="flex w-20 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 font-mono text-xs font-semibold text-slate-700">
              {selected}
            </span>
            <span className="flex w-10 shrink-0 items-center justify-center border-r border-slate-200 font-serif text-sm italic text-slate-500" aria-hidden>
              fx
            </span>
            <input
              value={rawSelected}
              onChange={(e) => commit(setCell(sheet, selected, e.target.value))}
              placeholder="Digite um valor ou uma fórmula, ex.: =SUM(B2:B10)"
              aria-label="Conteúdo da célula selecionada"
              className="min-w-0 flex-1 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400"
            />
          </div>
        }
        canvas={
          <div className="h-full overflow-auto">
            <table className="w-max border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 h-6 w-10 border-b border-r border-slate-300 bg-slate-100" aria-hidden />
                  {Array.from({ length: colCount }, (_, c) => {
                    const letter = columnLetters(c);
                    const active = letter === selectedCol;
                    return (
                      <th
                        key={c}
                        className={`h-6 min-w-[120px] border-b border-r border-slate-300 px-2 text-[11px] font-semibold ${
                          active ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {letter}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }, (_, r) => {
                  const rowActive = r + 1 === selectedRow;
                  return (
                    <tr key={r}>
                      <th
                        className={`sticky left-0 z-10 h-6 border-b border-r border-slate-300 px-1 text-center text-[11px] font-semibold ${
                          rowActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {r + 1}
                      </th>
                      {Array.from({ length: colCount }, (_, c) => {
                        const ref = toRef(c, r + 1);
                        const isSel = ref === selected;
                        const st = sheet.styles?.[ref] ?? {};
                        const shown = isSel ? rawSelected : (values[ref] ?? '');
                        return (
                          <td
                            key={ref}
                            style={{ background: st.fill ?? undefined }}
                            className={`h-6 border-b border-r border-slate-200 p-0 ${
                              isSel ? 'relative z-[1] shadow-[inset_0_0_0_2px_#2563eb]' : ''
                            }`}
                          >
                            <input
                              data-cell={ref}
                              value={shown}
                              onFocus={() => setSelected(ref)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  moveTo(toRef(c, Math.min(r + 2, SHEET_MAX_ROWS)));
                                }
                              }}
                              onChange={(e) => commit(setCell(sheet, ref, e.target.value))}
                              aria-label={`Célula ${ref}`}
                              style={{
                                textAlign: st.align ?? 'left',
                                fontWeight: st.bold ? 700 : 400,
                                fontStyle: st.italic ? 'italic' : 'normal',
                              }}
                              className={`h-6 w-full min-w-[120px] bg-transparent px-1.5 focus:outline-none ${
                                /^#/.test(values[ref] ?? '') && !isSel ? 'text-red-600' : 'text-slate-900'
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
        assistant={
          assistantOpen ? (
            <AiPanel
              placeholder="Ex.: Planilha de controle financeiro mensal com receitas, despesas e saldo por mês."
              creditsAvailable={creditsAvailable}
              busy={busy}
              onRun={generate}
              actionLabel={`Preencher com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
            />
          ) : null
        }
        status={
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span>Pronto</span>
              <span>{filled} células preenchidas</span>
              <NoticeInline notice={message} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Salvo neste navegador
            </div>
          </>
        }
      />
      <OfficeEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={sheet.title}
        creditsAvailable={creditsAvailable}
        formats={[
          { id: 'xlsx', label: 'Excel (.xlsx)', ext: 'xlsx' },
          { id: 'csv', label: 'CSV', ext: 'csv' },
        ]}
        buildFile={(id) =>
          id === 'csv'
            ? { bytes: new TextEncoder().encode(sheetToCsv(sheet.cells)) }
            : { bytes: new Uint8Array(sheetToXlsx(sheet)) }
        }
        sourceText={() => sheetToCsv(sheet.cells)}
      />
    </>
  );
}

/** Há conteúdo salvo neste navegador para o aplicativo? Usado para pedir confirmação antes de substituir. */
function storedHasContent(kind: 'doc' | 'sheet' | 'slides'): boolean {
  try {
    if (kind === 'doc') {
      const d = JSON.parse(window.localStorage.getItem(DOC_KEY) ?? 'null') as DocData | null;
      return !!d && d.blocks.some((b) => b.text.trim() !== '');
    }
    if (kind === 'sheet') {
      const sh = JSON.parse(window.localStorage.getItem(SHEET_KEY) ?? 'null') as SheetData | null;
      return !!sh && Object.keys(sh.cells).length > 0;
    }
    const dk = JSON.parse(window.localStorage.getItem(DECK_KEY) ?? 'null') as { slides: Array<{ title: string; bullets: string[] }> } | null;
    return !!dk && dk.slides.some((s) => s.title.trim() !== '' || s.bullets.some((b) => b.trim() !== ''));
  } catch {
    return false;
  }
}

const APP_LABEL: Record<'doc' | 'sheet' | 'slides', string> = {
  doc: 'documento',
  sheet: 'planilha',
  slides: 'apresentação',
};

export function OfficeSuite({ creditsAvailable }: { creditsAvailable: number }) {
  const [app, setApp] = useState<AppId>('doc');
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const [importNote, setImportNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pdfSeed, setPdfSeed] = useState<PdfSeed | null>(null);
  const [pdfKey, setPdfKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;

  /** Abre qualquer arquivo suportado no aplicativo certo, substituindo o rascunho após confirmação. */
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportNote(null);
    try {
      if (/\.pdf$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await inspectPdf(bytes);
        if (pdfSeed && !window.confirm('Abrir este PDF substitui o que está no editor de PDF. Continuar?')) return;
        setPdfSeed({ name: file.name, bytes });
        setPdfKey((k) => k + 1);
        setApp('pdf');
        setImportNote({ kind: 'ok', text: `${file.name} aberto no editor de PDF.` });
        return;
      }
      const r = await importFile(file);
      const target: 'doc' | 'sheet' | 'slides' = r.kind === 'doc' ? 'doc' : r.kind === 'sheet' ? 'sheet' : 'slides';
      if (storedHasContent(target) && !window.confirm(`Substituir o conteúdo atual do ${APP_LABEL[target]} por "${file.name}"?`)) {
        setImporting(false);
        return;
      }
      if (r.kind === 'doc') window.localStorage.setItem(DOC_KEY, JSON.stringify(r.doc));
      if (r.kind === 'sheet') window.localStorage.setItem(SHEET_KEY, JSON.stringify(r.sheet));
      if (r.kind === 'deck') window.localStorage.setItem(DECK_KEY, JSON.stringify(r.deck));
      setApp(target);
      setReloadKey((k) => k + 1);
      setImportNote({ kind: 'ok', text: r.note });
    } catch (err) {
      setImportNote({ kind: 'err', text: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 sm:py-6">
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]">
        {/* Barra do sistema: identidade, custo da IA e saldo. */}
        <header className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-blue-700 via-blue-700 to-violet-700 px-3 py-2.5 text-white">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 font-['Unbounded'] text-sm font-bold ring-1 ring-white/30"
          >
            V
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-['Unbounded'] text-sm font-bold leading-tight">Vertal Office</h2>
            <p className="truncate text-[11px] text-blue-100">Documentos, planilhas, apresentações e PDF. Grátis para usar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
              Só a IA é paga · {OFFICE_AI_CREDIT_COST} crédito por uso
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                hasCredit ? 'bg-white/15' : 'bg-amber-400/90 text-amber-950'
              }`}
            >
              {creditsAvailable} {creditsAvailable === 1 ? 'crédito disponível' : 'créditos disponíveis'}
            </span>
            <button
              type="button"
              onClick={() => setMiniOpen((v) => !v)}
              aria-pressed={miniOpen}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                miniOpen ? 'bg-white text-blue-800' : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              <Youtube className="h-3.5 w-3.5" aria-hidden />
              Mini janela
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-white/25 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {importing ? 'Abrindo…' : 'Abrir arquivo'}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={onPick} aria-label="Escolher arquivo para abrir" />
            <button
              type="button"
              aria-pressed={assistantOpen}
              onClick={() => setAssistantOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                assistantOpen ? 'bg-white text-blue-800 shadow-sm' : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Assistente
            </button>
          </div>
        </header>

        {importNote && (
          <p
            role="status"
            className={`border-b px-4 py-2 text-sm ${
              importNote.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {importNote.text}
          </p>
        )}
        <div className="flex flex-col sm:flex-row">
          {/* Navegação entre aplicativos: lateral no computador, linha no celular. */}
          <nav
            role="tablist"
            aria-label="Aplicativos do Office"
            className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 p-2 sm:w-[92px] sm:flex-col sm:border-b-0 sm:border-r sm:py-3"
          >
            {APPS.map((a) => {
              const on = app === a.id;
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setApp(a.id)}
                  className={`flex min-w-[84px] flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition ${
                    on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${a.tile}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>{a.label}</span>
                </button>
              );
            })}
          </nav>

          {app === 'doc' && <DocumentTab key={`doc-${reloadKey}`} creditsAvailable={creditsAvailable} assistantOpen={assistantOpen} />}
          {app === 'sheet' && <SheetTab key={`sheet-${reloadKey}`} creditsAvailable={creditsAvailable} assistantOpen={assistantOpen} />}
          {app === 'slides' && <SlidesTab key={`slides-${reloadKey}`} creditsAvailable={creditsAvailable} assistantOpen={assistantOpen} />}
          {/* Fica montado ao trocar de aplicativo, para o PDF em edição não se perder. */}
          <div className={app === 'pdf' ? 'flex min-w-0 flex-1' : 'hidden'}>
            <PdfTab key={`pdf-${pdfKey}`} seed={pdfSeed} />
          </div>
        </div>
      </div>
      <MiniWindow open={miniOpen} onClose={() => setMiniOpen(false)} />
    </div>
  );
}

export default OfficeSuite;
