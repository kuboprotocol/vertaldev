# VERTAL · Cobrança v2 (custo real × markup)

Status: **implementada e desligada**. Nada cobra, nada envia e-mail e nenhuma tabela nova existe até o Laércio aprovar os passos do fim deste documento.

Código: `supabase/functions/_shared/vertalCodeAi/billing.ts` (puro), `lowCreditNotice.ts` (puro), `lowCreditAdapters.ts` e `billingRuntime.ts` (Deno). Testes: `src/lib/vertalCodeAi/__tests__/billing-v2.test.ts`, `lowCreditNotice.test.ts`, `src/components/vertal-code-ai/__tests__/VertalBillingUi.test.tsx`.

## 1. Regra de preço

`preço (US$) = max(nosso custo real, piso do tipo) × markup` → créditos = preço ÷ US$0,03, em microcréditos (1 crédito = 1.000.000 µc), arredondado para cima. O débito inteiro acontece quando a fração acumulada passa de 1 crédito (mesmo "carry" da API, tabela `vertal_ai_carry`). Substitui a fórmula antiga `(custo + US$0,05) × 1,5`, inclusive nas estimativas mostradas hoje (`retailCredits`).

| Canal | Tipo | Markup | Piso do nosso custo | Exemplo: custo de amostra → preço → créditos |
|---|---|---|---|---|
| Varejo (dentro do Vertal Dev / Vibe Code / Vertal Chat) | Chat simples | ×1,69 | US$0,0003 | US$0,001 → US$0,00169 → 0,0563 |
| Varejo | Código | ×1,69 | US$0,002 | US$0,01 → US$0,0169 → 0,5633 |
| Varejo | Imagem | ×1,69 | US$0,003 | US$0,02 → US$0,0338 → 1,1267 |
| Varejo | Vídeo | ×1,69 | US$0,05 | US$0,40 → US$0,676 → 22,5333 |
| Varejo | Clonagem de app | ×2,59 (+159%) | US$0,02 | US$0,05 → US$0,1295 → 4,3167 |
| Varejo | Raspagem | ×5,50 (+450%) | US$0,002 | US$0,004 → US$0,022 → 0,7333 |
| Atacado / marca branca (apps do cliente e API) | Chat / código / imagem / vídeo | ×1,20 | igual ao varejo | código US$0,01 → US$0,012 → 0,40; imagem US$0,02 → 0,80; vídeo US$0,40 → 16 |
| Atacado / marca branca | Clonagem, raspagem | — | — | **recusado**: 403 `feature_not_available_white_label` |

Piso aplicado (modelo próprio ou grátis, custo ~0), varejo: chat 0,0169 · código 0,1127 · imagem 0,169 · vídeo 2,8167 · clonagem 1,7267 · raspagem 0,3667 créditos. Atacado: chat 0,012 · código 0,08 · imagem 0,12 · vídeo 2 créditos.

**Por que esses pisos** (estimativa conservadora, revisar com a conta real do mês): VM própria + GPU sob demanda com escala a zero + banda + registro. Um pedido curto de chat no modelo próprio ocupa ~1–2 s de CPU da VM; código usa contexto maior e às vezes a GPU (cold start); imagem ≈ 3–5 s de GPU; vídeo ≈ 1–2 min de GPU. Os valores ficam na config e podem ser trocados sem deploy.

**Grátis do varejo:** 5 mensagens de **chat simples** por conta por **dia** (como as mensagens diárias do Lovable). Quantidade, período (`day` | `week` | `month` | `lifetime`), fuso e tipos são config. A RPC reconta sob trava, então abas simultâneas não passam do limite. Não vale para atacado/API.

**Atacado/marca branca exige saldo positivo.** Saldo ≤ 0 → HTTP 402 `credits_exhausted` com mensagem clara (en ou pt-BR pelo `Accept-Language`), até a recarga. No varejo, com cobrança ligada, saldo ≤ 0 também pausa (402 `credits_exhausted`).

## 2. Config (sem segredo novo)

O projeto está no teto de 100 segredos, então tudo mora dentro do segredo JSON que já existe, `VERTAL_GPU_CONFIG` (segredo avulso com o mesmo nome vence). Chaves aceitas: `VERTAL_BILLING_*`, `VERTAL_LOW_CREDIT_*`, `VERTAL_CODE_AI_CHARGE_ENABLED`.

```json
{
  "VERTAL_BILLING_V2_ENABLED": "false",
  "VERTAL_BILLING_USER_IDS": "",
  "VERTAL_BILLING_FREE_ALLOWANCE_ENABLED": "false",
  "VERTAL_LOW_CREDIT_NOTICE_ENABLED": "false",
  "VERTAL_LOW_CREDIT_EMAIL_ENABLED": "false",
  "VERTAL_LOW_CREDIT_CRM_ENABLED": "false",
  "VERTAL_CODE_AI_CHARGE_ENABLED": "false",
  "VERTAL_BILLING_CONFIG": { "retailMarkup": { "scrape": 5.5 }, "freeAllowance": { "count": 5, "period": "day", "timeZone": "UTC" } }
}
```

`VERTAL_BILLING_CONFIG` é parcial (só o que mudar). Config inválida (markup < 1, piso ≤ 0, período desconhecido, limiar fora de 0–1, link sem https, JSON quebrado) é ignorada inteira e vale o padrão. A API (`vertal-ai-api`) continua exigindo `VERTAL_AI_API_ENABLED=true`, que também segue desligado.

## 3. Aviso de crédito baixo

Quando o saldo cai a ≤ 30% (`lowCredit.thresholdRatio`) da **última recarga** (última linha positiva de `credit_transactions` com `reason` em `lowCredit.topUpReasons`, padrão `credit_purchase`, que o `stripe-webhook` grava), envia **uma vez por recarga** (dedupe por `vertal_billing_notices` único em usuário + `topup:<id>`):

- (a) aviso in-app: linha em `vertal_billing_notices`, mostrada pelo `VertalCreditNoticeBanner` (montado na tela do VERTAL Code AI; pode ser montado em qualquer painel do Vertal Dev);
- (b) e-mail para o endereço do cadastro (`auth.users.email`), pelo caminho que o repo já usa (Lovable Email, remetente verificado `notify.kubovibe.dev`, nome "Vertal", `LOVABLE_API_KEY` existente), com chave de idempotência e registro em `email_send_log`. Sem a chave → canal fica `failed` e nada quebra;
- (c) se o cliente conectou um CRM no Vertal Fluxos (Pipedrive, HubSpot, Salesforce), registra uma atividade/nota pela 1ª ação disponível (`createActivity`/`createNote`/…), preenchendo só campos conhecidos (assunto e texto). Sem CRM ou com campo obrigatório desconhecido → pula em silêncio.

Idioma: `user_metadata.vertal_lang` → `locale` → `language` → `lang`; `pt*` → pt-BR, outro → inglês; nada → inglês. Textos exatamente os aprovados (o "30%" acompanha o limiar configurado). Testes usam só falsos; nenhum e-mail real sai em teste.

## 4. Extrato do cliente

- Painel: diálogo "Chaves da API" do VERTAL Code AI mostra "Extrato · últimos 30 dias" por tipo e canal (no Vertal / API e seus apps), créditos e markup aplicado (+69%, +20%…), nunca o fornecedor nem o custo bruto.
- API: `POST vertal-code-ai {action:"usage_statement", days}` e `POST vertal-ai-api/keys {action:"statement", days}`; avisos: `billing_notices` / `billing_notice_read`. Com a v2 desligada para a conta, respondem 404.

## 5. Onde a v2 entra no código

- `vertal-code-ai` (varejo): pedido de código cobra `custo real somado das chamadas × 1,69` (com piso) uma vez por pedido; imagem cobra no sucesso; vídeo cobra quando o job conclui (idempotente pelo job). Só com `VERTAL_CODE_AI_CHARGE_ENABLED` **e** v2 ligada para a conta.
- `vertal-ai-api` (atacado): clonagem/raspagem (`vertal_task` ou id de modelo) → 403 antes de qualquer custo; saldo zero → 402; preço = custo real dos tokens × 1,20 (piso) gravado como `cost_micro` no mesmo `vertal_ai_record_usage`; tipo e markup na linha do uso; aviso de crédito baixo depois do débito.
- Chat simples do Vertal Chat / Vibe Code: `chargeUsage(kind:"chat")` e o grátis estão prontos, mas **não foram ligados** nesses motores (são protegidos; ligar lá é uma decisão separada).

## 6. Para ir ao ar (aprovações do Laércio)

1. Mesclar o PR #225 (fica em rascunho até lá).
2. Aplicar `docs/vertal-code-ai/proposed-migration.sql` e depois `docs/vertal-code-ai/proposed-migration-billing-v2.sql` (inclui a correção do gatilho de `rate_limit_counters`).
3. Criar a edge function `vertal-ai-api` uma vez pela Management API (o deploy só atualiza funções que já existem) se a API for ao ar.
4. Ligar no `VERTAL_GPU_CONFIG`, de preferência primeiro só para a conta dele (`VERTAL_BILLING_USER_IDS`): `VERTAL_BILLING_V2_ENABLED`, depois `VERTAL_CODE_AI_CHARGE_ENABLED`, `VERTAL_BILLING_FREE_ALLOWANCE_ENABLED`, `VERTAL_LOW_CREDIT_NOTICE_ENABLED`, `VERTAL_LOW_CREDIT_EMAIL_ENABLED`, `VERTAL_LOW_CREDIT_CRM_ENABLED`; para a API, `VERTAL_AI_API_ENABLED`.
5. Confirmar os pisos de custo e os links do aviso (`links.topUp` = https://vertal.dev/pricing, onde já ficam os pacotes de créditos; `links.usage` = https://vertal.dev/vertal-code-ai, onde fica o extrato). Trocar por config se preferir outra página.
