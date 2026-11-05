// Vertal Office do Painel Criativo: Documento, Planilha e Apresentação.
// Editor e exportação são grátis. Cada uso da IA custa 1 crédito.
import React, { useMemo, useState } from 'react';
import { FileText, Sheet as SheetIcon, Presentation, Plus, Trash2, Download, Mail, Heading, AlignLeft, List, ShieldCheck } from 'lucide-react';
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
import { AiPanel } from './AiPanel';
import { docToDocx } from '@/lib/office/officeFiles';
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

type Notice = { kind: 'ok' | 'err'; text: string } | null;

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Título',
  paragraph: 'Parágrafo',
  bullet: 'Item de lista',
};

const APPS = [
  {
    id: 'doc',
    label: 'Documento',
    hint: 'Textos, propostas e relatórios',
    icon: FileText,
    accent: 'from-violet-500/40 via-violet-500/10',
    dot: 'bg-violet-400',
  },
  {
    id: 'sheet',
    label: 'Planilha',
    hint: 'Tabelas, fórmulas e controles',
    icon: SheetIcon,
    accent: 'from-cyan-500/40 via-cyan-500/10',
    dot: 'bg-cyan-400',
  },
  {
    id: 'slides',
    label: 'Apresentação',
    hint: 'Slides com título e tópicos',
    icon: Presentation,
    accent: 'from-amber-500/40 via-amber-500/10',
    dot: 'bg-amber-400',
  },
] as const;

type AppId = (typeof APPS)[number]['id'];

/** Cabeçalho de cada app: nome, o que faz e a ação principal de criação. */
function WorkspaceBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">{children}</div>
  );
}

/** Barra de rodapé: status à esquerda, exportações e e-mail à direita. */
function StatusBar({ status, children }: { status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" aria-hidden />
        {status}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Mensagem de resultado da IA ou de erro, com cor e ícone de estado. */
function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const ok = notice.kind === 'ok';
  return (
    <p
      role="status"
      className={`rounded-lg border px-3 py-2 text-sm ${
        ok ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-red-400/30 bg-red-400/10 text-red-200'
      }`}
    >
      {notice.text}
    </p>
  );
}

function DocumentTab({ creditsAvailable }: { creditsAvailable: number }) {
  const [doc, setDoc] = useState<DocData>(() => loadLocal(DOC_KEY, () => createEmptyDoc()));
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<Notice>(null);

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

  const addBlock = (type: BlockType) => update({ ...doc, blocks: [...doc.blocks, makeBlock(type)] });

  const exportAs = (kind: 'html' | 'md' | 'txt') => {
    const name = safeName(doc.title);
    if (kind === 'html') download(docToHtml(doc), `${name}.html`, 'text/html;charset=utf-8');
    if (kind === 'md') download(docToMarkdown(doc), `${name}.md`, 'text/markdown;charset=utf-8');
    if (kind === 'txt') download(docToText(doc), `${name}.txt`, 'text/plain;charset=utf-8');
  };

  const words = wordCount(doc);

  return (
    <div className="space-y-5">
      <WorkspaceBar>
        <span className="mr-auto text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Inserir</span>
        <InsertButton icon={<Heading className="h-3.5 w-3.5" />} label="Título" onClick={() => addBlock('heading')} />
        <InsertButton icon={<AlignLeft className="h-3.5 w-3.5" />} label="Parágrafo" onClick={() => addBlock('paragraph')} />
        <InsertButton icon={<List className="h-3.5 w-3.5" />} label="Item de lista" onClick={() => addBlock('bullet')} />
      </WorkspaceBar>

      {/* Folha de papel: o documento aparece como uma página, não como um formulário. */}
      <div className="rounded-xl bg-slate-950/70 p-3 sm:p-6">
        <article className="mx-auto w-full max-w-[760px] rounded-sm bg-[#fbfaf6] px-6 py-10 text-slate-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/5 sm:px-14 sm:py-14">
          <textarea
            value={doc.title}
            onChange={(e) => update({ ...doc, title: e.target.value })}
            aria-label="Título do documento"
            placeholder="Título do documento"
            rows={1}
            className="w-full resize-none bg-transparent font-serif text-2xl font-bold leading-tight tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none sm:text-4xl"
          />
          <div className="mb-6 mt-4 h-px w-16 bg-violet-500/60" aria-hidden />

          <div className="space-y-1">
            {doc.blocks.map((b) => (
              <div
                key={b.id}
                className="group relative -mx-3 flex flex-col gap-1 rounded-md px-3 py-1 transition hover:bg-slate-900/[0.03] focus-within:bg-slate-900/[0.03] sm:flex-row sm:items-start sm:gap-3"
              >
                {/* No celular, os controles ficam em linha própria. No desktop flutuam no canto, só no hover/foco, sem empurrar o texto. */}
                <div className="flex items-center gap-1 self-start rounded-md bg-[#fbfaf6] p-0.5 sm:absolute sm:right-1 sm:top-1 sm:z-10 sm:self-auto sm:opacity-0 sm:shadow-sm sm:ring-1 sm:ring-slate-200 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <select
                    value={b.type}
                    onChange={(e) => setBlock(b.id, { type: e.target.value as BlockType })}
                    aria-label="Tipo do bloco"
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
                  >
                    {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
                      <option key={t} value={t}>
                        {BLOCK_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeBlock(b.id)}
                    aria-label="Remover bloco"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {b.type === 'bullet' && <span className="mt-2 text-violet-600" aria-hidden>•</span>}
                <textarea
                  value={b.text}
                  onChange={(e) => setBlock(b.id, { text: e.target.value })}
                  rows={b.type === 'paragraph' ? 2 : 1}
                  aria-label="Texto do bloco"
                  className={`min-w-0 flex-1 resize-none bg-transparent font-serif leading-relaxed text-slate-800 placeholder:text-slate-300 focus:outline-none ${
                    b.type === 'heading' ? 'pt-1 text-xl font-semibold text-slate-900' : 'text-[15px]'
                  }`}
                />
              </div>
            ))}
          </div>
        </article>
      </div>

      <AiPanel
        placeholder="Ex.: Escreva uma proposta comercial curta para uma loja de café de bairro."
        creditsAvailable={creditsAvailable}
        busy={busy}
        onRun={runAi}
        actionLabel={`Escrever com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
      />

      <NoticeLine notice={message} />

      <StatusBar status={<span>{words} palavras · salvo neste navegador</span>}>
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Exportar</span>
        <ExportButton label="HTML" onClick={() => exportAs('html')} />
        <ExportButton label="Markdown" onClick={() => exportAs('md')} />
        <ExportButton label="Texto" onClick={() => exportAs('txt')} />
        <ExportButton
          label="Word (.docx)"
          onClick={() =>
            docToDocx(doc).then((b) =>
              download(b, `${safeName(doc.title)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            )
          }
        />
        <ExportButton label="Enviar por e-mail" icon={<Mail className="h-3.5 w-3.5" />} primary onClick={() => setEmailOpen(true)} />
      </StatusBar>

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

function InsertButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-400/10"
    >
      {icon}
      {label}
    </button>
  );
}

function ExportButton({
  label,
  onClick,
  icon,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        primary
          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-900/30 hover:brightness-110'
          : 'border border-white/10 text-slate-200 hover:border-white/20 hover:bg-white/5'
      }`}
    >
      {icon ?? <Download className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

/** Converte índice de coluna da seleção (ex.: "C" de "C7") para comparar com o cabeçalho. */
function columnOf(ref: string): string {
  return ref.replace(/\d+$/, '');
}

function SheetTab({ creditsAvailable }: { creditsAvailable: number }) {
  const [sheet, setSheet] = useState<SheetData>(() => loadLocal(SHEET_KEY, () => createEmptySheet()));
  const [selected, setSelected] = useState('A1');
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<Notice>(null);

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
  const selectedCol = columnOf(selected);
  const selectedRow = Number(selected.replace(/^[A-Z]+/, ''));
  const exportName = safeName(sheet.title);
  const filled = Object.keys(sheet.cells).length;

  return (
    <div className="space-y-4">
      <WorkspaceBar>
        <input
          value={sheet.title}
          onChange={(e) => commit({ ...sheet, title: e.target.value })}
          aria-label="Título da planilha"
          placeholder="Título da planilha"
          className="mr-auto min-w-0 flex-1 bg-transparent text-xl font-bold text-white placeholder:text-slate-600 focus:outline-none sm:text-2xl"
        />
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200">
          {filled} células
        </span>
      </WorkspaceBar>

      {/* Barra de fórmulas: caixa de nome + campo da célula selecionada, como nas planilhas de escritório. */}
      <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 shadow-inner shadow-black/40 focus-within:ring-2 focus-within:ring-cyan-400/40">
        <span className="flex w-16 shrink-0 items-center justify-center border-r border-white/10 bg-slate-900/80 font-mono text-xs font-semibold text-slate-200">
          {selected}
        </span>
        <span className="flex w-10 shrink-0 items-center justify-center border-r border-white/10 font-serif text-sm italic text-cyan-300" aria-hidden>
          fx
        </span>
        <input
          value={rawSelected}
          onChange={(e) => commit(setCell(sheet, selected, e.target.value))}
          placeholder="Digite um valor ou uma fórmula, ex.: =SUM(B2:B10)"
          aria-label="Conteúdo da célula selecionada"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
      </div>

      <div className="max-h-[460px] overflow-auto rounded-xl border border-white/10 bg-slate-950/60 shadow-inner shadow-black/30">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 h-8 w-12 border-b border-r border-white/10 bg-slate-900" aria-hidden />
              {Array.from({ length: colCount }, (_, c) => {
                const letter = columnLetters(c);
                const active = letter === selectedCol;
                return (
                  <th
                    key={c}
                    className={`h-8 min-w-[132px] border-b border-r border-white/10 px-2 text-[11px] font-semibold tracking-wider ${
                      active ? 'bg-cyan-400/15 text-cyan-200' : 'bg-slate-900 text-slate-400'
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
                    className={`sticky left-0 z-10 h-8 border-b border-r border-white/10 px-2 text-center text-[11px] font-semibold ${
                      rowActive ? 'bg-cyan-400/15 text-cyan-200' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: colCount }, (_, c) => {
                    const ref = toRef(c, r + 1);
                    const isSel = ref === selected;
                    return (
                      <td
                        key={ref}
                        className={`h-8 border-b border-r border-white/5 p-0 ${
                          isSel ? 'relative z-[1] shadow-[inset_0_0_0_2px_rgb(34,211,238)]' : ''
                        }`}
                      >
                        <input
                          value={isSel ? rawSelected : (values[ref] ?? '')}
                          onFocus={() => setSelected(ref)}
                          onChange={(e) => commit(setCell(sheet, ref, e.target.value))}
                          aria-label={`Célula ${ref}`}
                          className={`h-8 w-full min-w-[132px] bg-transparent px-2 font-mono text-[13px] focus:outline-none ${
                            /^#/.test(values[ref] ?? '') ? 'text-red-300' : 'text-slate-100'
                          } ${!isSel && (r % 2 === 1) ? 'bg-white/[0.015]' : ''}`}
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

      <AiPanel
        placeholder="Ex.: Planilha de controle financeiro mensal com receitas, despesas e saldo por mês."
        creditsAvailable={creditsAvailable}
        busy={busy}
        onRun={runAi}
        actionLabel={`Preencher com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
      />

      <NoticeLine notice={message} />

      <StatusBar status={<span>{filled} células preenchidas · salvo neste navegador</span>}>
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Exportar</span>
        <ExportButton label="CSV" onClick={() => download(sheetToCsv(sheet.cells), `${exportName}.csv`, 'text/csv;charset=utf-8')} />
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
        <ExportButton label="Enviar por e-mail" icon={<Mail className="h-3.5 w-3.5" />} primary onClick={() => setEmailOpen(true)} />
      </StatusBar>

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
  const [tab, setTab] = useState<AppId>('doc');
  const hasCredit = creditsAvailable >= OFFICE_AI_CREDIT_COST;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-slate-100 sm:py-8">
      {/* Cabeçalho da suíte: identidade, promessa de preço e saldo de IA. */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-violet-950/60 p-5 shadow-2xl shadow-black/40 sm:p-7">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 font-['Unbounded'] text-lg font-bold text-white shadow-lg shadow-fuchsia-900/40 ring-1 ring-white/20" aria-hidden>
              V
            </span>
            <div className="space-y-1">
              <h2 className="font-['Unbounded'] text-2xl font-bold tracking-tight text-white">Vertal Office</h2>
              <p className="text-sm text-slate-400">Documentos, planilhas e apresentações. Grátis para usar.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Só a IA é paga · {OFFICE_AI_CREDIT_COST} crédito por uso
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                hasCredit ? 'border-white/10 bg-white/5 text-slate-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${hasCredit ? 'bg-violet-400' : 'bg-amber-400'}`} aria-hidden />
              {creditsAvailable} {creditsAvailable === 1 ? 'crédito disponível' : 'créditos disponíveis'}
            </span>
          </div>
        </div>
      </header>

      {/* Seletor de aplicativos: cartões com estado ativo, não abas genéricas. */}
      <div role="tablist" aria-label="Aplicativos do Office" className="grid gap-3 sm:grid-cols-3">
        {APPS.map((app) => {
          const active = tab === app.id;
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(app.id)}
              className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-white/20 bg-slate-900 shadow-xl shadow-black/40'
                  : 'border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/80'
              }`}
            >
              {active && <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${app.accent} to-transparent`} aria-hidden />}
              {active && <span className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${app.accent} to-transparent blur-2xl`} aria-hidden />}
              <div className="relative flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                    active ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{app.label}</span>
                  <span className="block truncate text-xs text-slate-500" aria-hidden>
                    {app.hint}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:p-7">
        {tab === 'doc' && <DocumentTab creditsAvailable={creditsAvailable} />}
        {tab === 'sheet' && <SheetTab creditsAvailable={creditsAvailable} />}
        {tab === 'slides' && <SlidesTab creditsAvailable={creditsAvailable} />}
      </section>
    </div>
  );
}

export default OfficeSuite;
