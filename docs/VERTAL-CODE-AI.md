# VERTAL Code AI

O cérebro de LLM próprio do Vertal Dev: agente de programação na nuvem (aditivo ao Vibe Code e ao
Vertal Chat), API compatível com OpenAI para desenvolvedores e agente de operação do Laércio.
**Tudo desligado por padrão.** Este documento é o único lugar onde aparecem nomes de terceiros; a
interface mostra só "VERTAL Code AI".

Estado: v1 em PR rascunho. Nada foi mergeado, publicado nem migrado. Verificações de preço/limite
de terceiros feitas em **24/11/2026** — refaça antes de ligar em produção.

---

## 1. O que existe nesta versão

| Peça | Onde | Liga com |
|---|---|---|
| Tela mobile (Plano / Construir, modelo, raciocínio, anexos, provedores próprios, revisão de diffs, Aplicar) | `src/components/vertal-code-ai/*`, rota `/vertal-code-ai` | `VITE_VERTAL_CODE_AI=true` (build) **ou** `localStorage["vertal-code-ai"]="on"` (só no aparelho) |
| Atalho no Vibe Code e "Programar no VERTAL Code AI" no Vertal Chat | `VertalCodeAiEntry.tsx` | mesmo interruptor; desligado não renderiza nada |
| Edge function do agente | `supabase/functions/vertal-code-ai` | `VERTAL_CODE_AI_ENABLED=true` |
| API VERTAL (OpenAI-compatível) + gestão de chaves | `supabase/functions/vertal-ai-api` | `VERTAL_AI_API_ENABLED=true` + migração proposta |
| Agente de operação (só Laércio) | `supabase/functions/vertal-code-ai-admin` | `VERTAL_CODE_AI_ADMIN_ENABLED=true` + `VERTAL_ADMIN_USER_IDS` + migração |
| Núcleo puro (roteamento, protocolo, diff, sandbox, preços, chaves, aprovações, relatórios) | `supabase/functions/_shared/vertalCodeAi/*` (reexportado em `src/lib/vertalCodeAi/core.ts`) | — |
| Kit Ollama em CPU | `infra/vertal-ollama/*` | manual; nada é criado |
| Migração **proposta, não aplicada** | `docs/vertal-code-ai/proposed-migration.sql` | aplicar deliberadamente |

### Arquivos compartilhados que mudaram (todos atrás de interruptor desligado)

- `src/App.tsx` — 1 import + rota `/vertal-code-ai` registrada só se o interruptor estiver ligado.
- `src/components/vibe-code/VibeTopBar.tsx` — 1 import + `<VertalCodeAiVibeEntry />` (devolve `null` desligado).
- `src/components/vertal-chat/VertalChat.tsx` — 1 import + `<VertalCodeAiChatHandoff />` (devolve `null` desligado).
- `supabase/config.toml` — `[functions.vertal-ai-api] verify_jwt = false` (a função autentica a chave `vtl_ai_` ela mesma; só vale no deploy).

Motor existente (`vibe-code-agent`), jogos (blueprint, qualidade, skills), Design Intelligence e
fluxos de código **não foram tocados**. `src/lib/vertalCodeAi/__tests__/regression.existing-engines.test.ts`
congela a saída deles em snapshot.

---

## 2. Arquitetura

```
 Celular (navegador)                        Supabase Edge Functions                     Fora
 ───────────────────                        ──────────────────────                      ────
 /vertal-code-ai  ── plan/build/fix ──►  vertal-code-ai ── cadeia grátis-primeiro ──► OpenRouter :free
   │  (revisão de diffs)                    │   (llm.ts)                             ► Gemini API (free tier)
   │                                        │                                        ► Groq (Free Plan)
   │                                        │                                        ► Ollama próprio (opcional)
   │                                        │                                        ► pago (só se ligado)
   │  ── sandbox_start/poll/update ──►      └─ orchestrator.ts ─────────────────────► E2B (vertalrun.com / e2b)
   │
   └─ Aplicar ──────────────────────────►  vibe-code-agent {apply:[{path,content,baseHash}]}  (caminho EXISTENTE:
                                              lint, conferência de hash, créditos, commit/cofre, checkpoint)
 Vertal Chat ── handoff (sessionStorage) ──► /vertal-code-ai em modo Plano
 Apps de terceiros ── Bearer vtl_ai_… ──►  vertal-ai-api /v1/chat/completions ── mesma cadeia
 Laércio ── modo Operação ──►  vertal-code-ai-admin ── leitura direta / cartões de aprovação ── auditoria cifrada
```

### Ciclo construir → testar → corrigir

1. **Plano** (opcional): lê árvore + até 8 arquivos relevantes e devolve passos, perguntas e riscos. Não grava nada.
2. **Construir**: o modelo devolve edições (`edit` com trechos `search/replace` exatos, `create`, `replace`).
   O servidor aplica em memória, gera **diff unificado** por arquivo, `baseHash` do original e avisos de lint/segredo.
3. **Testar** (se o sandbox existir): sobe o E2B pelo `orchestrator.ts` já existente, clona (operador) ou
   copia o cofre do projeto (cliente), grava as mudanças e roda em segundo plano `install → tsc → test → build`
   (ou o `testCommand` sugerido, filtrado). O navegador consulta a cada 5 s.
4. **Corrigir sozinho**: se falhar, manda o log resumido de volta no modo `fix` (até 0–3 rodadas, padrão 2).
5. **Revisão**: o usuário marca os arquivos e toca **Aplicar** → caminho `apply` do `vibe-code-agent`.
   Se alguém mudou o arquivo no meio, o hash não confere e o motor existente recusa.

Por que em segundo plano: `npm install` + checagens passam do tempo de uma edge function; o handle do sandbox
vai **cifrado** (AES-GCM, `CONNECTOR_ENC_KEY`) para o navegador, amarrado ao usuário e com validade de 25 min.
O token do GitHub vai só no cabeçalho do `git clone` (nunca em `.git/config`).

---

## 3. Modelos e roteamento grátis-primeiro

Perfis na interface (só marca Vertal) → cadeia interna (`models.ts`):

| Perfil | Planejar (ordem) | Construir/Corrigir (ordem) |
|---|---|---|
| Auto | Nemotron 3 Ultra 550B :free → Gemini 2.5 Pro (free) → ERNIE 5.5 Flash :free → Groq gpt-oss-120b → Particle-1 :free → openrouter/free | Particle-1 :free → ERNIE 5.5 Flash :free → Gemini 3.8 Flash (free) → Groq gpt-oss-120b → Nemotron Ultra :free → openrouter/free |
| Código | Particle-1 → ERNIE → Gemini 3.8 Flash → Groq qwen3.8-27b → openrouter/free | idem |
| Raciocínio | Nemotron Ultra → Gemini 2.5 Pro → Groq gpt-oss-120b → ERNIE → openrouter/free | Nemotron Ultra → Gemini 2.5 Pro → Particle-1 → gpt-oss-120b → openrouter/free |
| Rápido | Groq gpt-oss-120b → Gemini 3.5 Flash-Lite → Nemotron 3.5 Lightning :free → openrouter/free | Groq qwen3.8-27b → … |
| Visão | Gemma 4 31B :free → Gemini 3.8 Flash → Nemotron 3.5 Super VL :free → Particle-1 → openrouter/free | Particle-1 → Gemma 4 31B → … |
| Servidor próprio | Ollama (`VERTAL_OLLAMA_MODEL`, padrão `qwen2.5-coder:7b`) → Auto grátis | idem |
| Pro (pago) | DeepSeek `deepseek-chat` → OpenRouter `qwen/qwen3-coder` | só com `VERTAL_CODE_AI_PAID_ENABLED=true` |

Depois do perfil vêm **Ollama** (se houver) e por último o **pago** (se ligado). Backend sem chave é pulado.
Erro HTTP, timeout, resposta vazia ou JSON inválido → próximo. Pedido com imagem só vai para backends com visão.

**Por que estes padrões.** Lista pública `GET https://openrouter.ai/api/v1/models` em 24/11/2026 tinha 14 modelos
gratuitos; escolhemos os que suportam `tools`/`reasoning` e contexto ≥ 256K:
`particle-ai/particle-1:free` (pós-treinado para agente de código sobre DeepSeek V4.1 Flash — melhor aposta para editar),
`nvidia/nemotron-3-ultra-550b-a55b:free` (o maior e mais forte em raciocínio — planos e bugs difíceis),
`baidu/ernie-5.5-flash-preview:free` (código/agente, 1M de contexto), `google/gemma-4-31b-it:free` e
`nvidia/nemotron-3.5-super-vl:free` (visão), e `openrouter/free` (roteador sorteia um gratuito — rede de segurança).
Os IDs gratuitos mudam toda semana, então: (a) o servidor **descarta** IDs `:free` que sumiram da lista pública
(cache 1 h), e (b) `VERTAL_CODE_AI_MODELS` (JSON, ex.: `{"auto.build":["or:x/y:free","gemini:gemini-3.8-flash"]}`)
troca a ordem sem deploy de código.

### Camadas gratuitas verificadas (fontes oficiais, 24/11/2026)

| Provedor | Situação | Fonte |
|---|---|---|
| OpenRouter `:free` | Grátis com limite por minuto e por dia por conta; o teto diário sobe quem já comprou créditos (o valor exato não renderiza na página; a própria API informa em `GET /api/v1/key → free_model_daily_requests`, e a tela mostra "N pedidos grátis hoje"). Criar mais contas/chaves **não** aumenta o limite ("we govern capacity globally"). | https://openrouter.ai/docs/api-reference/limits |
| Gemini API | Free tier existe; "Free of charge" para Gemini 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 2.5 Pro, 2.5 Flash, Gemma 4. **No free tier o conteúdo é usado para melhorar produtos do Google.** Limites por projeto, vistos no AI Studio. | https://ai.google.dev/gemini-api/docs/pricing , https://ai.google.dev/gemini-api/docs/rate-limits |
| Groq | Free Plan: `openai/gpt-oss-120b` e `qwen/qwen3.8-27b` com 30 RPM, 1K pedidos/dia, **8K tokens/min**, 200K tokens/dia (TPM baixo: serve para pedidos curtos). | https://console.groq.com/docs/rate-limits |
| Cerebras | **Não tem camada grátis permanente**: só US$ 5 de teste por 30 dias, com cartão. Fica fora da cadeia padrão. | https://inference-docs.cerebras.ai/support/rate-limits |

Chaves (só Secrets do Supabase/env; nada no código): `OPENROUTER_API_KEY` **ou** `NAVIGATOR_OPENROUTER_KEY`
(já existe), `VERTAL_GEMINI_API_KEY`/`GEMINI_API_KEY` (opcional), `GROQ_API_KEY` (já usada no projeto),
`DEEPSEEK_API_KEY` (pago, só com a flag). **Nada de rotação de IP, várias contas ou burlar cota** — isso
viola os termos e o próprio OpenRouter diz que não funciona.

### Provedores próprios (usuário)
Qualquer API compatível com OpenAI, `https` público (endereços internos recusados). A chave fica no **Cofre de
Segredos** do Vertal; o navegador guarda só o nome (`MEU_PROVEDOR_KEY`), resolvido no servidor por
`resolveEnvForRun` (auditado). Limitação conhecida: DNS que aponta para IP interno depois da validação não é
bloqueado (rodamos na rede do Supabase, não na do Vertal); fase 2: resolver o IP e checar antes de chamar.

---

## 4. API VERTAL para desenvolvedores

```
POST https://<projeto>.supabase.co/functions/v1/vertal-ai-api/v1/chat/completions
Authorization: Bearer vtl_ai_…            Idempotency-Key: <opcional, 8–128 chars>
{"model":"vertal-code-ai-coder","messages":[{"role":"user","content":"…"}],"max_tokens":1024}
GET  …/vertal-ai-api/v1/models
POST …/vertal-ai-api/keys   (JWT do usuário)  {"action":"create|list|revoke|set_cap|usage", …}
```

Modelos públicos: `vertal-code-ai`, `-coder`, `-reasoning`, `-fast`, `-vision`. Funciona com SDKs OpenAI
(`baseURL = …/vertal-ai-api/v1`). Resposta sem nenhum dado do provedor real + `vertal.cost_credits`.
Fase 1: sem `tools`; `stream:true` devolve um único pedaço SSE + `[DONE]` (compatível, não incremental).
Domínio de marca (`api.vertal.dev/v1`): proxy no Worker do Cloudflare — fase 2.

**Chaves:** formato `vtl_ai_` + 43 chars; só o SHA-256 vai ao banco (padrão das chaves MCP/Cofre);
a chave inteira aparece uma vez. Até 10 ativas por conta. Cada chave tem teto mensal (créditos) e RPM.

**Ordem de cada pedido:** chave válida → RPM da chave (`bump_rate_limit`) → valida o corpo → mesmo
`Idempotency-Key` já atendido? devolve a resposta guardada, **sem cobrar** → saldo e teto para o **pior caso**
(`max_tokens`) → modelo → `vertal_ai_record_usage` (RPC atômica: grava o uso uma vez, acumula a fração, soma no
gasto da chave) → se a fração passou de 1 crédito, `execute_atomic_credit_deduction` com idempotência
`vai-<usage_id>`. Se o débito falhar (saldo sumiu no meio), o uso fica `owed` e bloqueia novos pedidos até pagar.

Erros no formato OpenAI: 401 chave inválida/revogada/expirada, 402 `insufficient_credits`, 429
`rate_limit_exceeded` ou `spend_cap_reached`, 503 `model_unavailable` (com `Retry-After`).

### Preços (config, não código)

`supabase/functions/_shared/vertalCodeAi/pricing.ts` + env `VERTAL_CODE_AI_PRICING` (JSON parcial;
inválido → padrão inteiro e aviso no log). Conta em microcréditos (1 crédito = 1.000.000 µc).

Fórmula padrão por 1M tokens: `(custo real US$ + infra US$ 0,05) × margem 1,5 ÷ US$ 0,03 por crédito`.
O crédito de referência (US$ 0,03) vem do Starter (US$ 4,99 por ~150 créditos/mês ≈ US$ 0,033), o mais
barato por crédito; assim nunca vendemos abaixo do custo.

| Classe (quem respondeu) | Custo real (US$/1M in / out) | Créditos por 1M in / out | ≈ US$ por 1M | Pedido típico 3K in + 1K out |
|---|---|---|---|---|
| Grátis | 0 / 0 | 2,5 / 2,5 | 0,075 / 0,075 | 0,011 crédito |
| Servidor próprio (VM paga) | 0,20 / 1,85 | 12,5 / 95 | 0,375 / 2,85 | 0,134 crédito |
| Pago (DeepSeek, tabela pública — confira) | 0,27 / 1,10 | 16 / 57,5 | 0,48 / 1,725 | 0,107 crédito |

\+ taxa de 0,001 crédito por pedido. Grátis é barato de propósito: o custo real é a cota diária, não dinheiro.

**Varejo dentro do Vertal** (créditos inteiros, `inApp` na mesma config): Plano 0, Construir 1, rodada de
correção 0 (inclusa), sandbox 0; no perfil Pro: Plano 1, Construir 4, correção 2 — alinhado ao Vibe Code
(flash 1 / pro 4). Cobrança idempotente por `requestId`.

---

## 5. Agente de operação ("o cérebro" do Vertal Dev)

Só o **operador**: papel `admin` (`has_role`) **e** id em `VERTAL_ADMIN_USER_IDS`. Para qualquer outro a
função responde 404 e a tela nem mostra o botão. Cliente do Vertal Chat usa o VERTAL Code AI para os
**próprios** projetos, sem poder de admin.

| Ferramenta | Risco | Fase |
|---|---|---|
| metrics_overview, credits_by_category, top_users (ids mascarados), recent_errors, list_prs, api_usage, ops_report | leitura — roda direto | 1 |
| send_report_email (padrão: só para o e-mail do Laércio; outros só em `VERTAL_ADMIN_REPORT_RECIPIENTS`) | chega a pessoas — cartão | 1 |
| revoke_api_key | destrutiva — cartão | 1 |
| set_key_cap | dinheiro — cartão | 1 |
| grant_credits, rerun_ci, trigger_deploy, notify_users | cartão | **spec** (servidor recusa) |

**Cartão de aprovação:** registro `pending` em `vertal_ai_approvals` + token HMAC-SHA256
(`VERTAL_ADMIN_APPROVAL_KEY`, ou `CONNECTOR_ENC_KEY`) que amarra id, admin, ferramenta, **hash dos argumentos**
e validade (15 min). Executar exige assinatura válida, mesmo admin, mesma ferramenta, **mesmos argumentos**, e
a troca atômica `pending → executing` (uso único). Tudo vai para `vertal_ai_audit` cifrado com o mesmo cofre do
`navigator_audit` (AES-256-GCM, AAD amarrado ao dono e ao tipo; segredos nunca entram).

**Relatórios:** "Relatório do dia/semana" (créditos gastos por área, usuários ativos, top 10 mascarado, erros
agrupados, uso da API, PRs abertos). Envio por e-mail pelo conector Gmail existente (`gmail-send-message`), com
cartão. O Laércio pode **subir um relatório** (txt/md/csv/json até 200 KB) e perguntar sobre ele.
Fase 2: envio agendado (cron) diário/semanal, receita em R$ (Stripe/Asaas), PDF.

---

## 6. Isolamento entre clientes

- Leitura do projeto: cliente lê **só o cofre do próprio projeto** (`vibe_project_files` por `user_id` +
  `project_id` com dono verificado por RLS). O repositório da plataforma (`GITHUB_REPO`) só para o operador —
  inclusive no sandbox (clone).
- **Aplicar**: o motor existente grava no GitHub da plataforma quando `GITHUB_TOKEN/GITHUB_REPO` estão
  configurados. Para cliente não escrever no repo do Vertal, `canApply=false` nesse modo (botão desligado).
  ⚠️ Achado: o **Vibe Code atual** já tem esse comportamento para todos os usuários. Não mexemos (é o motor
  existente), mas vale decidir (ver §9).
- Chaves/uso da API: toda gestão filtra por `owner_id`; RLS da migração proposta só deixa o dono ler.
- Sandbox: handle cifrado com o `user_id`; outro usuário não consegue usar.

---

## 7. Servidor próprio (Ollama em CPU)

**Oracle Always Free hoje (verificado em https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm):**
Ampere A1 = 1.500 OCPU-hora e 9.000 GB-hora por mês ≈ **2 OCPU e 12 GB** (antes eram 4/24 — muitos guias
ainda dizem 4/24). Instância ociosa (CPU p95 < 20% por 7 dias) pode ser recuperada pela Oracle.

Modelo recomendado: **`qwen2.5-coder:7b`** (Q4_K_M, 4,7 GB, Apache-2.0). Rápido: `qwen2.5-coder:1.5b`
(Apache-2.0). Evite o `3b` (licença não-Apache, uso comercial restrito).

| Cenário | Velocidade esperada (estimativa; meça com `bench.sh`) | Custo |
|---|---|---|
| A1 Always Free 2 OCPU/12 GB, 7B Q4 | ~2–4 tok/s de saída; edição de 400 tokens ≈ 2–3 min | US$ 0 (se houver capacidade na região) |
| A1 2 OCPU, 1.5B Q4 | ~8–15 tok/s | US$ 0 |
| A1 pago 4 OCPU/24 GB, 7B Q4 | ~5–8 tok/s (relatos públicos) | ≈ US$ 0,01/OCPU-h + RAM ≈ US$ 30–40/mês |
| VM `vertal-e2b-vm` existente (2 vCPU, 12,9 GB, hugepages do E2B) | disputa CPU com os sandboxes e o navegador do Navigator | **não recomendado** fora de teste |

Conclusão honesta: CPU serve como **reserva** quando a cota grátis acaba ou para tarefas curtas; não substitui
os modelos grandes gratuitos em qualidade nem em velocidade.

Kit (`infra/vertal-ollama`): `docker-compose.yml` (Ollama só em 127.0.0.1, 1 pedido por vez, modelo sempre
carregado), `Caddyfile` (HTTPS automático + `Authorization: Bearer` obrigatório, só `/v1/chat/completions` e
`/v1/models` abertos), `setup.sh`, `bench.sh`, `.env.example`. Passos: criar VM Ubuntu ARM, abrir 80/443 na
Security List, DNS `llm.vertal.dev` → IP, `./setup.sh`, `./bench.sh`, e no Supabase:
`VERTAL_OLLAMA_URL`, `VERTAL_OLLAMA_TOKEN`, `VERTAL_OLLAMA_MODEL`.

---

## 8. Custos (resumo)

- Modelos: **US$ 0** nas camadas gratuitas, limitadas pela cota diária de cada provedor.
- Sandbox: E2B self-hosted na VM Oracle existente → custo marginal ~0 (CPU/RAM limitados; ver capacidade em `VERTAL_NAVIGATOR.md`).
- Edge functions: dentro do plano Supabase atual.
- Ollama: US$ 0 (Always Free) a ~US$ 40/mês (A1 4 OCPU pago).
- Pago: só se ligado, e cobrado do usuário pela tabela (margem 1,5×).

## Qualidade, sem exagero

Comparado a Cursor, Lovable e Replit (que usam modelos de ponta pagos e índices do repositório):
- Os gratuitos de hoje são bons para edições focadas e apps pequenos/médios; em refatorações grandes e bugs sutis
  ficam atrás. A cota grátis acaba em uso pesado; aí cai para Ollama (lento) ou pago.
- Contexto por seleção de arquivos por palavra-chave (sem embeddings/índice semântico) — pode faltar arquivo.
- Respostas não são incrementais (sem streaming) e o modelo do OpenRouter `:free` muda sem aviso.
- Pontos fortes reais: 100% nuvem e no celular, plano antes de mexer, teste no sandbox com auto-correção,
  revisão de diff antes de gravar, custo quase zero, sem trocar o motor existente.

---

## 9. Fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 (este PR) | Tela, ciclo plano→construir→testar→corrigir, roteamento grátis-primeiro, provedores próprios, anexos/imagens, handoff do Chat, API OpenAI-compatível com chaves/medição/débito/tetos, preços em config, agente de operação (leituras + 3 ações com cartão), relatórios e ingestão, kit Ollama, testes | código pronto, **desligado**; precisa da migração |
| 2 | Streaming real (SSE) na tela e na API; `tools` na API; domínio `api.vertal.dev`; envio agendado de relatórios; receita em R$; executores `rerun_ci`/`grant_credits` com cartão; página pública de preços/docs da API; checagem de DNS rebinding | spec |
| 3 | Índice semântico do repositório (embeddings) para contexto; multi-agente (planner/coder/reviewer) reaproveitando o Vibe Reviewer; preview ao vivo do sandbox na tela | spec |

## 10. Como ligar (quando aprovado)

1. Revisar e aplicar `docs/vertal-code-ai/proposed-migration.sql` (só API e operação dependem dela).
2. Secrets: `VERTAL_CODE_AI_ENABLED=true`; opcional `VERTAL_CODE_AI_ALLOWED_USERS` (beta fechado),
   `VERTAL_ADMIN_USER_IDS=<id do Laércio>`, `VERTAL_ADMIN_APPROVAL_KEY` (32+ chars), `VERTAL_AI_API_ENABLED`,
   `VERTAL_CODE_AI_ADMIN_ENABLED`, `VERTAL_CODE_AI_PRICING`, `VERTAL_CODE_AI_MODELS`, chaves dos provedores.
3. Front: `VITE_VERTAL_CODE_AI=true` no build, ou só no celular: `localStorage.setItem("vertal-code-ai","on")`.
4. Deploy das funções `vertal-code-ai`, `vertal-ai-api`, `vertal-code-ai-admin`.

## 11. Decisões em aberto (Laércio)

1. Aplicar a migração proposta? (sem ela: tela funciona; API e operação não.)
2. Preços: crédito de referência US$ 0,03 e margem 1,5× estão bons? Construir = 1 crédito no grátis?
3. Ligar o perfil Pro (pago)? Qual provedor/modelo e teto?
4. Usar o free tier do Gemini sabendo que o conteúdo é usado pelo Google para treino? (padrão: só com chave configurada.)
5. Repositório da plataforma: cliente do Vibe Code atual pode gravar no `GITHUB_REPO` do Vertal — manter, ou mover clientes para o cofre/um repo por usuário?
6. Ollama: criar a VM Always Free (2 OCPU/12 GB) e qual domínio?
7. Quem além do Laércio recebe relatórios (`VERTAL_ADMIN_REPORT_RECIPIENTS`)?
8. Domínio de marca da API (`api.vertal.dev`) e página pública de docs/preços.
