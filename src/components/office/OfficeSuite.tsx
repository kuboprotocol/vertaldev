// Vertal Office do Painel Criativo: Documento + Planilha.
// Editor e exportação são grátis. Cada uso da IA custa 1 crédito.
import React, { useMemo, useState } from 'react';
import { FileText, Sheet as SheetIcon, Presentation, Sparkles, Plus, Trash2, Download, Loader2 } from 'lucide-react';
import {
  DocData,
  BlockType,
  createEmptyDoc,
  docFromAi,
  docToHtml,
  docToMarkdown,
  docToText,
  makeBlock,
  wordCount,
} from '@/lib/office/documentModel';
import {
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  SheetData,
  createEmptySheet,
  setCell,
  sheetFromTable,
  sheetToCsv,
  sheetToXlsx,
  usedBounds,
} from '@/lib/office/sheetModel';
import { columnLetters, evaluateAll, toRef } from '@/lib/office/formulas';
import { OFFICE_AI_CREDIT_COST, runOfficeAi } from '@/services/officeAiService';
import { OfficeEmailDialog } from './OfficeEmailDialog';
import { SlidesTab } from './SlidesTab';

const DOC_KEY = 'kubo-office-doc-v1';
const SHEET_KEY = 'kubo-office-sheet-v1';

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

function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(title: string): string {
  return (title || 'arquivo').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
}

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Título',
  paragraph: 'Parágrafo',
  bullet: 'Item de lista',
};

interface AiPanelProps {
  placeholder: string;
  creditsAvailable: number;
  busy: boolean;
  onRun: (prompt: string, source: string) => void;
  actionLabel: string;
}

/** Bloco da IA: pedido, material opcional e botão com o custo visível. */
function AiPanel({ placeholder, creditsAvailable, busy, onRun, actionLabel }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState('');
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;
  const canRun = !busy && hasCredit && prompt.trim().length >= 3;

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <Sparkles className="h-4 w-4" /> Inteligência artificial
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
      />
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer select-none">Colar dados ou texto de referência (opcional)</summary>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={4}
          placeholder="Cole aqui tabelas, listas ou textos que a IA deve usar como base."
          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
        />
      </details>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          Custa {OFFICE_AI_CREDIT_COST} crédito por uso · você tem {creditsAvailable}
        </span>
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRun(prompt.trim(), source.trim())}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Gerando…' : actionLabel}
        </button>
      </div>
      {!hasCredit && <p className="text-xs text-amber-300">Sem créditos. O editor continua funcionando normalmente.</p>}
    </div>
  );
}

function DocumentTab({ creditsAvailable }: { creditsAvailable: number }) {
  const [doc, setDoc] = useState<DocData>(() => loadLocal(DOC_KEY, () => createEmptyDoc()));
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const update = (next: DocData) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDoc(stamped);
    saveLocal(DOC_KEY, stamped);
  };

  const runAi = async (prompt: string, source: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await runOfficeAi({ action: 'doc', prompt, source: source || undefined });
      if (res.action !== 'doc') throw new Error('Resposta inesperada da IA.');
      const generated = docFromAi(res.output.title, res.output.blocks);
      const isEmpty = doc.blocks.every((b) => b.text.trim() === '');
      update({
        ...doc,
        title: isEmpty || doc.title.startsWith('Documento sem') ? generated.title : doc.title,
        blocks: isEmpty ? generated.blocks : [...doc.blocks, ...generated.blocks],
      });
      setMessage({ kind: 'ok', text: `Texto gerado com IA (${OFFICE_AI_CREDIT_COST} crédito).` });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const setBlock = (id: string, patch: Partial<{ type: BlockType; text: string }>) =>
    update({ ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const removeBlock = (id: string) => {
    const blocks = doc.blocks.filter((b) => b.id !== id);
    update({ ...doc, blocks: blocks.length ? blocks : [makeBlock()] });
  };

  const exportAs = (kind: 'html' | 'md' | 'txt') => {
    const name = safeName(doc.title);
    if (kind === 'html') download(docToHtml(doc), `${name}.html`, 'text/html;charset=utf-8');
    if (kind === 'md') download(docToMarkdown(doc), `${name}.md`, 'text/markdown;charset=utf-8');
    if (kind === 'txt') download(docToText(doc), `${name}.txt`, 'text/plain;charset=utf-8');
  };

  return (
    <div className="space-y-4">
      <input
        value={doc.title}
        onChange={(e) => update({ ...doc, title: e.target.value })}
        aria-label="Título do documento"
        className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none"
      />

      <div className="space-y-2">
        {doc.blocks.map((b) => (
          <div key={b.id} className="flex items-start gap-2 rounded-lg border border-white/5 bg-slate-950/40 p-2">
            <select
              value={b.type}
              onChange={(e) => setBlock(b.id, { type: e.target.value as BlockType })}
              aria-label="Tipo do bloco"
              className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t]}
                </option>
              ))}
            </select>
            <textarea
              value={b.text}
              onChange={(e) => setBlock(b.id, { text: e.target.value })}
              rows={b.type === 'heading' ? 1 : 2}
              aria-label="Texto do bloco"
              className={`min-w-0 flex-1 resize-y bg-transparent text-slate-100 focus:outline-none ${
                b.type === 'heading' ? 'text-lg font-semibold' : 'text-sm'
              }`}
            />
            <button
              type="button"
              onClick={() => removeBlock(b.id)}
              aria-label="Remover bloco"
              className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update({ ...doc, blocks: [...doc.blocks, makeBlock()] })}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
        >
          <Plus className="h-4 w-4" /> Adicionar bloco
        </button>
      </div>

      <AiPanel
        placeholder="Ex.: Escreva uma proposta comercial curta para uma loja de café de bairro."
        creditsAvailable={creditsAvailable}
        busy={busy}
        onRun={runAi}
        actionLabel={`Escrever com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
      />

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="text-xs text-slate-400">{wordCount(doc)} palavras · salvo neste navegador</span>
        <div className="flex flex-wrap gap-2">
          <ExportButton label="HTML" onClick={() => exportAs('html')} />
          <ExportButton label="Markdown" onClick={() => exportAs('md')} />
          <ExportButton label="Texto" onClick={() => exportAs('txt')} />
          <ExportButton label="Enviar por e-mail" onClick={() => setEmailOpen(true)} />
        </div>
      </div>
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
    </div>
  );
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function SheetTab({ creditsAvailable }: { creditsAvailable: number }) {
  const [sheet, setSheet] = useState<SheetData>(() => loadLocal(SHEET_KEY, () => createEmptySheet()));
  const [selected, setSelected] = useState('A1');
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const values = useMemo(() => evaluateAll(sheet.cells), [sheet.cells]);
  const bounds = usedBounds(sheet.cells);
  const rowCount = Math.min(SHEET_MAX_ROWS, Math.max(bounds.rows + 10, 20));
  const colCount = Math.min(SHEET_MAX_COLS, Math.max(bounds.cols + 2, 8));

  const commit = (next: SheetData) => {
    setSheet(next);
    saveLocal(SHEET_KEY, next);
  };

  const runAi = async (prompt: string, source: string) => {
    const hasData = Object.keys(sheet.cells).length > 0;
    if (hasData && !window.confirm('A IA vai substituir o conteúdo atual da planilha. Continuar?')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await runOfficeAi({ action: 'sheet', prompt, source: source || undefined });
      if (res.action !== 'sheet') throw new Error('Resposta inesperada da IA.');
      commit(sheetFromTable(sheet.title, res.output.headers, res.output.rows));
      setMessage({ kind: 'ok', text: `Planilha preenchida com IA (${OFFICE_AI_CREDIT_COST} crédito).` });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rawSelected = sheet.cells[selected] ?? '';
  const exportName = safeName(sheet.title);

  return (
    <div className="space-y-4">
      <input
        value={sheet.title}
        onChange={(e) => commit({ ...sheet, title: e.target.value })}
        aria-label="Título da planilha"
        className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none"
      />

      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 rounded-md bg-slate-800 px-2 py-1 text-center text-xs font-mono text-slate-300">
          {selected}
        </span>
        <input
          value={rawSelected}
          onChange={(e) => commit(setCell(sheet, selected, e.target.value))}
          placeholder="Digite um valor ou uma fórmula, ex.: =SUM(B2:B10)"
          aria-label="Conteúdo da célula selecionada"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
        />
      </div>

      <div className="max-h-[420px] overflow-auto rounded-lg border border-white/10">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900">
            <tr>
              <th className="sticky left-0 z-20 w-10 border border-white/10 bg-slate-900 text-xs text-slate-500" />
              {Array.from({ length: colCount }, (_, c) => (
                <th key={c} className="min-w-[120px] border border-white/10 px-2 py-1 text-xs font-medium text-slate-400">
                  {columnLetters(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, r) => (
              <tr key={r}>
                <th className="sticky left-0 z-10 border border-white/10 bg-slate-900 px-2 text-xs font-medium text-slate-400">
                  {r + 1}
                </th>
                {Array.from({ length: colCount }, (_, c) => {
                  const ref = toRef(c, r + 1);
                  const isSel = ref === selected;
                  return (
                    <td key={ref} className={`border border-white/10 p-0 ${isSel ? 'ring-2 ring-inset ring-cyan-400' : ''}`}>
                      <input
                        value={isSel ? rawSelected : (values[ref] ?? '')}
                        onFocus={() => setSelected(ref)}
                        onChange={(e) => commit(setCell(sheet, ref, e.target.value))}
                        aria-label={`Célula ${ref}`}
                        className="h-8 w-full min-w-[120px] bg-transparent px-2 text-slate-100 focus:outline-none"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AiPanel
        placeholder="Ex.: Planilha de controle financeiro mensal com receitas, despesas e saldo por mês."
        creditsAvailable={creditsAvailable}
        busy={busy}
        onRun={runAi}
        actionLabel={`Preencher com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
      />

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="text-xs text-slate-400">
          {Object.keys(sheet.cells).length} células preenchidas · salvo neste navegador
        </span>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            label="CSV"
            onClick={() => download(sheetToCsv(sheet.cells), `${exportName}.csv`, 'text/csv;charset=utf-8')}
          />
          <ExportButton
            label="Excel (.xlsx)"
            onClick={() =>
              download(
                sheetToXlsx(sheet),
                `${exportName}.xlsx`,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              )
            }
          />
          <ExportButton label="Enviar por e-mail" onClick={() => setEmailOpen(true)} />
        </div>
      </div>
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
    </div>
  );
}

export function OfficeSuite({ creditsAvailable }: { creditsAvailable: number }) {
  const [tab, setTab] = useState<'doc' | 'sheet' | 'slides'>('doc');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-slate-100">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-['Unbounded'] text-2xl font-bold text-white">Vertal Office</h2>
          <p className="text-sm text-slate-400">Documentos, planilhas e apresentações. Grátis para usar.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
          Só a IA é paga · {OFFICE_AI_CREDIT_COST} crédito por uso
        </span>
      </header>

      <div role="tablist" aria-label="Aplicativos do Office" className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-1.5">
        {(
          [
            { id: 'doc', label: 'Documento', icon: <FileText className="h-4 w-4" />, accent: 'from-violet-500/30' },
            { id: 'sheet', label: 'Planilha', icon: <SheetIcon className="h-4 w-4" />, accent: 'from-cyan-500/30' },
            { id: 'slides', label: 'Apresentação', icon: <Presentation className="h-4 w-4" />, accent: 'from-amber-500/30' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? `bg-gradient-to-br ${t.accent} to-transparent text-white ring-1 ring-white/15`
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {t.icon} <span>{t.label}</span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-4 shadow-2xl shadow-black/30 sm:p-6">
        {tab === 'doc' && <DocumentTab creditsAvailable={creditsAvailable} />}
        {tab === 'sheet' && <SheetTab creditsAvailable={creditsAvailable} />}
        {tab === 'slides' && <SlidesTab />}
      </section>
    </div>
  );
}

export default OfficeSuite;
