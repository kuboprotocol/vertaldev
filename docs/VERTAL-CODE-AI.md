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
| Vertal Imagem | `vca-image` google/gemini-3.1-flash-lite-image (≈US$0,04/imagem) — ação `image` |
| Vertal Vídeo | `vca-video` google/veo-3.1-lite 4 s 720p sem áudio (≈US$0,12) → `vca-video-alt` google/gemini-omni-1.2-flash 4 s 360p (≈US$0,09; instável em 24–25/11/2026) — ações `video`/`video_status`/`video_content` |

Preços em US$ por 1M tokens (entrada/saída), tabela do OpenRouter de 24/11/2026. Não existe Llama grátis no
OpenRouter hoje, por isso Llama ficou no Turbo (pago). Cada modelo novo tem teto de saída por pedido
(`maxOutputTokens`, 4–8K).

**Preço de varejo** (só estimativa nos logs e na resposta de imagem/vídeo; a cobrança continua desligada):
`créditos = (custo + US$0,05) × 1,5 ÷ US$0,03`.

**Imagem e vídeo** ficam desligados por padrão: exigem `VERTAL_CODE_AI_MEDIA_ENABLED=true` + `ALLOW_PAID` +
`OPENROUTER_API_KEY`, e continuam atrás da lista de liberação. O vídeo é assíncrono: `video` devolve um `job`
assinado (HMAC com o usuário), `video_status` consulta e devolve o link assinado do provedor; quando não há link,
`video_content` repassa os bytes.

**Provedor extra OpenAI-compatível** (opcional, por segredo): `VERTAL_EXTRA_PROVIDER_URL` (https, base `/v1`),
`VERTAL_EXTRA_PROVIDER_KEY`, `VERTAL_EXTRA_PROVIDER_MODELS` (ids por vírgula), `VERTAL_EXTRA_PROVIDER_COST`
(`free` padrão | `paid`), `VERTAL_EXTRA_PROVIDER_CONTEXT`. Entra depois dos grátis e antes dos pagos. Serve, por ex.,
para o catálogo da NVIDIA (`https://integrate.api.nvidia.com/v1`) ou o Ollama Cloud (`https://ollama.com/v1`).

Limites oficiais dos planos grátis (fontes abaixo, lidas em 24/11/2026):

- **OpenRouter `:free`**: 20 pedidos/min; **50 pedidos/dia** se a conta comprou menos de 10 créditos na vida;
  **1.000/dia** depois de comprar 10 créditos (uma vez). Criar mais contas/chaves não aumenta (limite global).
  Fonte: https://openrouter.ai/docs/api/reference/limits e FAQ.
- **Gemini API free tier**: limites por projeto, vistos no AI Studio; `gemini-4-hydrogen` e `gemini-3.8-flash` têm
  free tier. **No free tier o conteúdo pode ser usado para melhorar os produtos do Google** — não mande código de
  cliente sensível por essa rota. Fontes: https://ai.google.dev/gemini-api/docs/pricing e /rate-limits.
- **Groq free**: `openai/gpt-oss-120b` 30/min, 1.000/dia, 8K tokens/min, 200K tokens/dia. Fonte: https://console.groq.com/docs/rate-limits.
- **Cerebras**: **não tem plano grátis permanente** (só US$5 de teste por 30 dias, exige cartão). Ficou de fora.
  Fonte: https://inference-docs.cerebras.ai/support/rate-limits.

Um pedido do agente usa em média 2–5 chamadas (ler, editar, corrigir). Com 50/dia no OpenRouter dá ~10–25 pedidos;
com 1.000/dia, ~200–500. **As cotas grátis são da conta da Vertal, divididas entre todos os usuários**: servem para o
Laércio e beta testers, não para um produto aberto ao público (ver decisões).

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
- Modelo padrão do servidor próprio: Qwen2.5-Coder-7B-Instruct, **Apache-2.0**. Alternativas leves: Qwen3-4B e
  Qwen2.5-Coder-1.5B (Apache-2.0). **Evitar Qwen2.5-Coder-3B** (licença Qwen Research, restringe uso comercial).
- Nomes de provedores aparecem só nesta documentação e no código do servidor; a interface mostra apenas nomes Vertal.
- Fora de escopo por política: rotação de IP para burlar cotas grátis e catálogos de "jailbreak/sem censura" (violam os termos dos provedores).
