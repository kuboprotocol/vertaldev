# Third-party notices

Este arquivo lista código de terceiros incorporado (ou adaptado) neste repositório e as respectivas licenças.

## PR-Agent

- Projeto: PR-Agent — https://github.com/The-PR-Agent/pr-agent
- Versão de referência: commit `e49163c25383184f87c90bd99d983eb2c9a3349f` (novembro de 2026)
- Licença: MIT
- O que foi adaptado (reescrito em TypeScript, sem copiar o código Python):
  - Prompts de `pr_agent/settings/pr_reviewer_prompts.toml`, `code_suggestions/pr_code_suggestions_prompts.toml`,
    `code_suggestions/pr_code_suggestions_reflect_prompts.toml`, `pr_description_prompts.toml` e
    `pr_questions_prompts.toml` → `supabase/functions/_shared/vibeReviewPrompts.ts`
  - Estrutura de findings, autorreflexão com nota 0–10, formato de código numerado (`__new hunk__`) e
    reindentação da substituição (`pr_agent/algo/findings.py`, `code_replacement.py`, `git_patch_processing.py`)
    → `supabase/functions/_shared/vibeReviewEngine.ts`
  - Comandos `/review`, `/improve`, `/describe`, `/ask` (`pr_agent/agent/command_registry.py`)
    → `supabase/functions/vibe-code-agent/review.ts` e `src/lib/vibeReview/slashCommands.ts`

```
MIT License

Copyright (c) 2026 The PR Agent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
