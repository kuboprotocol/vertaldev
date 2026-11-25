// Guarda do VERTAL Code AI: prova que ESTE branch não altera o motor existente
// (Vibe Code, sistemas de jogos, código e design). Compara com o ponto em que o branch
// saiu da base (git merge-base), então mudanças de OUTROS PRs no main não interferem.
//
//   node scripts/vertal-code-ai/engine-guard.mjs                 # base = origin/main
//   node scripts/vertal-code-ai/engine-guard.mjs --base origin/x
//
// Regras: nenhum arquivo protegido pode mudar, exceto os de FLAGGED, e nesses só podem
// ENTRAR linhas do VERTAL Code AI (nenhuma linha existente removida ou alterada).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Pastas e arquivos protegidos (motor do Vibe Code + sistemas de jogos, código e design). */
export const PROTECTED = [
  // Motor do Vibe Code (agente, roteamento de modelos, plano, revisão, memória)
  'supabase/functions/vibe-code-agent',
  'supabase/functions/vibe-agents',
  'supabase/functions/generate-code',
  'supabase/functions/creative-router',
  'supabase/functions/agent-chat',
  'supabase/functions/_shared/vibeAgentCore.ts',
  'supabase/functions/_shared/vibeAgentsConfig.ts',
  'supabase/functions/_shared/vibePayGate.ts',
  'supabase/functions/_shared/vibePlanPrompts.ts',
  'supabase/functions/_shared/vibePlandexEngine.ts',
  'supabase/functions/_shared/vibeRecord.ts',
  'supabase/functions/_shared/vibeReviewEngine.ts',
  'supabase/functions/_shared/vibeReviewPrompts.ts',
  'supabase/functions/_shared/vibeTaskGraph.ts',
  'supabase/functions/_shared/modelRouter.ts',
  'supabase/functions/_shared/llm.ts',
  'supabase/functions/_shared/aiGateway.ts',
  'supabase/functions/_shared/aiGatewayStore.ts',
  'supabase/functions/_shared/chatOrchestrator.ts',
  'supabase/functions/_shared/chatAgent.ts',
  'supabase/functions/_shared/chatBrain.ts',
  'supabase/functions/_shared/chatDelegate.ts',
  'supabase/functions/_shared/chatPlan.ts',
  'supabase/functions/_shared/deepseekRouter.ts',
  'supabase/functions/_shared/complexity.ts',
  'supabase/functions/_shared/primeMemory.ts',
  'src/lib/vibePlan',
  'src/lib/vibeReview',
  'src/lib/chatAgent',
  'src/lib/vibeCodeAgentTypes.ts',
  'src/lib/vibeCodeFiles.ts',
  'src/lib/builderTurn.ts',
  'src/components/vibe-code',
  // Sistema de jogos
  'supabase/functions/create-game',
  'supabase/functions/update-game',
  'supabase/functions/game-ai-architect',
  'supabase/functions/game-npc-ai',
  'src/game',
  'src/components/builder',
  '.agents/skills',
  // Sistema de design
  'supabase/functions/creative-design',
  'supabase/functions/_shared/designIntelligence.ts',
  'src/components/ui',
  'src/index.css',
  'tailwind.config.ts',
  'src/config/brand.ts',
];

/** Arquivos compartilhados que o VERTAL Code AI pode tocar: só linhas novas, atrás do interruptor. */
export const FLAGGED = ['src/App.tsx', 'src/components/vertal-chat/VertalChat.tsx', 'src/components/vibe-code/VibeTopBar.tsx', 'src/pages/BuilderPage.tsx'];

/** Toda linha adicionada nos FLAGGED precisa ser do VERTAL Code AI. */
// Vertal Prospector (módulo do VERTAL Code AI) também pode entrar nos FLAGGED, só atrás do próprio interruptor.
// Vertal Growth Team (equipe de crescimento do VERTAL Code AI) idem, atrás do próprio interruptor.
export const VCA_LINE = /VertalCodeAi|VertalCodeAI|VERTAL_CODE_AI|VERTAL Code AI|VertalProspector|vertalProspector|VERTAL_PROSPECTOR|VertalGrowth|vertalGrowth|VERTAL_GROWTH/;

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export const isProtected = (f) => PROTECTED.some((p) => f === p || f.startsWith(`${p}/`));

/** Lista violações (vazia = motor intacto). Lança se o git não achar a base. */
export function checkEngine(base = 'origin/main') {
  const mergeBase = git(['merge-base', 'HEAD', base]).trim();
  // Inclui o que ainda não foi commitado (diff da base até a árvore de trabalho).
  const changed = git(['diff', '--name-only', mergeBase]).split('\n').filter(Boolean);
  const violations = [];
  for (const f of changed) {
    const flagged = FLAGGED.includes(f);
    if (!flagged && !isProtected(f)) continue;
    if (!flagged) {
      violations.push(`arquivo do motor alterado: ${f}`);
      continue;
    }
    const diff = git(['diff', '-U0', mergeBase, '--', f]).split('\n');
    for (const l of diff) {
      if (l.startsWith('+++') || l.startsWith('---')) continue;
      if (l.startsWith('-')) violations.push(`${f}: linha existente removida/alterada: ${l.slice(1).trim().slice(0, 120)}`);
      else if (l.startsWith('+') && l.slice(1).trim() && !VCA_LINE.test(l)) violations.push(`${f}: linha nova fora do VERTAL Code AI: ${l.slice(1).trim().slice(0, 120)}`);
    }
  }
  return { mergeBase, changed, violations };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--base');
  const base = i > -1 ? process.argv[i + 1] : 'origin/main';
  const { mergeBase, changed, violations } = checkEngine(base);
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exit(1);
  }
  console.log(`motor intacto: ${changed.length} arquivo(s) mudados desde ${mergeBase.slice(0, 8)}, nenhum do motor (exceto linhas do VERTAL Code AI atrás do interruptor)`);
}
