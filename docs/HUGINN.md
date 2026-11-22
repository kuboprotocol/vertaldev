# Huginn no Vertal Chat

[Huginn](https://github.com/huginn/huginn) (licença MIT) é um sistema de agentes em Ruby on Rails: agentes que vigiam sites, feeds e APIs, emitem eventos e reagem a eventos de outros agentes. Este plugin liga a instância Huginn do cliente ao Vertal Chat, ao painel de agentes e ao plugin do Automatisch.

Nada aqui cria uma edge function nova (o Supabase está no limite de 100): tudo passa pelo `creative-router` (tool `huginn`).

## Marca branca (o que o usuário vê)

Para quem usa o Vertal Chat e o painel de agentes, o Huginn é o **Vertal Agentes** e o Automatisch é o **Vertal Fluxos**. Nenhum texto de interface, cartão de permissão, mensagem de erro, rótulo do Cofre ou prompt do chat cita os nomes dos motores nem de provedores de hospedagem (Railway etc.), e o endereço da instância (`*.up.railway.app`) não aparece: o painel mostra só o botão "Abrir Vertal Agentes". O prompt do chat leva a regra `BRAND_RULES` sempre que uma das duas ferramentas está ligada. Os ids internos não mudaram: ferramentas `huginn`/`automatisch`, segredos `HUGINN_*`/`AUTOMATISCH_*`, slugs dos conectores e nomes no código. O teste `src/test/whitelabel-vendor-names.test.ts` falha se um nome de fornecedor voltar a um texto visível.

Licenças (Huginn MIT, Automatisch AGPL-3.0 com a oferta de código-fonte para uso em rede): [LICENCAS-TERCEIROS.md](./LICENCAS-TERCEIROS.md). Não há entrada de licença na interface.

## Peças

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Núcleo | `supabase/functions/_shared/huginnCore.ts` | Valida as operações, faz o login por sessão (Devise + CSRF), chama as rotas JSON do Huginn e filtra a resposta (sem senha, cookie, token CSRF nem opções com nome de segredo). |
| Ponte | `supabase/functions/_shared/huginnBridge.ts` | Liga Huginn ↔ Automatisch reutilizando o executor do Automatisch (`automatischCore.ts`). |
| Servidor | `supabase/functions/creative-router/index.ts` (`handleHuginn`) | Exige `confirmed: true`, lê os segredos do Cofre, fixa o host (sem seguir redirecionamento), limite de 20 chamadas/min e registra em `connector_activity_logs` (slug `huginn`). |
| Contrato do chat | `supabase/functions/_shared/chatAgent.ts` | Ação `{"tool":"huginn",…}`; a ferramenta só entra no prompt quando a conversa fala de Huginn (`wantsHuginn`). Ao cortar o prompt, Huginn e Automatisch ficam e GitHub/YouTube saem antes. |
| Navegador | `src/lib/huginn/client.ts`, `src/lib/chatAgent/runAction.ts` (`runHuginn`) | Cartão de permissão em TODA chamada (leitura também), com os nomes dos segredos. Segredo faltando ou login recusado abrem o Cofre. |
| Painel de agentes | `src/components/huginn/HuginnAgentsCard.tsx` em `/agents` (painel “Habilidades” do chat) e `/vibe-agents` | Status, lista de agentes, ativar/desativar, rodar e link para abrir a instância. Só chama o Huginn quando o usuário clica. |
| Conector | `src/lib/connectorsConfig.ts` (slug `huginn`) | Leva ao Cofre com `HUGINN_URL`. |

## Operações (`op`)

| op | Chamada no Huginn | Escreve? |
| --- | --- | --- |
| `status` | `GET /worker_status` | não |
| `list_agents` (`page`, `scenario_id`) | `GET /agents.json` | não |
| `get_agent` (`agent_id`) | `GET /agents/:id.json` + `GET /agents/:id/events.json` (5 últimos) | não |
| `list_events` (`agent_id?`, `page`) | `GET /agents/:id/events.json` ou `GET /events.json` | não |
| `list_scenarios` | `GET /scenarios.json` | não |
| `create_agent` (`type`, `name`, `options{}`, `schedule`, `source_ids[]`, `receiver_ids[]`, `scenario_ids[]`, `keep_events_for`, `propagate_immediately`, `disabled`) | `POST /agents.json` (`options` vai como JSON em texto, igual ao formulário) | sim |
| `import_scenario` (`scenario{}` no formato de exportação) | `POST /scenarios/scenario_imports` (só HTML; sucesso = 302 para `/scenarios/:id`) | sim |
| `run_agent` (`agent_id`) | `POST /agents/:id/run.json` (enfileira `AgentCheckJob`) | sim |
| `set_agent_enabled` (`agent_id`, `enabled`) | `PUT /agents/:id.json` `{agent:{disabled}}` | sim |
| `send_webhook_event` (`agent_id`, `payload{}`) | `POST /users/:user_id/web_requests/:agent_id/:secret` (o segredo é lido das opções do agente no servidor) | sim |
| `connect_to_automatisch` (`source_agent_id`, `flow_id`, `name?`) | ponte, ver abaixo | sim |
| `connect_from_automatisch` (`step_id`, `webhook_agent_id?`, `name?`, `data?`) | ponte, ver abaixo | sim |

Recusados de propósito: `ShellCommandAgent` (roda comandos no servidor) ao criar e ao importar; apagar agentes; importar cenário por URL.

## Como o Huginn é chamado (conferido no código e na instância real)

O Huginn não tem API REST formal. Conferido em `config/routes.rb`, `app/controllers/*` e `config/initializers/devise.rb` (Rails 8.1, Devise 5) e testado contra a instância no Railway em 22/11/2026:

1. `GET /users/sign_in` → cookie `_rails_session` + `<meta name="csrf-token">`.
2. `POST /users/sign_in` (form) com `authenticity_token`, `user[login]` (usuário ou e-mail), `user[password]`, `user[remember_me]=0` → `302` para `/` = logado. Senha errada volta o formulário (sem 302).
3. O Devise troca o token CSRF ao logar. Antes da 1ª escrita, `GET /` lê o token novo; o cookie renovado por essa página é o que vai na escrita (o token antigo dá `422`).
4. Escritas levam `X-CSRF-Token`. O cookie é descartado no fim da requisição (sem “lembrar de mim”).
5. O JSON dos agentes **não traz o tipo** (`type`). Um WebhookAgent é reconhecido pelas opções (`secret` + `payload_path`/`verbs`/…); se errar, o próprio Huginn recusa o POST.
6. O importador de cenários exige `guid` no cenário e `guid`/`disabled` em cada agente (sem eles dá 500); o núcleo completa esses campos e usa `schema_version: 1`.

## Ponte Huginn ↔ Automatisch

- **“Quando o Huginn detectar X, rode o fluxo Y do Automatisch”** → `connect_to_automatisch`. O servidor lê o fluxo no Automatisch, pega a URL do gatilho Webhook (app `webhook` → `catchRawWebhook`, URL `/webhooks/flows/:id` ou `/webhooks/flows/:id/sync`) e cria no Huginn um **PostAgent** que recebe os eventos do agente de origem e faz `POST` JSON nessa URL (`no_merge: false`, então o evento vai inteiro; `emit_events: true` guarda a resposta). Com o fluxo em rascunho, o Automatisch registra o pedido só como teste; publicado, roda as ações.
- **“Quando o fluxo Y rodar, avise o Huginn”** → `connect_from_automatisch`. Cria no Huginn um **WebhookAgent** (segredo aleatório de 48 hex) ou reusa `webhook_agent_id`, e configura o passo de ação do Automatisch como **HTTP Request → Custom request** (`POST`, `Content-Type: application/json`, `data` opcional com variáveis do Automatisch). O passo fica incompleto até `test_step` e o fluxo precisa ser publicado. A URL (com o segredo) vai só para o Automatisch; o chat recebe a URL mascarada.

A ponte usa os dois conjuntos de segredos (`HUGINN_*` e `AUTOMATISCH_*`), e o cartão de permissão mostra os seis nomes.

## Segredos (Cofre de segredos do Vertal, por usuário)

| Nome | Valor |
| --- | --- |
| `HUGINN_URL` | `https://<seu-huginn>.up.railway.app` |
| `HUGINN_USERNAME` | usuário ou e-mail do Huginn |
| `HUGINN_PASSWORD` | senha desse usuário |
| `HUGINN_INVITATION_CODE` | opcional; não é usado pelo chat (só serve para cadastrar outros usuários na instância) |

O `creative-router` lê esses nomes do Cofre (`kubo_secrets`, cifrado) do usuário que está no chat; não há fallback para variáveis globais da função, para que um cliente nunca use a instância de outro.

## Hospedagem (Railway)

Kit em `infra/huginn/`:

- `railway-create.sh`: cria `huginn-postgres` (imagem `ghcr.io/railwayapp-templates/postgres-ssl:18` + volume) e `huginn` (imagem `ghcr.io/huginn/huginn`, web + jobs no mesmo contêiner), domínio público na porta 3000 e redeploy.
- `railway.env.example` e `postgres.env.example`: variáveis.

Decisões de tamanho mínimo: um contêiner só para web e jobs (imagem multi-process), `WEB_CONCURRENCY=1` (puma sem cluster), `RAILS_MAX_THREADS=3`, `DELAYED_JOB_MAX_MEMORY=384`, Postgres próprio (não toca no Postgres do Automatisch). O admin é criado no 1º boot com `SEED_USERNAME`/`SEED_PASSWORD` aleatórios (nunca `admin`/`password`), `INVITATION_CODE` aleatório, `TIMEZONE=Brasilia`, `FORCE_SSL=true`.

Custo (preços do Railway em 22/11/2026: RAM US$10/GB/mês, CPU US$20/vCPU/mês, volume US$0,15/GB/mês, https://docs.railway.com/reference/pricing/plans): medido no 1º boot, o Huginn ficou em ~0,83 GB de RAM com 2 workers do puma e quase nada de CPU, e o Postgres em ~0,1 GB. Isso dá cerca de **US$ 8–11/mês** de uso; com `WEB_CONCURRENCY=1` a expectativa é ficar perto do limite de baixo. Esse uso soma ao do projeto e é descontado dos US$5 incluídos no plano Hobby.

## Deploy do código

1. Merge do PR em `main`: o workflow `deploy.yml` publica as edge functions existentes (inclui `creative-router`). Não há função nova.
2. O Worker (`worker/`) não muda neste PR.
3. No Cofre do usuário: `HUGINN_URL`, `HUGINN_USERNAME`, `HUGINN_PASSWORD`. Para a ponte, também `AUTOMATISCH_URL`, `AUTOMATISCH_EMAIL`, `AUTOMATISCH_PASSWORD`.
4. Teste no chat: “liste meus agentes do Huginn” → aprovar o cartão.
