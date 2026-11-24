// @vitest-environment node
//
// Regressão: o VERTAL Code AI é 100% ADITIVO. Estes testes provam que o motor existente
// (Vibe Code, sistema de jogos, sistema de código e sistema de design) continua igual.
//
// A prova por arquivo usa o git (scripts/vertal-code-ai/engine-guard.mjs): compara este branch
// com o ponto em que ele saiu do main, então PRs de outras frentes no motor NÃO quebram este teste.
// Sem histórico do git (checkout raso no CI), esse teste específico é pulado e quem prova é o
// workflow .github/workflows/vertal-code-ai-guard.yml (fetch-depth 0).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, rankModels } from '../../supabase/functions/_shared/modelRouter';
import { checkVibeOrigin, parseAgentTurn, VIBE_ORIGINS } from '../../supabase/functions/_shared/vibeAgentCore';
import { validateBlueprint } from '@/components/builder/blueprintQuality';
import { buildBlueprintPrompt } from '@/components/builder/gameBlueprint';
import { checkEngine } from '../../scripts/vertal-code-ai/engine-guard.mjs';

const ROOT = join(__dirname, '..', '..');

function hasGitBase(): boolean {
  try {
    execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('VERTAL Code AI não altera o motor existente', () => {
  it.runIf(hasGitBase())('nenhum arquivo do Vibe Code, jogos, código ou design mudou; nos compartilhados só ENTRAM linhas do VERTAL Code AI', () => {
    const { violations } = checkEngine('origin/main') as { violations: string[] };
    expect(violations).toEqual([]);
  });

  it('a rota nova só existe com o interruptor ligado', () => {
    const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
    const routeLines = app.split('\n').filter((l) => l.includes('VERTAL_CODE_AI_ROUTE') && l.includes('<Route'));
    expect(routeLines).toHaveLength(1);
    expect(routeLines[0].trim().startsWith('{isVertalCodeAiEnabled() && <Route')).toBe(true);
  });

  it('a edge function nova não grava na saúde de modelos do Vibe Code nem usa o roteador dele', () => {
    const fn = readFileSync(join(ROOT, 'supabase/functions/vertal-code-ai/index.ts'), 'utf8');
    const core = readFileSync(join(ROOT, 'supabase/functions/_shared/vertalCodeAi/core.ts'), 'utf8');
    const router = readFileSync(join(ROOT, 'supabase/functions/_shared/vertalCodeAi/router.ts'), 'utf8');
    expect(fn).not.toMatch(/from\(\s*["']ai_gateway_runs["']\s*\)/);
    expect(fn).not.toMatch(/vibe_conversations|vibe_messages|vibe_checkpoints/);
    for (const src of [fn, core, router]) {
      // Não importa o roteador/gateway/prompts do Vibe Code (só utilitários puros de leitura).
      expect(src).not.toMatch(/from\s+["'][^"']*(modelRouter|aiGateway|\/llm|deepseekRouter|vibePlanPrompts|vibePlandexEngine|designIntelligence)(\.ts)?["']/);
    }
    expect(fn).toMatch(/isVcaEnabled\(env\(\)\)\) return json\(404/);
  });
});

describe('comportamento do Vibe Code continua igual', () => {
  it('catálogo e ordem do roteador de modelos do Vibe Code inalterados', () => {
    expect(MODEL_CATALOG.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'groq-llama-3.3-70b',
    ]);
    const keys = new Set(['DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY']);
    const pick = (kind: 'code' | 'plan', tier: 'flash' | 'pro', policy: 'economy' | 'balanced' | 'quality') =>
      rankModels({ kind, tier, policy, availableKeys: keys, needJson: true }).map((r) => r.profile.id);
    expect(pick('code', 'flash', 'balanced')).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'deepseek-reasoner', 'deepseek-chat']);
    expect(pick('plan', 'pro', 'quality')).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'deepseek-reasoner']);
    expect(pick('code', 'flash', 'economy')).toEqual(['claude-haiku-5-5', 'deepseek-chat', 'deepseek-reasoner', 'claude-sonnet-5-5']);
  });

  it('origens aceitas pelo vibe-code-agent continuam só vibe_code e vertal_chat', () => {
    expect([...VIBE_ORIGINS]).toEqual(['vibe_code', 'vertal_chat']);
    expect(checkVibeOrigin({}).ok).toBe(true);
    expect(checkVibeOrigin({ origin: 'vertal_code_ai' }).ok).toBe(false);
  });

  it('leitura das voltas do agente do Vibe Code inalterada', () => {
    const t = parseAgentTurn('{"summary":"ok","actions":[{"type":"read_file","path":"src/a.ts"},{"type":"edit_file","path":"src/b.ts","content":"x"}]}');
    expect(t.actions.map((a) => a.type)).toEqual(['read_file', 'edit_file']);
    expect(t.final).toBe(false);
  });

  it('sistema de jogos: blueprint e checagem de qualidade respondem como antes', () => {
    expect(buildBlueprintPrompt({ title: '  ', game_type: 'platformer', engine: 'phaser' })).toBeNull();
    expect(buildBlueprintPrompt({ title: 'Mario', description: 'pulos', game_type: 'platformer', engine: 'phaser' })).toBe(
      'Título: Mario\nDescrição: pulos\nTipo: platformer\nEngine: phaser',
    );
    expect(validateBlueprint(null)).toEqual({ ok: false, issues: [{ severity: 'error', path: 'blueprint', message: 'o blueprint não é um objeto' }] });
  });
});
