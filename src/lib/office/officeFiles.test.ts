import { describe, expect, it } from 'vitest';
import { docFromAi } from './documentModel';
import { createEmptyDeck, makeSlide } from './slidesModel';
import { deckToPptx, docToDocx } from './officeFiles';

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('exportação Word e PowerPoint', () => {
  it('gera um .docx válido (arquivo zip) a partir do documento', async () => {
    const doc = docFromAi('Proposta', [
      { type: 'heading', text: 'Escopo' },
      { type: 'bullet', text: 'Item' },
      { type: 'paragraph', text: 'Texto' },
    ]);
    const blob = await docToDocx(doc);
    expect(blob.size).toBeGreaterThan(0);
    expect(isZip(await blobBytes(blob))).toBe(true);
  });

  it('gera um .pptx válido (arquivo zip) com um slide por item', async () => {
    const deck = createEmptyDeck('Deck');
    deck.slides = [makeSlide('Um', ['a', 'b']), makeSlide('Dois')];
    const bytes = new Uint8Array(await deckToPptx(deck));
    expect(isZip(bytes)).toBe(true);
  });
});
