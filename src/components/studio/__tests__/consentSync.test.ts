import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// O painel e a função voice-clone precisam aceitar exatamente o mesmo consentimento.
// Se um lado mudar sem o outro, este teste falha.
const root = resolve(__dirname, '../../../..');
const panel = readFileSync(resolve(root, 'src/components/studio/VertalStudioPanel.tsx'), 'utf8');
const fn = readFileSync(resolve(root, 'supabase/functions/voice-clone/index.ts'), 'utf8');

function constant(src: string, name: string): string {
  // Junta as strings concatenadas ("a" + "b") de uma constante.
  const start = src.indexOf(`const ${name} =`);
  expect(start, `${name} não encontrado`).toBeGreaterThan(-1);
  const end = src.indexOf(';', start);
  const block = src.slice(start, end);
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? m[2]).join('');
}

describe('consentimento sincronizado entre painel e backend', () => {
  it('a versão do consentimento é a mesma', () => {
    expect(constant(panel, 'CONSENT_VERSION')).toBe(constant(fn, 'CONSENT_VERSION'));
  });

  it('o texto do consentimento é idêntico', () => {
    expect(constant(panel, 'CONSENT_TEXT')).toBe(constant(fn, 'CONSENT_TEXT'));
  });
});
