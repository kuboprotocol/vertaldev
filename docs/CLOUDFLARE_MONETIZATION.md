# Monetização da Cloudflare no vertal.dev

O site roda num Worker (`worker/index.ts`) na frente do build estático. Ele liga
os dois produtos de monetização da Cloudflare:

| Produto | Quem paga | Como | Status na Cloudflare |
|---|---|---|---|
| **Pay Per Crawl** (AI Crawl Control) | Crawlers de IA (GPTBot, ClaudeBot…) | Cobrança por página; Cloudflare é Merchant of Record e paga via Stripe | Beta fechado |
| **Monetization Gateway** | Agentes de IA e APIs | x402 — stablecoin (USDC) direto para a carteira configurada | Beta fechado (desde 30/09/2026) |

Os dois precisam ser **liberados e ligados no painel**. O código já está pronto e
não muda nada enquanto estiverem desligados.

## 1. Pay Per Crawl

### Painel
1. Peça acesso: <https://www.cloudflare.com/paypercrawl-signup/>.
2. **AI Crawl Control → Account Settings**: deixe `vertal.dev` como *Visible* e conecte a conta Stripe para os repasses.
3. **AI Crawl Control → Payments → Pay Per Crawl → Enable**: defina o preço padrão (mínimo US$ 0,001) e marque **Enable dynamic pricing**.
4. **AI Crawl Control → Crawlers**: escolha *Charge* nos crawlers que devem pagar.

### O que o Worker faz
Com o preço dinâmico ligado, a Cloudflare envia `cf-pay-per-crawl: ...pricing=in-band`
e o Worker responde com `Crawler-Price` conforme a tabela em `worker/payPerCrawl.ts`:

| Caminho | Preço por página |
|---|---|
| `/`, `/pricing`, `/privacy`, `/terms`, `/support`, `/download` | grátis (descoberta) |
| `/docs/*` | US$ 0,010 |
| `/alternativas/*`, `/agents/*`, `/connectors/*` | US$ 0,005 |
| qualquer outro | preço padrão do painel |

`/robots.txt` e `/sitemap.xml` são sempre gratuitos pela própria Cloudflare.
Para mudar preços, edite `RULES` em `worker/payPerCrawl.ts`.

## 2. Monetization Gateway (x402)

### Painel
1. Peça acesso: **Monetize → Monetization Gateway** no painel.
2. Configure a carteira de recebimento (`payTo`), a rede e o preço das rotas.

### O que o Worker faz
Rotas listadas em `MONETIZATION_GATEWAY_PATHS` (`wrangler.jsonc → vars`, separadas
por vírgula, ex.: `"/api/paid"`) só são servidas com um `PAYMENT-CONTEXT` válido:
JWT Ed25519 assinado pelo JWKS fixo `https://payments.cloudflare.com/certs`, dentro
da validade e com `aud` igual à URL pedida. Sem isso o Worker devolve **402** e
nunca entrega o conteúdo pago. Hoje a lista está vazia: nenhuma rota é cobrada.

Preço variável (`upto`, header `PAYMENT-SETTLEMENT`) ainda não é usado.

## Custos e observações
- O Worker roda antes de todas as páginas (exceto `/assets/*`, `/js/*` e arquivos do PWA), então cada visita a uma página conta como requisição de Worker (plano gratuito: 100 mil/dia).
- Com o Worker na frente, o `public/_headers` não se aplica a essas respostas; os headers de segurança são repetidos em `worker/index.ts`.
- Se um crawler estiver bloqueado no WAF/Bot Management, o bloqueio vence a cobrança.
