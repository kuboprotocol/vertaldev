# Consent gate — termo assinado por categoria (F5)

> ⚠️ **O texto dos termos (`CONSENT_CATEGORIES` e `COMMON_RULES` em
> `supabase/functions/_shared/consentGate.ts`) é um rascunho técnico e PRECISA DE REVISÃO JURÍDICA
> (LGPD, Marco Civil, Lei 12.737/2012, validade da assinatura eletrônica — MP 2.200-2/2001 e
> Lei 14.063/2020 — e leis de outros países onde houver usuários) antes de ir para produção.**
> Mudou o texto? Suba a `version` da categoria: aceites antigos deixam de valer e o termo é pedido
> de novo.

O gate roda no Vertal Chat (`creative-router`), no Vibe Code (`vibe-code-agent`), nas rotas de
coleta (`/api/scrape/*`) e nas tarefas do Vertal Navigator (`/api/navigator/task`).

## Três níveis

| Nível | O que acontece |
|---|---|
| **(a) normal** | Segue sem termo, como antes. É a grande maioria dos pedidos. |
| **(b) sensível** | Exige o aceite assinado do termo **daquela categoria**. O aceite é reaproveitado enquanto a `version` da categoria não mudar. |
| **(b) ambíguo** | 1º a IA pede esclarecimento; se continuar ambíguo, exige o termo `ambiguous`. |
| **(c) proibido** | **Bloqueado sempre.** Assinar qualquer termo **não** libera. A tentativa vai para a auditoria. |

Categorias sensíveis: `web_scraping`, `third_party_automation`, `public_personal_data`,
`financial_actions` (+ `ambiguous`). Proibidas: `captcha_bypass`, `paywall_bypass`,
`access_bypass`, `malware`, `fraud`, `intrusion`, `sensitive_personal_data`, `illegal_content`.

Classificação: regras determinísticas (`classifyByRules`) + classificador LLM barato com saída JSON
(`classifyRequest`), consultado só quando as regras acham um indício. O LLM **nunca rebaixa** o que
as regras acharam; se falhar, o fallback é conservador (pelo menos "sensível").

### Quando o termo é exigido em cada superfície

| Superfície | Regra |
|---|---|
| Vertal Chat / Vibe Code | Só quando o pedido é classificado como sensível/ambíguo. Pedido normal nem lê os aceites. |
| Ferramentas **novas** de coleta (`scrape_page`, `crawl_site`, `monitor_page`, `use_scraper`) | Sempre pedem o termo `web_scraping` no 1º uso (`TOOL_CONSENT`). São novas: não mudam nada que já existia. |
| **Vertal Navigator** (tarefas) | **Não** exige o termo em toda tarefa. Tarefa normal ("entre no site da loja e veja o preço", "baixe o extrato do meu banco") segue como antes, sem termo. O termo só é pedido quando a tarefa é classificada como sensível (ex.: bot que segue/curte/posta automaticamente, contas em massa, pix/compra) ou ambígua. Proibido é bloqueado. |

O Navigator ficou fora de `TOOL_CONSENT` de propósito, e a regra de `third_party_automation` só
pega automação **em escala** ou de interação social — não "entrar num site" ou "automatizar testes".
Testes: `src/lib/consent/consentGate.test.ts` ("Navigator: tarefa normal NÃO exige termo").

## Cobrança e idempotência (Vertal Chat)

Antes, a 1ª rodada do turno era cobrada **antes** do gate: o usuário pagava pela resposta que só
pedia o termo e pagava de novo ao repetir a mensagem depois de assinar. Agora
(`supabase/functions/_shared/turnBilling.ts`):

1. Na 1ª rodada do turno (`agent_chat` sem `tool_results`) o gate roda **antes** da cobrança. Turno
   segurado pelo gate (termo, esclarecimento, bloqueio) **não cobra** crédito nem consome a vaga
   grátis do dia (`creditsCharged: 0`).
2. A cobrança usa a chave de idempotência do turno `agent_chat:turn:<userId>:<turnId>`. O cliente
   (`useVertalChat`) gera um `turn_id` por chamada de 1ª rodada e o **reaproveita** na repetição
   automática depois de assinar o termo. Reenvio da mesma rodada com a mesma chave não debita de
   novo (o RPC `execute_atomic_credit_deduction` devolve `replayed` → 409 `duplicate_request`,
   igual às outras chaves de idempotência do projeto).
3. Sem `turn_id` (cliente antigo) vale a chave de antes (`X-Idempotency-Key` ou aleatória).
4. Rodadas seguintes do turno (com `tool_results`) continuam cobradas como antes.

Vibe Code: o gate já rodava antes de qualquer cobrança; o reenvio após assinar cobra uma vez.
Coleta: nada é cobrado antes do termo (a cobrança é no fim, por `scrape:<runId>`).
Teste: `src/lib/consent/turnBilling.test.ts`.

## Assinatura

O cartão `ConsentTermsDialog` abre no chat (Vertal Chat, Vibe Code, Navigator). O usuário lê o
documento inteiro e assina com:

- **Nome completo** (pré-preenchido do último aceite, do Stripe ou do perfil; editável).
- **Documento**: CPF, passaporte ou documento nacional.
  - CPF do cadastro de compra (Stripe, `tax_id br_cpf`) com dígitos verificadores **válidos**: vem
    mascarado e **travado**; o servidor usa o dele (o número nunca vai ao cliente).
  - **Sem CPF no cadastro/Stripe** (ou CPF inválido lá): o campo vem **vazio e editável** e o
    usuário preenche. O documento de um aceite anterior **não** é reaproveitado para travar o campo.
  - Validação no cliente e no servidor (mesma função): CPF com **dígitos verificadores**
    (`isValidCpf`; repetidos como 111.111.111-11 são inválidos) e máscara `000.000.000-00`;
    passaporte com **formato básico** ICAO (6–9 letras/números com pelo menos um dígito;
    brasileiro = 2 letras + 6 números, ex. AB123456) — `isValidPassport`, `documentInputError`.
- **Endereço** (pré-preenchido, editável), **organização** (opcional).
- **Localização**: a exata do navegador **só** com consentimento explícito (texto LGPD no cartão);
  sem ele, o servidor registra a aproximada pelo IP (`request.cf`), marcada como "aproximada".
- IP, navegador (User-Agent), data/hora e um nonce aleatório.

### Prova

- O servidor monta o payload canônico (`canonicalJson`) e calcula
  `SHA-256(documento do termo + payload)` (`consentDigest`).
- O payload é **cifrado** (AES-256-GCM, `CONSENT_ENC_KEY` ou, na falta, `CONNECTOR_ENC_KEY`) em
  `consent_acceptances` (tabela **só-inserção**, trigger `consent_insert_only`).
- O hash vai para o **Bitcoin via OpenTimestamps** (calendários públicos); a prova `.ots` fica em
  `consent_timestamps` e o cron `/api/consent/cron` faz o upgrade até a confirmação no bloco.
- Admin: `/api/consent/admin-list` e `admin-get` (exige motivo; cada acesso vira linha em
  `consent_admin_access_log`); `admin-get` recalcula o hash e informa `digestMatches`.

## Rotas `/api/consent/*` (Worker, POST, JWT)

`status` (aceites vigentes + termo e pré-preenchimento de uma categoria), `accept`, `classify`,
`admin-list`, `admin-get`, `cron` (`x-cron-token`).

## Banco

Migration `supabase/migrations/20261122090000_scrapling_consent_gate.sql` (**não aplicada**):
`consent_acceptances`, `consent_timestamps`, `consent_audit`, `consent_admin_access_log`, além das
tabelas da coleta. RLS ligada; dados pessoais sem policy de leitura para o cliente.

## Deploy

1. Revisão jurídica do texto dos termos (bloqueante).
2. Aplicar a migration (manual).
3. Worker: `CONSENT_ENC_KEY` (32 bytes, base64 — recomendado, separado de `CONNECTOR_ENC_KEY`),
   `SCRAPE_CRON_TOKEN`, `STRIPE_SECRET_KEY` (já existente; usado só para o pré-preenchimento),
   opcional `CONSENT_CLASSIFIER_MODEL`. Vault do Supabase: `vertal_scrape_cron_token`.
4. Deploy das edge functions `creative-router` e `vibe-code-agent` e do Worker.

## Riscos

- Falso positivo/negativo das regras: ajustar `SENSITIVE_RULES`/`PROHIBITED_RULES` com casos reais
  (logs em `consent_audit`). O LLM só endurece, nunca afrouxa.
- Classificador LLM indisponível → fallback conservador pede termo em pedidos com indício.
- Perda de `CONSENT_ENC_KEY` torna os payloads ilegíveis (o hash no Bitcoin continua valendo, mas
  sem os dados não se reconstrói a prova). Guardar a chave com backup. Definir `CONSENT_ENC_KEY`
  **antes** do primeiro aceite: aceites cifrados com `CONNECTOR_ENC_KEY` (fallback) ficam
  ilegíveis se a chave for trocada depois.
