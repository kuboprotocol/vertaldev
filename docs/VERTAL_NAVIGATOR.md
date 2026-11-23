# Vertal Navigator (fases 1–4 + cofre da auditoria) — navegador na nuvem com sessão persistente

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
       PulseAudio, sink "vertal" (null-sink) ← Chromium toca aqui; navd GET /audio = ffmpeg no monitor → MP3 stream
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
| `/api/navigator/audio-ticket` | `{sessionId}` | **Áudio.** Devolve `ticket` (HMAC de sessão + validade de 10 min, `worker/navigatorAudio.ts`). O botão "Ouvir no celular" monta `…/audio?ticket=…`. |
| `GET /api/navigator/audio?ticket=…` | — | **Áudio.** Não usa JWT (o `<audio>` não envia cabeçalhos): valida o ticket, abre `GET /audio` do navd com o token da sessão guardado cifrado e repassa o MP3 (`audio/mpeg`, sem cache). Um ouvinte por sessão; sessão encerrada → 410. |

**Áudio do navegador (no celular):** o Chromium roda com `--autoplay-policy=no-user-gesture-required` e
toca no sink do PulseAudio; o navd captura o monitor com ffmpeg (MP3 128 kb/s, estéreo, 44,1 kHz). O
usuário toca em "Ouvir no celular" (o toque é obrigatório em iOS/Android). Limite conhecido: ao
bloquear a tela ou trocar de app, o navegador do celular pode pausar o `<audio>`; o botão avisa e
reconecta com um toque. Exige rebuild do template `vertal-browser` (novos pacotes: pulseaudio, ffmpeg).

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
| `NAVIGATOR_AUDIT_KEY` | segredo | recomendada | **Cofre da auditoria (22/11).** AES-256-GCM, 32 bytes (`openssl rand -base64 32`). Cifra `navigator_audit` (`key_version 1`). Sem ela: fallback `NAVIGATOR_ENC_KEY` → `CONNECTOR_ENC_KEY` (`key_version 0`). Guardar cópia fora do Cloudflare: perdida, as linhas cifradas não abrem mais. |
| `NAVIGATOR_LLM_DATA_COLLECTION` | var | não | `deny` (padrão): OpenRouter só usa provedores que não guardam/treinam com os prompts (`provider.data_collection`). `allow` só em emergência. |
| `NAVIGATOR_LLM_ZDR` | var | não | `true` restringe o OpenRouter a endpoints de retenção zero (`provider.zdr`). Desligado por padrão: pode não haver provedor ZDR para o modelo. |

## Deploy (passo a passo)

1. **Migration:** aplicar `supabase/migrations/20261121090000_vertal_navigator.sql` (idempotente) —
   `supabase db push` ou colar no SQL Editor do projeto.
2. **Template E2B** (já construído e testado na VM em 21/11/2026; refazer só se mudar `infra/vertal-browser`):
   ```bash
   # na VM (ubuntu@132.226.249.211 — IP reservado vertal-e2b-ip), com os arquivos de infra/vertal-browser em /tmp/vb
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

---

# Fase 4 — navegador dentro do chat do Vibe Code, agente que navega sozinho, mais inteligente

## Navegador DENTRO do chat do Vibe Code (como Lovable/Bolt/Replit)

- `/navegar <tarefa>` não abre mais tela cheia nem um cartão solto: vira uma **mensagem da conversa** com o
  cartão `VibeNavigatorCard` (`src/components/vibe-code/VibeNavigatorCard.tsx`):
  - **Ao vivo:** tela compacta (noVNC) na largura do chat, status · minutos · crédito/min · site, botão
    **Expandir** (janela grande dentro do Vibe Code, nunca uma página nova), **Passos do agente** ao vivo,
    **Assumir controle / Devolver ao agente**, **Fechar (salva o login)**, campo do **código 2FA** e o
    **cartão de aprovação de pagamento inline** (mesma regra dura: só "Aprovar e clicar" envia
    `approve + confirmed`). Enquanto o cartão está ao vivo, o diálogo global não duplica a aprovação
    (`inlineApprovalHosts` no store).
  - **Encerrado:** captura final + resposta (citando o que foi lido) + passos + plano, com "Usar no pedido" e
    "Continuar com o agente".
- **Guardado na conversa:** o cliente grava a troca com `vibe-code-agent` `{record:{prompt, reply, steps}}`
  (só grava: sem modelo, sem créditos; cria a conversa se não existe). Sanitização em
  `supabase/functions/_shared/vibeRecord.ts` (só passos `navigator|delegate|message|error`, captura JPEG
  ≤ 160 KB, links só internos). O cartão volta ao recarregar.
- Peças compartilhadas extraídas do `NavigatorPanel` para `src/components/navigator/NavigatorParts.tsx`
  (`NavigatorLiveFrame`, `NavigatorStepList`, `NavigatorPendingInput`, `NavigatorControls`,
  `NavigatorApprovalDetails`, `NavigatorApprovalInline`). O painel do Vertal Chat continua igual.

## Resposta só da tarefa atual (bug da resposta de outra conversa)

- O store marca cada tarefa (`currentTask`: id, runId, `baseSeq` = último evento antes da tarefa). Ao
  reaproveitar uma sessão viva, sincroniza os eventos antigos **antes** de mandar a tarefa. Só o `done`
  desta tarefa resolve a espera (`isDoneForTask`: compara `runId`; navd antigo sem runId → só eventos
  depois de `baseSeq`). O navd agora manda `runId` em `step` e `done`.

## /github no Vibe Code

- Sempre responde no chat: entende linguagem natural (`/github liste meus repositórios` → `list_repos`),
  mostra a ajuda quando não entende e, sem conexão, mostra **"Conectar o GitHub"** (→ `/connectors/github`).
  Leitura sem confirmação; escrita continua com o cartão de confirmação.

## O agente do Vibe Code usa o navegador sozinho (ação `use_browser`)

- Nova ação do agente (`vibeAgentCore.ts`): `{"type":"use_browser","reason":"tarefa","path":"https://… (opcional)"}`,
  no máximo 1 por pedido, nunca em pedido vindo do Vertal Chat. O servidor só registra o pedido (passo
  `navigator` com `state: "requested"`); quando o agente termina, o chat abre o cartão ao vivo e roda a
  tarefa pelo mesmo Worker (`/api/navigator/*`, JWT do usuário): `fill_secret` do cofre, TOTP, gate de
  pagamento, auditoria em `navigator_audit` — nada muda nas regras. "Continuar com o agente" devolve o
  resultado ao agente (não é automático para não gastar créditos sem o usuário ver).

## Mais potente e inteligente

- Tarefa enquadrada (`framedNavigatorTask`): plano curto no 1º passo, ler a página com a nova ferramenta
  **`read_page_text`** (texto visível via CDP pelo navd, só leitura), abrir/alternar abas quando precisar
  comparar páginas, resposta final **citando entre aspas** o trecho lido + URL.
- **Modelo por tarefa:** `/api/navigator/task {model}` — só vale se estiver em `NAVIGATOR_ALLOWED_MODELS`
  (var do Worker, separada por vírgula); padrão continua `google/gemini-3-flash-preview` (OpenRouter).
- Abertura robusta: `waitNavd` espera até 40 s com backoff (400 ms → 2,5 s), `/init` com 60 s, e o Worker
  tenta **2 vezes** (sandbox novo na 2ª, o que falhou é encerrado) antes de responder erro. O cliente
  ainda repete 1 vez em silêncio se vier `sandbox_error`.

## Vertal Chat: resposta final depois de mídia

- Se o modelo devolver saída vazia depois das ferramentas, há uma 2ª chance barata em texto simples
  (`plainReplyPrompt`); se falhar, a contingência agora é uma frase normal ("Pronto! ▶️ Está tocando …"),
  nunca "não consegui escrever o resumo". O resultado do YouTube pede uma frase curta ao modelo.

## Deploy da fase 4

1. **Sem migration nova.**
2. **Edge functions (já existentes):** `supabase functions deploy vibe-code-agent` (op `record`, ação
   `use_browser`) e `supabase functions deploy creative-router` (resposta final após mídia).
3. **Template E2B:** reconstruir `vertal-browser` (o `navd.py` mudou: `runId` nos eventos, ferramenta
   `read_page_text`, regras de plano/abas/citação) — mesmo comando da fase 1 (só a última camada).
   Sem rebuild tudo funciona (o cliente filtra por `baseSeq`), só sem `read_page_text`/`runId`.
4. **Worker:** merge → Workers Builds. Opcional: `NAVIGATOR_ALLOWED_MODELS`.

## Escopo, DuckDuckGo e e-mail pelo conector (fix 22/11)

Relato (22/11, ~09:15–09:30): o agente "fazia várias tarefas que não foram pedidas", não usava o
DuckDuckGo e, no pedido "entre no meu e-mail, leia, me pergunte o que responder e preencha os convites",
abriu `workspace.google.com/intl/en-US/gmail/` (página de marketing, sem login).

O que mudou:

- **Só o que foi pedido.** `NAVIGATOR_SCOPE_RULES` vai em toda tarefa (`framedNavigatorTask`) e no system
  prompt do `navd.py`: nada de etapas/objetivos inventados, `done` assim que o pedido estiver feito,
  `ask_user` em vez de adivinhar. Abas novas só quando a tarefa pede comparação.
- **Continua da página aberta.** Tarefa sem URL numa sessão que já tem página aberta continua dali
  (o Worker lê a URL atual do navd). Antes, toda tarefa sem URL voltava ao buscador e pesquisava o
  próprio texto da tarefa — era isso que abandonava o Gmail e "navegava por subpáginas".
- **Teto duro de passos:** padrão 20, máximo 40 por tarefa (TS `NAVIGATOR_LIMITS` e `navd.py`).
- **DuckDuckGo como buscador.** Política gerenciada do Chromium (`chromium-policy.json`:
  `DefaultSearchProvider*`, página inicial e nova aba = duckduckgo.com); no `navd.py`, a ação `search`
  é forçada para `engine=duckduckgo` e `navigate` para `google.com/search`/`bing.com/search` vira a mesma
  busca no DuckDuckGo (`rewriteSearchUrl`/`rewrite_search_url`).
- **Gmail direto no login.** `navigatorStartUrl`: `mail.google.com/`, `gmail.com` e a página de marketing
  viram `accounts.google.com/ServiceLogin?service=mail&continue=…` (com cookies salvos, cai na caixa de entrada).
- **Senha fora da tarefa.** Texto com "senha/password + valor" é recusado no aparelho e no Worker
  (`credentials_in_task`): iria para o modelo, para o buscador e para `navigator_audit`. A auditoria também
  passa por `redactCredentials`. Senha: Cofre (`fill_secret`) ou "Assumir controle".
- **Toda ação de escrita passa pela aprovação.** Além do gate de pagamento, cliques em enviar, responder,
  encaminhar, publicar, excluir, aceitar/recusar, enviar formulário, Sim/Não/Talvez de convite (em página
  de e-mail/agenda) e Ctrl+Enter pausam o agente (`needs_write_approval`). O cartão
  (`NavigatorApprovalDialog`/inline) mostra **o conteúdo exato** (campos preenchidos: para, assunto, corpo…),
  o botão, a URL e a captura. Escrita **nunca** entra na aprovação automática por valor.
- **E-mail pelo conector do Gmail, não pelo navegador.** `emailRouting.ts` (`emailRoute`): pedido sobre o
  e-mail do usuário vai para `gmail_search` → resumo → pergunta quais responder → rascunho no chat →
  `gmail_send` (agora com `thread`/`in_reply_to` para responder na mesma conversa) só depois do "sim" e do
  cartão de aprovação. Nova ferramenta `gmail_read` (conversa inteira via `gmail-get-thread`, com
  Message-ID e marcação de convite). Convites: Sim/Não/Talvez perguntados no chat; sem conector de agenda,
  a resposta vai por e-mail ao organizador, com aprovação. Sem Gmail conectado, abre Conectores.
  O navegador só entra se o usuário insistir ("pelo navegador"); o `creative-router` troca `navigator`
  sobre webmail por `gmail_search` na rota do conector.

### Deploy deste fix

1. **Sem migration.**
2. **Edge function:** `supabase functions deploy creative-router` (rota de e-mail, `gmail_read`, regras).
   As funções `gmail-get-thread` e `gmail-send-message` já existem e não mudaram.
3. **Worker** (`worker/navigatorRoutes.ts`): merge → Workers Builds (continua da página aberta, Gmail no
   login, recusa de senha, escrita fora da aprovação automática).
4. **Frontend:** build normal (cartão de aprovação de escrita, recusa de senha no painel).
5. **Template E2B `vertal-browser`: precisa de rebuild** para a política do DuckDuckGo e o novo `navd.py`
   (gate de escrita, regras de escopo, teto de 40 passos, busca forçada no DuckDuckGo) — mesmo comando da
   fase 1 (`node build-template.mjs` na imagem node-e2b). Sem o rebuild, o Worker já manda as regras de
   escopo e DuckDuckGo no texto da tarefa e recusa senha, mas o gate de escrita e a política do Chromium
   só valem depois do rebuild. Conferir depois: `chrome://policy` no sandbox mostra `DefaultSearchProviderName = DuckDuckGo`.

# Cofre da auditoria e anti-telemetria (22/11)

Pedido do Laércio: "um local onde os registros fiquem armazenados com criptografia e antitelemetria,
para registros de login e senha".

## O que fica cifrado e onde

- **`navigator_audit`** (única tabela com texto de tarefa, URLs/hosts de login e nomes de segredos usados):
  - Em **claro**, só o que serve para consultar: `user_id`, `session_id`, `kind`, `created_at` e, em
    `detail`, no máximo `end_reason`/`minutes`/`limit` (constraint `navigator_audit_detail_clear_only`).
  - **Cifrado** (AES-256-GCM) em `detail_ciphertext`/`detail_iv`/`detail_tag` + `key_version`: texto da
    tarefa, URL (já sem query/fragmento), host, nome do segredo usado, loja, total, itens, botão, motivo.
    AAD = `navigator_audit:v<key_version>:<user_id>:<kind>` — ciphertext copiado para outra linha não abre.
  - **Nunca entra, nem cifrado:** valor preenchido por `fill_secret`, senha, código 2FA/OTP, cookie,
    cabeçalho. Segredo aparece só pelo NOME (ex.: "Segredo usado: GMAIL_PASSWORD" na aba Atividade).
    Texto da tarefa passa por `redactCredentials`.
  - Decifra **só no Worker**, na rota `/api/navigator/activity`, para o dono (a resposta tem o mesmo formato
    de antes; a aba Atividade não mudou). Linha que não decifra vem como `{ sealed: true }`.
  - RLS: `authenticated` lê só `id, user_id, session_id, kind, created_at` das próprias linhas (sem
    `detail` nem colunas cifradas); só o `service_role` (Worker) escreve.
  - Código: `supabase/functions/_shared/navigatorAuditVault.ts` (mesmo módulo no Worker, nas edge functions,
    nos testes e no backfill).
- `navigator_profiles` (cookies) e `navigator_sessions.secret_*` já eram cifrados (`NAVIGATOR_ENC_KEY`).
- `kubo_secret_audit` guarda só `host`/`session_id` do uso (sem valor) — inalterado.

## Senha/PIN/código na tarefa (detecção mais forte)

`findCredentialSpans` (TS, `navigatorCore.ts`) e `find_credential_spans` (`navd.py`), com os mesmos casos
em `infra/vertal-browser/credential_cases.json`:
- `senha: x`, `pwd=abc`, `senha do gmail: x` (com `:`/`=`) → **qualquer valor** recusa (`credentials_in_task`);
- `senha é Abc123!`, `password is 'x y'` → valor com dígito/símbolo ou entre aspas;
- `senha Abc123!`, `PIN 1234`, `OTP 123456`, `código 2FA 123456`, `código: 123456` → valor forte ou 4–8 dígitos;
- não recusa: "trocar minha senha", "senha do cofre GMAIL_PASSWORD", "senha: ****", "senha de 8 caracteres",
  URLs como `/password/reset`, "o código 2FA vai chegar por SMS".
Recusa no aparelho (store), no Worker (`parseTaskBody`) e no navd (`/task` → `credentials_in_task`). Eventos do
navd passam por `redact_credentials`; erros do agente por `redact_for_log` (sem query de URL).

## Anti-telemetria

- **browser-use 0.13.14** (conferido no código: `browser_use/config.py`, `telemetry/service.py`,
  `sync/service.py`, `agent/service.py`, `tokens/service.py`): `ANONYMIZED_TELEMETRY=false` (sem PostHog),
  `BROWSER_USE_CLOUD_SYNC=false`, `BROWSER_USE_VERSION_CHECK=false` (sem PyPI), `BROWSER_USE_CLOUD_HINTS=false`,
  `BROWSER_USE_CALCULATE_COST=false` (sem baixar tabela de preços), `BROWSER_USE_LOGGING_LEVEL=warning`,
  `DO_NOT_TRACK=1`. Forçadas no topo do `navd.py` (antes de importar o browser-use) e no `start.sh`.
- **Chromium — flags** (`CHROMIUM_PRIVACY_FLAGS` no `navd.py`): `--metrics-recording-only` (métricas só em
  memória, nunca enviadas), `--disable-breakpad`, `--disable-crash-reporter`, `--disable-domain-reliability`,
  `--disable-component-update`, `--disable-client-side-phishing-detection`, `--disable-field-trial-config`,
  `--no-pings`, `--disable-features=Translate,OptimizationHints*,AutofillServerCommunication,
  CertificateTransparencyComponentUpdater,NetworkTimeServiceQuerying,PrivacySandboxSettings4,BrowsingTopics,…`
  (além de `--disable-background-networking` e `--disable-sync`, que já existiam).
- **Chromium — políticas gerenciadas** (`chromium-policy.json`): `MetricsReportingEnabled=false`,
  `UrlKeyedAnonymizedDataCollectionEnabled=false`, `SafeBrowsingExtendedReportingEnabled=false`
  (Safe Browsing padrão continua ligado: protege contra phishing), `SpellCheckServiceEnabled=false`,
  `SearchSuggestEnabled=false`, `AlternateErrorPagesEnabled=false`, `NetworkPredictionOptions=2`,
  `TranslateEnabled=false`, `BrowserSignin=0`, `SyncDisabled=true`, `PasswordManagerEnabled=false`,
  `PasswordLeakDetectionEnabled=false`, `AutofillAddressEnabled=false`, `AutofillCreditCardEnabled=false`,
  `PaymentMethodQueryEnabled=false`, `ChromeVariations=2` (sem field trials), `DomainReliabilityAllowed=false`,
  `UserFeedbackAllowed=false`, `FeedbackSurveysEnabled=false`, `WebRtcEventLogCollectionAllowed=false`,
  `BrowserNetworkTimeQueriesEnabled=false`, `ComponentUpdatesEnabled=false`, `PrivacySandbox*=false`,
  recursos de IA do Chrome (`GenAiDefaultSettings`, `HelpMeWriteSettings`… = 2) desligados.
- **LLM (OpenRouter):** `extra_body.provider.data_collection = "deny"` em toda chamada do agente (docs
  OpenRouter → Provider Routing: só provedores que não guardam/treinam com os dados). ZDR opcional
  (`NAVIGATOR_LLM_ZDR=true`). DeepSeek direto não tem essa opção (vale a política da DeepSeek).
- **Logs do Worker/edge:** `redactForLog`/`safeErrorMessage` (`_shared/logRedact.ts`) em todo `console.*` do
  Navigator e do `kubo-secrets`: sem texto de tarefa/senha, URL só origem+caminho, `Authorization`/`Cookie`/
  `apikey`, JWT, tokens longos e e-mails mascarados.
- **Frontend (Sentry):** `beforeBreadcrumb`/`beforeSend` (`src/lib/sentry.ts`): cliques/inputs dentro de
  `[data-sentry-mask]` (painel do Navigator e cartão de aprovação) viram `[navigator]`; breadcrumbs de console
  sem argumentos e redigidos; evento sem corpo de request, cookies, cabeçalhos de auth e query. Sem PostHog
  ou outro analytics no front.

## Deploy deste pacote (nesta ordem; nada foi aplicado ainda)

1. **Segredo novo no Worker:** `NAVIGATOR_AUDIT_KEY` = `openssl rand -base64 32` (Cloudflare → Workers →
   vertal → Settings → Variables and Secrets, tipo Secret). Guardar cópia no cofre da empresa.
   (Opcional: `NAVIGATOR_LLM_ZDR=true`.)
2. **Migration:** `supabase/migrations/20261122140000_navigator_audit_vault.sql` (idempotente; colunas novas,
   constraints, RLS por coluna). A constraint `navigator_audit_detail_clear_only` entra `NOT VALID`.
3. **Worker:** merge → Workers Builds (logo depois da migration: o Worker antigo teria as linhas de
   auditoria recusadas pela constraint — a rota não quebra, só a linha se perde).
4. **Edge function:** `supabase functions deploy kubo-secrets` (log redigido). `creative-router` não mudou.
5. **Backfill (só com OK):** cifrar as linhas antigas (em 22/11: 30 linhas, 9 tarefas com texto em claro):
   ```bash
   SUPABASE_URL=… SUPABASE_SECRET_KEY=… NAVIGATOR_AUDIT_KEY=<a mesma do Worker> \
     deno run --no-check -A scripts/navigator-audit-backfill.ts          # simulação: só conta
   … deno run --no-check -A scripts/navigator-audit-backfill.ts --apply  # grava
   ```
   Depois: `alter table public.navigator_audit validate constraint navigator_audit_detail_clear_only;`
6. **Template E2B `vertal-browser`: rebuild** (novo `navd.py`, `start.sh` e `chromium-policy.json`) — mesmo
   comando da fase 1, na VM `ubuntu@132.226.249.211`. Conferir: `chrome://policy` mostra
   `MetricsReportingEnabled=false` e `ChromeVariations=2`; `env | grep TELEMETRY` no sandbox = `false`.
7. **Frontend:** build normal (Sentry com scrub).

Rotação da chave (futuro): criar `NAVIGATOR_AUDIT_KEY` nova com `key_version` 2 exige ler a anterior para
as linhas antigas — hoje só existem as versões 1 (dedicada) e 0 (fallback).
