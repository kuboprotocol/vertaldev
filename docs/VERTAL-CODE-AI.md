# VERTAL Code AI — v1 (100% nuvem)

Agente de programação da Vertal que roda **na nuvem**, dentro do Vertal Code (Vibe Code) e do Vertal Chat,
usável pelo navegador do celular. Prioriza modelos **grátis**; servidor próprio e modelos pagos são opcionais.

> Status: **v1 em PR rascunho**. Desligado por padrão. Nada foi publicado, nenhum servidor foi criado.
> Escopo mudou em 24/11/2026: app desktop / CLI / Ollama no PC **adiados** (PC do Laércio quebrado). Tudo aqui é nuvem.

---

## 1. Regra de ouro: só ADITIVO

O motor atual do Vertal Code continua **exatamente igual** (vibe-code-agent, roteador de modelos, sistema de jogos,
sistema de código, sistema de design, prompts, templates, padrões). O VERTAL Code AI é um modo **novo, ao lado**:

| O que | Como fica |
|---|---|
| `vibe-code-agent`, `modelRouter.ts`, `llm.ts`, `aiGateway.ts`, prompts do Vibe/plan/review, `src/game/**`, `src/components/builder/**`, `src/components/ui/**`, `designIntelligence.ts`, skills `.agents/skills/**` | **Intocados** (guarda por git: `scripts/vertal-code-ai/engine-guard.mjs`) |
| `src/App.tsx` | +4 linhas: import, `lazy()` da página e a rota `/vertal-code-ai` **só se** `VITE_VERTAL_CODE_AI=true` |
| `src/components/vertal-chat/VertalChat.tsx` | +3 linhas: botão "Code AI" no cabeçalho, que **não renderiza nada** com o interruptor desligado |
| `src/components/vibe-code/VibeTopBar.tsx` | +3 linhas: o mesmo botão, mesmo interruptor |
| Banco de dados | **Sem migração.** Lê `vibe_project_files`; o "Aplicar" grava **versões novas** nessa mesma tabela, do mesmo jeito que o cofre do Vibe Code. Não escreve em `ai_gateway_runs` (para não mexer na saúde/roteamento do Vibe Code), nem em `vibe_conversations/messages/checkpoints`. |
| Créditos | v1 não cobra (modelos grátis). Não toca no ledger. |

Com os dois interruptores desligados (padrão), o app e as edge functions existentes se comportam de forma idêntica.
Os testes `src/test/vertal-code-ai-regression.test.ts` provam isso (ver seção 9).

## 2. Como ligar

Servidor (segredos da edge function `vertal-code-ai`, via `supabase secrets set`, nunca no código):

| Variável | Obrigatória | Para quê |
|---|---|---|
| `VERTAL_CODE_AI_ENABLED=true` | sim | Liga a função (sem ela responde 404 `vertal_code_ai_disabled`) |
| `OPENROUTER_API_KEY` | sim (já existe no projeto) | Modelos grátis `:free` |
| `GEMINI_API_KEY` | opcional | Cota grátis extra do Google AI Studio |
| `GROQ_API_KEY` | opcional (já existe) | Modelo "Relâmpago" para pedidos pequenos |
| `VERTAL_OLLAMA_URL`, `VERTAL_OLLAMA_TOKEN`, `VERTAL_OLLAMA_MODEL` | opcional | Servidor próprio (seção 6) |
| `VERTAL_CODE_AI_ALLOW_PAID=true` | opcional, **padrão desligado** | Libera o modelo barato pago como último recurso |
| `VERTAL_CODE_AI_PREFER_SELF_HOSTED=true` | opcional | Servidor próprio na frente dos grátis |
| `VERTAL_CODE_AI_FREE_MODELS=a:free,b:free` | opcional | Troca a lista grátis do OpenRouter sem deploy |
| `VERTAL_CODE_AI_DEADLINE_MS` | opcional (padrão 140000) | Prazo total por pedido. Plano grátis do Supabase: 150 s de relógio; planos pagos: 400 s |
| `VERTAL_CODE_AI_TS_CHECK=false` | opcional | Desliga a checagem de sintaxe com o compilador TypeScript |

Front-end (variável de build do Vite / Cloudflare): `VITE_VERTAL_CODE_AI=true` mostra a rota e os botões.

Deploy (quando o Laércio aprovar): `supabase functions deploy vertal-code-ai` + build do front com a flag.

## 3. Arquitetura

```
Celular / navegador
  ├─ Vertal Chat  ── botão "Code AI" ──┐   (ponte: /vertal-code-ai?from=chat&prompt=…)
  ├─ Vibe Code    ── botão "Code AI" ──┤
  └─ /vertal-code-ai  (VertalCodeAIPage: Planejar/Construir, esforço, anexos, diffs, Aplicar)
          │  POST + SSE (JWT do Supabase)
          ▼
supabase/functions/vertal-code-ai/index.ts          ← edge function NOVA
  ├─ actions: models | run | apply
  ├─ lê o projeto em vibe_project_files (última versão de cada arquivo)
  ├─ _shared/vertalCodeAi/router.ts   cadeia "grátis primeiro" + troca automática em 429/402/5xx/timeout
  ├─ _shared/vertalCodeAi/core.ts     loop do agente (puro, testado no Vitest)
  │     índice do repositório → plano → edições multi-arquivo → verificação → auto-correção → diffs
  └─ checagem de sintaxe real: npm:typescript (transpileModule) carregado sob demanda
          │ OpenAI-compatível
          ▼
  modelos grátis (OpenRouter :free, Gemini free tier, Groq free) → servidor próprio Ollama → pago (se liberado)
```

Arquivos novos:

- `supabase/functions/_shared/vertalCodeAi/router.ts` — catálogo, cadeia, corpo das chamadas, nomes Vertal.
- `supabase/functions/_shared/vertalCodeAi/core.ts` — parse das respostas, índice do repo, edições (arquivo inteiro e busca/troca), diff unificado, verificação, loop.
- `supabase/functions/vertal-code-ai/index.ts` — edge function (Deno).
- `src/lib/vertalCodeAi/{client,session}.ts` — interruptor, ponte do chat, SSE, estado da tela.
- `src/pages/VertalCodeAIPage.tsx` — tela mobile-first.
- `src/components/vertal-code-ai/VertalCodeAiEntryButton.tsx` — botão de entrada (nulo com flag desligada).
- `infra/vertal-ollama/*` — kit do servidor próprio.
- `scripts/vertal-code-ai/engine-guard.mjs` + `.github/workflows/vertal-code-ai-guard.yml` — guarda de não-regressão
  (o workflow só roda em PRs que tocam o VERTAL Code AI).

Reaproveita (só leitura, sem alterar): `repairAgentJson` (chatOrchestrator), `isSafePath`, `lintGeneratedFile`,
`looksLikeSecret` (vibeAgentCore) — as mesmas barreiras de segurança do Vibe Code.

## 4. Como o agente trabalha

1. **Indexa o projeto**: caminhos + símbolos exportados + imports de cada arquivo; escolhe os ~6 arquivos mais
   relevantes para o pedido e os vizinhos de import (contexto do repositório inteiro sem mandar tudo ao modelo).
2. **Planejar** (opcional): devolve objetivo, passos com arquivos, riscos e perguntas. Nada é editado.
   Botão "Construir este plano" passa o plano aprovado para o modo Construir.
3. **Construir**: o modelo pode ler mais arquivos e propõe `write_file` (arquivo inteiro), `patch_file`
   (busca/troca exata — economiza tokens em arquivos grandes) ou `delete_file`. Caminhos perigosos (`.env`, `.git`,
   `node_modules`, `.github/workflows`, absolutos, `..`) são bloqueados.
4. **Verificar** ("testes" da v1): sintaxe real com o compilador TypeScript, JSON válido, delimitadores, placeholders
   tipo "// ... resto do código", segredos no código, marcadores de conflito, e **imports relativos/`@/` que apontam
   para arquivo inexistente**. Só conta problema **novo** (um TODO que já existia não trava).
5. **Auto-corrigir**: os problemas voltam ao modelo, até 2 rodadas.
6. **Revisar**: a tela mostra um diff por arquivo (+/−), com caixa de seleção. **Nada é gravado sem o dev tocar em
   "Aplicar selecionados"**. O Aplicar recusa arquivo que mudou enquanto o dev revisava (hash do "antes").
7. Se os modelos param no meio (cota/prazo), entrega o que já estava pronto, marcado como não verificado.

## 5. Roteamento "grátis primeiro"

Ordem: **grátis na nuvem → servidor próprio → pago (só se liberado)**. Em 429/402/408/5xx/timeout/modelo sumido,
passa para o próximo automaticamente e a tela mostra "troca automática". O usuário só vê nomes Vertal.

Modelos padrão (verificados em 24/11/2026 no catálogo ao vivo `openrouter.ai/api/v1/models` e na página de preços
do Gemini). A edge function ainda confere o catálogo ao vivo (cache de 1 h) e descarta os que sumirem.

| Nome na tela | Modelo | Por quê | Esforço |
|---|---|---|---|
| Vertal Livre · Código | `particle-ai/particle-1:free` | Modelo de código para agentes (pós-treino do DeepSeek V4.1 Flash), aceita JSON e imagem | auto, rápido, profundo |
| Vertal Livre · Raciocínio | `nvidia/nemotron-3-ultra-550b-a55b:free` | O maior grátis (550B MoE), raciocínio forte para planos e bugs difíceis | profundo, máximo |
| Vertal Livre · Agente | `gemini-4-hydrogen` (Gemini API, free tier) | Feito para "coding e agentic workflows", 1M de contexto | auto, profundo, máximo |
| Vertal Livre · Rápido | `gemini-3.8-flash` (free tier) | Rápido para pedidos simples | rápido |
| Vertal Livre · Multimodal | `google/gemma-4-31b-it:free` | Bom generalista, lê imagens | auto |
| Vertal Livre · Visão | `nvidia/nemotron-3.5-super-vl:free` | Prints de tela / mockups | quando há imagem |
| Vertal Livre · Relâmpago | Groq `openai/gpt-oss-120b` (free) | Muito rápido, mas só 8K tokens/min no grátis → só pedido pequeno | rápido |
| Vertal Livre · Reserva | `openrouter/free` | Roteador oficial que escolhe qualquer modelo grátis disponível | sempre por último |
| Vertal Própria | `vertal-coder` (Qwen2.5-Coder 7B no seu servidor) | Sem cota, mas lento em CPU | fallback |
| Vertal Turbo (pago) | `deepseek/deepseek-v4.1-flash` (US$0,05 entrada / US$0,20 saída por 1M tokens) | Barato e bom em código | só com `ALLOW_PAID` |

### 5.1 Opções Vertal (famílias de modelos) — desde 24/11/2026

O usuário escolhe uma **opção Vertal** no seletor "Modelo Vertal" (campo `option` no `run`). "Vertal Auto" é a cadeia
de sempre, sem mudança. Em **todas** as opções a LLM própria (`VERTAL_OLLAMA_URL`, e `_2` se houver) continua
primeiro para pedidos pequenos; depois vêm os grátis da opção, depois os pagos da opção (só com
`VERTAL_CODE_AI_ALLOW_PAID=true`), depois o provedor extra (se configurado) e, por último, a reserva `openrouter/free`.
`modelId` (id Vertal) fixa um modelo da opção — útil para testar uma família.

| Opção | Cadeia (ids internos → modelo) |
|---|---|
| Vertal Code | própria → `vca-code-free` particle-1:free → `vca-multi-free` gemma-4-31b:free → `vca-reason-free` nemotron-3-ultra:free → `vca-code-agile` qwen3-coder-30b-a3b ($0,07/$0,28) → `vca-code-pro` kimi-k2.7-code ($0,60/$3,00) → `vca-turbo-direct` deepseek-chat (API DeepSeek) → `vca-turbo-paid` deepseek-v4.1-flash → `vca-code-classic` qwen-2.5-coder-32b ($0,66/$1,00) → reserva |
| Vertal Livre (só grátis) | própria → gemma-4-31b:free → `vca-light-free` gemma-4-26b-a4b:free → nemotron-3-ultra:free → nemotron-3.5-super-vl:free → `vca-omni-free` nemotron-3-nano-omni:free → `vca-swift-free` nemotron-3.5-lightning:free → particle-1:free → (Gemini/Groq se houver chave) → reserva |
| Vertal Turbo | própria → deepseek-chat direto → `vca-turbo-v4` deepseek-v4-flash ($0,09/$0,18) → deepseek-v4.1-flash → `vca-open` llama-4-maverick ($0,35/$1,00) → `vca-open-lite` llama-4-scout ($0,10/$0,30) → reserva |
| Vertal Pro | própria → `vca-pro` kimi-k2.6 ($0,65/$3,41) → kimi-k2.7-code → deepseek-chat → deepseek-v4.1-flash → reserva |
| Vertal Imagem | `vca-image-own` própria em GPU (FLUX.1-schnell, se `VERTAL_OWN_IMAGE_URL`) → `vca-image` google/gemini-3.1-flash-lite-image (≈US$0,04/imagem) — ação `image` |
| Vertal Vídeo | `vca-video-own` próprio em GPU (Wan2.1 T2V 1.3B, 4 s 480p, se `VERTAL_OWN_VIDEO_URL`) → `vca-video` google/veo-3.1-lite 4 s 720p sem áudio (≈US$0,12) → `vca-video-alt` google/gemini-omni-1.2-flash 4 s 360p (≈US$0,09; instável em 24–25/11/2026) — ações `video`/`video_status`/`video_content` |

Preços em US$ por 1M tokens (entrada/saída), tabela do OpenRouter de 24/11/2026. Não existe Llama grátis no
OpenRouter hoje, por isso Llama ficou no Turbo (pago). Cada modelo novo tem teto de saída por pedido
(`maxOutputTokens`, 4–8K).

**Preço de varejo** (só estimativa nos logs e na resposta de imagem/vídeo; a cobrança continua desligada):
`créditos = (custo + US$0,05) × 1,5 ÷ US$0,03`.

**Imagem e vídeo** ficam desligados por padrão: exigem `VERTAL_CODE_AI_MEDIA_ENABLED=true` + `ALLOW_PAID` +
`OPENROUTER_API_KEY`, e continuam atrás da lista de liberação. O vídeo é assíncrono: `video` devolve um `job`
assinado (HMAC com o usuário), `video_status` consulta e devolve o link assinado do provedor; quando não há link,
`video_content` repassa os bytes.

**GPU própria serverless (Modal, desde 26/11/2026)** — kit em `infra/vertal-gpu-modal/`, scale-to-zero (desliga
após 120 s sem uso), no máximo 1 contêiner por endpoint, cada um protegido por Bearer próprio:

- **LLM**: Qwen2.5-Coder-14B-Instruct-AWQ (Apache-2.0) no vLLM, GPU A10G, nome `vertal-coder-gpu`, contexto 16K.
  Entra no **2º endpoint próprio** (`VERTAL_OLLAMA_URL_2` / `_TOKEN_2` / `_MODEL_2`, mais `_MAX_INPUT_TOKENS_2`,
  `_FIRST_TOKEN_MS_2`, `_TOTAL_MS_2`, `_MAX_OUTPUT_TOKENS_2`, `_CONTEXT_2`). O roteador já fala OpenAI-compatível
  (`/v1/chat/completions` com streaming), então não precisou de adaptador. Ordem: VM → GPU para pedidos pequenos;
  acima de `VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS` (padrão 3 000) a GPU vem primeiro (a VM nem cabe). Medido em
  26/11/2026: ~48 tok/s gerando (VM: ~18 tok/s com o 1.5B), 1º token 0,3 s quente / ~52 s a frio.
- **Imagem**: FLUX.1-schnell (Apache-2.0; cópia sem bloqueio `unsloth/FLUX.1-schnell`), GPU L40S, 1024 px, 4 passos.
  `VERTAL_OWN_IMAGE_URL` / `_TOKEN` (`_TIMEOUT_MS`, padrão 70 s; `_COST` US$/imagem, padrão 0,003). Só texto → imagem:
  com imagem de referência vai direto para a de sempre. ~2,5 s quente, ~34 s a frio.
- **Vídeo**: Wan2.1-T2V-1.3B (Apache-2.0), GPU L40S, 4 s 832×480 16 fps, H.264. `VERTAL_OWN_VIDEO_URL` / `_TOKEN`
  (`_COST` US$/segundo, padrão 0,02). Assíncrono: o `job` assinado ganha o prefixo `vcaown_`; `video_status` consulta o
  endpoint próprio e `video_content` repassa o mp4. ~1 min 50 s gerando, ~2 min 40 s a frio.
- Falhou (erro, tempo, contêiner frio demais)? A cadeia segue para os modelos de sempre. Tirar o segredo desliga.
- **Pedido grande → GPU primeiro em todas as opções de texto** (Auto, Code, Livre, Turbo, Pro; decisão do Laércio em
  26/11/2026). "Grande" = acima do limite de entrada da VM (`VERTAL_OLLAMA_MAX_INPUT_TOKENS`, 3 000; ou
  `VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS`, se definido). Pequeno: VM → GPU → cadeia da opção. A decisão final é por chamada,
  com o pedido real (sistema + mapa do projeto + arquivos): se passar do limite da VM, ela é pulada sem chamada. Na
  "Vertal Livre" a GPU conta como própria (crédito Modal), então entra; pagos continuam fora. `modelId` continua vencendo.
- **Frio**: o prazo do 1º token da GPU (`_FIRST_TOKEN_MS_2`, 60 s) conta desde o ENVIO (`firstTokenFromStart`, padrão
  ligado só no 2º endpoint; `VERTAL_OLLAMA_FIRST_TOKEN_FROM_START_2=false` volta ao antigo). Antes contava só depois dos
  cabeçalhos, e um contêiner subindo a frio podia segurar o pedido até o prazo total (90 s). A VM segue como antes.
- **Contexto**: a saída pedida à própria é limitada a `contexto − entrada × 1,35 − 256` (`selfHostedOutputTokens`;
  a estimativa de 3,5 caracteres/token erra para baixo em código: medido com o tokenizer do Qwen2.5-Coder, TS/JSON/CSS
  ≈ 1,3× a estimativa, português ≈ 1,0–1,1×). Sem espaço para ≥ 1 024 tokens de resposta, a GPU é pulada sem chamada.
  400/413/422 da própria (erro do pedido) não deixa a GPU de castigo para os próximos pedidos; 5xx/tempo deixa 60 s.
- Executor da cadeia em `_shared/vertalCodeAi/chainRunner.ts` (testado com fetch e relógio falsos em
  `src/lib/vertalCodeAi/gpuRouting.test.ts`).
- O projeto Supabase está no limite de 100 segredos, então tudo isso vai num **único** segredo JSON,
  `VERTAL_GPU_CONFIG` (`{"VERTAL_OLLAMA_URL_2":"…","VERTAL_OWN_IMAGE_URL":"…",…}`). Ele só aceita chaves
  `VERTAL_OLLAMA_*_2` (inclui `VERTAL_OLLAMA_FIRST_TOKEN_FROM_START_2`), `VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS` e `VERTAL_OWN_IMAGE_*`/`VERTAL_OWN_VIDEO_*`; um segredo avulso
  com o mesmo nome vence. Nunca mexe em liga/desliga, lista de liberação ou chaves de provedores.

**Provedor extra OpenAI-compatível** (opcional, por segredo): `VERTAL_EXTRA_PROVIDER_URL` (https, base `/v1`),
`VERTAL_EXTRA_PROVIDER_KEY`, `VERTAL_EXTRA_PROVIDER_MODELS` (ids por vírgula), `VERTAL_EXTRA_PROVIDER_COST`
(`free` padrão | `paid`), `VERTAL_EXTRA_PROVIDER_CONTEXT`. Entra depois dos grátis e antes dos pagos. Serve, por ex.,
para o catálogo da NVIDIA (`https://integrate.api.nvidia.com/v1`) ou o Ollama Cloud (`https://ollama.com/v1`).

**Ollama Cloud** (desde 26/11/2026, plano Pro do Laércio, créditos de uso mensais): configurado **só dentro do
`VERTAL_GPU_CONFIG`** (sem segredo novo) com `VERTAL_OLLAMA_CLOUD_URL` (`https://ollama.com`), `VERTAL_OLLAMA_CLOUD_KEY`,
`VERTAL_OLLAMA_CLOUD_CODE_MODEL` (padrão `kimi-k2.7-code`), `VERTAL_OLLAMA_CLOUD_FAST_MODEL` (padrão
`deepseek-v4.1-flash`), opcionais `VERTAL_OLLAMA_CLOUD_CONTEXT` (128 000) e `VERTAL_OLLAMA_CLOUD_ENABLED=false` (desliga).
Ordem: própria pequena (VM) → GPU (Modal) → **Nuvem** ("Vertal Nuvem · Código" / "· Rápido") → grátis → pagos (só com
`ALLOW_PAID`). O de código vem primeiro; o rápido vem primeiro com esforço `low` (pedidos curtos, CRM/Prospector) e na
opção Turbo. Fica fora da opção Livre (que também é a cadeia de coordenação/Decide, sempre sem nada pago) e de pedidos
com imagem (sem visão). Aparece como `cost: "paid"` (gasta créditos do plano Ollama); a cobrança ao usuário segue
desligada. Prazo por chamada: 120 s.

**Vertal Decide da Equipe**: prazo da própria (Modal) **45 s** (15 s → 30 s → 45 s em 26/11/2026; o frio da L4 passava
de 30 s e caía no Jev). Ajustável com `VERTAL_OWN_DECIDE_TIMEOUT_MS` (aceito no `VERTAL_GPU_CONFIG`; em produção = 45000).
O prazo do Jev continua 15 s.

### 5.1b Grátis extras depois do Ollama Cloud + monitor de cota (desde 26/11/2026)

Ordem nas opções Auto, Code, Turbo e Pro: própria pequena (VM) → GPU (Modal) → Nuvem (Ollama Cloud) →
**Vertal Livre · Veloz** (Cerebras, plano grátis) → **Vertal Livre · Leve+** (Gemini, plano grátis do AI Studio) →
outros grátis (OpenRouter `:free`) → pagos só com `ALLOW_PAID`. A opção **Livre** (também cadeia de coordenação/Decide)
não muda. NVIDIA (termos só de teste interno) e Groq (conta restrita) **não** são usados.

Config (arquivo `supabase/functions/_shared/vertalCodeAi/freeQuota.ts`):

| Onde | Chave | Padrão / uso |
| --- | --- | --- |
| segredo avulso | `VERTAL_CEREBRAS_KEY` | chave da Cerebras; sem ela o provedor fica fora |
| segredo avulso | `VERTAL_GEMINI_KEY` | chave do AI Studio; sem ela o provedor fica fora (nome próprio para não ligar o `GEMINI_API_KEY` de outras funções) |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_KEYS_OWNER` | uuid da conta dona: chave que não couber como segredo da função (limite de 100 do projeto) é lida do cofre de segredos dessa conta (`/secrets`, `kubo_secrets`, auditado como "inject", destino `vertal_code_ai_free_tier`). Em produção o `VERTAL_GEMINI_KEY` está lá |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_CEREBRAS_MODELS` | `qwen-3.8-27b,gpt-oss-120b` (450 RPM e 1,08 B tokens/dia; 5 RPM) |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_GEMINI_MODELS` | `gemini-3.5-flash-lite` (15 RPM / 500 RPD) |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_CEREBRAS_CONTEXT` / `_GEMINI_CONTEXT` | 32 000 / 200 000 |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_TIER_ENABLED` | `false` tira os dois sem apagar nada |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_QUOTA_THRESHOLD` | 0.9 (pula ao chegar a 90%) |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_QUOTA_LIMITS` | JSON `{"gemini:*":{"rpd":500,"rpm":15}}` sobrepõe limites (`rpm`,`rpd`,`tpm`,`tpd`,`resetTz`) |
| `VERTAL_GPU_CONFIG` | `VERTAL_FREE_QUOTA_OLLAMA_MONTHLY_USD` | opcional: teto estimado do mês no Ollama Cloud (só pula se definido) |

**Monitor de cota.** Cada chamada a Cerebras, Gemini, OpenRouter `:free` e Ollama Cloud é contada (pedidos e tokens do
`usage`). Minuto: memória do isolate. Dia/mês e esperas: tabela **já existente** `ai_gateway_cache` (sem migração),
`key` `vcaq:<provedor>:<modelo>:d:<dia>:req|tok`, `…:m:<mês>:usd_micro` e `…:cool`, `content` = contagem,
`task_kind` = `vca_quota`, `expires_at` = fim da janela. (A `rate_limit_counters` não serve: o gatilho de INSERT dela
usa uma coluna `created_at` que não existe, então todo INSERT falha — também o `bump_rate_limit`; corrigir exige migração.) Cabeçalhos `x-ratelimit-*` (Cerebras) são lidos.
O modelo é **pulado** quando chega a 90% de um limite, quando os cabeçalhos dizem que sobra ≤10%, ou depois de
429/402/403-de-cota: espera até `retry-after`/`retryDelay`/reset dos cabeçalhos; cota **diária** do Gemini espera até a
**meia-noite do Pacífico** (Cerebras: meia-noite UTC, ou o reset que o cabeçalho disser). A API do Ollama não expõe o uso
dos créditos: o monitor só soma o **nosso gasto estimado** do mês (preço de tabela).

**Consulta (só admin, `is_admin`)**: `POST /functions/v1/vertal-code-ai` com JWT do usuário admin e
`{"action":"free_quota"}` → `{at, threshold, providers:[{key, requestsToday, tokensToday, limits, pct, resetsAt,
cooldownUntil, skipped, skipReason, estUsdThisMonth, providerHeaders…}], anySkipped, warnings, chainAuto}`.
`{"action":"free_quota","op":"probe"}` lista os ids de modelo que cada chave enxerga (para conferir a config).
Não-admin recebe 404. Teste de queda (só admin): `run` aceita `skipModels: ["ollama","ollama_cloud"]` (ids, provedores ou custos).

**Plano grátis do Gemini:** o Google pode usar o conteúdo enviado para melhorar os produtos (o Laércio aceitou em 26/11/2026).

Limites oficiais dos planos grátis (fontes abaixo, lidas em 24/11/2026):

- **OpenRouter `:free`**: 20 pedidos/min; **50 pedidos/dia** se a conta comprou menos de 10 créditos na vida;
  **1.000/dia** depois de comprar 10 créditos (uma vez). Criar mais contas/chaves não aumenta (limite global).
  Fonte: https://openrouter.ai/docs/api/reference/limits e FAQ.
- **Gemini API free tier**: limites por projeto, vistos no AI Studio; `gemini-4-hydrogen` e `gemini-3.8-flash` têm
  free tier. **No free tier o conteúdo pode ser usado para melhorar os produtos do Google** — não mande código de
  cliente sensível por essa rota. Fontes: https://ai.google.dev/gemini-api/docs/pricing e /rate-limits.
- **Groq free**: `openai/gpt-oss-120b` 30/min, 1.000/dia, 8K tokens/min, 200K tokens/dia. Fonte: https://console.groq.com/docs/rate-limits.
- **Cerebras**: em 24/11/2026 não havia plano grátis permanente; desde 26/11/2026 a conta do Laércio tem plano grátis
  (ver 5.1b). Fonte: https://inference-docs.cerebras.ai/support/rate-limits.

Um pedido do agente usa em média 2–5 chamadas (ler, editar, corrigir). Com 50/dia no OpenRouter dá ~10–25 pedidos;
com 1.000/dia, ~200–500. **As cotas grátis são da conta da Vertal, divididas entre todos os usuários**: servem para o
Laércio e beta testers, não para um produto aberto ao público (ver decisões).

## 5.2 Equipe Vertal, memória expansiva e Vertal Decide (desde 26/11/2026 · desligado por padrão)

Modo novo, **ao lado** do `run` de sempre (ação `team_run`; o `run` não mudou). Só aparece para quem está na lista
**própria** da Equipe e já é liberado pelo VERTAL Code AI (a regra de liberação geral não foi tocada).

| Segredo | Padrão | Para quê |
|---|---|---|
| `VERTAL_CODE_AI_TEAM_ENABLED` | desligado | Liga a Equipe |
| `VERTAL_CODE_AI_TEAM_USER_IDS` | vazio = **ninguém** | Quem pode usar (ids separados por vírgula) |
| `VERTAL_CODE_AI_TEAM_MAX_CALLS` / `_MAX_TOKENS` / `_MAX_MS` / `_MAX_DECISIONS` | 16 / 200 000 / prazo do pedido / 8 | Orçamento por execução |
| `VERTAL_CODE_AI_TEAM_MAX_ENGINEERS` / `_REVIEW_ROUNDS` | 3 / 1 | Engenheiros em paralelo / rodadas "reprovado → corrige" |
| `VERTAL_CODE_AI_TEAM_MEMORY` | ligada (precisa da migração) | `false` desliga a memória |
| `VERTAL_CODE_AI_TEAM_EMBEDDINGS` | ligado | `false` = memória só por palavras |
| `VERTAL_CODE_AI_TEAM_E2B` (+ `E2B_API_KEY`) / `_E2B_TIMEOUT_MS` | desligado / 45 000 | Revisor testa no sandbox |
| `VERTAL_OWN_DECIDE_URL` / `_TOKEN` / `_MODEL` (apelido antigo: `VERTAL_DECIDE_URL` / `_TOKEN` / `_MODEL`) | — | Modelo de decisão próprio (GPU) — **o mesmo** para a Equipe e os Sentidos (§13). URL = base do app (o cliente acrescenta `/v1/systemone`) ou endpoint completo `…/v1/<algo>`. Se os dois nomes existirem, `VERTAL_OWN_DECIDE_*` vence |
| `VERTAL_DECIDE_JEV_MODEL` (ou `VERTAL_OWN_DECIDE_FALLBACK_MODEL`) / `VERTAL_DECIDE_JEV` | `typesafe/jev-1.14` / ligado | Decisões via OpenRouter (só com `VERTAL_CODE_AI_ALLOW_PAID`) |
| `VERTAL_OWN_DECIDE_IMAGES` | desligado | Decisão **com foto** vai à reserva paga (padrão, ~0,3 s) em vez da própria (~15 s); `true` força a própria |
| `VERTAL_DECIDE_HIGH` / `_MEDIUM` | 0,80 / 0,55 | Limites de confiança |

O projeto está no limite de 100 segredos: todas as chaves `VERTAL_CODE_AI_TEAM_*` e `VERTAL_DECIDE_*` também podem ir
**dentro do `VERTAL_GPU_CONFIG`** (o JSON que já existe). Segredo avulso vence. Nenhuma outra chave é aceita ali.

**3 núcleos, 5 papéis** (`_shared/vertalCodeAi/team.ts`, lógica pura testada no Vitest):

- **Pensa** — *Gerente* (entende, define escopo, divide em tarefas com arquivos; cadeia barata/própria) e *Encarregado*
  (determinístico, sem chamada: junta tarefas que dividem arquivo, dá a cada Engenheiro arquivos **exclusivos**).
- **Constrói** — *Engenheiros* em paralelo (até 3), cada um com o loop de sempre (ler → editar → verificar → auto-corrigir)
  na cadeia **forte** da opção escolhida (própria primeiro → grátis → pago só com `ALLOW_PAID`). Edição em arquivo de
  outro Engenheiro é descartada.
- **Entrega** — *Revisor/QA* (verificação automática do conjunto: sintaxe, imports entre arquivos, segredos; teste no
  sandbox se ligado; revisão do diff; reprova e devolve ao Engenheiro **dono** do arquivo) e *Entregador* (pacote final
  com os diffs no mesmo formato do Aplicar de sempre, resumo para o dev e o que vale lembrar).
- Coordenação (Gerente, Revisor, Entregador, Vertal Decide por LLM) usa a cadeia "Vertal Livre" com esforço rápido:
  própria → grátis → reserva grátis, **nunca paga**.
- **Orçamento** por execução: chamadas, tokens (estimados) e tempo; cada papel deixa reserva de tempo para quem vem
  depois. Estourou: entrega o que tiver, marcado como **não verificado**.
- "Verificado" = todas as tarefas saíram, orçamento não estourou, verificação automática limpa, sandbox ok (se rodou) e
  Revisor não reprovou.

**Vertal Decide** (`_shared/vertalCodeAi/decide.ts`): camada de decisão rápida e tipada para bifurcações simples, no
lugar de uma chamada de LLM inteira. Perguntas `noul` (sim/não), `choice` e `score`, cada uma com probabilidade.
Interface única `decide(state, questions)`; **um só cliente HTTP** (`requestDecision` em `decide.ts`), usado também pelos
Sentidos (§13). Provedores: **própria** (`VERTAL_OWN_DECIDE_URL` + `_TOKEN`, ou o apelido `VERTAL_DECIDE_*`; contrato = corpo e resposta da
Decisions API: `POST {model?, state, questions}` → `{answers}`, servido por `infra/vertal-gpu-modal/vertal_decide.py` em `/v1/systemone`) → **OpenRouter Decisions API** (`/api/alpha/decisions`,
chave `OPENROUTER_API_KEY` que já existe; cobrado por token de entrada, por isso só com `ALLOW_PAID`) → **LLM barata** com
JSON (confiança limitada abaixo de "alta") → nenhum (padrão seguro). Regra: **alta age, média sobe para modelo maior,
baixa pergunta ao usuário** (as perguntas aparecem no pacote final).

| Papel | Decisão | Alta | Média / baixa |
|---|---|---|---|
| Gerente | tamanho (score) | trivial → pula a chamada do Gerente (1 tarefa) | chama o Gerente |
| Gerente | modelo dos Engenheiros (choice) | "padrão" → Engenheiros na cadeia barata | cadeia forte |
| Gerente | precisa de sandbox? (noul) | "não" → pula o sandbox | roda se ligado |
| Gerente | revisão humana? (noul) | "sim" → pacote marcado | baixa → pergunta |
| Revisor | passa? (noul) | "sim" → aprova sem LLM | revisão por LLM; baixa → aviso ao dev |
| Entregador | pronto para entregar? (noul) | segue a decisão, mas **nunca "pronto" com problema pendente** | média: pronto só se verificado e aprovado; baixa → pergunta |

Ferramenta **Vertal Decide** para análise de dados: ação `decide` (`{state, questions}` livres) e `decide_analyze`
(`{dossier, question?, causes?}` → causa principal + probabilidades + risco baixo/médio/alto/crítico + confiança + nível;
sem causas, a LLM barata propõe 3–5 antes). Respostas mostram só "vertal_decide" (o motor fica em `engine`).

**Memória expansiva** (`_shared/vertalCodeAi/memory.ts` + migração `20261126120000_vertal_code_ai_memory.sql`,
**não aplicada em produção**): tabela `vertal_code_ai_memories` (escopo `user` ou `project`; cofre pessoal =
`project_id` nulo), tipos decisão / preferência / fato do código / execução / resumo do projeto / nota, embedding
`vector(384)` (gte-small do próprio Edge Runtime, sem custo) com índice HNSW, função `match_vertal_code_ai_memories`
(só service role) e FTS em português. RLS: o dono só **lê e apaga**; grava só a edge function, que barra segredos.
Busca = cosseno + palavras + importância + recência; sem a função SQL, ordena as últimas 300 linhas no código.
**Sem a tabela, nada quebra**: a memória desliga por 10 min no isolate e o pedido segue. Ações `memory_list` /
`memory_delete` (`ids`, `clear` do projeto, `clearAll`); tela "Memória" (ícone de cérebro) para ver e apagar.

Tela: botão **Equipe** ao lado do seletor de modelo (só com `team_status` liberado), progresso por núcleo (Pensa /
Constrói / Entrega) e por papel, decisões rápidas, memória usada/guardada, orçamento e o pacote final.

## 6. Servidor próprio (Ollama na nuvem, opcional)

Kit em `infra/vertal-ollama/`: Docker Compose com Ollama (sem porta pública) + Caddy com HTTPS automático e **token
obrigatório** (Ollama não tem autenticação nativa), só expõe `/v1/chat/completions` e `/v1/models`.
Modelo padrão `qwen2.5-coder:7b` (Apache-2.0) empacotado como `vertal-coder` (contexto 8K, temperatura 0,2).

```bash
# na VM (SSH), dentro do repositório
cd infra/vertal-ollama && cp .env.example .env && nano .env   # domínio, ex.: ollama.vertalrun.com
sudo ./setup.sh     # instala Docker se faltar, sobe tudo, baixa o modelo, cria o token
./bench.sh          # mede tokens/s reais nesta máquina
supabase secrets set VERTAL_OLLAMA_URL=https://ollama.vertalrun.com VERTAL_OLLAMA_MODEL=vertal-coder
supabase secrets set VERTAL_OLLAMA_TOKEN=…   # do .env; nunca no chat nem no git
```

DNS: um registro A no Cloudflare apontando para o IP da VM (proxy laranja desligado no 1º emissão do certificado).
Na Oracle, libere 80/443 também na Security List da VCN (o `setup.sh` libera o iptables da VM).

### Onde hospedar (verificado em 24/11/2026)

| Opção | Custo | Realidade |
|---|---|---|
| **Oracle Always Free, Ampere A1** | R$0 | A cota grátis hoje é **2 OCPUs e 12 GB de RAM no total** (1.500 OCPU-h e 9.000 GB-h/mês), não mais 4/24. A `vertal-e2b-vm` (2 vCPU, 12,9 GB) já usa essa cota → **não dá para criar uma segunda VM A1 grátis**. Fonte: docs.oracle.com, "Always Free Resources". |
| **Na própria `vertal-e2b-vm`** (recomendado para testar) | R$0 | Cabe com limites (`OLLAMA_MEM_LIMIT=6g`, `OLLAMA_CPUS=1.5`, descarrega após 10 min ocioso). Disputa CPU/RAM com o Navigator/E2B (hugepages de 4 GiB + ~0,7 GB por sessão). Com Navigator em uso, prefira `qwen3:4b` ou `qwen2.5-coder:1.5b`. |
| Railway (Hobby) | ~US$60/mês só de RAM para 6 GB sempre ligado (US$0,00000386/GB·s) + CPU | **Não é quase grátis.** O plano Free (0,5 GB) não roda modelo de código. Fonte: railway.com/pricing. |
| Oracle pago / GPU | pago | Fora do escopo (nada pago foi criado). |

Atenção Oracle: VM Always Free ociosa (CPU p95 < 20%, rede < 20% e RAM < 20% por 7 dias) **pode ser recolhida**.

### Velocidade realista em CPU (estimativa — meça com `./bench.sh`)

Ampere A1 com 2 núcleos, `qwen2.5-coder:7b` Q4: algo como **10–20 tokens/s lendo o prompt e 2–4 tokens/s gerando**
(estimativa de ordem de grandeza, não medida aqui). Na prática:

- Pedido pequeno (prompt 2K, resposta 300 tokens): ~2–4 min.
- Pedido típico do agente (prompt 6K com arquivos, resposta 1.500 tokens): **8–15 min** — passa do limite de 150/400 s
  da edge function. Ou seja: **o servidor próprio serve como reserva para pedidos pequenos quando as cotas grátis
  acabam**, não como motor principal. Por isso ele fica **depois** dos grátis na cadeia.
- Modelos leves (`qwen3:4b`, `qwen2.5-coder:1.5b`) são ~2–4× mais rápidos e bem mais fracos.

Custo do servidor próprio na `vertal-e2b-vm`: **R$0** de infraestrutura (já paga/grátis). Custo real = disputa de recursos
com o Navigator.

## 7. Custos (meta ~R$0)

| Cenário | Custo mensal |
|---|---|
| Só grátis (OpenRouter sem créditos + Gemini free + Groq free) | **R$0** — ~10–25 pedidos/dia no OpenRouter + o que couber no Gemini/Groq |
| + compra única de 10 créditos no OpenRouter | **US$10 uma vez** (em reais pelo câmbio do dia + IOF) → 1.000 pedidos grátis/dia; os créditos continuam disponíveis para o Turbo |
| + servidor próprio na `vertal-e2b-vm` | R$0 a mais |
| + Turbo pago liberado | centavos de dólar por pedido (US$0,05/US$0,20 por 1M tokens; um pedido de ~20K tokens ≈ US$0,002) |
| Edge function Supabase | dentro do plano atual |

## 8. Ponte Vertal Chat → VERTAL Code AI

- Botão **Code AI** no cabeçalho do Vertal Chat e na barra do Vibe Code (só com a flag).
- Link com pedido: `/vertal-code-ai?from=chat&prompt=<texto>` (`vertalCodeAiHref`) — o pedido chega preenchido e a
  edge function registra a origem `vertal_chat`.
- `looksLikeCodingRequest(texto)` já existe para sugerir a troca automaticamente; **ligar a sugestão dentro do
  cérebro do chat ficou de fora** de propósito (mudaria prompts/comportamento do chat). Fica como próximo passo atrás de flag.

## 9. Garantias e testes

- `scripts/vertal-code-ai/engine-guard.mjs` compara o branch com o ponto em que ele saiu do `main` (`git merge-base`):
  falha se **qualquer** arquivo do motor mudar (Vibe Code, roteamento de modelos, prompts, jogos, design, skills) e,
  nos 3 arquivos compartilhados, se alguma linha existente for removida/alterada ou se entrar linha que não seja do
  VERTAL Code AI. Por comparar com a base do próprio branch, **PRs de outras frentes no motor não são afetados**.
  Roda no workflow `vertal-code-ai-guard.yml` (só em PRs que tocam o VERTAL Code AI) e no Vitest quando há histórico git.
- `src/test/vertal-code-ai-regression.test.ts` (sempre roda): rota só atrás de `isVertalCodeAiEnabled()`; a função nova
  não importa roteador/gateway/prompts do Vibe Code e não grava `ai_gateway_runs`/conversas do Vibe; ranking do
  `modelRouter` (3 cenários), origens aceitas pelo vibe-code-agent, `parseAgentTurn` e blueprint de jogos iguais a antes.
- `src/lib/vertalCodeAi/*.test.ts` e `VertalCodeAiEntryButton.test.tsx`: roteador, loop completo com modelo falso
  (constrói → verificação reprova → auto-correção → diff verificado), modo Planejar, queda de modelos, SSE, ponte, botão nulo.

## 10. Comparação honesta com Cursor, Lovable e Replit

**Ainda não é melhor que eles.** O que a v1 tem de bom: custo ~zero, roda inteiro do celular, plano→construção→
verificação→auto-correção antes de mostrar, diffs multi-arquivo com aprovação por arquivo, índice do repositório,
e convive com o Vibe Code sem mexer nele.

Onde perde hoje:
- **Qualidade do modelo**: os grátis são bons, mas abaixo dos modelos de ponta pagos que Cursor/Lovable/Replit usam.
  Cotas grátis também caem sem aviso (a troca automática ameniza, não resolve).
- **Execução real**: a v1 verifica sintaxe/imports/segredos, mas **não roda `tsc` do projeto inteiro, testes nem build**
  (edge function não tem o projeto instalado). Replit e Lovable rodam o app de verdade.
- **Preview ao vivo e deploy em 1 clique**: ainda via o Vibe Code existente (preview E2B, deploy-trigger), não dentro
  do VERTAL Code AI.
- **Contexto**: índice por símbolos/nomes, sem busca semântica (embeddings) — Cursor é mais preciso em repositório grande.
- **Edição em tempo real/streaming de tokens**: a tela mostra passos e diffs, não o texto sendo digitado.

Caminho para ficar à frente (v2): rodar `tsc`/testes/build num sandbox (o E2B da `vertal-e2b-vm` já existe) e devolver
os erros ao loop; embeddings do repositório; botão "Publicar" usando o `deploy-trigger`; créditos para o Turbo pago.

## 11. Decisões em aberto (Laércio)

1. **Merge do PR** (rascunho; nada publicado) e quando ligar `VERTAL_CODE_AI_ENABLED` + `VITE_VERTAL_CODE_AI`.
2. **Comprar 10 créditos no OpenRouter (uma vez)?** Leva de 50 para 1.000 pedidos grátis/dia. Recomendo.
3. **Quem pode usar**: só você/beta (cotas grátis compartilhadas) ou todos — nesse caso precisa cobrar créditos e liberar o Turbo pago.
4. **Gemini free tier**: aceitar que o Google pode usar o conteúdo para melhorar produtos? Se não, não configure `GEMINI_API_KEY`.
5. **Servidor próprio**: instalar na `vertal-e2b-vm` (R$0, disputa com o Navigator) ou não usar por enquanto.
6. **v2**: verificação com `tsc`/testes no sandbox E2B? Sugestão automática dentro do chat (mexe no cérebro do chat, atrás de flag)?
7. **Desktop/CLI**: retomar quando houver PC (o plano era um fork do OpenCode, licença MIT — se retomado, manter o aviso MIT).

## 12. Licenças e atribuição

- Nenhum código de terceiros foi copiado nesta v1. A ideia de modos Planejar/Construir e catálogo de modelos veio de
  ferramentas abertas como o OpenCode (licença MIT, https://github.com/anomalyco/opencode); se partes dele forem
  usadas no futuro, o aviso MIT precisa ir junto (THIRD_PARTY_NOTICES.md).
- Ollama (MIT) e Caddy (Apache-2.0) só são usados como imagens Docker no kit de deploy.
- GPU própria (kit `infra/vertal-gpu-modal/`): vLLM (Apache-2.0), Diffusers (Apache-2.0); pesos Qwen2.5-Coder-14B-
  Instruct-AWQ, FLUX.1-schnell e Wan2.1-T2V-1.3B, todos **Apache-2.0** (baixados do Hugging Face no deploy, não
  versionados aqui).
- Sentidos (26/11/2026): Intern-Decision-4B (**Apache-2.0**, internlm/Intern-Decision-4B; arquivo LICENSE-QWEN do
  Qwen3.5 preservado no próprio repositório do modelo), Qwen2.5-Omni-7B (**Apache-2.0**, arquivo LICENSE do repositório
  Qwen/Qwen2.5-Omni-7B), Kokoro-82M (**Apache-2.0**, hexgrad/Kokoro-82M; usa espeak-ng, GPL-3.0, só como programa
  separado dentro do contêiner, sem link), flash-linear-attention (MIT), causal-conv1d (BSD-3-Clause), ffmpeg (LGPL/GPL,
  pacote do Debian dentro do contêiner). Conferidos e **não usados**: OpenJev 27B (pesos **CC BY-NC 4.0**, proibido uso
  comercial); Kev-4B (Apache-2.0, conferido no card `jaredpalmer/kev-4b`, mas só texto e abaixo do Intern-Decision-4B
  nas tabelas publicadas); V-JEPA 2 (descartado a pedido; não foi implantado).
- Modelo padrão do servidor próprio: Qwen2.5-Coder-7B-Instruct, **Apache-2.0**. Alternativas leves: Qwen3-4B e
  Qwen2.5-Coder-1.5B (Apache-2.0). **Evitar Qwen2.5-Coder-3B** (licença Qwen Research, restringe uso comercial).
- Nomes de provedores aparecem só nesta documentação e no código do servidor; a interface mostra apenas nomes Vertal.
- Fora de escopo por política: rotação de IP para burlar cotas grátis e catálogos de "jailbreak/sem censura" (violam os termos dos provedores).

## 13. Sentidos: Vertal Decide, Vertal Visão, Vertal Ouvir e Vertal Novela (26/11/2026)

Tudo **aditivo** e **desligado** sem configuração: as ações novas `senses` e `novela` da edge function só existem com
`VERTAL_CODE_AI_MEDIA_ENABLED=true` **e** a URL própria do recurso (`VERTAL_OWN_DECIDE_URL`, `VERTAL_OWN_OMNI_URL`,
`VERTAL_OWN_NOVELA_URL`, cada uma com `_TOKEN`, dentro do segredo JSON `VERTAL_GPU_CONFIG`). Sem a URL respondem 404
como "desligado". Como a função inteira já é só para quem está em `VERTAL_CODE_AI_USER_IDS`, ninguém além da lista vê.
Reservas pagas só entram com `VERTAL_CODE_AI_ALLOW_PAID=true`. Cobrança: **desligada** (a resposta traz só a estimativa).

| Nome na tela | O que faz | Própria (Modal, scale-to-zero, 1 contêiner) | Reserva |
|---|---|---|---|
| Vertal Decide | Decisões tipadas rápidas no formato `/v1/systemone` (estilo Jev): `noul` (sim/não), `choice`, `score`, com probabilidades calibradas | `vertal-decide`: Intern-Decision-4B (Apache-2.0), L4 (alternativa A10G) | Decisions API do OpenRouter, `typesafe/jev-1.14` (pago por token de entrada) |
| Vertal Visão | Foto de produto → Decide classifica (é produto? categoria, qualidade, impróprio?) → descrição de venda em JSON (nome, tipo, características, cores, faixa de preço em R$, título, texto, tags). Vídeo: quadros amostrados **no navegador** → decisão por quadro (cenas-chave, moderação) | `vertal-omni`: Qwen2.5-Omni-7B no vLLM, L40S | `google/gemini-3.1-flash-lite` (OpenRouter) |
| Vertal Ouvir | Áudio curto (até 30 s) → transcrição + entendimento + resposta; "Ouvir resposta" lê em voz pt-BR | `vertal-omni` + voz Kokoro-82M (`vertal-novela`, `/tts`) | mesma reserva multimodal (sem reserva para a voz) |
| Vertal Novela | Premissa → novelinha vertical 720×1280 com narração pt-BR, legendas, zoom/pan e transições | `vertal-novela` (CPU) orquestrando LLM própria, FLUX, (opcional) Wan e Kokoro | LLM do roteiro cai para o `vertal-omni` |

Ações (POST na função `vertal-code-ai`):
- `{action:"senses", op:"status"}` → quais recursos estão ligados.
- `{action:"senses", op:"decide", state, images?, questions}` → respostas tipadas.
- `{action:"senses", op:"photo", image, note?}` → `{decision, route, product, estimate}`. A rota não chama o modelo
  grande se a foto for imprópria, não for produto ou estiver inutilizável.
- `{action:"senses", op:"frames", frames:[{t,image}], questions, rank_by?}` → decisão por quadro + `top` (até 24 quadros).
- `{action:"senses", op:"hear", audio}` (WAV 16 kHz gerado no navegador) → transcrição/resposta.
- `{action:"senses", op:"speak", text, voice?}` → `audio/wav`.
- `{action:"novela", op:"submit", premise, voice?, scenes?, clips?}` → job assinado (HMAC, como o vídeo);
  `op:"status"` → etapa/título/duração/custo; `op:"result"` → `video/mp4`.

Decisões com imagem: por padrão vão direto à reserva (medido: própria quente ~15 s por foto vs reserva ~0,3 s);
`VERTAL_OWN_DECIDE_IMAGES=true` força a própria. Texto na própria: ~0,2 s. Sem `ALLOW_PAID`, tudo fica na própria.
A rede do Decide passa pelo mesmo cliente da Equipe (`requestDecision` em `decide.ts`): mesma URL, token e reserva.

Tela: botão de olho no cabeçalho do `/vertal-code-ai` abre o painel "Visão · Ouvir · Novela" (`VertalSensesPanel`).

### Câmera, microfone e LGPD

- O consentimento de coleta de dados já existe no Vertal Dev (banner de cookies e painel de recompensas) — **não** há
  tela de consentimento separada.
- Câmera e microfone só abrem quando a pessoa toca em "Usar câmera"/"Gravar"; o **navegador pede a permissão dele a cada
  uso**; um indicador vermelho ("Câmera ligada"/"Gravando") fica visível enquanto estão ligados.
- As trilhas são **desligadas** logo após a captura, ao parar a gravação (máx. 30 s), ao trocar de aba do painel, ao
  fechar o painel e quando a aba do navegador vai para o fundo. Nada é gravado em segundo plano.
- Foto/áudio vão uma vez para a análise e só a resposta volta; a edge function não grava mídia em banco nem em
  storage. Os apps próprios processam em memória/arquivos temporários do contêiner (apagados ao fim); o vídeo da
  Novela fica no resultado do job do Modal (expira) e no navegador de quem pediu.
- Vídeos para "Analisar vídeo" não sobem inteiros: o navegador tira até 12 quadros (640 px) e manda só eles.
- Base legal sugerida (LGPD art. 7º, V — execução do serviço pedido pelo titular); rosto/voz podem ser dado pessoal
  sensível (biometria) só se usados para identificar alguém, o que **não** fazemos. Ao ligar para mais gente, revisar
  a política de privacidade para citar os subprocessadores (Modal e, na reserva, OpenRouter/TypeSafe/Google).

### Custos medidos (26/11/2026, preços Modal: L4 US$0,80/h, A10G US$1,10/h, L40S US$1,95/h, CPU US$0,047/núcleo·h)

Ver `work/vmllm/NOTES.md` (fora do repo) para os números da rodada de testes; resumo no PR.
Preço de varejo (só proposta; cobrança desligada): créditos = (custo real + US$0,05) × 1,5 ÷ US$0,03.

## Data Library (Vertaldephin)

O uso do VERTAL Code AI pode ser enviado ao livro "Vertal Code AI" do Knowledge Book: desligado por padrão, só com consentimento já gravado (painel de recompensas / banner de cookies), uso anonimizado. Ver [VERTAL-CODE-AI-DATA-LIBRARY.md](VERTAL-CODE-AI-DATA-LIBRARY.md).
---

# Parte 2 · Plataforma (PR empilhado sobre `feat/vertal-code-ai-cloud`)

Tudo abaixo é **aditivo e desligado por padrão**. Nenhuma migração foi aplicada: as tabelas novas estão em
`docs/vertal-code-ai/proposed-migration.sql` (fora de `supabase/migrations` de propósito; o deploy não roda
`db push`). Sem a migração, a tela da Parte 1 continua igual; API e Operação respondem erro até ela existir.

## 13. Interruptores e segredos novos

| Env (Supabase Secrets) | Padrão | Liga |
|---|---|---|
| `VERTAL_AI_API_ENABLED` | off | API para desenvolvedores (`vertal-ai-api`) |
| `VERTAL_CODE_AI_ADMIN_ENABLED` | off | agente de operação (`vertal-code-ai-admin`) |
| `VERTAL_ADMIN_USER_IDS` | vazio = ninguém | ids do operador (além do papel `admin`) |
| `VERTAL_ADMIN_APPROVAL_KEY` | usa `CONNECTOR_ENC_KEY` | segredo (32+) que assina os cartões de aprovação |
| `VERTAL_CODE_AI_CHARGE_ENABLED` | off | cobrança de varejo em créditos na tela (Vibe Code/Chat → VERTAL Code AI) |
| `VERTAL_CODE_AI_PRICING` | tabela padrão | JSON parcial que sobrescreve preços (inválido → padrão inteiro) |
| `VERTAL_OPERATOR_EMAILS`, `VERTAL_OPERATOR_SLACK_IDS` | e-mail do login | quem conta como "o próprio Laércio" nos canais |
| `VERTAL_OUTLOOK_TENANT/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN` | vazio | Outlook (Microsoft Graph) |
| `VERTAL_MAIL_SMTP_HOST/PORT/USER/PASS`, `VERTAL_MAIL_FROM` | vazio | e-mail do domínio próprio (SMTP 465) |
| `VERTAL_CRM_MAP` | Pipedrive + HubSpot padrão | JSON com as chaves das ações do Fluxos por CRM |

Arquivo compartilhado tocado: `supabase/config.toml` (`[functions.vertal-ai-api] verify_jwt = false`, porque a
função autentica a chave `vtl_ai_` ela mesma). Também mudaram, só no código do VERTAL Code AI:
`supabase/functions/vertal-code-ai/index.ts` (cobrança atrás de flag), `src/pages/VertalCodeAIPage.tsx` (botões
Chaves e Operação), `src/lib/vertalCodeAi/client.ts` (texto do erro de crédito). Motor, jogos, design: intocados
(`engine-guard.mjs` + `regression.existing-engines.test.ts` com snapshots).

## 14. API VERTAL para desenvolvedores (OpenAI-compatível)

```
POST {SUPABASE_URL}/functions/v1/vertal-ai-api/v1/chat/completions   Authorization: Bearer vtl_ai_…
GET  {SUPABASE_URL}/functions/v1/vertal-ai-api/v1/models
POST {SUPABASE_URL}/functions/v1/vertal-ai-api/keys  (JWT)  {"action":"create|list|revoke|set_cap|usage"}
```

- Modelos públicos (só marca VERTAL): `vertal-code-ai` (auto), `-fast` (low), `-reasoning` (high), `-max`,
  `-vision`. Mapeiam para o esforço da cadeia grátis-primeiro do `router.ts` (mesmo roteamento da tela).
- `reasoning_effort` do cliente (low/medium/high) ajusta o esforço. Sem `tools` na fase 1; `stream:true` devolve
  um único pedaço SSE + `[DONE]` (compatível com SDKs, não incremental). Resposta sem nenhum dado do provedor real,
  com `vertal.cost_credits`. Um system prompt de marca é colocado antes das mensagens.
- **Chaves por desenvolvedor**: `vtl_ai_` + 43 chars, só o SHA-256 no banco (mesmo padrão das chaves MCP/Cofre),
  mostrada uma vez, até 10 ativas, cada uma com teto mensal em créditos e RPM.
- **Ordem de cada pedido**: chave → RPM (`bump_rate_limit`) → corpo → mesmo `Idempotency-Key` já atendido?
  devolve a resposta guardada **sem cobrar** → saldo e teto para o **pior caso** (`max_tokens`, classe mais cara da
  cadeia) → modelo → `vertal_ai_record_usage` (RPC atômica: uso gravado uma vez, fração acumulada, gasto da chave)
  → se passou de 1 crédito inteiro, `execute_atomic_credit_deduction` com idempotência `vai-<usage_id>`.
  Débito falhou no meio (saldo sumiu)? O uso fica `owed` e bloqueia novos pedidos até pagar.
- Erros no formato OpenAI: 401 (chave), 402 `insufficient_credits`, 429 `rate_limit_exceeded`/`spend_cap_reached`,
  503 `model_unavailable` (com `Retry-After`). Domínio `api.vertal.dev/v1` (proxy no Worker): fase 2.

## 15. Preços (config, não código)

`_shared/vertalCodeAi/pricing.ts` + `VERTAL_CODE_AI_PRICING`. Conta em microcréditos (1 crédito = 1.000.000 µc).
Fórmula padrão por 1M tokens: `(custo real US$ + infra US$ 0,05) × margem 1,5 ÷ US$ 0,03 por crédito`.
O crédito de referência (US$ 0,03) vem do Starter (US$ 4,99 / ~150 créditos/mês ≈ US$ 0,033), o mais barato por
crédito, então nunca vendemos abaixo do custo. Margem < 1 é recusada pelo validador.

| Classe de quem respondeu | Custo real US$/1M (in / out) | Créditos/1M (in / out) | Pedido típico 3K in + 1K out |
|---|---|---|---|
| Grátis | 0 / 0 | 2,5 / 2,5 | 0,011 crédito |
| Servidor próprio (VM paga, ~US$ 1,85/1M de saída a ~6 tok/s) | 0,20 / 1,85 | 12,5 / 95 | 0,134 crédito |
| Pago (tabela pública do provedor no dia — confira) | 0,27 / 1,10 | 16 / 57,5 | 0,107 crédito |

\+ 0,001 crédito por pedido. Grátis é barato de propósito: o custo real é a cota diária, não dinheiro.

**Varejo dentro do Vertal** (créditos inteiros, `inApp`): Planejar 0, Construir 1 nos modelos grátis/próprio;
Planejar 1, Construir 4 no pago (alinhado ao Vibe Code: flash 1 / pro 4); auto-correção incluída. Com
`VERTAL_CODE_AI_CHARGE_ENABLED=true` a função checa o saldo para o pior caso **antes** (402 se faltar) e cobra uma
vez **depois**, pelo modelo mais caro que respondeu, com idempotência `vcai-<user>-<modo>-<requestId>`. Vale para
quem chega pelo Vibe Code e pelo Vertal Chat (a ponte do Chat abre esta mesma tela).

## 16. Agente de operação ("o cérebro" do Vertal Dev)

Só o **operador**: papel `admin` (`has_role`) **e** id em `VERTAL_ADMIN_USER_IDS`. Para qualquer outro a função
responde 404 e a tela nem mostra o botão. Cliente usa o VERTAL Code AI nos próprios projetos, sem poder de admin.

| Ferramenta | Tipo | Execução |
|---|---|---|
| `metrics_overview`, `credits_by_category`, `top_users` (ids mascarados), `recent_errors`, `list_prs`, `api_usage`, `ops_report` | leitura | direto |
| `inbox_list`, `inbox_read` (qualquer canal) | leitura | direto, nada é marcado/alterado |
| `send_message`, `send_report` | envio | direto **só** se todos os destinos são o próprio Laércio; senão cartão |
| `revoke_api_key` (destrutiva), `set_key_cap` (dinheiro) | escrita | cartão |
| `grant_credits`, `rerun_ci`, `trigger_deploy`, `notify_users` | — | fase 2 (servidor recusa) |

**Cartão de aprovação**: linha `pending` em `vertal_ai_approvals` + token HMAC-SHA256 que amarra id, admin,
ferramenta, **hash dos argumentos** e validade (15 min). Executar exige assinatura válida, mesmo admin, mesma
ferramenta, **mesmos argumentos** e a troca atômica `pending → executing` (uso único). Tudo vai para
`vertal_ai_audit`, cifrado com o mesmo cofre do `navigator_audit` (AES-256-GCM, AAD amarrado ao dono e ao tipo).

**Relatórios**: diário/semanal (créditos por área, usuários ativos, top 10 mascarado, erros agrupados, uso da API,
PRs abertos); botão na tela, envio por qualquer canal (§17) e **ingestão** de relatórios que o Laércio sobe
(txt/md/csv/json até 200 KB) para perguntar sobre eles. Fase 2: envio agendado (cron) e receita em R$.

## 17. Canais: Gmail, Slack, Outlook, e-mail próprio e CRMs

Abstração única `send / receive / read` (`_shared/vertalCodeAi/channels.ts` = tipos, validação, roteamento e
política; `channelAdapters.ts` = adaptadores). Nada de Gmail fixo; os adaptadores **reaproveitam** o que existe,
chamando as funções atuais com o JWT do próprio operador (mesmas regras, logs e isolamento):

| Canal | Enviar | Receber / ler | Reaproveita | Estado |
|---|---|---|---|---|
| Gmail | `gmail-send-message` (um por destinatário) | `gmail-list-messages`, `gmail-get-thread` | conector Gmail do Vertal Chat | fase 1 |
| Slack | `slack-send-message` | `slack-list-messages` (scope = canal) | conector Slack existente | fase 1 |
| Outlook | Graph `POST /me/sendMail` | Graph `/me/mailFolders/inbox/messages`, `/me/messages/{id}` | — (refresh token por env) | código pronto; **sem credenciais = "não configurado"** |
| E-mail do domínio próprio | SMTP 465 (nodemailer) por env | IMAP | — | envio fase 1; leitura **fase 2** (IMAP não roda bem em Edge; plano: relay no Worker do vertal.dev) |
| Pipedrive (CRM) | nota (`createNote`) via **Vertal Fluxos** | buscas (`newDeals`, `newPersons`…) | conexão do usuário no Fluxos (creative-router `fluxos_apps`) | fase 1 quando o OAuth do Pipedrive estiver no Fluxos |
| HubSpot (CRM) | nota via Fluxos | `newContacts`, `newDeals` | idem | fase 1 |

Chaves das ações do CRM são config (`VERTAL_CRM_MAP`); se uma não existir na versão do Fluxos, o handler responde
`action_not_found` e nada é executado. Novos CRMs = uma entrada no mapa (o Fluxos já tem 74 apps).

**Política (testada em `channels.test.ts`)**: receber/ler é só leitura e roda direto; enviar para qualquer destino
que não seja o Laércio (e-mails em `VERTAL_OPERATOR_EMAILS` + o do login, Slack em `VERTAL_OPERATOR_SLACK_IDS`)
pede cartão — basta **um** destino de fora; escrita em CRM **sempre** pede cartão; cliente nunca usa canais do cérebro.

## 18. Isolamento entre clientes

- Tela: leitura e aplicação só no cofre do próprio usuário/projeto (`vibe_project_files` por `user_id` + projeto
  verificado por RLS) — já era assim na Parte 1.
- API: toda gestão de chave filtra por `owner_id` (inclusive para admin: `assertOwner`); a migração dá RLS de
  leitura só ao dono em chaves, uso e fração; aprovações e auditoria só pelo service role.
- Cobrança: sempre na conta do dono da chave / do usuário do pedido; idempotência inclui o id dele.
- Operação/canais: negados para não-operador em três camadas (404 na função, `gate`, `channelDecision`).

## 19. Fases

| Fase | Conteúdo |
|---|---|
| 1 (este PR, desligado) | API OpenAI-compatível com chaves/medição/débito fracionário/tetos/RPM; preços em config; varejo atrás de flag; agente de operação (leituras + cartões + auditoria cifrada); relatórios (montar, enviar, ingerir); canais Gmail/Slack/Outlook(stub sem credencial)/SMTP próprio/CRMs via Fluxos; testes |
| 2 | Streaming real na API, `tools`, domínio `api.vertal.dev`; IMAP do domínio próprio via Worker; relatórios agendados e receita em R$; executores `grant_credits`/`rerun_ci` com cartão; página pública de docs/preços; caixa de entrada unificada na tela |
| 3 | Agente que sugere ações a partir das caixas de entrada (sempre com cartão); webhooks de entrada (Slack Events, Graph subscriptions) |

## 20. Decisões em aberto da Parte 2 (Laércio)

1. Aplicar `docs/vertal-code-ai/proposed-migration.sql`?
2. Preços: crédito de referência US$ 0,03 e margem 1,5× ok? Construir = 1 crédito nos grátis?
3. Ligar a cobrança de varejo (`VERTAL_CODE_AI_CHARGE_ENABLED`) junto com a abertura para todos?
4. Outlook: registrar o app no Microsoft Entra (Mail.Read, Mail.Send, offline_access) e gerar o refresh token.
5. E-mail próprio: qual provedor SMTP (IONOS, Zoho, Google Workspace…) e endereço (`ops@vertal.dev`?).
6. Pipedrive/HubSpot: confirmar as chaves das ações no Fluxos (ou ajustar `VERTAL_CRM_MAP`).
7. Quem mais conta como "você" nos canais (`VERTAL_OPERATOR_EMAILS`, `VERTAL_OPERATOR_SLACK_IDS`).

## Cobrança v2 (custo real × markup) — desligada

Preço = max(nosso custo real, piso por tipo) × markup: varejo 1,69 (chat, código, imagem, vídeo), 2,59 (clonagem), 5,50 (raspagem); atacado/marca branca 1,20, sem clonagem/raspagem, saldo zero → 402. Crédito US$0,03. 5 mensagens de chat grátis por dia (configurável). Aviso único a 30% da última recarga (in-app, e-mail, CRM do Fluxos) e extrato por tipo. Detalhes, tabela, flags e o que falta aprovar: [docs/vertal-code-ai/BILLING-V2.md](vertal-code-ai/BILLING-V2.md). SQL proposto (não aplicado): [docs/vertal-code-ai/proposed-migration-billing-v2.sql](vertal-code-ai/proposed-migration-billing-v2.sql).

## API VERTAL · voz clonada (marca branca) — 27/11/2026, desligada

Rotas em `vertal-ai-api` (`supabase/functions/vertal-ai-api/voice.ts`), mesma chave `vtl_ai_…`, isoladas por cliente
da API (dono da chave) e por usuário final (`end_user`, id do usuário no app do cliente):

| Rota | O que faz |
|---|---|
| `GET /v1/voices/consent` | termo (pt/en/es), versão e campos obrigatórios do atestado |
| `GET /v1/voices/languages` | 23 idiomas da fala (Chatterbox Multilingual); cantar: qualquer idioma |
| `GET /v1/music/genres?q=` | catálogo de ritmos do mundo + 50 idiomas de letra (para o app do cliente) |
| `POST /v1/voices` | cria a voz: `end_user`, `name`, `language?`, `sample_seconds` (8–90), `sample_url` (https público) **ou** multipart `sample` (≤12 MB), `consent` {version "voice-consent-v1", accepted, owner_confirmed, speaker_name, accepted_at, end_user_ip?, end_user_agent?, authorization_url?} — sem atestado completo → 400 `consent_required`; máx. 5 vozes por usuário final, 500 por cliente |
| `GET /v1/voices?end_user=` / `DELETE /v1/voices/{id}` | lista / apaga (apaga a amostra) |
| `POST /v1/audio/speech` | `{voice_id, input, language?: "auto"\|código}` → 202 `{id}`; idioma fora → fallback avisado ou 422 `language_unsupported` sem cobrar |
| `POST /v1/audio/sing` | `{voice_id, source_url, pitch_shift?}` → 202 `{id}` (música ≤40 MB, ≤5,5 min) |
| `GET /v1/voice-jobs/{id}` | `processing` / `completed` (+`audio_url` 7 dias, créditos cobrados, `gpu_seconds`) / `failed` (nada cobrado) |

**Preço (cobrança v2, atacado ×1,20, crédito US$0,03, pré-pago, saldo zerado → 402):** custo real = segundos de GPU
medidos pelo motor (inclui partida a frio) × preço/hora da GPU (L4 US$0,80, A10/A10G US$1,10; `VERTAL_OWN_VOICE_GPU_USD_HOUR`),
com piso: fala/criar voz US$0,004, canto US$0,03. Exemplos: criar voz 0,16 crédito; fala de ~20 s de L4 ≈ 0,18 crédito
(30 s de A10 ≈ 0,37); canto de 3 min de L4 = 1,6 crédito (mínimo 1,2). Só cobra o que fica pronto; teto mensal da chave
vale para o pior caso (fala 300 s, canto 900 s de GPU) antes de enviar.

**Liga/desliga:** `VERTAL_OWN_VOICE_API_ENABLED` (+ `VERTAL_OWN_VOICE_API_USER_IDS` opcional) dentro do `VERTAL_GPU_CONFIG`,
além do `VERTAL_AI_API_ENABLED` da API. **Para ir ao ar:** merge do #225 (e deste PR), aplicar `proposed-migration.sql`,
`proposed-migration-billing-v2.sql` e `proposed-migration-voice-api.sql`, criar a função `vertal-ai-api` (o projeto está
no teto de funções; o deploy só atualiza as existentes) e ligar as flags.

## API VERTAL · vídeo (marca branca) — 28/11/2026, liberado por chave

Primeiro cliente: o MūskAI ("Vídeo de verdade" e "Vídeo com capa" do pacote de US$ 99). Motor = o mesmo app Modal
`vertal-video` do "Vertal Vídeo" (Wan2.1-T2V-1.3B próprio, L40S), nova rota `/video`.

| Rota (`Authorization: Bearer vtl_ai_…`) | O que faz |
|---|---|
| `POST /v1/videos/generations` | `{mode?: "ai"\|"cover", prompt?, duration_seconds (1–300), audio_url?, image_url?, end_user?}` → 202 `{id, status:"processing", eta_seconds, estimate:{price_usd, credits, max_price_usd, scenes}}` |
| `GET /v1/videos/{id}` | `processing` / `completed` (+`video_url` 7 dias, `billing.credits`, `billing.price_usd`, `scenes`, `gpu_seconds`) / `failed` (nada cobrado) |

- **"ai"**: gera N cenas de 5 s (480p, 16 qps) e monta em sequência (repetindo o ciclo) até a duração; com `audio_url`
  a música vai por baixo. **"cover"**: capa parada + áudio (só CPU, ffmpeg, 1280×720, 2 qps).
- **Trava de custo (fail closed):** preço de atacado ≤ `VERTAL_VIDEO_API_MAX_USD_PER_MIN` (0,30) × max(minutos, 1).
  O orçamento de GPU enviado ao motor sai desse teto e o motor **para de gerar cenas** antes de passar dele
  (contando a subida do contêiner); a cobrança é o custo real medido (GPU L40S US$1,95/h + CPU), nunca acima do teto.
  Vídeo curto (< 1 min) usa 1 minuto de teto (US$ 0,30). Sem espaço para nem 1 cena → 503 `video_cost_guard`.
- **Limites:** `VERTAL_VIDEO_API_MAX_SECONDS` 300, `_MAX_CLIPS` 16 (5 min ≈ 80 s de cenas únicas em ciclo), `_STEPS` 16,
  `_CLIP_GPU_S` 80 / `_COLD_START_S` 90 (estimativas para planejar; medido 28/11: ~4,4 s por passo numa cena de 5 s na L40S), `_GPU_USD_HOUR` 1,95, `_CPU_USD_PER_S` 0,000016.
  Todos opcionais, no `VERTAL_GPU_CONFIG`.
- **Cobrança:** kind `video` da cobrança v2 (atacado ×1,20, piso US$ 0,05), pré-pago, saldo zerado → 402, teto mensal
  da chave vale para o pior caso antes de enviar; idempotente por job (`video-job:<id>`), só cobra o que fica pronto.
- **Sem tabela nova:** o id do job é assinado (HMAC) e amarrado à chave; o MP4 fica em `uploads/{dono}/videos/api/`.
- **Liga/desliga (por chave):** `vertal_ai_api_keys.features = {"video": true}` (migração `20261128010000`), ou
  `VERTAL_VIDEO_API_ENABLED=true` + `VERTAL_VIDEO_API_KEY_IDS` no `VERTAL_GPU_CONFIG`. `VERTAL_VIDEO_API_ENABLED=false`
  desliga para todas as chaves.
