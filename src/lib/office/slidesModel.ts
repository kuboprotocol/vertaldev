// Modelo de apresentação do Vertal Office: slides com título e tópicos, HTML e PDF.
import { escapeHtml } from './documentModel';

export const DECK_MAX_SLIDES = 40;
export const SLIDE_MAX_BULLETS = 12;

export interface Slide {
  id: string;
  title: string;
  bullets: string[];
}

export interface DeckData {
  title: string;
  slides: Slide[];
  updatedAt: string;
}

let counter = 0;
function slideId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function makeSlide(title = 'Novo slide', bullets: string[] = []): Slide {
  return { id: slideId(), title, bullets };
}

export function createEmptyDeck(title = 'Apresentação sem título'): DeckData {
  return { title, slides: [makeSlide('Título da apresentação')], updatedAt: new Date().toISOString() };
}

/** Normaliza um slide: tira espaços, descarta tópicos vazios e limita a quantidade. */
export function cleanSlide(slide: Slide): Slide {
  return {
    ...slide,
    title: slide.title.trim(),
    bullets: slide.bullets.map((b) => b.trim()).filter(Boolean).slice(0, SLIDE_MAX_BULLETS),
  };
}

/** HTML autocontido: cada slide ocupa uma página, pronta para imprimir ou abrir no navegador. */
export function deckToHtml(deck: DeckData): string {
  const slides = deck.slides
    .map(
      (s) => `<section class="slide"><h2>${escapeHtml(s.title)}</h2>${
        s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''
      }</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(deck.title)}</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a}
.slide{max-width:960px;min-height:540px;margin:24px auto;padding:48px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);box-sizing:border-box}
h2{font-size:40px;margin:0 0 24px}
li{font-size:22px;margin:10px 0}
@media print{body{background:#fff}.slide{margin:0;box-shadow:none;border-radius:0;page-break-after:always;min-height:100vh}}
</style></head><body>
${slides}
</body></html>`;
}

/** Texto puro dos slides, para e-mail e cópia. */
export function deckToText(deck: DeckData): string {
  return deck.slides
    .map((s, i) => [`Slide ${i + 1}: ${s.title}`, ...s.bullets.map((b) => `• ${b}`)].join('\n'))
    .join('\n\n');
}
