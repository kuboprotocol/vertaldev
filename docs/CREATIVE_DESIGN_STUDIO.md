# Estúdio de Design Premium (Painel Criativo)

Card **Design Premium** no Painel Criativo (`/creative`). Gera artes com direção de arte IA
e cobra em créditos conforme o nível escolhido.

## Níveis e custo

| Nível        | Créditos | Variações | Uso                                           |
|--------------|---------:|----------:|-----------------------------------------------|
| Simples      | 1        | 1         | Testar uma ideia                              |
| Profissional | 5        | 2         | Composição e hierarquia tipográfica refinadas |
| Premium      | 10       | 4         | Direção de arte de agência, acabamento editorial |

Formatos: Post 1:1, Story 9:16, Banner 16:9, Cartaz 4:5.

A fonte da verdade do custo é o servidor (`supabase/functions/creative-design/index.ts`).
`src/config/designPricing.ts` só mostra o preço antes do clique. O teste
`src/config/__tests__/designPricing.test.ts` falha se as duas tabelas divergirem.

## Fluxo

1. A UI envia `{ prompt, format, tier }` e um `X-Idempotency-Key` por clique.
2. A função valida a entrada, cobra `credits` (`deductCredits`) e gera as variações em paralelo
   pelo gateway de imagem (o mesmo do `creative-image`).
3. Cada imagem vai para `creative_assets` (ferramenta `design`). O custo do lote fica no primeiro asset.
4. Se todas as variações falharem, a resposta é 502 e os créditos são devolvidos
   automaticamente (`withRefundOnFailure`).

## Limitações conhecidas

- **Cobrança parcial**: se só algumas variações ficarem prontas, o lote é cobrado por inteiro.
  A UI avisa quantas vieram. Reavaliar se o produto quiser cobrar proporcionalmente.
- **Texto na imagem**: modelos de imagem ainda erram texto (ortografia, kerning). Para
  tipografia exata, o caminho é um editor de layout, não o gerador.
- **Saldo exibido**: o painel ainda passa `creditsAvailable = 100` fixo (TODO em `CreativePanel.tsx`).
  A checagem real é feita no servidor; a UI só antecipa o bloqueio.
- **Deploy**: a função precisa de `LOVABLE_API_KEY` configurada no Supabase. Sem ela, responde 503.
