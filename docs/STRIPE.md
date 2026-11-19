# Stripe no Vertal Dev

Como o Vertal Dev cobra com o Stripe: a conta da plataforma, o Stripe Connect
da Carteira (perfil → Carteira), as Edge Functions, os secrets, os webhooks e o
que falta para ir para produção.

> A Carteira agora se chama **Vertal Vibe Pay** (`/pay`, antes `/bank`; landing pública em `/vibe-pay`) e também usa o ASAAS.
> Veja `docs/VERTAL_BANK.md` para a conta global (país do titular, saldos
> multimoeda, saques) e a conta Brasil (Pix, boleto, subcontas ASAAS).

## 1. Conta da plataforma

| Campo | Valor |
|---|---|
| Conta | **Vertal Company** |
| ID | `acct_1Tsnb8QarzeTlyCY` |
| País / modo | BR · **live** · moeda padrão BRL |
| Login do painel | `borgessument@gmail.com` |

É a conta dona do `STRIPE_SECRET_KEY` e **recebe todos os pagamentos** do
Vertal Dev, do Vertal Run e do Vertal App (planos, créditos e a taxa de 1% das
cobranças da Carteira). O CNPJ gravado nos metadados das contas conectadas e
das cobranças vem de `PLATFORM_CNPJ` (padrão `65.822.139/0001-66`).

## 2. Stripe Connect Express (Carteira)

Cada usuário pode ativar recebimentos na Carteira. O fluxo fica todo em
`supabase/functions/wallet` (ações `connect-*`) e na UI
`src/components/profile/WalletSection.tsx`.

### Onboarding

1. **Ativar com Stripe** → `connect-onboard`.
2. Sem conta vinculada, a função tenta **adotar uma conta existente** (ver §6);
   se não achar, cria uma conta `type: "express"` no país escolhido
   (`country`, padrão `BR`; lista em `src/lib/bank/countries.ts`), com
   `card_payments` e `transfers` e `metadata.supabase_user_id`, e grava em
   `connected_accounts`.
3. Devolve um **account link** (`account_onboarding`) com
   `refresh_url = <origem>/profile?wallet=connect-refresh` e
   `return_url = <origem>/profile?wallet=connect-return`. A origem só é aceita se
   for kubovibe.dev, vertal.dev, lovable.app, lovableproject.com, workers.dev ou
   localhost; senão cai em `https://kubovibe.dev`.

### Status e `past_due`

`connect-status` busca a conta no Stripe, atualiza o espelho em
`connected_accounts` (`charges_enabled`, `payouts_enabled`, `details_submitted`,
`requirements_disabled_reason`, `requirements_due`, `status_synced_at`) e
devolve:

- `pendingRequirements` — itens únicos de `past_due` + `currently_due`;
- `pastDue` — quantidade em `past_due`;
- `disabledReason` e `currentDeadline`.

Na UI:

| Situação | Título | Botão |
|---|---|---|
| Sem conta | Receba em qualquer moeda | **Ativar com Stripe** |
| Conta com `past_due` | Verificação pendente | **Concluir verificação** |
| Conta em análise / `currently_due` | Verificação em andamento | **Continuar verificação** |
| `charges_enabled` | Recebimentos ativos | **Painel** · **Nova cobrança** |

Os botões de verificação chamam `connect-onboard` de novo, que só gera outro
account link para a conta já vinculada. O mesmo `connect-status` também
sincroniza até 10 cobranças `open` com a Checkout Session no Stripe.

### Painel (dashboard)

`connect-dashboard` lê `controller.stripe_dashboard.type` da conta:

- `express` → `accounts.createLoginLink` (painel Express);
- qualquer outro (`none`, contas sem painel) → **fallback para account link**
  (`account_update` se `details_submitted`, senão `account_onboarding`).

### Cobranças: direct charges com taxa de 1%

`connect-charge { amount, currency, description? }`:

- exige conta vinculada e `charges_enabled` (senão `connect_not_ready`);
- cria uma Checkout Session `mode: "payment"` **na conta conectada**
  (`stripeAccount`), ou seja, **direct charge**: as tarifas do Stripe ficam com o
  recebedor;
- `application_fee_amount` = **1% do valor, arredondado, mínimo 1 unidade
  mínima** da moeda (`platformFeeFor` em `supabase/functions/_shared/walletCurrency.ts`,
  espelho de `src/lib/wallet/currency.ts`, com teste garantindo igualdade);
- `metadata.source = "wallet"` na sessão (é o que o webhook Connect filtra);
- grava a cobrança em `wallet_charges` (status `open` → `paid` / `failed` / `expired`).

Moedas aceitas (16): BRL, USD, EUR, GBP, CAD, AUD, CHF, MXN, ARS, **CLP**, COP,
PEN, UYU, **JPY**, CNY, INR. CLP e JPY têm 0 casas decimais; as demais, 2. Valor
máximo: 99.999.999 na menor unidade; o valor precisa ser maior que 1 unidade mínima.

## 3. Edge Functions (projeto Supabase `sccizjlpwezsgaxkclot`)

| Função | `verify_jwt` | Ações / rotas |
|---|---|---|
| `wallet` | `true` | POST `{ action }`: `list`, `card-setup`, `card-attach`, `pix-add`, `pix-brcode`, `set-default`, `remove`, `connect-status`, `connect-onboard`, `connect-dashboard`, `connect-charge` |
| `stripe-connect-webhook` | `false` | Eventos de contas conectadas (§5) → `connected_accounts`, `wallet_charges` |
| `stripe-webhook` | `false` | Eventos da plataforma (§5) → `subscriptions`, `credit_orders`, comissão de afiliado |
| `stripe-connect-account` | — | `POST ?action=create` (`display_name`, `contact_email`) cria conta Express BR · `GET ?action=status&stripe_account_id=…` · `GET ?action=list` |
| `stripe-connect-onboard` | — | POST `{ account_id, refresh_url?, return_url? }` → account link (só para conta do próprio usuário) |
| `stripe-connect-checkout` | — | Checkout com **destination charge** (`transfer_data.destination`) e taxa de **10%**; fluxo legado da página `/connect`, separado da Carteira |
| `stripe-connect-products` | — | `GET` lista `connect_products` (público) · `POST` cria produto/preço na plataforma com o `connected_account_id` nos metadados |

`verify_jwt` vem de `supabase/config.toml`; as funções `stripe-connect-*` validam
o JWT no código. A Carteira usa só `wallet` + `stripe-connect-webhook`.

Tabelas: `connected_accounts` (vínculo usuário ↔ `acct_…` + espelho do status,
migration `20261119090000_connected_accounts_status.sql`), `wallet_charges`,
`wallet_payment_methods`, `profiles.stripe_customer_id`.

## 4. Secrets

Em Lovable Cloud → Settings → Functions → Secrets (ou `supabase secrets set`):

| Secret | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Chave da conta Vertal Company (`sk_live_…` ou chave restrita `rk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…`; o `wallet` devolve para o Stripe Elements (sem ela, `card-setup` falha) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` do endpoint **da plataforma** (`stripe-webhook`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_…` do endpoint **Connect** (`stripe-connect-webhook`); é outro segredo |

Opcional: `PLATFORM_CNPJ`. Nunca coloque nenhum deles em variável `VITE_*`.

## 5. Webhooks

São **dois endpoints**, cada um com seu segredo de assinatura.

### Plataforma

`https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/stripe-webhook`

| Evento | O que faz |
|---|---|
| `checkout.session.completed` | Ativa o plano (`metadata.plan`) ou credita a recarga (`metadata.kind = credit_topup`); sessões sem plano são confirmadas e ignoradas |
| `customer.subscription.deleted` | Volta o usuário para `free` |
| `invoice.payment_succeeded` | Renova `paid_at`; renovações geram comissão de afiliado |

### Connect (`connect=true`, "Events on connected accounts")

`https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/stripe-connect-webhook`

| Evento | O que faz |
|---|---|
| `account.updated` | Espelha o status em `connected_accounts` |
| `checkout.session.completed` | `wallet_charges` → `paid` (se `payment_status = paid`) |
| `checkout.session.async_payment_succeeded` | → `paid` |
| `checkout.session.async_payment_failed` | → `failed` |
| `checkout.session.expired` | → `expired` |

Só sessões com `metadata.source = "wallet"` são processadas; uma cobrança já
`paid` nunca é rebaixada. Mesmo sem o webhook, `connect-status` sincroniza as
cobranças abertas.

Criar pela API (precisa de chave com permissão de escrita em webhooks):

```bash
curl https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" \
  -d url=https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/stripe-connect-webhook \
  -d connect=true \
  -d "enabled_events[]=account.updated" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed" \
  -d "enabled_events[]=checkout.session.expired"
```

O `secret` (`whsec_…`) só aparece na resposta de criação; guarde-o como
`STRIPE_CONNECT_WEBHOOK_SECRET`.

## 6. Vincular contas conectadas que já existem

Quando o usuário não tem linha em `connected_accounts`, `connect-status` e
`connect-onboard` procuram na plataforma (até 500 contas):

1. uma conta com `metadata.supabase_user_id` = id do usuário; ou
2. só se o e-mail do usuário estiver **confirmado**: uma conta com o mesmo
   e-mail e **sem** `supabase_user_id`.

Se a conta não estiver vinculada a outro usuário, grava o vínculo, preenche
`metadata.supabase_user_id` no Stripe e sincroniza o status.

Contas criadas com um e-mail que não é usuário do Vertal Dev não são adotadas
sozinhas. Nesse caso: o dono entra com esse e-mail (e confirma), **ou** se
vincula manualmente:

```sql
insert into public.connected_accounts (user_id, stripe_account_id, contact_email)
values ('<uuid do usuário>', 'acct_…', '<e-mail>');
```

Depois, abra a Carteira (ou chame `connect-status`) para sincronizar.

## 7. Checklist de go-live

- [ ] Chave com permissão de escrita em webhooks (`webhook_write`) **ou** criar
      os dois endpoints no painel: Developers → Webhooks → Add endpoint (no
      Connect, marcar "Events on connected accounts").
- [ ] Endpoint da plataforma com os 3 eventos da §5 → `STRIPE_WEBHOOK_SECRET`.
      Sem ele o `stripe-webhook` responde "Key length is zero" em todo evento.
- [ ] Endpoint Connect com os 5 eventos da §5 → `STRIPE_CONNECT_WEBHOOK_SECRET`.
- [ ] `STRIPE_PUBLISHABLE_KEY` (`pk_live_…`) configurada.
- [ ] Connect habilitado na conta da plataforma, com contas Express e país BR.
- [ ] Merge do PR #188 (`fix/wallet-connect-e2e`), migration aplicada e funções
      `wallet`, `stripe-connect-webhook` e `stripe-webhook` publicadas.
- [ ] Teste: Ativar com Stripe → concluir onboarding → Nova cobrança pequena →
      conferir `wallet_charges = paid` e a taxa de 1% em Payments → Collected fees.
