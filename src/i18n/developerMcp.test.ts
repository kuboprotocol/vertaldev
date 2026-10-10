import { describe, it, expect } from 'vitest';
import { resolveLocale, getTexts, SUPPORTED_LOCALES } from './developerMcp';

describe('resolveLocale', () => {
  it('prefers the saved choice', () => {
    expect(resolveLocale('es', ['pt-BR'])).toBe('es');
  });

  it('falls back to the browser language, matching the base language', () => {
    expect(resolveLocale(null, ['pt-PT'])).toBe('pt-BR');
    expect(resolveLocale(null, ['es-MX', 'en'])).toBe('es');
  });

  it('uses English for unsupported languages', () => {
    expect(resolveLocale(null, ['fr-FR'])).toBe('en');
    expect(resolveLocale(null, [])).toBe('en');
  });

  it('ignores an invalid saved value', () => {
    expect(resolveLocale('xx-YY', ['pt-BR'])).toBe('pt-BR');
  });
});

describe('translations', () => {
  it('every language has every text, with no empty strings', () => {
    const keys = Object.keys(getTexts('pt-BR')).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const texts = getTexts(locale);
      expect(Object.keys(texts).sort()).toEqual(keys);
      for (const value of Object.values(texts)) {
        if (typeof value === 'string') expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
