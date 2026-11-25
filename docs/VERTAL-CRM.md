# Vertal CRM

CRM próprio do Vertal Dev, na área **Conectores** (cartão fixado no topo, “Grátis · IA 1 crédito”) e no topo do
**Vertal Chat** (botão **CRM**, ou `/crm` / “abrir o crm”). Rota `/crm`, carregada sob demanda.

> Base: adaptado do [Atomic CRM](https://github.com/marmelab/atomic-crm) (Marmelab, licença MIT; aviso completo em
> `src/components/vertal-crm/LICENSE.atomic-crm.md` e `THIRD_PARTY_NOTICES.md`). Na interface o produto é só “Vertal CRM”.

Tudo é **aditivo** e **desligado por padrão**. Nada no CRM envia e-mail ou mensagem para ninguém.

## O que tem

| Área | O que faz |
|---|---|
| Painel | valor em aberto, previsão ponderada (valor × probabilidade da etapa), taxa de ganho, total ganho, por etapa, previsão por mês, tarefas/lembretes, contatos quentes, atividade recente |
| Contatos | lista, busca, filtros (status, etiqueta), **busca com IA**, CSV (importar/exportar no formato do Atomic CRM + cabeçalhos em português), criação rápida |
| Empresas | lista, busca, criação; contatos e negócios ligados |
| Negócios | **Kanban** com arrastar e soltar, **vários funis** com **etapas personalizadas** (aberta/ganha/perdida + probabilidade) |
| Tarefas | atrasadas / hoje / próximas, tipos (ligação, reunião, follow-up…), prazo e lembrete |
| Registro (painel lateral) | dados + **campos personalizados** + etiquetas, **notas**, tarefas, **linha do tempo** automática, **anexos** (Storage privado), **IA**, **trazer e-mails do Gmail como notas** (só leitura) |
| Configurações | workspace (nome, moeda, importação automática), funis/etapas, etiquetas, campos personalizados, **equipe e papéis** (dono/admin/membro/leitura), **CRMs externos**, importar do Prospector/Growth, **API e webhooks** |

## Preços (regras do Laércio)

| Uso | Créditos |
|---|---|
| CRM normal (criar/editar/apagar, Kanban, CSV, importações, API, Vertal Fluxos) | **0** |
| Cada uso de IA (resumo, e-mail de follow-up, pontuação do lead, próxima ação, busca em linguagem natural) | **1** |
| Ativar a sincronização com um CRM pago (por workspace + provedor, uma vez) | **4** |
| Cada sincronização/mapeamento **com IA** entre o Vertal CRM e o outro CRM | **2** |
| Sincronização **sem IA** (mapeamento padrão) | **0 por padrão** — `VERTAL_CRM_PLAIN_SYNC_COST` muda (decisão pendente do Laércio) |

- O custo aparece **antes** (diálogo da IA; confirmação na ativação/sincronização).
- Débito atômico e idempotente (`execute_atomic_credit_deduction`, chave `crm_ai:<uuid>`, `crm_sync_activate:<uuid>`,
  `crm_sync_run:<uuid>`); repetir o mesmo pedido devolve o resultado guardado sem cobrar de novo (`crm_ai_runs`).
- Falhou depois do débito: **devolução** (`execute_atomic_credit_topup`, chave `refund:<chave>`).
- Modelo: o roteador do VERTAL Code AI, sem mudança nenhuma (LLM própria → OpenRouter grátis → DeepSeek).
- `VERTAL_CRM_CHARGE=true` liga a cobrança. Admins não pagam, a não ser com `VERTAL_CRM_CHARGE_ADMINS=true` (teste na conta do Laércio).

## CRMs externos

Usa só conexões que o usuário **já tem no Vertal Fluxos** (nenhum app OAuth novo):

| Provedor | Enviar contatos | Trazer contatos |
|---|---|---|
| Pipedrive | `createPerson` | gatilhos `newLeads` / `newDeals` |
| HubSpot | `createContact` | — (o app do Fluxos não tem busca) |
| Salesforce | — (o app do Fluxos não tem “criar contato”) | `executeQuery` (SOQL dos 100 contatos mais novos) |
| Zoho CRM, RD Station CRM | em breve (sem app no Vertal Fluxos) | — |

Com IA, o modelo lê os parâmetros da ação do provedor e propõe o mapeamento (só campos permitidos), salvo na conexão.
Ids externos ficam em `external_ids` para não duplicar. Até 100 contatos por execução.

## Integrações

- **Vertal Prospector / Growth Team → Vertal CRM (CRM padrão)**: com o CRM liberado para o usuário, `find_leads`,
  `enrich_lead`, `check_replies`, `update_lead` (Prospector) e `sync`, `add_contact`, `update_contact` (Growth) importam
  os leads/contatos para o 1º workspace (sem duplicar; opt-out vira “NÃO CONTATAR” nas observações e o Prospector pula
  `opted_out`). Desliga em Configurações → “Receber leads… automaticamente”. Também há botões de importação manual.
- **Vertal Fluxos (app “Vertal”, fork `kuboprotocol/automatisch`)**: gatilhos **Novo contato no Vertal CRM** e **Etapa de
  negócio mudou no Vertal CRM** (consulta a cada 15 min, opcional “só quando chegar à etapa X”); ações **Criar contato**,
  **Atualizar contato** (por id ou e-mail), **Criar negócio**, **Atualizar negócio** (etapa/valor/data), **Criar tarefa**.
  Usam a mesma chave `vfk1` da conexão “Vertal”. Vertal Agentes usam essas ações pelos fluxos (ponte Agentes ↔ Fluxos existente).
- **API**: `POST https://<projeto>.supabase.co/functions/v1/vertal-code-ai?app=crm` com `x-vertal-crm-key: vcrm_…`
  (criada em Configurações → API; aparece uma vez; só o hash fica no banco; escopo leitura ou leitura+escrita).
  Ops: `list_pipelines`, `list_contacts`, `get_contact`, `find_contact`, `create_contact`, `update_contact`, `delete_contact`,
  `list_companies`, `create_company`, `list_deals`, `get_deal`, `create_deal`, `update_deal`, `move_deal`, `delete_deal`,
  `list_tasks`, `create_task`, `complete_task`, `create_note`, `events_since`. IA não é liberada para chaves.
- **Webhooks**: https público (sem rede interna), eventos `contact.*`, `company.*`, `deal.created|updated|stage_changed|won|lost|deleted`,
  `task.*`, `note.*` ou `*`. Enviados pelo banco (pg_net, assíncrono) com `X-Vertal-Signature: sha256=<HMAC do corpo>`.

## Arquitetura

| Peça | Onde |
|---|---|
| Regras puras (flags, preços, etapas, Kanban, métricas, CSV, IA, sync, webhooks) | `supabase/functions/_shared/vertalCrm/core.ts` |
| Operações do servidor | `supabase/functions/_shared/vertalCrm/handler.ts` |
| Servidor | edge function **existente** `vertal-code-ai`, rota `?app=crm` (nenhuma função nova; `creative-router` intocado) |
| Banco | `supabase/migrations/20261125160000_vertal_crm.sql`: 18 tabelas `crm_*`, gatilhos (linha do tempo, eventos, webhooks, status do negócio), bucket `crm-attachments` |
| Front | `src/pages/VertalCrmPage.tsx`, `src/components/vertal-crm/*`, `src/lib/vertalCrm/*` |
| Fluxos | fork `kuboprotocol/automatisch`: `packages/backend/src/apps/vertal/{common/crm.js, triggers/crm-*, actions/crm-*, dynamic-data/list-crm-stages}` |

## Segurança e multi-tenant

- Tudo tem `workspace_id`. RLS por papel: `crm_can_read` (membro), `crm_can_write` (dono/admin/membro), `crm_is_admin`.
  Leitura só lê; funis e campos personalizados só admin muda.
- **Só a edge function cria workspace e membros** (é onde valem as flags); sem membro, o RLS não deixa ler nem escrever nada.
- FKs compostas `(workspace_id, id)`: um registro nunca aponta para outro workspace; `contact_ids` do negócio é filtrado no banco.
- Chave da API e segredo do webhook: o navegador não lê (GRANT por coluna).
- Anexos: `crm-attachments/<workspace>/<usuário>/<arquivo>`; membro lê; grava só na própria pasta; apaga o próprio (admin apaga qualquer um).
- Busca com IA: o filtro do modelo passa por lista de chaves permitidas (nada vira SQL).
- Membros novos: só quem já tem conta no Vertal Dev (nenhum convite por e-mail é enviado).
- Limite de 120 operações/minuto por usuário no servidor.

## Flags

| Onde | Nome | Valor |
|---|---|---|
| Edge secret | `VERTAL_CRM_ENABLED` | `true` liga |
| Edge secret | `VERTAL_CRM_USER_IDS` | lista de ids (vazia = ninguém; `*` = todos — **não usado**; abrir é decisão do Laércio) |
| Edge secret | `VERTAL_CRM_CHARGE` | `true` cobra os créditos |
| Edge secret | `VERTAL_CRM_CHARGE_ADMINS` | `true` cobra também admins (teste) |
| Edge secret | `VERTAL_CRM_PLAIN_SYNC_COST` | créditos da sincronização sem IA (padrão 0) |
| Edge secret | `VERTAL_CRM_ALLOW_SIMULATED_FAILURE` | `true` só durante o teste de devolução (desligar depois) |
| Front | `VITE_VERTAL_CRM` | `true` mostra cartão/rota/botão só para quem o servidor libera |
| Fluxos (Railway) | `VERTAL_CRM_URL` (opcional) | URL da rota do CRM (padrão: vertal-code-ai do kubovibe) |

## Toques em arquivos compartilhados (todos atrás da flag)

| Arquivo | Mudança | Com a flag desligada |
|---|---|---|
| `src/App.tsx` | rota `/crm` (lazy) | rota não existe |
| `src/components/vertal-chat/VertalChat.tsx` | botão **CRM** + comando `/crm` | botão não renderiza; comando não age |
| `src/pages/ConnectorsHubPage.tsx` | cartão do Vertal CRM fixado no topo + selo | lista e ordem idênticas (nenhum conector tem `pinned`) |
| `src/lib/connectorsConfig.ts` | campos opcionais `pinned`, `badge` na interface | nenhum conector existente usa |
| `supabase/functions/vertal-code-ai/index.ts` | rota `?app=crm` antes do resto; importação automática depois de ops do Prospector/Growth | 404 na rota; importação não roda (só com `isCrmEnabled`) |
| `scripts/vertal-code-ai/engine-guard.mjs` | aceita linhas `VertalCrm`/`VERTAL_CRM` nos FLAGGED | — |
