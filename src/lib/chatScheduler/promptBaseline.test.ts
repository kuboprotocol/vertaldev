// Regressão: com o Agendador desligado (padrão), o prompt do Vertal Chat é byte a byte o mesmo de antes.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt, type AgentPromptContext } from '@/lib/chatAgent/contract';

const CASES: Record<string, AgentPromptContext> = {
  minimal: { secretNames: [] },
  full: {
    secretNames: ['OPENAI_KEY', 'NOTION_TOKEN'], today: '2026-11-25', localNow: 'quarta-feira, 25 de novembro de 2026 04:00', timezone: 'America/Sao_Paulo',
    memoryEnabled: true, memories: '- gosta de café', summary: 'conversa anterior', github: true, media: true, automatisch: true, huginn: true,
    fluxosApps: [{ key: 'todoist', name: 'Todoist' }], authKit: true, email: 'gmail', navigator: true,
  },
  form: { secretNames: ['X'], browserForm: true, memoryEnabled: false },
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// Hashes medidos no main (1d3b87c, antes do Agendador).
const BASELINE: Record<string, string> = {
  minimal: '36d25d5e549a40d23ea7acba3c9ae4a357191e903c292babdb664f87f9605c9a',
  full: '07e75db86ad8b0b41f0acca54a0c2a7d01c4f1a2983487ad53a884344ecd2cf7',
  form: '7084763200993d58ad78d13a1e6e63196de57c494463cc9868320b539eaaeef2',
};

describe('Agendador desligado: prompt idêntico ao de antes', () => {
  for (const [name, ctx] of Object.entries(CASES)) {
    it(name, () => {
      expect(sha(buildAgentSystemPrompt(ctx))).toBe(BASELINE[name]);
      expect(sha(buildAgentSystemPrompt({ ...ctx, scheduler: false }))).toBe(BASELINE[name]);
      expect(buildAgentSystemPrompt(ctx)).not.toContain('"agendador"');
    });
  }
});
