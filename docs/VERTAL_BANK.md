# Vertal Vibe Pay

> **Novo nome (19/11/2026):** VERTAL Bank → Vertal Vibe Bank → **Vertal Vibe Pay**,
> com logo oficial próprio (`public/vibe-pay/`). A troca de "Bank" por "Pay" segue a
> Res. Conjunta CMN/BCB nº 17/2025 e nº 16/2025 (ver §12.4). O arquivo continua com
> este nome para não quebrar links.

O Vertal Vibe Pay é a antiga **Carteira** do Vertal Dev, agora como uma conta
digital que junta dois provedores:

| Provedor | Papel no Vertal Vibe Pay |
|---|---|
| **ASAAS** (API v3) | **Conta Brasil**: subconta white-label por usuário, Pix (QR/copia e cola), boleto, cartão em reais, links de pagamento, saldo, extrato e **Pix de saída** |
| **Stripe** (Connect Express) | **Conta global**: conta conectada no país do titular (40+ países), recebimentos em 16 moedas, saldo multimoeda, saques para banco local, **cartões salvos** do usuário (SetupIntent) |

Rotas no app: **`/pay`** (principal, logado). `/bank`, `/wallet`, `/carteira` e
`/vertal-bank` redirecionam para `/pay` (301 no Worker, mantendo query string).
**Landing pública:** `/vibe-pay` (pt-BR) e `/<idioma>/vibe-pay` — ver §12.
`/vibe-bank`, `/<idioma>/vibe-bank`, `/vertal-vibe-bank` e `/vertal-vibe-pay`
redirecionam (301) para `/vibe-pay` no mesmo idioma (`worker/legacyRedirects.ts`). O bloco no **Perfil** continua
existindo (rota antiga) com o atalho "Abrir Vertal Vibe Pay". A Edge Function
continua se chamando **`wallet`** por compatibilidade.

> **Status:** PR em rascunho. Nada foi publicado: migration não aplicada,
> funções não publicadas, nenhuma chave nova configurada.

---

## 1. Telas (`src/pages/VertalBankPage.tsx`)

| Aba | O que faz |
|---|---|
| **Início** | Saldo unificado (BRL em destaque + outras moedas), a liberar, últimas movimentações, atalhos para abrir as contas |
| **Receber** | Pix, boleto, cartão ou link. O roteamento escolhe o provedor (§3) e mostra QR Code, linha digitável ou link |
| **Pagar** | Pix de saída (ASAAS, com chave digitada ou salva) e saque global (Stripe payout) — sempre com confirmação |
| **Extrato** | Extrato unificado (`bank_transactions` + `wallet_charges`) e, sob demanda, o extrato bruto de cada provedor (30 dias) |
| **Cartões e Pix** | Cartões salvos (Stripe) e chaves Pix cifradas — o mesmo componente da antiga Carteira |
| **Contas** | Abrir/acompanhar a conta Brasil (ASAAS) e a conta global (Stripe, com escolha de país), contas bancárias de saque, modo de saque, flags de Treasury/Global Payouts |

## 2. Cartões salvos (Stripe) — fluxo de ponta a ponta

1. `card-setup` → cria (ou reaproveita) o **Customer** do usuário
   (`profiles.stripe_customer_id`). Se o customer foi apagado ou é de outro
   modo (test × live), cria outro. Devolve o `client_secret` de um
   **SetupIntent** (`usage: off_session`) e a `STRIPE_PUBLISHABLE_KEY`.
2. O navegador monta o **Payment Element** (Stripe.js de `js.stripe.com`) e
   chama `confirmSetup`. O número do cartão **nunca** passa pelo nosso servidor
   (PCI SAQ A).
3. `card-attach { setupIntentId }` confere dono/status, recusa cartão duplicado
   (fingerprint), define padrão (`invoice_settings.default_payment_method`) e
   grava só bandeira, final, validade, tipo e país em `wallet_payment_methods`.
4. **Novo:** se o banco exigir 3D Secure com redirecionamento, a volta
   (`?setup_intent=…&redirect_status=succeeded`) agora conclui o `card-attach`
   sozinha (antes o cartão ficava no Stripe mas não aparecia no app).
5. `set-default` / `remove` (detach no Stripe) continuam iguais.

## 3. Roteamento entre provedores (`src/lib/bank/routing.ts`)

| Operação | Provedor |
|---|---|
| Pix / boleto (só BRL) | ASAAS |
| Cartão em BRL | ASAAS se a conta Brasil existir; senão Stripe |
| Link em BRL | Stripe se houver conta global; senão ASAAS |
| Qualquer outra moeda (USD, EUR…) | Stripe (conta global) |
| Pix de saída | ASAAS |
| Saque para banco (qualquer país) | Stripe (payout da conta conectada) |

O mesmo arquivo existe no servidor (`supabase/functions/_shared/bankRouting.ts`);
um teste garante que os dois são idênticos.

## 4. Edge Functions

| Função | `verify_jwt` | Ações |
|---|---|---|
| `wallet` | `true` | as antigas (`list`, `card-*`, `pix-*`, `set-default`, `remove`, `connect-*`) + **novas** em `wallet/bank.ts`: `bank-overview`, `bank-statement`, `bank-provider-statement`, `bank-receive`, `bank-send-pix`, `bank-payout`, `bank-payout-mode`, `asaas-open`, `asaas-status`, `asaas-card-charge`, `asaas-card-tokens`. `connect-onboard` agora aceita `{ country, returnPath }` |
| **`asaas-webhook`** (nova) | `false` | eventos `PAYMENT_*`, `TRANSFER_*`, `ACCOUNT_STATUS_*` das subcontas |
| `stripe-connect-webhook` | `false` | + `payout.paid`, `payout.failed`, `payout.canceled` → `bank_transactions` |

Só **uma** função nova foi criada (o resto foi dobrado no `wallet`) para não
pressionar o limite de funções do projeto.

## 5. Banco de dados (migration `20261119150000_vertal_bank.sql`)

| Tabela | Acesso | Conteúdo |
|---|---|---|
| `bank_asaas_accounts` | só service role | subconta ASAAS do usuário: `asaas_account_id`, `wallet_id`, **apiKey cifrada** (AES-GCM, `CONNECTOR_ENC_KEY`), CPF/CNPJ mascarado, status |
| `bank_asaas_card_tokens` | só service role | `creditCardToken` do ASAAS cifrado + bandeira/final (nunca o número) |
| `bank_transactions` | usuário **lê** as próprias linhas (RLS); só service role escreve | extrato unificado (entradas/saídas, Stripe e ASAAS) |
| `bank_webhook_events` | só service role | idempotência dos webhooks |
| `connected_accounts` | + colunas `country`, `default_currency` | **Correção de segurança:** removidas as policies que deixavam o usuário inserir/alterar o próprio vínculo e o espelho de status (`charges_enabled` etc.) direto pelo cliente |

Aplique a migration **antes** de publicar a nova versão do `wallet` (ela grava
`country`/`default_currency`).

## 6. Secrets

### Stripe (já existentes / pendentes)

| Secret | Situação |
|---|---|
| `STRIPE_SECRET_KEY` | configurado (chave restrita) |
| `STRIPE_PUBLISHABLE_KEY` | **falta** (`pk_live_…`) — sem ela não dá para salvar cartão |
| `STRIPE_WEBHOOK_SECRET` | **falta** (endpoint da plataforma) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | **falta** (endpoint Connect) |

A chave restrita precisa de: Connect (accounts, account links, login links,
external accounts — leitura), **Balance** (leitura), **Balance transactions**
(leitura), **Payouts** (escrita), Customers, SetupIntents, PaymentMethods,
Checkout Sessions e, para criar os webhooks pela API, `webhook_write`.
No endpoint Connect, assine também `payout.paid`, `payout.failed`,
`payout.canceled`.

### ASAAS (novos)

| Secret | Uso |
|---|---|
| `ASAAS_API_KEY` | chave da **conta-pai** (CNPJ) — só cria subcontas. Sem ela, tudo de ASAAS fica desligado (`asaas_not_configured`) |
| `ASAAS_ENV` | `sandbox` (padrão) ou `production` |
| `ASAAS_WEBHOOK_TOKEN` | token aleatório (32+ caracteres, **não** use uma API key). Vai no `authToken` do webhook de cada subconta e é conferido no header `asaas-access-token` |
| `ASAAS_WEBHOOK_EMAIL` | opcional — e-mail que o ASAAS avisa se o webhook falhar |
| `ASAAS_PLATFORM_WALLET_ID` | opcional — `walletId` da conta-pai; quando existe, cada cobrança tem **split de 1%** para a VERTAL |
| `ASAAS_DIRECT_CARD_ENABLED` | `false` (padrão). Ver §8 |
| `BANK_PIX_OUT_MAX_BRL` | limite por Pix de saída (padrão 5000) |

### Stripe Treasury / Global Payouts (flags)

| Secret | Padrão |
|---|---|
| `BANK_STRIPE_TREASURY_ENABLED` | `false` |
| `BANK_STRIPE_GLOBAL_PAYOUTS_ENABLED` | `false` |

## 7. Conta global (Stripe)

- **País:** o titular escolhe entre 42 países (`src/lib/bank/countries.ts`). A
  documentação do Stripe diz que plataformas no Brasil podem criar contas
  Express "para a maioria dos países que o Stripe suporta", **mas cada país
  precisa ser habilitado** em *Connect → Settings → Onboarding*
  (https://docs.stripe.com/connect/express-accounts). O país não muda depois.
- **Recebimento:** direct charges na conta conectada (o dinheiro fica no saldo
  dela, em BRL/USD/EUR… conforme a conta), com `application_fee_amount` de 1%.
- **Saque:** `bank-payout` cria um payout manual para a conta bancária da conta
  conectada, na moeda do saldo. Payout manual exige o cronograma `manual`
  (botão "Guardar saldo" → `bank-payout-mode`); no automático o Stripe repassa
  sozinho todo dia.
- **Limites conhecidos (docs.stripe.com):**
  - *Cross-border payouts* (a plataforma transferir para contas de outro país)
    só existem para plataformas nos EUA, UK, EEE, Canadá e Suíça
    (https://docs.stripe.com/connect/cross-border-payouts). Por isso o VERTAL
    Bank usa **direct charges**: cada conta recebe direto e saca no próprio
    país, sem transferência internacional da plataforma.
  - **Treasury / Financial Accounts:** disponível para empresas nos **EUA e
    UK**; Austrália e UE em *private preview* (https://docs.stripe.com/treasury).
    Uma plataforma brasileira não tem Treasury hoje. O código só consulta
    `treasury.financialAccounts` com `BANK_STRIPE_TREASURY_ENABLED=true` e
    mostra "indisponível" se o Stripe recusar.
  - **Global Payouts:** só para empresas nos **EUA e UK** (UE/Austrália em
    preview) e exige Treasury (https://docs.stripe.com/global-payouts). Não há
    implementação de envio — fica atrás de `BANK_STRIPE_GLOBAL_PAYOUTS_ENABLED`
    e só aparece como "desligado" na tela. Para usar seria preciso uma entidade
    da VERTAL nos EUA/UK com a conta Stripe dela.

## 8. Conta Brasil (ASAAS)

- **Abrir conta** (`asaas-open`): cria uma **subconta** com a chave da conta-pai
  (`POST /v3/accounts`), já com o webhook do Vertal Vibe Pay configurado. A
  `apiKey` da subconta só aparece nessa resposta: é cifrada e guardada. O ASAAS
  envia ao titular um e-mail para criar senha e mandar documentos (fluxo
  **não-BaaS**).
- **Receber** (`bank-receive`): cria/acha o cliente pagador por CPF/CNPJ e a
  cobrança (`POST /v3/payments`) — Pix (`/pixQrCode`), boleto
  (`/identificationField`), cartão (fatura hospedada do ASAAS, `invoiceUrl`) ou
  link (`POST /v3/paymentLinks`). Boleto a partir de R$ 5,00.
- **Pix de saída** (`bank-send-pix`): `POST /v3/transfers` com `operationType:
  PIX`; confere saldo e limite antes. Só com a subconta **aprovada**.
- **Saldo / extrato:** `GET /v3/finance/balance` e `GET /v3/financialTransactions`.
- **Cartão direto (tokenização):** `asaas-card-charge` cobra com cartão digitado
  e guarda o `creditCardToken` (cifrado) para cobranças futuras. **Fica
  desligado** (`ASAAS_DIRECT_CARD_ENABLED=false`) porque o número do cartão
  passa pela Edge Function a caminho do ASAAS, o que coloca o app no escopo
  PCI-DSS mais pesado (SAQ D). O caminho padrão é a fatura hospedada do ASAAS.

## 9. Webhooks a cadastrar

| Provedor | URL | Eventos |
|---|---|---|
| ASAAS (automático em cada subconta nova) | `https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/asaas-webhook` | `PAYMENT_*`, `TRANSFER_*`, `ACCOUNT_STATUS_GENERAL_APPROVAL_*` |
| Stripe Connect | `…/functions/v1/stripe-connect-webhook` | os 5 do `docs/STRIPE.md` + `payout.paid`, `payout.failed`, `payout.canceled` |

Mesmo sem webhook, o extrato sincroniza até 10 itens pendentes do ASAAS a cada
abertura, e `connect-status` sincroniza as cobranças Stripe.

## 10. Conformidade — leia antes de divulgar

- **A VERTAL não vira banco.** Nem o Stripe nem o ASAAS tornam a VERTAL uma
  instituição financeira ou de pagamento. O dinheiro fica em contas no Stripe
  e no ASAAS, em nome de cada titular. Evite chamar de "banco" em material
  público sem orientação jurídica: "Vertal Vibe Pay" é marca de produto. Ver também §12.4 (Resolução Conjunta BCB/CMN nº 17/2025). O rodapé da
  tela já diz isso.
- **Subcontas ASAAS:** a conta-pai precisa ser **CNPJ** (Resoluções Conjuntas
  BCB nº 16 e 17). Novos integradores entram num **período de avaliação
  regulatória**: até 10 subcontas, R$ 2.000 em cobranças por subconta, até 60
  dias — depois disso bloqueia até a homologação. Em sandbox, até 20
  subcontas/dia. A manutenção da apiKey das subcontas depois da avaliação exige
  enquadramento no **BaaS do ASAAS** (ou subcontas filiais do mesmo CNPJ).
  Pode haver taxa por subconta criada.
- **Transferências ASAAS** podem exigir autorização por token SMS ou o
  [mecanismo de validação de saque via webhook](https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks);
  nesse caso o Pix fica "pendente" com o motivo no extrato.
- **Stripe:** Express no Brasil exige KYC do titular; a plataforma responde
  por fraude/chargebacks conforme o tipo de cobrança. Cada país da conta
  global precisa estar habilitado no painel.
- **LGPD/PCI:** número de cartão nunca é gravado. CPF/CNPJ do titular é guardado
  só mascarado; chaves Pix e apiKeys, cifradas.

## 11. Checklist para ir ao ar

- [ ] Revisar e fazer merge do PR (depois do #188).
- [ ] Aplicar a migration `20261119150000_vertal_bank.sql` no projeto
      `sccizjlpwezsgaxkclot`.
- [ ] Publicar `wallet`, `asaas-webhook` e `stripe-connect-webhook`.
- [ ] Stripe: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_CONNECT_WEBHOOK_SECRET`; permissões da chave restrita (§6);
      habilitar os países desejados em Connect → Onboarding.
- [ ] ASAAS: criar a conta-pai (CNPJ), gerar a API key **de sandbox** primeiro,
      configurar `ASAAS_API_KEY`, `ASAAS_ENV=sandbox`, `ASAAS_WEBHOOK_TOKEN`
      (e `ASAAS_PLATFORM_WALLET_ID` para o split de 1%).
- [ ] Teste sandbox: abrir conta Brasil → Pix de R$ 5 → pagar no simulador →
      ver "Concluído" no extrato → Pix de saída.
- [ ] Só então trocar para a chave de produção e `ASAAS_ENV=production`.

## 12. Landing pública e SEO internacional

### 12.1 Páginas

Geradas no build como **HTML estático** (sem React, conteúdo completo no
HTML) por `vite-plugins/vibePay.ts`, a partir de `src/config/vibePay.ts`
(marca, rotas e todos os textos). O plugin de SEO (`vite-plugins/seo.ts`)
grava os arquivos em `dist/` e põe as URLs no `sitemap.xml` e no `rss.xml`.

| Idioma | URL | Arquivo em `dist/` |
|---|---|---|
| pt-BR (raiz) | https://vertal.dev/vibe-pay | `vibe-pay.html` |
| en (x-default) | https://vertal.dev/en/vibe-pay | `en/vibe-pay.html` |
| es | https://vertal.dev/es/vibe-pay | `es/vibe-pay.html` |
| fr | https://vertal.dev/fr/vibe-pay | `fr/vibe-pay.html` |
| de | https://vertal.dev/de/vibe-pay | `de/vibe-pay.html` |
| it | https://vertal.dev/it/vibe-pay | `it/vibe-pay.html` |
| ja | https://vertal.dev/ja/vibe-pay | `ja/vibe-pay.html` |
| zh-CN | https://vertal.dev/zh-CN/vibe-pay | `zh-CN/vibe-pay.html` |
| hi | https://vertal.dev/hi/vibe-pay | `hi/vibe-pay.html` |
| ar (RTL) | https://vertal.dev/ar/vibe-pay | `ar/vibe-pay.html` |
| ko | https://vertal.dev/ko/vibe-pay | `ko/vibe-pay.html` |
| ru | https://vertal.dev/ru/vibe-pay | `ru/vibe-pay.html` |
| tr | https://vertal.dev/tr/vibe-pay | `tr/vibe-pay.html` |
| id | https://vertal.dev/id/vibe-pay | `id/vibe-pay.html` |

Cada página tem: `<title>` (≤ 65) e meta description (≤ 155) próprios,
`meta keywords` (Yandex/Baidu/Naver), canonical, `hreflang` de todas as
versões + `x-default` (inglês), Open Graph (`og:locale` + alternates, imagem
1200×630) e Twitter `summary_large_image`, JSON-LD (`Organization`, `WebSite`,
`WebPage`, `BreadcrumbList`, `SoftwareApplication` com `applicationCategory:
FinanceApplication`, `FAQPage`). **Não** usa `BankOrCreditUnion` nem
`FinancialService` (a VERTAL não é banco; `FinancialService` é tipo de
estabelecimento local). Os botões levam a `/auth?redirect=%2Fpay`.

Para adicionar um idioma: acrescente um objeto em `VIBE_PAY_COPY` (o código
precisa existir em `src/config/locales.ts`); sitemap, hreflang e seletor de
idioma se ajustam sozinhos. `src/test/vibe-pay-seo.test.ts` confere limites,
idiomas obrigatórios, a linha de conformidade, os redirecionamentos e que
nenhum nome/título/descrição/H1/keywords usa "banco/bank" em qualquer idioma.

Outros pontos:
- **SPA:** `/vibe-pay` também é rota do React (`VibePayLandingPage`, mesmo
  texto em pt-BR) para navegação interna e `vite dev`. O service worker não
  intercepta `/vibe-pay` (`navigateFallbackDenylist`), então quem já tem o
  PWA instalado recebe o HTML estático.
- **Pay Per Crawl:** `/vibe-pay` e `/<idioma>/vibe-pay` têm preço 0
  (`worker/payPerCrawl.ts`).
- **robots.txt:** `Allow: /vibe-pay` e `Allow: /*/vibe-pay` explícitos.
- **Links internos:** rodapé da home (`Index.tsx`) e rodapé das páginas
  traduzidas (`/<idioma>`, `/<idioma>/alternativas…`) apontam para a landing.
- **Redirecionamentos 301** (`worker/legacyRedirects.ts`, antes dos assets):
  `/vibe-bank` → `/vibe-pay`, `/<idioma>/vibe-bank` → `/<idioma>/vibe-pay`,
  `/vertal-vibe-bank` → `/vibe-pay`, `/vibe-bank/<arquivo>` → `/vibe-pay/<arquivo>`
  (OG antigo em cache), `/bank`/`/wallet`/`/carteira`/`/vertal-bank` → `/pay`.
  O React Router tem os mesmos aliases (navegação interna e `vite dev`).
- **Imagens** (`public/vibe-pay/`): `logo.webp`/`logo.png` (960×640),
  `og-image.jpg` (1200×630), `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png` (180), `icon-64.webp` (emblema "V") — gerados do logo
  oficial 1536×1024 (fundo preto, "VERTAL VIBE PAY" com PAY em roxo).

### 12.2 Conformidade dos textos e palavras-chave

Nenhum idioma chama o produto de banco: nome, `<title>`, description, H1 e
keywords falam em **conta digital / conta global / carteira digital / conta
multimoeda / receber pagamentos do exterior / Pix / links de pagamento** (e
equivalentes: *global account, multi-currency account, digital wallet, receive
payments worldwide; cuenta global, billetera digital; compte global, portefeuille
numérique; globales Konto, digitale Wallet; conto globale, wallet digitale;
グローバル口座, デジタルウォレット; 全球账户, 数字钱包; ग्लोबल खाता, डिजिटल वॉलेट;
حساب عالمي, محفظة رقمية; 글로벌 계좌, 디지털 지갑; глобальный счёт, цифровой кошелёк;
küresel hesap, dijital cüzdan; akun global, dompet digital*).
A **única** menção a banco é para negar: a 1ª pergunta do FAQ ("O Vertal Vibe
Pay é um banco? Não…", que também capta buscas por "banco digital") e a linha
de conformidade no fim da página: as contas são fornecidas pelo **Stripe e pelo
ASAAS**; a Vertal não é banco. Não prometemos licença bancária, cartão emitido,
rendimento, garantia do FGC nem tarifas zero (só o cadastro no Vertal Dev é
grátis). Traduções de hi, ar, ja, zh-CN, ko, ru, tr e id foram feitas sem
revisão nativa: vale revisar.

### 12.3 Depois do deploy (não feito)

1. Conferir no ar: `curl -s https://vertal.dev/en/vibe-pay | grep canonical`
   e o `sitemap.xml` com as 14 URLs; validar no
   [Rich Results Test](https://search.google.com/test/rich-results) e no
   [Schema Markup Validator](https://validator.schema.org/).
2. **Google Search Console** (propriedade de domínio `vertal.dev`): Sitemaps →
   enviar `https://vertal.dev/sitemap.xml`; Inspeção de URL → "Solicitar
   indexação" para `/vibe-pay` e `/en/vibe-pay`. Conferir "Segmentação
   internacional"/hreflang em alguns dias.
3. **Bing Webmaster Tools**: importar do Search Console ou adicionar o site e
   enviar o sitemap. O índice do Bing também alimenta **Yahoo, DuckDuckGo e
   Ecosia**.
4. **IndexNow** (Bing, Yandex, Naver, Seznam): `node scripts/indexnow.mjs`
   (lê o sitemap publicado; com `BING_WEBMASTER_API_KEY` também usa a URL
   Submission API do Bing).
5. **Yandex Webmaster** (webmaster.yandex.com): adicionar o site, verificar e
   enviar o sitemap (público russo).
6. **Baidu Ziyuan** (ziyuan.baidu.com): exige verificação e funciona melhor
   com acesso rápido a partir da China; enviar o sitemap e as URLs `zh-CN`.
7. **Naver Search Advisor** (searchadvisor.naver.com): enviar sitemap e
   `rss.xml` (a verificação do Naver já existe no Worker).
8. Opcional: Seznam (cs), e compartilhar a URL `/vibe-pay` nas redes da KUBO
   (X, GitHub, Telegram) para os primeiros backlinks.

### 12.4 Nome (Brasil) — por que "Pay"

- **Resolução Conjunta CMN/BCB nº 17/2025:** veda "banco"/"bank" (e
  variações) em nome, marca, domínio e comunicação de quem não tem licença
  bancária; prazo de adequação até **28/11/2026**.
- **Resolução Conjunta CMN/BCB nº 16/2025:** provedores de BaaS (como o ASAAS)
  não podem contratar com parceiros que usem esses termos.

Por isso o produto passou de "Vertal Vibe Bank" para **Vertal Vibe Pay** em
19/11/2026 (aprovado pelo dono do produto): marca, rotas (`/vibe-pay`, `/pay`),
textos em 14 idiomas, JSON-LD (`alternateName` sem "Bank"), OG e logo. As
rotas antigas respondem 301. Nomes internos de código/banco de dados
(`bank-*`, `src/lib/bank`, migration `vertal_bank`) não aparecem ao usuário e
ficaram como estão. Validar o nome final com advogado antes de divulgar
continua recomendado.
