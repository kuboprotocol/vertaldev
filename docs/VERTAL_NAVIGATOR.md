# Vertal Navigator (fases 1–3) — navegador na nuvem com sessão persistente

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
| `/api/navigator/settings` | `{}` lê · `{autoApproveEnabled, autoApproveMaxCents, confirmed}` grava · `{consent:"totp", name, boundTo, confirmed}` | **Fase 2.** "Aprovar automático até R$X" (padrão: sempre pedir) e registro do consentimento TOTP. |
| `/api/navigator/activity` | `{}` | **Fase 2.** Últimas 20 sessões + 150 linhas de auditoria do usuário (aba Atividade). |

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


---

# Fase 2 — confiança (2FA por TOTP, gate de pagamento melhorado, Atividade)

## 2FA por TOTP (opcional)

- **Convenção do cofre:** segredo do `kubo-secrets` com `env_key` terminando em **`_TOTP`** (ex.:
  `GITHUB_COM_TOTP`) e **`bound_to`** obrigatório (slug do site, ex. `github-com`). O valor é a *semente*
  do app autenticador: o texto base32 que o site mostra em "não consigo ler o QR code" ou a URI
  `otpauth://totp/...` inteira (aceita `digits` 6–8, `period` 15–120 s, `SHA1/SHA256/SHA512`; HOTP não).
- **Consentimento explícito na UI:** Navigator → aba **Segurança** → "Autenticador (TOTP)": site + chave +
  caixa "Autorizo a Vertal a guardar esta chave… somente para este site". Salva pelo `kubo-secrets`
  (`action: "create"`, grupo `navigator`, descrição com a data do consentimento) e grava `totp_consent`
  na auditoria (`/api/navigator/settings {consent:"totp"}`).
- **Fluxo:** o agente chama `request_user_code(índice, pergunta)` como antes. O navd procura um segredo
  `*_TOTP` vinculado ao host da página; se houver, emite `needs_totp` (sem valor). O Worker
  (`fulfillTotp`) escolhe o segredo (`pickTotpForHost`: dono vence convidado, host precisa casar) e pede
  o código à edge function **`kubo-secrets` pelo canal interno `x-navigator-token`, op `"totp"`** —
  a função confere dono/convite, `*_TOTP` e `bound_to`↔host, decifra a semente, gera o código
  (`supabase/functions/_shared/totp.ts`, RFC 6238) e devolve **só** `{code, expiresIn}` (se faltam < 5 s,
  já entrega o do próximo período). O Worker repassa ao navd, que digita direto no campo. A semente nunca
  sai da função; o código não passa pelo modelo. Sem semente (ou falha), o navd volta ao fluxo antigo:
  pede o código ao usuário.
- **Defesas:** `fill_secret` recusa nomes `*_TOTP` (navd e `pickSecretForHost`); o caminho antigo do canal
  interno (sem `op`) recusa entregar semente TOTP (403). Se o Worker tiver `CONNECTOR_ENC_KEY`, gera o
  código localmente com o mesmo módulo (fallback). Cada geração grava `inject` em `kubo_secret_audit`
  (`meta.kind = "totp"`) e `totp_used` em `navigator_audit`.

## Gate de pagamento melhorado

- O navd, ao parar num clique de pagamento, captura **screenshot** e o **texto visível** da página
  (CDP `Runtime.evaluate` feito pelo navd, não pelo agente). Os dois ficam só no pedido pendente (nunca
  em evento). O Worker roda `extractCheckoutSummary` (heurística em `navigatorCore.ts`: rótulos "Total do
  pedido", "Valor total", "Order total"…, formatos BR/US, itens = linhas com um valor que não são
  subtotal/frete/desconto/parcela) e manda ao cartão só **loja, título, itens, total**. O texto bruto
  não sai do servidor.
- **Cartão** (`NavigatorApprovalDialog`): loja, valor total lido da página, itens, botão, URL e a captura
  do momento do pedido. Se o total não foi lido, o cartão diz isso.
- **Limite por usuário:** tabela `navigator_settings`. Padrão **desligado — sempre pedir**. Na aba
  Segurança o usuário liga "aprovar automático até R$X" (teto duro **R$ 1.000,00**, também na
  constraint do banco). Ligar exige `confirmed: true` (só o clique na tela envia). O Worker só aprova
  sozinho quando: automático ligado, total lido **com rótulo de total** (`confidence: "high"`), moeda
  **BRL**, `0 < total ≤ limite` (`autoApproveDecision`). Qualquer dúvida → cartão.
- **Auditoria:** toda aprovação (`approval_granted`), recusa (`approval_denied`) e aprovação automática
  (`auto_approved`, com o limite) vai para `navigator_audit` com loja/total/itens/botão/URL.

## Aba "Atividade"

`NavigatorPanel` agora tem abas **Ao vivo · Atividade · Segurança** (a tela ao vivo continua montada ao
trocar de aba). Atividade lista as sessões (início, minutos, fim/motivo) e, dentro de cada uma: tarefas,
segredos usados (**só nomes** + host), códigos 2FA (gerado do cofre ou digitado por você), aprovações,
recusas, assumir/devolver controle. Fora de sessão: mudanças de preferência e consentimentos TOTP.
`auditDetail` só aceita chaves conhecidas (nunca valor, código ou cookie).

---

# Fase 3 — Vibe Code + GitHub, hospedagem e mídia

## Vibe Code: GitHub pela API (navegador só como plano B)

- Usa a conexão OAuth que já existia (`github_connections`, escopo `repo`, token cifrado). A edge function
  existente **`github-repos`** ganhou `POST {op, …}` — sem `op` continua listando como antes (nada
  removido; o Supabase está no limite de funções, por isso não há função nova).
- Ops (`supabase/functions/_shared/githubOps.ts`): `list_repos`, `create_repo` (privado por padrão,
  `auto_init`), `create_issue`, `create_branch` (a partir de `from` ou da branch padrão), `create_pr`
  (rascunho por padrão). Validação de `dono/repo`, nome de branch (subconjunto seguro do
  `check-ref-format`), tamanhos.
- **Confirmação:** escrita exige `confirmed: true` na função; o front só envia depois do clique.
  - **Vertal Chat:** ferramenta `{"tool":"github",...}` → cartão de aprovação (`approveApi`, o mesmo do
    Gmail/Slack). Falhou na API → o resultado sugere `navigator run` como plano B.
  - **Vibe Code:** comando `/github` com cartão `GithubConfirmDialog`:
    `/github repos` · `/github repo <nome> [publico]` · `/github issue <dono/repo> <título> [| corpo]` ·
    `/github branch <dono/repo> <branch> [de <base>]` · `/github pr <dono/repo> <head> [-> <base>] <título> [| corpo]`.
    A resposta vira cartão "Usar no pedido", como o `/navegar`.
- A ferramenta só entra no prompt quando a conversa fala de GitHub (`wantsGithub`).

## Implantar/rodar apps (hospedagem, ex. Hostinger)

Fluxo "abrir site de hospedagem → logar → contratar VPS/plano → configurar" usa o **Navigator** com as
regras de sempre — não há atalho:

1. No chat: *"publique meu app na Hostinger: contrate a VPS KVM 1 e me passe o IP"* (ou `/navegar …` no
   Vibe Code). O prompt do navegador inclui a regra de hospedagem (`NAVIGATOR_RULES`).
2. **Login:** `fill_secret` com segredos do cofre vinculados ao site (ex.: `HOSTINGER_EMAIL` e
   `HOSTINGER_PASSWORD` com `bound_to = hostinger`), ou o usuário assume o controle e loga à mão
   (cookies ficam salvos para a próxima vez).
3. **2FA:** TOTP do cofre (`HOSTINGER_COM_TOTP`) se o usuário guardou; senão, o código é pedido no painel.
4. **Contratar:** "Contratar", "Pagar", "Finalizar compra" e "Continuar" no checkout param no **gate de
   pagamento**: cartão com loja, plano/itens, total e captura. Só segue com "Aprovar e clicar" (ou dentro do
   limite automático, se o usuário ligou e o total foi lido com confiança).
5. **Configurar/implantar:** o agente segue no painel da hospedagem (criar VPS, escolher SO, ver IP).
   Para código: repositório pelo `github` (criar repo/branch/PR) e deploy pelo painel do provedor ou pelo
   Vibe Code. Passos com SSH/terminal ficam fora do Navigator (sem `evaluate`, sem upload).
6. Tudo fica na aba **Atividade** (tarefa, segredos usados por nome, aprovação com o valor).

## Mídia: YouTube + Spotify

- Ferramenta `{"tool":"youtube","op":"play|search","query":"…","url":"…"}` → artefato `youtube` com
  **player embutido** (IFrame Player do YouTube, `youtube-nocookie.com`, `enablejsapi=1`).
  - Com link: toca direto (id validado; outros domínios são recusados).
  - Com busca: Worker **`POST /api/media/youtube`** (JWT, 30 buscas/10 min por usuário) chama a
    **YouTube Data API v3** com o segredo **`YOUTUBE_API_KEY`** (só vídeos incorporáveis).
  - **Sem chave:** a ferramenta devolve ao agente a instrução de achar o link pelo **Navigator**
    (ou `web_search site:youtube.com`) e repetir com `url`.
- **Spotify:** o conector existente continua igual; o prompt diz "música do Spotify conectado → spotify;
  vídeo/clipe/YouTube → youtube". As duas ferramentas aparecem juntas quando a conversa fala de
  música/vídeo (`wantsMedia`).
- Orçamento do prompt: `AGENT_PROMPT_BUDGET` (25.950 caracteres). Em conversas muito longas a
  ferramenta de menor prioridade sai (youtube, depois github); o resto não muda.

---

## Deploy das fases 2 e 3

1. **Migration:** `supabase/migrations/20261121180000_vertal_navigator_f2.sql` (idempotente) —
   `navigator_settings` e `navigator_audit`.
2. **Edge functions (já existentes):** `supabase functions deploy kubo-secrets` (op `totp`),
   `supabase functions deploy github-repos` (ops do GitHub), `supabase functions deploy creative-router`
   (ferramentas `github`/`youtube` no prompt).
3. **Template E2B:** reconstruir `vertal-browser` (o `navd.py` mudou: TOTP, `/pending`, texto/captura no
   pedido de aprovação) — mesmo comando do passo 2 da fase 1 (só a última camada, ≈ 35 s).
4. **Worker:** merge na `main` → Workers Builds. Rotas novas: `/api/navigator/settings`,
   `/api/navigator/activity`, `/api/media/youtube`.
5. **Segredos:** nenhum obrigatório novo. Opcional: **`YOUTUBE_API_KEY`** no Worker (Google Cloud →
   YouTube Data API v3; restrinja a chave à API). O TOTP usa o `NAVIGATOR_INTERNAL_TOKEN` já existente.

## Limitações e riscos conhecidos (fases 2 e 3)

- **Leitura do total é heurística.** Páginas com vários "Total" (ex.: total por item) ou valores em imagem
  podem confundir; por isso o automático exige rótulo de total, BRL e teto, e vem desligado.
- **Semente TOTP no cofre** transforma o cofre em "algo que você tem": quem comprometer a conta Vertal e o
  cofre gera códigos. Mitigações: opt-in por site com consentimento, `bound_to` obrigatório, semente nunca
  sai do servidor, auditoria por uso.
- **GitHub:** o token OAuth tem escopo `repo` (todos os repositórios do usuário); organizações com
  restrição a apps OAuth recusam (o resultado diz isso e sugere o navegador).
- **YouTube:** a cota diária da Data API é limitada (search = 100 unidades); sem chave, depende do
  Navigator (créditos por minuto) ou da busca na web.
