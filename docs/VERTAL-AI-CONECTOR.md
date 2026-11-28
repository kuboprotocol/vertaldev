# Conector "Vertal AI" (o "Lovable AI" do Vertal Dev)

Quando um app criado no Vertal Dev precisa de IA (texto, vídeo, voz), o agente oferece o conector
**Vertal AI**. Um clique e o app já chama a nossa API white-label, sem o Dev configurar variável
nenhuma e sem chave no código do navegador.

Desligado por padrão. Nada muda para ninguém enquanto a flag estiver desligada.

## Fluxo (do clique ao código)

1. O Dev pede, no Vibe Code: "crie um app gerador de vídeo com IA" (ex.: SunkAI).
2. `vibe-code-agent` chama `vertalAiForRequest` (`_shared/vertalAiConnectorStore.ts`). Com a flag e a
   allowlist, detecta IA no pedido (`detectAiNeeds`: texto/vídeo/voz) e, se o projeto ainda não tem o
   conector, manda o passo `vertal_ai` com `offer` e põe `VERTAL_AI_OFFER_PROMPT` no prompt (o agente
   monta as telas sem integrar outro provedor e sem pedir variáveis).
3. O chat mostra o cartão **Ativar Vertal AI** (`src/components/vertal-ai/VertalAiOfferCard.tsx`, só com
   `VITE_VERTAL_AI_CONNECTOR=true`). O clique chama `POST …/vertal-ai-api/connector {action:"activate", projectId, needs:{video}}`.
4. O servidor (`vertal-ai-api/connector.ts` → `ensureProjectConnector`) cria **uma** chave `vtl_ai_…`
   escopada ao projeto com a **mesma função do /keys** (`_shared/vertalCodeAi/apiKeysStore.ts`:
   limite de 10 chaves, `parseNewKey`, só o hash no banco), teto mensal e rpm padrão, `features.connector =
   {project, ref}` e `features.video = true` quando o app precisa de vídeo. Guarda a chave e a base URL
   no Cofre do Dev. Nunca devolve a chave para o navegador.
5. O cartão manda sozinho o pedido seguinte ("Conecte a IA deste app à Vertal AI…"). Agora o projeto
   tem conector ativo: o agente recebe `formatVertalAiForPrompt` (use o helper, gere vídeo com
   `generateVideo`, nunca peça variáveis, nunca use outros provedores) e o `vibe-code-agent` injeta dois
   arquivos determinísticos que o agente não pode sobrescrever:
   - `src/lib/vertalAi.ts` — helper do navegador: `chat`, `startVideo`/`getVideo`/`generateVideo`
     (`/v1/videos/generations` + polling), `speak`, `VertalAiError` (402 = créditos esgotados).
     Fala com o **proxy do projeto** `…/vertal-ai-api/p/<ref>`, URL pública e sem chave.
   - `supabase/functions/vertal-ai/index.ts` — proxy de servidor para quem publica com backend próprio
     (lê `VERTAL_AI_API_KEY` / `VERTAL_AI_BASE_URL` do ambiente do servidor).
6. O cartão de requisitos mostra **Vertal AI · conectado** e tira pedidos de chave de outros provedores
   de IA (OpenAI, Anthropic, Gemini…), a menos que o Dev tenha pedido um deles explicitamente.

**Vertal Chat:** com a flag, quando a conversa fala de app com IA, entra `VERTAL_AI_RULES`: o chat
oferece uma vez; se o Dev aceitar, manda `vibe_code` com `"vertal_ai":true` e o `vibe-code-agent` ativa
(idempotente) antes de gerar. Sem projeto, o escopo é `default` (uma chave para os pedidos sem projeto).

**VERTAL Code AI:** com a flag, quando o pedido fala de IA, `withVertalAiHint` anexa a regra ao PEDIDO
(o prompt de sistema não muda): usar a Vertal AI pelo servidor e nunca pedir variáveis nem outros provedores.

## Vertal Chat e consciência de conectores (fix 28/11, depois do teste SunkAI)

**O que falhou no teste do Laércio (28/11 07:08, Vertal Chat):** o app SunkAI tinha sido criado às 01:38 pela
ferramenta `app` do chat (HTML único via `generate-code`, que não conhece o conector). Às 07:08/07:09 o
`creative-router` respondeu só com texto: escreveu "[artefato a3: aplicativo …]" sem rodar ferramenta e pediu
`VERTAL_API_KEY` nas variáveis de ambiente / painel de segredos (regra do `api_request`). `VERTAL_AI_RULES`
só sabia oferecer por `vibe_code`, o chat não tinha cartão e o conector da conta seguia inativo.

**Agora (mesma flag + allowlist; flag off = nada muda, sem tocar no banco):**
- `_shared/vertalAiChat.ts` (puro) + `_shared/vertalAiChatStore.ts` (só leitura de nomes/status).
- Antes de responder, o chat e o Vibe Code leem **CONECTORES DO DEV**: Vertal AI (ativa ou não), Login Vertal,
  MetaMask (rede), Fluxos conectados, nomes do Cofre. Nunca valores.
- Decisão por rodada no chat: `active` (conector da conta já existe) → usa; `activate` (o Dev disse "use a Vertal AI",
  "a chave já está conectada", "conecte a LLM", citou `VERTAL_API_KEY`… em pt/en/es) → ativa sem perguntar;
  `offer` (app com IA, sem pedido) → cartão **Ativar Vertal AI** no chat (um clique, escopo `default`).
- Reescrita determinística das ações: `app` de app com IA → `vibe_code` (projeto real, onde entram
  `src/lib/vertalAi.ts` e o proxy `/p/<ref>`), com `"vertal_ai":true` quando ativo/ativando; `open_panel secrets`
  sai (a menos que o Dev peça o painel); pedido explícito sem build → `vibe_code` continue/start. Na rodada com
  resultados não repete o build.
- Resposta limpa: sem "[artefato …]" inventado, sem pedir env/chave/Vercel/.env/painel de segredos, `VERTAL_API_KEY`
  → `VERTAL_AI_API_KEY`, `VERTAL_API_URL` → `VERTAL_AI_BASE_URL`.
- Vibe Code: pedido explícito ativa sem cartão (`vertalAiForRequest`); código gerado com `VERTAL_API_KEY`
  (inclusive `VITE_`/`NEXT_PUBLIC_`) vira os nomes do servidor; requisito "Vertal AI API"/`VERTAL_API_KEY` sai; resposta
  final sem "configure a chave".
- Linhas novas no motor (só adição, todas com `vertalAi`): `creative-router/index.ts` (2 imports, snapshot, contexto,
  reescrita, `reply`/`vertal_ai_offer` na resposta), `_shared/chatAgent.ts` (campo `vertalAiConnectors` + linha do prompt),
  `vibe-code-agent/index.ts` (2 imports, bloco de conectores, nomes no código, resposta). Front: `useVertalChat.ts`
  (estado do cartão) e `VertalChat.tsx` (cartão; arquivo entrou em `CONNECTOR_FLAGGED`).
- Testes: `src/test/vertal-ai-chat.test.ts` (pedido SunkAI exato em `src/test/fixtures/sunkai-request.txt`).
- Lacuna: a ferramenta `app` (HTML único) e o /builder seguem sem conector; app com IA sai dela para o Vibe Code.

## Onde a chave fica e como é protegida

- **Banco:** `vertal_ai_api_keys` guarda só o SHA-256 (como no /keys). A chave inteira existe uma vez, na criação.
- **Cofre do Dev** (`kubo_secrets`, AES-GCM com `CONNECTOR_ENC_KEY`, sem acesso de `anon`/`authenticated`):
  `VERTAL_AI_API_KEY_P<12 hex do projeto>` e `VERTAL_AI_BASE_URL_P<…>` (o Cofre é único por dono+variável,
  então cada projeto tem o seu sufixo), grupo `vertal-ai`, `bound_to = vertal-ai-p<…>`. O app as recebe
  com os nomes sem sufixo (`projectEnvFromVault`). Criação, troca, remoção e cada uso pelo proxy entram
  na auditoria do Cofre (`kubo_secret_audit`), sem valores.
- **Navegador:** só o `ref` público (`vapp_…`). O proxy troca o ref pela chave **dentro do servidor**,
  reentra nas rotas de sempre da API (mesma medição e cobrança) e só libera rotas de app: `GET /v1/models`,
  `POST /v1/chat/completions`, `POST /v1/videos/generations`, `GET /v1/videos/{id}`, `POST /v1/audio/speech`,
  `GET /v1/voice-jobs/{id}`, `GET /v1/voices[/languages]`. Gestão de chaves, criação de voz clonada e canto ficam fora.
- **Abuso do ref:** quem copiar o ref de um app publicado consegue gastar até o teto mensal da chave
  (padrão 200 créditos) a 20 pedidos/minuto. Defesas: teto mensal + rpm por chave, lista de origens do
  navegador (`VERTAL_AI_CONNECTOR_ALLOWED_ORIGINS`; padrão domínios do Vertal, `*.pages.dev`, E2B e localhost),
  revogação imediata no /keys (o proxy relê a linha a cada pedido) e o dono fora da allowlist para na hora.
  Origem é só defesa extra (cliente fora do navegador pode forjar). Próximo passo sugerido: exigir o JWT
  do usuário final do app (Login Vertal) no proxy.

## Cobrança

O conector não cobra nada. O uso passa pelas mesmas rotas da API, então vale exatamente o que a API já
aplica para o dono da chave: com a cobrança v2 ligada para a conta (`VERTAL_BILLING_V2_ENABLED`),
atacado = custo real × 1,20 nos créditos do dono, clonagem/raspagem recusadas (403) e saldo zero → 402.
Sem a v2, vale a tabela antiga da API. Uma cobrança por pedido (idempotente por chave + Idempotency-Key).

## Flags (VERTAL_GPU_CONFIG ou segredo avulso; desligado por padrão)

| Chave | Padrão | O que faz |
|---|---|---|
| `VERTAL_AI_CONNECTOR_ENABLED` | off | Liga o conector (oferta, ativação, proxy). Off = `/connector` e `/p/…` não existem. |
| `VERTAL_AI_CONNECTOR_USER_IDS` | `5441b397-7be8-44fc-87e8-8057fdb79a0e` (Laércio) | Allowlist. `*` = todos. |
| `VERTAL_AI_CONNECTOR_MONTHLY_CAP_CREDITS` | 200 | Teto mensal da chave do projeto. |
| `VERTAL_AI_CONNECTOR_RPM` | 20 | Pedidos por minuto da chave do projeto. |
| `VERTAL_AI_CONNECTOR_VIDEO` | on | Libera `/v1/videos` na chave quando o app precisa de vídeo. |
| `VERTAL_AI_CONNECTOR_ALLOWED_ORIGINS` | domínios do Vertal + E2B + localhost | Origens aceitas no proxy (`*` = qualquer). |
| `VERTAL_AI_CONNECTOR_BASE_URL` | `${SUPABASE_URL}/functions/v1/vertal-ai-api` | Base URL pública. |
| `VERTAL_AI_API_ENABLED` | (já ligado) | O conector exige a API no ar. |
| `VITE_VERTAL_AI_CONNECTOR` (front) | off | Mostra o cartão "Ativar Vertal AI". |

Exemplo para ligar só para o Laércio: acrescentar ao `VERTAL_GPU_CONFIG`
`"VERTAL_AI_CONNECTOR_ENABLED": true, "VERTAL_AI_CONNECTOR_USER_IDS": ["5441b397-7be8-44fc-87e8-8057fdb79a0e"]`
e `VITE_VERTAL_AI_CONNECTOR=true` no build do front.

## Mudanças no motor (todas só linhas novas, atrás da flag)

Listadas em `CONNECTOR_FLAGGED` no `scripts/vertal-code-ai/engine-guard.mjs` (só podem ENTRAR linhas do
conector; nenhuma existente muda). Com a flag off, `vertalAiForRequest` devolve `{mode:"off"}` sem tocar
no banco, e prompt, arquivos, passos e requisitos ficam idênticos (testes "engine guard").

- `supabase/functions/vibe-code-agent/index.ts`: imports; campo `vertalAi` no corpo; estado do conector
  antes do prompt (+ passo de oferta); `vertalAiPromptBlock` no prompt; injeção dos 2 arquivos e passo
  "IA do app conectada"; ajuste dos requisitos.
- `supabase/functions/_shared/chatAgent.ts`: `VERTAL_AI_RULES`, `ctx.vertalAi`, membro `vertalAi: true` da
  ação `vibe_code` e leitura de `"vertal_ai":true`.
- `supabase/functions/creative-router/index.ts`: `vertalAiOn` (flag + allowlist + conversa de app com IA).
- `src/lib/chatAgent/vibeBridge.ts`: manda `vertalAi:{enabled:true}` quando o Dev aceitou no chat.
- `src/lib/vibeCodeAgentTypes.ts`: passo `vertal_ai` e campo `vertalAi`.
- `src/components/vibe-code/VibeCodeAgentChat.tsx`: ícone do passo e o cartão.

## Lacunas conhecidas

- Imagem: a API white-label ainda não tem `/v1/images`; o agente avisa e não usa outro provedor.
- O executor de plano (`plan.ts`) e o gerador do /builder (`generate-code`) não recebem o conector.
- Corrida de cliques: resolvida no código (fica a chave mais antiga, as outras são revogadas). O índice
  único proposto em `docs/vertal-code-ai/proposed-migration-vertal-ai-connector.sql` (NÃO aplicado) fecha isso no banco.
- `/keys` mostra a chave do conector como uma chave comum ("Vertal AI · <projeto>"); revogar lá desliga o app.
