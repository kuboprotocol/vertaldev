import { describe, expect, it } from 'vitest';
import { DECK_MAX_SLIDES, cleanSlide, createEmptyDeck, deckToHtml, deckToText, makeSlide } from './slidesModel';

describe('apresentação', () => {
  it('começa com um slide editável', () => {
    expect(createEmptyDeck().slides).toHaveLength(1);
  });

  it('limpa tópicos vazios e espaços', () => {
    const s = cleanSlide({ id: 'x', title: '  Oi  ', bullets: ['  um ', '   ', 'dois'] });
    expect(s.title).toBe('Oi');
    expect(s.bullets).toEqual(['um', 'dois']);
  });

  it('escapa HTML dos slides', () => {
    const deck = createEmptyDeck('T');
    deck.slides = [makeSlide('<img src=x onerror=1>', ['<b>x</b>'])];
    const html = deckToHtml(deck);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('gera uma seção por slide e texto puro numerado', () => {
    const deck = createEmptyDeck('T');
    deck.slides = [makeSlide('A', ['1']), makeSlide('B')];
    expect(deckToHtml(deck).match(/<section class="slide">/g)).toHaveLength(2);
    expect(deckToText(deck)).toBe('Slide 1: A\n• 1\n\nSlide 2: B');
    expect(DECK_MAX_SLIDES).toBeGreaterThan(0);
  });
});
