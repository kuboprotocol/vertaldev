// Aba de Apresentação do Vertal Office. Editor e exportação são grátis.
import React, { useState } from 'react';
import { Plus, Trash2, Download, ChevronUp, ChevronDown, List } from 'lucide-react';
import jsPDF from 'jspdf';
import {
  DECK_MAX_SLIDES,
  DECK_THEMES,
  DeckData,
  DeckThemeId,
  SLIDE_MAX_BULLETS,
  Slide,
  createEmptyDeck,
  deckToHtml,
  deckToText,
  makeSlide,
  setDeckTheme,
  themeById,
} from '@/lib/office/slidesModel';
import { deckToPptx } from '@/lib/office/officeFiles';
import { OFFICE_AI_CREDIT_COST, runOfficeAi } from '@/services/officeAiService';
import { AiPanel } from './AiPanel';
import { AppFrame } from './AppFrame';
import { RibbonButton, RibbonGroup, RibbonTab } from './Ribbon';

const DECK_KEY = 'kubo-office-deck-v1';

function loadDeck(): DeckData {
  try {
    const raw = window.localStorage.getItem(DECK_KEY);
    if (raw) return JSON.parse(raw) as DeckData;
  } catch {
    /* rascunho ilegível: começa do zero */
  }
  return createEmptyDeck();
}

function saveDeck(deck: DeckData) {
  try {
    window.localStorage.setItem(DECK_KEY, JSON.stringify(deck));
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
  return (title || 'apresentacao').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'apresentacao';
}

/** PDF em paisagem, um slide por página, com quebra de linha nos títulos e tópicos longos. */
function deckToPdf(deck: DeckData): ArrayBuffer {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const width = pageW - margin * 2;

  deck.slides.forEach((s, i) => {
    if (i > 0) pdf.addPage();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    let y = margin + 16;
    for (const line of pdf.splitTextToSize(s.title || ' ', width)) {
      pdf.text(line, margin, y);
      y += 40;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(18);
    y += 12;
    for (const b of s.bullets) {
      for (const [k, line] of pdf.splitTextToSize(`• ${b}`, width - 12).entries()) {
        if (y > pageH - margin) break;
        pdf.text(k === 0 ? line : `   ${line}`, margin + 6, y);
        y += 26;
      }
    }
  });
  return pdf.output('arraybuffer');
}

export function SlidesTab({ creditsAvailable, assistantOpen }: { creditsAvailable: number; assistantOpen: boolean }) {
  const [deck, setDeck] = useState<DeckData>(loadDeck);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const commit = (next: DeckData) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDeck(stamped);
    saveDeck(stamped);
  };

  const slides = deck.slides;
  const current: Slide = slides[Math.min(selected, slides.length - 1)] ?? slides[0];
  const index = slides.indexOf(current);
  const theme = themeById(deck.theme);

  const updateSlide = (patch: Partial<Slide>) =>
    commit({ ...deck, slides: slides.map((s) => (s.id === current.id ? { ...s, ...patch } : s)) });

  const move = (dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[index], next[j]] = [next[j], next[index]];
    commit({ ...deck, slides: next });
    setSelected(j);
  };

  const removeCurrent = () => {
    const next = slides.filter((s) => s.id !== current.id);
    commit({ ...deck, slides: next.length ? next : [makeSlide('Novo slide')] });
    setSelected(Math.max(0, index - 1));
  };

  const addSlide = () => {
    if (slides.length >= DECK_MAX_SLIDES) return;
    const created = makeSlide('Novo slide');
    commit({ ...deck, slides: [...slides.slice(0, index + 1), created, ...slides.slice(index + 1)] });
    setSelected(index + 1);
  };

  const addBullet = () => {
    if (current.bullets.length >= SLIDE_MAX_BULLETS) return;
    updateSlide({ bullets: [...current.bullets, ''] });
  };

  /** IA: adiciona os slides gerados depois do slide atual (ou substitui a apresentação vazia). Não apaga nada. */
  const runAi = async (prompt: string, source: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await runOfficeAi({ action: 'slides', prompt, source: source || undefined });
      if (res.action !== 'slides') throw new Error('Resposta inesperada da IA.');
      const generated = res.output.slides.map((g) => makeSlide(g.title, g.bullets));
      const hasContent = slides.some((sl) => sl.title.trim() || sl.bullets.some((b) => b.trim()));
      const merged = hasContent ? [...slides.slice(0, index + 1), ...generated, ...slides.slice(index + 1)] : generated;
      commit({
        ...deck,
        title: deck.title.startsWith('Apresentação sem') ? res.output.title : deck.title,
        slides: merged.slice(0, DECK_MAX_SLIDES),
      });
      setSelected(hasContent ? index + 1 : 0);
      setMessage({ kind: 'ok', text: `${generated.length} slides gerados com IA (${OFFICE_AI_CREDIT_COST} crédito).` });
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const safe = safeName(deck.title);

  const ribbons: Record<string, React.ReactNode> = {
    home: (
      <>
        <RibbonGroup label="Slide">
          <RibbonButton wide icon={<Plus className="h-4 w-4" />} label="Novo slide" onClick={addSlide} />
          <RibbonButton wide icon={<ChevronUp className="h-4 w-4" />} label="Subir" onClick={() => move(-1)} />
          <RibbonButton wide icon={<ChevronDown className="h-4 w-4" />} label="Descer" onClick={() => move(1)} />
          <RibbonButton wide icon={<Trash2 className="h-4 w-4" />} label="Remover" onClick={removeCurrent} />
        </RibbonGroup>
        <RibbonGroup label="Tema">
          <div className="flex items-center gap-1.5 px-0.5">
            {DECK_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-label={`Tema: ${t.label}`}
                aria-pressed={theme.id === t.id}
                title={`Tema ${t.label}`}
                onClick={() => commit(setDeckTheme(deck, t.id as DeckThemeId))}
                className={`flex h-8 w-[72px] items-center justify-center overflow-hidden whitespace-nowrap rounded-md border text-[11px] font-semibold transition ${
                  theme.id === t.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'
                }`}
                style={{ background: t.bg, color: t.fg }}
              >
                <span className="block h-1 w-6 rounded" style={{ background: t.accent }} aria-hidden />
                <span className="ml-1">{t.label}</span>
              </button>
            ))}
          </div>
        </RibbonGroup>
      </>
    ),
    insert: (
      <>
        <RibbonGroup label="Conteúdo">
          <RibbonButton wide icon={<Plus className="h-4 w-4" />} label="Novo slide" onClick={addSlide} />
          <RibbonButton wide icon={<List className="h-4 w-4" />} label="Tópico" onClick={addBullet} />
        </RibbonGroup>
      </>
    ),
    share: (
      <>
        <RibbonGroup label="Exportar">
          <RibbonButton wide icon={<Download className="h-4 w-4" />} label="PDF" onClick={() => download(deckToPdf(deck), `${safe}.pdf`, 'application/pdf')} />
          <RibbonButton wide icon={<span className="text-[10px] font-bold">HTML</span>} label="HTML" onClick={() => download(deckToHtml(deck), `${safe}.html`, 'text/html;charset=utf-8')} />
          <RibbonButton wide icon={<span className="text-[10px] font-bold">TXT</span>} label="Texto" onClick={() => download(deckToText(deck), `${safe}.txt`, 'text/plain;charset=utf-8')} />
          <RibbonButton
            wide
            icon={<span className="text-[10px] font-bold">PPTX</span>}
            label="PowerPoint (.pptx)"
            onClick={() =>
              deckToPptx(deck).then((b) =>
                download(b, `${safe}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
              )
            }
          />
        </RibbonGroup>
      </>
    ),
  };

  const tabs: RibbonTab[] = [
    { id: 'home', label: 'Início' },
    { id: 'insert', label: 'Inserir' },
    { id: 'share', label: 'Compartilhar' },
  ];

  const bulletsText = current.bullets.join('\n');

  return (
    <AppFrame
      title={deck.title}
      titleLabel="Título da apresentação"
      titlePlaceholder="Apresentação sem título"
      onTitle={(title) => commit({ ...deck, title })}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      ribbons={ribbons}
      workspaceClass="bg-[#e9ecef]"
      canvas={
        <div className="flex h-full min-h-[560px] flex-col sm:flex-row">
          {/* Painel de miniaturas, como nas suítes de apresentação. */}
          <ol
            aria-label="Slides"
            className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-300 bg-slate-200/70 p-3 sm:w-52 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r"
          >
            {slides.map((s, i) => {
              const t = themeById(deck.theme);
              const on = s.id === current.id;
              return (
                <li key={s.id} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-current={on}
                    className={`group relative w-40 rounded-md p-1 text-left transition sm:w-full ${
                      on ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-white/70'
                    }`}
                  >
                    <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1 text-[10px] font-semibold text-slate-600">{i + 1}</span>
                    <span
                      className="flex aspect-video w-full flex-col justify-center overflow-hidden rounded-sm px-3 shadow-sm ring-1 ring-black/10"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      <span className="line-clamp-2 text-[11px] font-bold leading-tight">{s.title || 'Sem título'}</span>
                      <span className="mt-1 h-0.5 w-8 rounded" style={{ background: t.accent }} aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="shrink-0 sm:shrink">
              <button
                type="button"
                onClick={addSlide}
                disabled={slides.length >= DECK_MAX_SLIDES}
                className="flex h-full min-h-[64px] w-40 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-400 text-xs font-medium text-slate-600 transition hover:bg-white/70 disabled:opacity-40 sm:w-full"
              >
                <Plus className="h-3.5 w-3.5" /> Novo slide
              </button>
            </li>
          </ol>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-3 p-4 sm:p-8">
            {/* Palco do slide em 16:9. Título e tópicos são editados no próprio slide. */}
            <div
              className="relative aspect-video w-full max-w-[860px] overflow-hidden rounded-sm p-6 shadow-[0_2px_4px_rgba(15,23,42,0.2),0_12px_32px_-8px_rgba(15,23,42,0.35)] sm:p-12"
              style={{ background: theme.bg, color: theme.fg }}
            >
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: theme.accent }} aria-hidden />
              <textarea
                value={current.title}
                onChange={(e) => updateSlide({ title: e.target.value })}
                aria-label="Título do slide"
                placeholder="Título do slide"
                rows={2}
                className="w-full resize-none bg-transparent font-['Unbounded'] text-lg font-bold leading-tight tracking-tight placeholder:opacity-40 focus:outline-none sm:text-3xl"
                style={{ color: theme.fg }}
              />
              <textarea
                value={bulletsText}
                onChange={(e) => updateSlide({ bullets: e.target.value.split('\n').slice(0, SLIDE_MAX_BULLETS) })}
                aria-label="Tópicos do slide"
                placeholder="Um tópico por linha"
                rows={6}
                className="mt-4 w-full resize-none bg-transparent text-sm leading-relaxed placeholder:opacity-40 focus:outline-none sm:mt-6 sm:text-lg"
                style={{ color: theme.fg }}
              />
              <span className="absolute bottom-3 right-5 text-[11px] font-medium opacity-50" aria-hidden>
                {index + 1} / {slides.length}
              </span>
            </div>
          </div>
        </div>
      }
      assistant={
        assistantOpen ? (
          <AiPanel
            placeholder="Ex.: Apresentação de 6 slides sobre o lançamento de uma cafeteria de bairro."
            creditsAvailable={creditsAvailable}
            busy={busy}
            onRun={runAi}
            actionLabel={`Gerar slides com IA · ${OFFICE_AI_CREDIT_COST} crédito`}
          />
        ) : null
      }
      status={
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Slide {index + 1} de {slides.length}
            </span>
            {message && (
              <span role="status" className={message.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'}>
                {message.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Salvo neste navegador
          </div>
        </>
      }
    />
  );
}
