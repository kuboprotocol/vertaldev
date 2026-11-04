// Aba de Apresentação do Vertal Office. Editor e exportação são grátis.
import React, { useState } from 'react';
import { Plus, Trash2, Download, ChevronUp, ChevronDown } from 'lucide-react';
import jsPDF from 'jspdf';
import {
  DECK_MAX_SLIDES,
  DeckData,
  SLIDE_MAX_BULLETS,
  Slide,
  createEmptyDeck,
  deckToHtml,
  deckToText,
  makeSlide,
} from '@/lib/office/slidesModel';
import { deckToPptx } from '@/lib/office/officeFiles';

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

export function SlidesTab() {
  const [deck, setDeck] = useState<DeckData>(loadDeck);
  const [selected, setSelected] = useState(0);

  const commit = (next: DeckData) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDeck(stamped);
    saveDeck(stamped);
  };

  const slides = deck.slides;
  const current: Slide = slides[Math.min(selected, slides.length - 1)] ?? slides[0];
  const index = slides.indexOf(current);

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

  const bulletsText = current.bullets.join('\n');
  const safe = safeName(deck.title);

  return (
    <div className="space-y-4">
      <input
        value={deck.title}
        onChange={(e) => commit({ ...deck, title: e.target.value })}
        aria-label="Título da apresentação"
        className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none"
      />

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <ol className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Slides">
          {slides.map((s, i) => (
            <li key={s.id} className="shrink-0 md:shrink">
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-current={s.id === current.id}
                className={`w-40 rounded-lg border p-2 text-left text-xs md:w-full ${
                  s.id === current.id
                    ? 'border-amber-400/60 bg-amber-400/10 text-white'
                    : 'border-white/10 bg-slate-950/40 text-slate-300 hover:bg-white/5'
                }`}
              >
                <span className="block text-[10px] text-slate-500">Slide {i + 1}</span>
                <span className="line-clamp-2 font-medium">{s.title || 'Sem título'}</span>
              </button>
            </li>
          ))}
          <li className="shrink-0 md:shrink">
            <button
              type="button"
              onClick={addSlide}
              disabled={slides.length >= DECK_MAX_SLIDES}
              className="inline-flex w-40 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 p-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40 md:w-full"
            >
              <Plus className="h-3.5 w-3.5" /> Novo slide
            </button>
          </li>
        </ol>

        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-white p-6 text-slate-900 shadow-lg sm:p-10">
            <h3 className="text-xl font-bold sm:text-3xl">{current.title || 'Sem título'}</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm sm:text-lg">
              {current.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>

          <label className="block text-xs text-slate-400">
            Título do slide
            <input
              value={current.title}
              onChange={(e) => updateSlide({ title: e.target.value })}
              className="mt-1 w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Tópicos (um por linha, até {SLIDE_MAX_BULLETS})
            <textarea
              value={bulletsText}
              onChange={(e) => updateSlide({ bullets: e.target.value.split('\n').slice(0, SLIDE_MAX_BULLETS) })}
              rows={4}
              className="mt-1 w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => move(-1)} aria-label="Mover slide para cima" className="rounded-md border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => move(1)} aria-label="Mover slide para baixo" className="rounded-md border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={removeCurrent} aria-label="Remover slide" className="rounded-md border border-white/10 p-1.5 text-slate-500 hover:bg-white/5 hover:text-red-300">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="text-xs text-slate-400">{slides.length} slides · salvo neste navegador</span>
        <div className="flex flex-wrap gap-2">
          <ExportBtn label="PDF" onClick={() => download(deckToPdf(deck), `${safe}.pdf`, 'application/pdf')} />
          <ExportBtn label="HTML" onClick={() => download(deckToHtml(deck), `${safe}.html`, 'text/html;charset=utf-8')} />
          <ExportBtn label="Texto" onClick={() => download(deckToText(deck), `${safe}.txt`, 'text/plain;charset=utf-8')} />
          <ExportBtn label="PowerPoint (.pptx)" onClick={() => deckToPptx(deck).then((b) => download(b, `${safe}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))} />
        </div>
      </div>
    </div>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
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
