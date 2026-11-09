import { describe, expect, it } from 'vitest';
import {
  NOTEBOOK_AI_COSTS,
  NOTEBOOK_LARGE_CONTEXT_CHARS,
  NOTEBOOK_LIMITS,
  NOTEBOOK_PODCAST_COSTS,
  NOTEBOOK_PRICING,
  gatewayParams,
  notebookAiCost,
  type NotebookAiRequest,
  type PodcastLength,
} from '../../../supabase/functions/_shared/notebookAi';

const src = (chars: number) => [{ id: 'source:a', title: 'Fonte', content: 'x'.repeat(chars) }];
const P = NOTEBOOK_PRICING;

/** Custo em USD no pior caso: material de entrada no máximo e saída no teto de tokens. */
function worstCostUsd(req: NotebookAiRequest, inputChars: number): number {
  const inTok = (inputChars + P.systemChars) / P.charsPerToken;
  const outTok = gatewayParams(req).maxTokens;
  return (inTok * P.worstInputUsdPerMTok + outTok * P.worstOutputUsdPerMTok) / 1_000_000;
}

const margin = (req: NotebookAiRequest, inputChars: number) => {
  const revenue = notebookAiCost(req) * P.creditValueUsdMin;
  return 1 - worstCostUsd(req, inputChars) / revenue;
};

const ACTIONS: NotebookAiRequest[] = [
  { action: 'chat', context: [], messages: [] },
  { action: 'transform', context: [] },
  { action: 'guide', context: [] },
  { action: 'study', context: [], study: 'quiz' },
  ...(['short', 'medium', 'long'] as PodcastLength[]).map(
    (length): NotebookAiRequest => ({ action: 'podcast', context: [], podcast: { speakers: [{ name: 'A' }], length } }),
  ),
];

describe('preço da IA do Vertal Notebook', () => {
  it('preço base por ação e podcast pela duração', () => {
    expect(notebookAiCost({ action: 'chat', context: src(100) })).toBe(NOTEBOOK_AI_COSTS.chat);
    expect(notebookAiCost({ action: 'study', context: src(100) })).toBe(2);
    expect(NOTEBOOK_PODCAST_COSTS).toEqual({ short: 3, medium: 4, long: 5 });
    expect(notebookAiCost({ action: 'podcast', context: src(100) })).toBe(4); // sem duração = médio
  });

  it('contexto grande custa +1, contando o histórico só no chat', () => {
    expect(notebookAiCost({ action: 'guide', context: src(NOTEBOOK_LARGE_CONTEXT_CHARS - 10) })).toBe(1);
    expect(notebookAiCost({ action: 'guide', context: src(NOTEBOOK_LARGE_CONTEXT_CHARS + 10) })).toBe(2);
    const history = [{ role: 'user' as const, content: 'y'.repeat(NOTEBOOK_LARGE_CONTEXT_CHARS) }];
    // Histórico conta até historyMaxChars: 20k de fonte + 24k de histórico passam do limite.
    expect(notebookAiCost({ action: 'chat', context: src(20_000), messages: history })).toBe(2);
    expect(notebookAiCost({ action: 'guide', context: src(20_000), messages: history })).toBe(1);
  });

  it('o adicional não cresce além do que o servidor manda ao modelo', () => {
    expect(notebookAiCost({ action: 'chat', context: src(10 * NOTEBOOK_LIMITS.contextMaxChars) })).toBe(2);
  });

  it(`margem bruta de pelo menos ${P.minMargin * 100}% no pior caso, no pacote mais barato`, () => {
    for (const base of ACTIONS) {
      const history = base.action === 'chat' ? NOTEBOOK_LIMITS.historyMaxChars : 0;
      // Logo abaixo do limite (sem adicional) e no máximo (com adicional).
      const below = NOTEBOOK_LARGE_CONTEXT_CHARS - history;
      for (const ctxChars of [Math.max(below, 0), NOTEBOOK_LIMITS.contextMaxChars]) {
        const req: NotebookAiRequest = {
          ...base,
          context: src(ctxChars - 5),
          messages: history ? [{ role: 'user', content: 'h'.repeat(history) }] : undefined,
        };
        const m = margin(req, Math.min(ctxChars, NOTEBOOK_LIMITS.contextMaxChars) + history);
        expect(m, `${base.action} ${base.podcast?.length ?? ''} com ${ctxChars} caracteres`).toBeGreaterThanOrEqual(P.minMargin);
      }
    }
  });
});
