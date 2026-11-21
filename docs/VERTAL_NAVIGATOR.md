# Vertal Navigator (fase 1) — navegador na nuvem com sessão persistente

O usuário pede no Vertal Chat, por exemplo: **"entre no meu GitHub e me diga quantas notificações eu tenho"**.
Um agente (browser-use) opera um Chromium real num sandbox E2B self-hosted (vertalrun.com). O usuário
acompanha a tela ao vivo no painel, pode **assumir o controle** (ex.: fazer login à mão), responde ao
**código 2FA** quando o site pedir e **aprova** qualquer clique de pagar/comprar/confirmar pedido.
Os cookies ficam salvos cifrados por usuário: na próxima sessão o login continua valendo.

Nada do que já existia foi removido: `browser_form` (Cloudflare Browser Run, sem estado), cofre
`kubo-secrets`, conectores, Spotify etc. continuam iguais. O Navigator só soma.

## Arquitetura

```
Vertal Chat / Vibe Code (navegador do usuário)
  │  modelo: {"tool":"navigator","op":"run|open|stop", ...}       (Vibe Code: "/navegar <tarefa>")
  ▼
src/lib/chatAgent/runAction.ts ─ runNavigator ─► src/lib/navigator/store.ts (1 poller de /status)
  │                                                │      ▲
  │   NavigatorPanel (iframe noVNC, passos,        │      │ aprovação / código 2FA / assumir controle
  │   "Assumir controle", campo 2FA)               │      │ (NavigatorApprovalDialog, estilo FormApprovalDialog)
  ▼                                                ▼      │
Worker vertal.dev  /api/navigator/*  (JWT do Supabase) ───┘
  │  worker/navigatorRoutes.ts  ─ sessões, limites, cobrança/minuto, cofre, cookies
  │  worker/e2bClient.ts        ─ API do E2B + navd
  │  worker/navigatorCrypto.ts  ─ AES-GCM com a CONNECTOR_ENC_KEY (mesmo formato do cofre)
  ▼
E2B self-hosted (VM Oracle vertal-e2b-vm, api.vertalrun.com, portas em https://<porta>-<id>.vertalrun.com)
  └─ sandbox "vertal-browser" (infra/vertal-browser)
       navd :8787   daemon (aiohttp) que o Worker controla; roda o agente browser-use 0.13.14
       Chromium     CDP só em 127.0.0.1:9222, perfil em /home/user/.vertal-profile
       Xvfb :99 → x11vnc (127.0.0.1:5900, senha de ver ≠ senha de controlar) → websockify/noVNC :6080
```

### Rotas do Worker

Todas `POST`, `Authorization: Bearer <JWT do Supabase>`, resposta `{ok, status, message?, ...}`.

| Rota | Corpo | Faz |
|---|---|---|
| `/api/navigator/start` | `{url?}` | Reaproveita a sessão viva do usuário ou cria um sandbox, restaura os cookies e devolve `liveViewUrl` (só ver). Cobra o 1º minuto. |
| `/api/navigator/task` | `{sessionId, task, url?, maxSteps?}` | Envia a instrução ao agente (browser-use) no sandbox, com os **nomes** dos segredos do cofre vinculados a um domínio. |
| `/api/navigator/status` | `{sessionId, after?}` | Passos novos (texto), pedidos pendentes, screenshot JPEG, URL atual. Resolve pedidos de segredo no servidor. Cobra os minutos devidos e renova o timeout do sandbox. Salva cookies quando uma tarefa termina. |
| `/api/navigator/input` | `{sessionId, requestId, kind:"approval", approve, confirmed}` ou `{…, kind:"code"\|"text", value}` | Resposta do usuário. Aprovar pagamento exige `confirmed: true` (só o botão do cartão envia). |
| `/api/navigator/takeover` | `{sessionId}` | Pausa o agente e devolve `controlUrl` com uma **senha de controle nova**. |
| `/api/navigator/release` | `{sessionId}` | Troca a senha de controle de novo (a URL antiga deixa de controlar), retoma o agente e salva os cookies. |
| `/api/navigator/stop` | `{sessionId}` | Salva os cookies, para o agente, encerra o sandbox, cobra o restante. |
| `/api/navigator/forget` | `{}` | Apaga os cookies salvos do usuário. |

`status` pode ser `ok`, `blocked_url`, `busy`, `capacity`, `no_session`, `session_ended`, `not_pending`,
`rate_limited`, `insufficient_credits`, `not_configured`, `unauthorized`, `bad_request`, `sandbox_error`, `error`.

### Arquivos

| Arquivo | O quê |
|---|---|
| `supabase/functions/_shared/navigatorCore.ts` | Núcleo puro (testado): validação das rotas, gate de pagamento, vínculo segredo↔domínio, cobrança por minuto, URL do noVNC, `wantsNavigator`. SSRF reaproveitada de `browserForm.ts`. Re-exportado em `src/lib/navigator/navigatorCore.ts`. |
| `supabase/functions/_shared/chatAgent.ts` | Ferramenta `navigator` (tipo, `parseNavigatorAction`, custo, prompt condicional). Não existe op de aprovar. |
| `supabase/functions/creative-router/index.ts` | Liga a ferramenta no prompt só quando a conversa pede para operar um site (`wantsNavigator`). Edge function já existente. |
| `worker/navigatorRoutes.ts`, `worker/e2bClient.ts`, `worker/navigatorCrypto.ts` | Rotas, cliente E2B/navd e cifra. |
| `supabase/migrations/20261121090000_vertal_navigator.sql` | Tabelas `navigator_sessions` e `navigator_profiles` (só service role). |
| `src/lib/navigator/{client,store}.ts` | Cliente HTTP e estado/poller compartilhado. |
| `src/components/vertal-chat/NavigatorPanel.tsx` | Painel no Vertal Chat. |
| `src/components/vertal-chat/NavigatorApprovalDialog.tsx` | Cartão de aprovação de pagamento (e de código 2FA quando o painel está fechado). |
| `src/lib/chatAgent/vibeBridge.ts` | `/navegar <tarefa>` no Vibe Code → `delegateToNavigator`. |
| `infra/vertal-browser/` | Template E2B: `e2b.Dockerfile`, `navd.py`, `start.sh`, `chromium-policy.json`, `build-template.mjs`. |
| `scripts/navigator-smoke.ts` | Teste de ponta a ponta contra o E2B usando o mesmo código do Worker (sem Supabase). |

## Segurança

- **Gate de pagamento (regra dura):** toda ação `click`/`select_dropdown` cujo alvo (texto, `aria-label`,
  `value`, `title`…) tenha palavra de pagar/comprar/confirmar pedido (pt/en), todo "Finish/Continuar/
  Confirmar" numa página de checkout e todo Enter numa página de checkout **param** e viram `needs_approval`.
  Só seguem com `approve: true` + `confirmed: true`, que só o botão "Aprovar e clicar" envia. Fechar o
  cartão = recusar. Pedido sem resposta em 10 min = recusado. O agente não tem `evaluate` (JS arbitrário),
  upload, nem clique por coordenada — o gate sempre sabe qual elemento é. As listas de palavras existem
  em TS e em Python; um teste garante que são iguais.
- **fill_secret:** o modelo só conhece o **nome** do segredo (e o domínio a que está vinculado). Quando
  chama `fill_secret(nome, índice)`, o navd confere que a página é pública e que o host casa com o
  `bound_to` do segredo; o Worker confere de novo (`pickSecretForHost`), decifra no servidor e manda o
  valor direto ao navd, que digita no campo. O valor nunca aparece em evento, log, resposta ao cliente nem
  no prompt. Segredos que não são identificador (usuário/e-mail/login/CPF) só vão em `<input type=password>`
  (o browser-use nunca mostra valor de campo de senha ao modelo). Cada uso grava `inject` na auditoria do
  cofre (`kubo_secret_audit`, `meta.target = "navigator"`). Segredo sem `bound_to` nunca é usado.
- **2FA:** `request_user_code(índice, pergunta)` pausa e emite `needs_user_input`; o código volta por
  `/input` e é digitado direto no campo, sem voltar ao modelo.
- **SSRF/rede:** URL inicial e toda navegação pedida pelo agente passam pela guarda do `browser_form`
  (só http/https 80/443, sem IP privado/loopback/metadados/hosts internos). No sandbox, a política do
  Chrome bloqueia `file://`, `localhost`, `127.0.0.1`, `169.254.169.254`, `chrome://settings` etc., e o
  sandbox é criado com `network.denyOut` para 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10 e 127/8.
- **Tela ao vivo:** noVNC com duas senhas no x11vnc (só ver / controlar). A senha vai no fragmento `#` da
  URL (não chega a servidor nenhum). A de controle é trocada a cada "Assumir controle" e a cada "Devolver".
  O envd do sandbox é criado com `secure: true` (quem só sabe o id do sandbox não executa comandos).
- **Cookies:** exportados via CDP (`Storage.getCookies`), filtrados (sem hosts internos, até 3.000),
  cifrados com AES-256-GCM (CONNECTOR_ENC_KEY) em `navigator_profiles`. "Esquecer" = `/forget`.
- **Limites:** 1 sessão viva por usuário (índice único parcial), `NAVIGATOR_MAX_SESSIONS` no total
  (padrão 2), sessão de no máximo 60 min, sandbox morre após 10 min sem chamadas, 6 aberturas e 20 tarefas
  por usuário a cada 10 min (limitador por isolate, como no browser_form).

## Créditos

Pré-pago por minuto, pelo mesmo RPC do browser_form: `execute_atomic_credit_deduction`
(motivo `navigator_minutes`, categoria `vertal_chat`, idempotência `navigator:<sessão>:m<de>-<até>`).
O 1º minuto é cobrado quando o navegador abre; os seguintes, nas chamadas de `status`/`task`/etc. Uma trava
otimista em `billed_minutes` impede cobrança dupla em chamadas simultâneas. Sem saldo, a sessão é salva e
encerrada. O tempo ocioso depois da última chamada (até o sandbox morrer) não é cobrado.
Padrão: **1 crédito/min** (`NAVIGATOR_CREDITS_PER_MINUTE`). LLM: custo do OpenRouter por conta da Vertal.

## Variáveis de ambiente (Worker → Settings → Variables and Secrets)

| Variável | Tipo | Obrigatória | Valor |
|---|---|---|---|
| `E2B_API_KEY` | segredo | sim | Chave do time no E2B self-hosted (a mesma do Railway `vertal-run-api`; no host: `docker exec e2b-ready-1 cat /run/e2b/sdk.env`). |
| `CONNECTOR_ENC_KEY` | segredo | sim | **A mesma** das edge functions (decifra o cofre e cifra os cookies). |
| `OPENROUTER_API_KEY` | segredo | sim* | Modelo do agente. *Ou `DEEPSEEK_API_KEY` com `NAVIGATOR_LLM_PROVIDER=deepseek`. |
| `SUPABASE_SECRET_KEY` | segredo | sim (já existe) | Já usada pelo Spotify/browser_form. |
| `E2B_API_URL` | var | não | Padrão `https://api.vertalrun.com`. |
| `E2B_DOMAIN` | var | não | Padrão `vertalrun.com`. |
| `NAVIGATOR_TEMPLATE` | var | não | Padrão `vertal-browser`. |
| `NAVIGATOR_MODEL` | var | não | Padrão `google/gemini-3-flash-preview` (OpenRouter, com visão) ou `deepseek-flash`. |
| `NAVIGATOR_LLM_PROVIDER` | var | não | `openrouter` (padrão) ou `deepseek` (sem visão, só DOM). |
| `NAVIGATOR_MAX_SESSIONS` | var | não | Padrão `2` (capacidade atual da VM). |
| `NAVIGATOR_CREDITS_PER_MINUTE` | var | não | Padrão `1`. |

## Deploy (passo a passo)

1. **Migration:** aplicar `supabase/migrations/20261121090000_vertal_navigator.sql` (idempotente) —
   `supabase db push` ou colar no SQL Editor do projeto.
2. **Template E2B** (já construído e testado na VM em 21/11/2026; refazer só se mudar `infra/vertal-browser`):
   ```bash
   # na VM (ubuntu@163.176.111.245), com os arquivos de infra/vertal-browser em /tmp/vb
   sudo docker exec e2b-ready-1 cat /run/e2b/sdk.env | sed 's/^export //' > /tmp/vb/.sdkenv && chmod 600 /tmp/vb/.sdkenv
   I=us-docker.pkg.dev/e2b-artifacts/embed/node-e2b:v0.3.202609120109-ad1cddd091b
   sudo docker run --rm --network host --env-file /tmp/vb/.sdkenv -e TEMPLATE_DIR=/templates \
     -v /tmp/vb:/templates -v /tmp/vb/build-template.mjs:/app/build-template.mjs -w /app $I node /app/build-template.mjs
   ```
   1 vCPU / 1536 MB. Build do zero ≈ 10 min (só a última camada: ≈ 35 s). O tier `base_v1` do E2B foi
   ajustado para `disk_mb = 3072` (com 512 MB o `apt-get` do Chromium não cabia no disco do build).
3. **Segredos do Worker:** `E2B_API_KEY`, `CONNECTOR_ENC_KEY`, `OPENROUTER_API_KEY` (tabela acima).
4. **Deploy do Worker:** merge na `main` → Workers Builds (`npm run build` + `npx wrangler deploy`).
5. **Edge function `creative-router`** (já existente): `supabase functions deploy creative-router` para o
   modelo receber a ferramenta `navigator`.
6. **Teste de ponta a ponta sem Supabase** (mesmo código do Worker):
   ```bash
   export E2B_API_KEY=… OPENROUTER_API_KEY=…
   npx vite-node scripts/navigator-smoke.ts -- start https://example.com
   SMOKE_SECRET_NAME=THE_INTERNET_PASSWORD SMOKE_SECRET_BOUND=herokuapp SMOKE_SECRET_VALUE='SuperSecretPassword!' \
     npx vite-node scripts/navigator-smoke.ts -- task "Faça login em https://the-internet.herokuapp.com/login com tomsmith e a senha do segredo THE_INTERNET_PASSWORD (use fill_secret)"
   npx vite-node scripts/navigator-smoke.ts -- poll 90
   npx vite-node scripts/navigator-smoke.ts -- stop
   ```
7. **No produto:** Vertal Chat → "entre no site X e …" → painel abre com a tela ao vivo → passos →
   cartão de aprovação em qualquer pagamento → "Fechar (salva o login)".

## Capacidade da VM (vertal-e2b-vm: 2 vCPU, 12,9 GB RAM, hugepages 4 GiB)

Medido em 21/11/2026 com uma sessão (login + checkout de teste): ~730 MB usados dentro do sandbox,
~1,3 GB de hugepages ocupados no host. O Firecracker usa as hugepages (4 GiB por padrão), então:

- **Hoje: 2 sessões simultâneas** (padrão `NAVIGATOR_MAX_SESSIONS=2`), deixando folga para builds.
- Subindo `HUGEPAGES` do stack para 8 GiB (há RAM livre): **~4 sessões**; acima disso a CPU (2 vCPU) vira
  o gargalo quando vários agentes renderizam ao mesmo tempo.
- Criar sandbox: ~1 s; abrir navegador pronto (init + restaurar cookies): 7–20 s.

## Limitações conhecidas (fase 1)

- Valor de segredo de identificador (usuário/e-mail) digitado em campo de texto fica visível ao modelo no
  DOM/screenshot (senhas não). Código 2FA também fica visível depois de digitado (é de uso único).
- Só cookies são persistidos (não localStorage/IndexedDB). Sites que guardam login só no localStorage
  pedem login de novo.
- O gate é por palavras-chave + URL de checkout: é conservador (pede aprovação em "Checkout",
  "Continuar" no checkout) e pode não reconhecer botões só com ícone. Aprovação humana continua sendo a
  regra; ampliar a lista em `navigatorCore.ts` **e** `navd.py`.
- A chave do OpenRouter vai para a memória do navd durante a tarefa (nunca para disco/env). O usuário no
  controle só tem acesso ao Chromium, com `file://` e `localhost` bloqueados.
- Poller por HTTP (1,5 s com tarefa ativa). Sem WebSocket/SSE na fase 1.
- Limitador de taxa por isolate do Worker (como o browser_form); o teto global de sessões é pelo banco.
