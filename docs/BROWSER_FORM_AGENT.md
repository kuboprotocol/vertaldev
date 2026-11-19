# Agente de formulários do Vertal Chat (navegador na nuvem)

O usuário pede no Vertal Chat, por exemplo: **"inscreva minha startup neste formulário https://…"**.
O agente abre o site num navegador headless na nuvem, lê o formulário, preenche com o que o
usuário disse na conversa (ou com a memória dele), **pergunta o que faltar**, mostra um cartão de
revisão com todos os campos + captura de tela e **só envia depois que o usuário clica em "Enviar"**.
No fim, relata o texto de confirmação que a página mostrou.

## Como funciona

```
Vertal Chat (navegador do usuário)
  │  modelo responde {"tool":"browser_form","op":"inspect|preview|submit", ...}
  ▼
src/lib/chatAgent/runAction.ts ──► src/lib/browserForm/client.ts ──► Worker vertal.dev /api/browser/*
                                                                       │  (JWT do Supabase)
                                                                       ▼
                                                     Cloudflare Browser Run (binding BROWSER,
                                                     @cloudflare/puppeteer) abre o site
```

| Rota (POST, `Authorization: Bearer <JWT do Supabase>`) | Corpo | Faz |
|---|---|---|
| `/api/browser/inspect` | `{url}` | Abre a página e devolve o esquema do formulário (rótulo, chave, tipo, obrigatório, opções, seletor), os botões de envio e uma captura de tela. |
| `/api/browser/fill-preview` | `{url, values}` | Preenche **sem enviar**; devolve captura, erros de validação, obrigatórios em branco e chaves desconhecidas. |
| `/api/browser/submit` | `{url, values, submitSelector?, confirmed: true, runId}` | Preenche de novo, cobra os créditos, clica no botão de envio e devolve título/cabeçalhos/mensagens da página de confirmação + captura. |

Respostas sempre em JSON `{ok, status, message?, ...}`. `status` pode ser `ok`, `captcha`,
`no_form`, `validation_error`, `blocked_url`, `timeout`, `navigation_failed`, `rate_limited`,
`insufficient_credits`, `not_configured`, `unauthorized`, `bad_request` ou `error`.

Cada chamada abre o navegador do zero e fecha no fim (sem sessão guardada entre chamadas). É o
caminho mais simples e robusto: o envio refaz o preenchimento na mesma sessão em que clica.

### Arquivos

| Arquivo | O quê |
|---|---|
| `supabase/functions/_shared/browserForm.ts` | Regras puras (testadas): guarda SSRF, esquema do formulário, honeypots, casamento de valores, captcha, limites, limitador de taxa, `wantsBrowserForm`. Re-exportado em `src/lib/browserForm/formCore.ts`. |
| `supabase/functions/_shared/chatAgent.ts` | Ferramenta `browser_form` no contrato: tipo, validação (`parseBrowserFormAction`), custo e instruções do prompt. |
| `supabase/functions/creative-router/index.ts` | Liga as instruções de `browser_form` no prompt só quando a conversa fala de formulário (`wantsBrowserForm`). Edge function **já existente** (nenhuma função nova). |
| `worker/browserFormRoutes.ts` | Rotas `/api/browser/*` no Worker (auth, limites, cobrança, Browser Run). |
| `worker/browserFormPage.ts` | Scripts que rodam dentro da página (coletar campos, preencher, clicar, ler o resultado). |
| `src/lib/chatAgent/runAction.ts` | Executor `runBrowserForm` (inspect → preview → revisão → submit). |
| `src/components/vertal-chat/FormApprovalDialog.tsx` | Cartão de revisão: campos + valores + captura, botões **Enviar / Editar / Cancelar**. |
| `src/components/vertal-chat/ArtifactViews.tsx` | Cartão do artefato "Formulário" na conversa (campos, captura, texto de confirmação). |

## Segurança

- **Aprovação obrigatória:** `submit` sempre passa pelo cartão de revisão; o Worker recusa `submit`
  sem `confirmed: true` e `runId`. O mesmo `runId` nunca envia duas vezes (idempotência da cobrança).
- **Não inventa dados:** o prompt proíbe inventar dados pessoais/da empresa e manda perguntar o
  que faltar. O cartão bloqueia "Enviar" enquanto houver obrigatório em branco.
- **Honeypots:** campos escondidos, fora da tela, `aria-hidden`, `tabindex=-1` sem rótulo ou com
  rótulos tipo "não preencha" / "deixe este campo em branco" nunca entram no esquema e nunca são
  preenchidos.
- **Captcha:** detectado (reCAPTCHA, hCaptcha, Turnstile, páginas "Just a moment…") e devolvido
  como `status: "captcha"`. Não há nenhuma tentativa de resolver ou contornar; o agente passa o link.
- **SSRF:** só `http/https` nas portas 80/443, sem usuário/senha na URL; bloqueia `localhost`,
  IPs privados/loopback/link-local/CGNAT/metadados (169.254.169.254), IPv6 local/ULA/mapeado e
  hosts internos (`.local`, `.internal`, sem ponto…). Toda requisição da página (subrecursos e
  redirecionamentos) passa pela mesma guarda via interceptação de requisições.
- **Botão de envio:** o agente só pode escolher um botão que o próprio servidor marcou
  (`[data-vertal-submit="sN"]`); qualquer outro seletor é ignorado.
- **Limites:** corpo ≤ 64 KB; até 80 valores (5.000 caracteres cada); 20 s para abrir a página;
  50 s por chamada; captura JPEG ≤ ~400 KB; por usuário, 20 leituras/prévias e 5 envios a cada
  10 min e 1 navegador por vez. O limitador é em memória por isolate do Worker (melhor esforço).

## Créditos

`inspect` e `preview` são grátis. `submit` cobra **4 créditos** (mesmo valor do "Agent run" do
Local Agent) pela RPC `execute_atomic_credit_deduction` (motivo `browser_form_submit`, categoria
`vertal_chat`), **antes do clique** e só depois de passar por captcha e validação. Sem saldo,
nada é enviado. Se o site recusar o envio depois do clique, os créditos não voltam (a execução
aconteceu); ajuste em `BROWSER_FORM_LIMITS.submitCredits`.

## Plano da Cloudflare e custos

Fonte: <https://developers.cloudflare.com/browser-run/pricing/> e
<https://developers.cloudflare.com/browser-run/limits/> (o Browser Rendering agora se chama
**Browser Run**). Consultado em 18/11/2026.

| | Workers Free | Workers Paid |
|---|---|---|
| Horas de navegador | 10 minutos por dia | 10 h/mês incluídas, depois US$ 0,09/h |
| Navegadores simultâneos (Puppeteer) | 3 | 10 (média mensal) incluídos, depois US$ 2,00 por navegador; teto padrão 200 |
| Novos navegadores | 1 a cada 20 s | 3 por segundo |
| Timeout por inatividade | 60 s (até 20 min com `keep_alive`) | 60 s (até 20 min com `keep_alive`) |

- **Funciona no plano Free**, mas 10 min/dia e 1 navegador novo a cada 20 s só servem para teste.
  Para uso real, **Workers Paid**. Uma inscrição típica usa 3 aberturas (inspect, preview e o
  preview+submit), cerca de 20–60 s de navegador no total.
- Depois de mudar de plano, faça um novo deploy do Worker (a doc avisa que o limite de 10 min/dia
  pode continuar até redeploy).
- O Browser Run sempre se identifica como robô; sites com proteção anti-bot podem bloquear.

## Ativação (passo a passo)

1. **Plano:** no painel da Cloudflare → Workers & Pages → Plans, confirme o plano (Free para
   testar, Paid para produção).
2. **Binding:** já está no `wrangler.jsonc` deste PR:
   ```jsonc
   "browser": { "binding": "BROWSER" }
   ```
   O `compatibility_date` (2026-09-25) já liga `nodejs_compat`, exigido pelo `@cloudflare/puppeteer`.
3. **Segredos do Worker** (já usados pelo Spotify; confira em Worker → Settings → Variables and
   Secrets): `SUPABASE_SECRET_KEY` (para validar a cobrança) — `SUPABASE_URL` e
   `SUPABASE_PUBLISHABLE_KEY` já estão em `vars`.
4. **Deploy do Worker:** acontece pelo Workers Builds ao fazer merge na `main`
   (`npm run build` + `npx wrangler deploy`). Para conferir antes: `npx wrangler deploy --dry-run`
   (deve listar `env.BROWSER — Browser Run`).
5. **Deploy da edge function `creative-router`** (já existente, não cria função nova):
   `supabase functions deploy creative-router`. Sem isso o modelo não recebe as instruções da
   ferramenta `browser_form` (o resto do chat segue igual).
6. **Teste local:** `npx wrangler dev` roda o Chrome da sua máquina; com
   `"browser": { "binding": "BROWSER", "remote": true }` usa o navegador real da Cloudflare.
7. **Teste de ponta a ponta:** no Vertal Chat, peça "preencha este formulário <url de um form de
   teste>" e confira: perguntas sobre o que falta → prévia → cartão de revisão → Enviar →
   confirmação.

## Limitações conhecidas

- Formulários em várias etapas (wizard), login, upload de arquivo e componentes de seleção
  personalizados (que escondem o `<select>` nativo) não são preenchidos automaticamente.
- Formulários dentro de `iframe` (ex.: alguns embeds) não são lidos; use o link direto do form.
- A guarda SSRF olha o nome/IP literal; a resolução DNS fica com a rede da Cloudflare, que não
  alcança redes privadas.
- O limitador de taxa é por isolate (não global). Se precisar de limite global, mover para uma
  tabela ou Durable Object.
