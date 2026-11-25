import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  VERTAL_PERSONA_MARKER, vertalPersonaBlock, vertalPersonaEnabled, withVertalPersona,
} from '../../supabase/functions/_shared/vertalPersona';
import { AGENT_PROMPT_BUDGET, buildAgentSystemPrompt } from '../../supabase/functions/_shared/chatAgent';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const baseCtx = {
  secretNames: [] as string[],
  today: '2026-11-25',
  localNow: 'quarta-feira, 25/11/2026 16:30',
  timezone: 'America/Sao_Paulo',
  connections: [],
  memoryEnabled: true,
  memories: [],
};

describe('Atitude Vertal — flag', () => {
  it('fica ligada por padrão e só desliga com valor explícito', () => {
    expect(vertalPersonaEnabled(undefined)).toBe(true);
    expect(vertalPersonaEnabled('')).toBe(true);
    expect(vertalPersonaEnabled('on')).toBe(true);
    for (const off of ['off', 'false', '0', 'no', ' OFF ']) expect(vertalPersonaEnabled(off)).toBe(false);
  });

  it('desligada devolve o prompt exatamente igual; ligada só soma no fim e é idempotente', () => {
    const p = 'PROMPT ORIGINAL {"reply":"..."}';
    expect(withVertalPersona(p, 'vibe', false)).toBe(p);
    const on = withVertalPersona(p, 'vibe', true);
    expect(on.startsWith(p)).toBe(true);
    expect(on).toContain(VERTAL_PERSONA_MARKER);
    expect(withVertalPersona(on, 'vibe', true)).toBe(on);
  });

  it('a camada cobre idioma, honestidade, aprovação e marca branca', () => {
    const b = vertalPersonaBlock('vibe');
    expect(b).toMatch(/idioma/);
    expect(b).toMatch(/nunca diga que é humano/);
    expect(b).toMatch(/aprovação/);
    expect(b).toMatch(/só nomes Vertal|nomes Vertal/);
    expect(b).toMatch(/como testar/);
    expect(b).not.toMatch(/DeepSeek|OpenRouter|Qwen|Claude|GPT|Gemini/);
  });
});

describe('Vertal Chat — prompt do agente', () => {
  it('sem a flag o prompt é o mesmo de antes', () => {
    expect(buildAgentSystemPrompt({ ...baseCtx, persona: false })).toBe(buildAgentSystemPrompt(baseCtx));
  });

  it('com a flag mantém todas as seções e ferramentas e cabe no orçamento', () => {
    const before = buildAgentSystemPrompt(baseCtx);
    const after = buildAgentSystemPrompt({ ...baseCtx, persona: true });
    expect(after).toContain(VERTAL_PERSONA_MARKER);
    // Tudo o que existia continua lá (a camada só soma).
    expect(after.replace(`\n\n${vertalPersonaBlock('chat')}`, '')).toBe(before);
    for (const s of ['Responda SOMENTE com um objeto JSON válido', '{"tool":"vibe_code"', '{"tool":"image"', 'Regras:', 'Busca na web:']) {
      expect(after).toContain(s);
    }
    expect(after.indexOf(VERTAL_PERSONA_MARKER)).toBeLessThan(after.indexOf('Responda SOMENTE com um objeto JSON'));
    expect(after.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
  });

  it('nunca derruba ferramentas para caber: prompt grande fica sem a camada', () => {
    const big = { ...baseCtx, github: true, media: true, automatisch: true, huginn: true, summary: 'x'.repeat(24_000) };
    const without = buildAgentSystemPrompt(big);
    const withP = buildAgentSystemPrompt({ ...big, persona: true });
    expect(withP.replace(`\n\n${vertalPersonaBlock('chat')}`, '')).toBe(without);
    expect(withP.length).toBeLessThanOrEqual(Math.max(AGENT_PROMPT_BUDGET, without.length));
  });
});

describe('Vibe Code — protocolo intacto (regressão no código-fonte)', () => {
  const src = read('supabase/functions/vibe-code-agent/index.ts');
  it('o SYSTEM original continua com o protocolo JSON e as regras', () => {
    for (const s of ['"thought"', '{"type":"edit_file"', '{"type":"read_file"', '"requirements"', '"memories"', 'ASK_CHAT_RULE', 'USE_BROWSER_RULE', '"final": true']) {
      expect(src).toContain(s);
    }
  });
  it('a camada é somada ao SYSTEM e as outras partes (auth kit, design, memória, conectores) continuam', () => {
    expect(src).toMatch(/withVertalPersona\(SYSTEM, "vibe", vertalPersonaEnabled\(Deno\.env\.get\("VERTAL_PERSONA_ENABLED"\)\)\)/);
    for (const s of ['formatAuthKitForPrompt(authKit.options)', 'buildDesignPrompt(design.surface', 'formatMemoriesForPrompt(memories)', 'formatConnectorsForPrompt(connected)', 'formatDevContext(body.devContext)']) {
      expect(src).toContain(s);
    }
  });
  it('o Vertal Chat lê a mesma flag', () => {
    const router = read('supabase/functions/creative-router/index.ts');
    expect(router).toContain('persona: vertalPersonaEnabled(Deno.env.get("VERTAL_PERSONA_ENABLED"))');
  });
});
