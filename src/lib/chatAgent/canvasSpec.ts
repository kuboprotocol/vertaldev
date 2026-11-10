// Layout de Canvas desenhado pelo agente: cores e quebra de texto usadas na
// prévia do chat. As cores são as da paleta do tldraw (modo claro), para a
// prévia bater com o que abre no editor.
import type { CanvasColor, CanvasElement, CanvasSpec } from './contract';

export const CANVAS_HEX: Record<CanvasColor, string> = {
  black: '#1d1d1d',
  grey: '#9fa8b2',
  white: '#ffffff',
  red: '#e03131',
  'light-red': '#f87777',
  orange: '#e16919',
  yellow: '#f1ac4b',
  green: '#099268',
  'light-green': '#4cb05e',
  blue: '#4465e9',
  'light-blue': '#4ba1f1',
  violet: '#ae3ec9',
  'light-violet': '#e085f4',
};

/** Tamanho base da fonte "m" do tldraw; o texto do Canvas é esse tamanho vezes `scale`. */
export const CANVAS_BASE_FONT_PX = 24;
export const CANVAS_LINE_HEIGHT = 1.35;

type TextElement = Extract<CanvasElement, { type: 'text' }>;

/** Largura média de um caractere em relação ao tamanho da fonte (sans, com folga para negrito). */
const charWidth = (el: TextElement) => el.size * (el.bold ? 0.58 : 0.54);

/** Quebra o texto em linhas que cabem na largura do elemento. Palavra maior que a linha fica inteira. */
export function wrapCanvasText(el: TextElement): string[] {
  const maxChars = Math.max(1, Math.floor(el.w / charWidth(el)));
  const lines: string[] = [];
  for (const paragraph of el.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChars || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Altura ocupada por um elemento de texto (para a prévia e para checar o enquadramento). */
export function textHeight(el: TextElement): number {
  return Math.round(wrapCanvasText(el).length * el.size * CANVAS_LINE_HEIGHT);
}

/** Texto que resume o layout (título da prévia e leitores de tela). */
export function describeCanvas(spec: CanvasSpec): string {
  const texts = spec.elements.filter((e): e is TextElement => e.type === 'text').map((e) => e.text);
  return `${spec.name}: ${spec.width}×${spec.height}px, ${spec.elements.length} elementos${texts.length ? `. Textos: ${texts.join(' · ')}` : ''}`;
}
