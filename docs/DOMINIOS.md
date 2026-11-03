# Domínios: compra e transferência

Status: **em desenvolvimento** (PR #93, em rascunho). Este documento descreve o modelo decidido e o que já existe no código.

## Modelo

A plataforma revende domínios, no estilo de Lovable e Replit. O Dev escolhe o domínio dentro do app, paga com cartão no checkout, e o domínio é ligado ao projeto publicado. A origem do domínio (IONOS) aparece de forma discreta no painel e no recibo.

- **Registrador:** IONOS, via API de reseller (`https://api.ionos.com/reseller/v2`, `https://api.hosting.ionos.com/domains/v1`).
- **Cobrança:** cartão no checkout, cobrado antes do pedido ser feito na IONOS. Não usa créditos.
- **Margem:** preço de atacado da IONOS por extensão **+ 38%**.
- **Reembolso:** domínio é não reembolsável na maioria dos casos. Isso precisa aparecer no checkout.

## Preço

Preço final = atacado IONOS (por extensão, em USD) × 1,38.

| Extensão | Atacado IONOS | Preço final (×1,38) |
|----------|---------------|---------------------|
| _a preencher_ | _a preencher_ | _a preencher_ |

> **Pendente:** a tabela de atacado ainda não está no repositório. Enquanto ela não entrar, o preço final não existe. A `TLD_PRICES` em `supabase/functions/domain-purchase/index.ts` e `domain-search/index.ts` são valores de teste em créditos e **não devem ser usadas para cobrança real**.

## Fluxo de compra (alvo)

1. Dev abre `/builder/:projectId/dominio` depois de publicar.
2. Busca o nome. A busca usa `cloudflare-domains` (Registrar da Cloudflare) **ou** IONOS, a definir; hoje só a Cloudflare tem função de busca.
3. Dev escolhe o domínio e vê o preço final com impostos, a política de não reembolso e o botão de pagar.
4. Pagamento com cartão no checkout.
5. Após o pagamento confirmado, a plataforma cria o pedido na IONOS (`domainorders`).
6. A plataforma aponta o domínio para o Worker publicado (`domain-dns` / `domain-connect`).
7. Dev vê "domínio ativo", com o nome da IONOS discreto no painel.

Hoje existe apenas `domain-purchase`, que debita **créditos** e depois compra na IONOS. Ele precisa ser trocado pelo fluxo de cartão. Ordem invertida (cobrar antes de comprar) é obrigatória, para não sair dinheiro da plataforma.

## Fluxo de transferência (alvo)

1. Dev informa o domínio e o código de autorização (EPP / auth code).
2. Plataforma verifica elegibilidade (domínio desbloqueado, DNSSEC desligado, não transferido nos últimos 60 dias).
3. Cobrança igual à de compra (cartão no checkout).
4. Transferência iniciada na IONOS (`domain-transfer` já faz isso, com a IONOS). Hoje esse fluxo **não cobra**: precisa passar a cobrar antes de iniciar.
5. Status acompanhado até a conclusão (1 a 10 dias).

Hoje a aba "Transferir" da subpágina só mostra os requisitos. Não envia nada.

## Registrador Cloudflare (busca)

A função `cloudflare-domains` consulta disponibilidade e preço pela Registrar API da Cloudflare (beta). **Somente leitura.** Requer:

- `CLOUDFLARE_API_TOKEN` com permissão de Registrar.
- `CLOUDFLARE_ACCOUNT_ID`.
- Billing profile, contato de registrante e aceite do Domain Registration Agreement na conta.

A Cloudflare vende a preço de custo e não tem programa de afiliados ou revenda para domínio (ver pesquisa de novembro de 2026). Por isso ela não entra no fluxo de compra. Só serve para busca, se você quiser comparar preço.

## Estado atual (implementado, não testado de ponta a ponta)

| Peça | Arquivo | O que faz |
|------|---------|-----------|
| Preços de atacado | `supabase/migrations/20261103120000_domain_checkout.sql` (`kubo_domain_prices`) | Uma linha por extensão. Sem linha = venda recusada (`price_unavailable`). |
| Pedidos | mesma migration (`kubo_domain_orders`) | Status: `awaiting_payment` → `paid` → `ordered`, ou `failed` → `refunded`. |
| Checkout | `supabase/functions/domain-checkout/index.ts` | Calcula preço = atacado × 1,38, cria o pedido e abre o Stripe Checkout (cartão). Aceita `purchase` e `transfer`. |
| Fulfilment | `supabase/functions/_shared/domainOrders.ts` | Chamado pelo webhook depois do pagamento. Faz o pedido na IONOS. Se a IONOS recusar, estorna o cartão. |
| Webhook | `supabase/functions/stripe-webhook/index.ts` | Ramo `kind = domain_purchase | domain_transfer` em `checkout.session.completed`. |
| Compra antiga | `supabase/functions/domain-purchase/index.ts` | Aposentada: responde 410. |
| Transferência antiga | `supabase/functions/domain-transfer/index.ts` | Ação `start` aposentada (410). O código abaixo do `return` ainda existe e deve ser removido. |
| UI | `src/pages/DomainsPage.tsx` | Compra e transferência redirecionam para o checkout. |

**Regras de dinheiro:**
- Nada é pedido na IONOS antes do pagamento confirmado (`payment_status = paid`).
- Se a IONOS recusar depois do pagamento, o estorno é automático e o pedido vai para `refunded`.
- Depois que a IONOS aceita, a exceção de gravação local não estorna: é registrada no log para conciliação manual.
- O código de transferência (EPP) fica no pedido só até a IONOS responder, e é apagado em seguida.

## Pendências

- [ ] **Tabela de atacado IONOS por extensão**: inserir em `kubo_domain_prices`. Sem isso, nenhuma compra é aceita.
- [ ] Confirmar no contrato de reseller IONOS se a marca precisa aparecer de forma visível (o texto discreto pode não bastar).
- [ ] Testar o fluxo completo com Stripe em modo teste e a API da IONOS (nada foi executado ainda).
- [ ] `domain-search` (IONOS, `/domains`) ainda mostra preços em créditos fixos (`TLD_PRICES`). Precisa mostrar o preço real de `kubo_domain_prices` × 1,38, ou não mostrar preço.
- [ ] Remover o código morto de `domain-transfer` abaixo do `return` de 410.
- [ ] Acompanhar o status da transferência depois que a IONOS aceita (hoje só o pedido é registrado; o polling antigo de `domain-transfer` não é mais alimentado).
- [ ] Decidir se a busca usa IONOS (para ter o mesmo catálogo da compra) ou Cloudflare.

## Referências no código

- `supabase/functions/cloudflare-domains/index.ts`: busca pela Cloudflare (read-only).
- `supabase/functions/domain-purchase/index.ts`: compra atual, por créditos (a trocar).
- `supabase/functions/domain-transfer/index.ts`: transferência atual, sem cobrança (a ajustar).
- `supabase/functions/domain-dns/index.ts`, `domain-connect/index.ts`: apontamento de DNS.
- `src/pages/PublishDomainPage.tsx`: subpágina pós-publicação.
- `src/pages/DomainsPage.tsx`: página `/domains` existente (IONOS).
