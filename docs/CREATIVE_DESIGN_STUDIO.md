# Estúdio de Design Premium (Painel Criativo)

Card **Design Premium** no Painel Criativo (`/creative`). Gera artes com direção de arte IA
e cobra em créditos conforme o nível escolhido.

## Níveis e custo

| Nível   | Créditos | Variações | Uso                                                   |
|---------|---------:|----------:|-------------------------------------------------------|
| Simples | 1        | 1         | Arte rápida, layout limpo, uma ideia central          |
| Premium | 2        | 2         | Direção de arte de agência, acabamento editorial      |

Formatos: Post 1:1, Story 9:16, Banner 16:9, Cartaz 4:5.

### Mix esperado de criações

- **~80%** das criações no nível **Simples** → 1 crédito.
- **~20%** das criações no nível **Premium** → 2 créditos.

Este mix é uma meta de negócio para acompanhar em `creative_assets` (campo `metadata.tier`).
O código não impõe o percentual: cada criação cobra o preço do nível escolhido.

### Preço por variação

Cada variação custa 1 crédito: Simples = 1 variação por 1 crédito, Premium = 2 variações por 2 créditos.
Assim o custo para o usuário acompanha o custo de geração.

## Fonte da verdade

A cobrança é feita no servidor (`supabase/functions/creative-design/index.ts`).
`src/config/designPricing.ts` só mostra o preço antes do clique. O teste
`src/config/__tests__/designPricing.test.ts` falha se as duas tabelas divergirem.

## Fluxo

1. A UI envia `{ prompt, format, tier }` e um `X-Idempotency-Key` por clique.
2. A função valida a entrada, cobra `credits` (`deductCredits`) e gera as variações em paralelo
   pelo gateway de imagem (o mesmo do `creative-image`).
3. Cada imagem vai para `creative_assets` (ferramenta `design`). O custo do lote fica no primeiro asset.
4. Se todas as variações falharem, a resposta é 502 e os créditos são devolvidos
   automaticamente (`withRefundOnFailure`).

## Histórico de preços

- **Atual:** Simples 1 crédito, Premium 2 créditos (mix esperado 80/20).
- **Anterior (descartado):** três níveis — Simples 1, Profissional 5, Premium 10 créditos,
  com 1, 2 e 4 variações. Substituído porque o preço máximo de 10 créditos não correspondia
  ao mix esperado de criações.

## Limitações conhecidas

- **Cobrança parcial**: se só algumas variações ficarem prontas, o lote é cobrado por inteiro.
  A UI avisa quantas vieram. Reavaliar se o produto quiser cobrar proporcionalmente.
- **Texto na imagem**: modelos de imagem ainda erram texto (ortografia, kerning). Para
  tipografia exata, o caminho é um editor de layout, não o gerador.
- **Saldo exibido**: o painel ainda passa `creditsAvailable = 100` fixo (TODO em `CreativePanel.tsx`).
  A checagem real é feita no servidor; a UI só antecipa o bloqueio.
- **Deploy**: a função precisa de `LOVABLE_API_KEY` configurada no Supabase. Sem ela, responde 503.
