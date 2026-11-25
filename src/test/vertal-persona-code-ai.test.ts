import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../../supabase/functions/_shared/vertalCodeAi/core';

const root = path.resolve(__dirname, '../..');

describe('VERTAL Code AI — Atitude Vertal no systemPrompt', () => {
  it('sem a flag é idêntico; com a flag só soma no fim e mantém formato JSON e ações', () => {
    for (const mode of ['build', 'plan'] as const) {
      const before = systemPrompt(mode, 'auto');
      const after = systemPrompt(mode, 'auto', true);
      expect(systemPrompt(mode, 'auto', false)).toBe(before);
      expect(after.startsWith(before)).toBe(true);
      expect(after).toContain('Atitude Vertal');
    }
    expect(systemPrompt('build', 'auto', true)).toContain('"type":"patch_file"');
    expect(systemPrompt('plan', 'auto', true)).toContain('MODO PLANEJAR');
  });

  it('a edge function lê a flag VERTAL_PERSONA_ENABLED', () => {
    const fn = readFileSync(path.join(root, 'supabase/functions/vertal-code-ai/index.ts'), 'utf8');
    expect(fn).toContain('persona: vertalPersonaEnabled(Deno.env.get("VERTAL_PERSONA_ENABLED"))');
  });
});
