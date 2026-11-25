# Vertal Growth Team (equipe de crescimento)

Depois que o dev termina um app, site, software ou landing page no Vertal Dev, ele pede
**"buscar clientes para minha aplicação"** e o Vertal monta uma equipe de crescimento para AQUELE projeto:

| Modelo do projeto | Etapa 1 | Etapa 2 | Etapa 3 |
|---|---|---|---|
| Empresas (B2B) / pessoas e assinatura (B2C) | **Captação** | **Conversão** | **Retenção** |
| Causa / ONG (doações) | **Captação de doadores** | **Primeira doação** | **Doação recorrente** |

Tudo é **aditivo** e **desligado por padrão**. Nada sai para um contato sem aprovação do dev.

## Como o dev usa

1. No projeto (Vibe Code: botão flutuante **Buscar clientes**; VERTAL Code AI: botão no topo; Vertal Chat:
   `buscar clientes para meu app <projeto>`, `find customers for my app …`, `buscar doadores para minha ONG …`, `/growth`).
2. A tela lê o próprio projeto (título/`<title>`/`<h1>`, descrição, texto da página e link publicado) e sugere o modelo
   (B2B, B2C/assinatura ou causa). O dev confere e muda se precisar.
3. Antes de lançar, a tela mostra o custo: **20 créditos uma vez** (devolvidos se falhar) e **2 créditos por execução
   de agente** da equipe (devolvidos se falhar). Só lança com "Entendi o custo" + confirmação.
4. **Captação** abre o Vertal Prospector já na campanha: o dev confirma o cliente ideal (ICP) como hoje, busca leads,
   lê sites e aprova o 1º contato.
5. **Atualizar etapas** move contatos entre as etapas, cria rascunhos de conversão/onboarding/check-in/recuperação
   (para aprovar) e, se houver equipe de agentes, oferece mandar os eventos para ela (com o custo por execução na pergunta).

## Arquitetura

| Peça | Onde |
|---|---|
| Regras puras (modelo do negócio, etapas, portão, anti-abuso, rodapé LGPD, plano da equipe, comando) | `supabase/functions/_shared/vertalGrowth/core.ts` |
| Operações (projeto, cobrança, painel, sync, contatos, mensagens, piloto) | `supabase/functions/_shared/vertalGrowth/handler.ts` |
| Servidor | edge function **existente** `vertal-code-ai`, `action: "growth"` (nenhuma função nova; `creative-router` não foi tocado) |
| Tabelas | `supabase/migrations/20261125140000_vertal_growth_team.sql` (só criação) |
| Front | `src/pages/VertalGrowthPage.tsx`, `src/lib/vertalGrowth/*`, `src/components/vertal-growth/*` |

### Etapas e fluxos prontos

- **Captação** = Vertal Prospector (mesmas tabelas e portão de envio). Campanha criada pelo Growth tem **teto de leads**
  (`VERTAL_GROWTH_TEAM_MAX_LEADS`, padrão 200). Para B2C o ICP aponta para **empresas parceiras** que atendem o público do app
  (nunca pessoas físicas); para causas, **empresas doadoras/patrocinadoras**.
- **Lead contatado → CRM**: o lead entra como contato da Captação e gera o evento `new_lead`.
- **Resposta positiva → conversão**: a resposta "interessado/dúvida" (lida pelo Prospector, que já cria o rascunho de resposta
  com horários ou link de agenda) move o contato para Conversão, cria um lembrete de conversão (4 dias) e gera `reply_positive`.
- **Stripe → cliente + onboarding** (se o dev tiver `STRIPE_SECRET_KEY` no Cofre; só leitura): assinatura nova desde o lançamento
  vira cliente/doador com rascunho de boas-vindas (ou agradecimento, em causas) e `new_customer`; assinatura cancelada/não paga
  vira "cancelou" com rascunho de recuperação; pagamento atrasado vira "em risco" com check-in (`churn_risk`). Em causas, doação
  avulsa (charge sem fatura) vira "primeira doação" com agradecimento.
- **Inatividade → check-in**: cliente/doador sem contato há N dias (padrão 30, ajustável) vira "em risco" com rascunho de check-in.
- Respostas aos e-mails da equipe: "parar" → lista de não contatar + "não contatar"; devolução → e-mail inválido; resposta → atividade
  (e "recuperado" se tinha cancelado).
- **Contatos manuais**: o dev pode adicionar quem já tem relação com o projeto (precisa marcar a declaração; LGPD).

### Equipe de agentes (Vertal Agentes + Vertal Fluxos)

Botão **Criar a equipe de agentes** (com confirmação e o preço por execução). Usa só operações que já existem no `creative-router`
(chamadas aprovadas, `callHuginnOp`):

1. `create_agent` WebhookAgent "Vertal Growth · <projeto> · entrada";
2. para cada fluxo, `create_agent` TriggerAgent (filtra `type == new_lead | reply_positive | new_customer | churn_risk`);
3. `create_fluxos_agent` com o app que o dev **conectou** no Vertal Fluxos (prioridade: Pipedrive → HubSpot → Notion → Todoist):
   Pipedrive `createPerson` / `createDeal` / `createActivity`; HubSpot `createContact` (lead e cliente novo); Notion
   `createDatabaseItem` (precisa do id do banco); Todoist `createTask`. Parâmetros com Liquid (`{{ name }}`, `{{ email }}`…).

Os eventos do **Atualizar etapas** vão para a entrada com `send_webhook_event` (só depois da confirmação). Cada execução de agente
custa 2 créditos (cobrança e devolução que já existem na ponte Agentes ↔ Fluxos). Sem CRM/tarefas conectado ou sem o Vertal
Agentes no Cofre, a tela explica o que falta.

### Agendador

Botão **Lembrete diário no Agendador** cria (pela API existente do `vertal-chat-scheduler`) um lembrete em dias úteis às 9h para
revisar aprovações e atualizar etapas. Lembrete não envia nada a ninguém.

## Créditos

- **20 créditos uma vez** ao lançar (`execute_atomic_credit_deduction`, motivo `vertal_growth_team`, chave idempotente
  `growth:<uuid do pedido>`). Repetir o mesmo pedido devolve a mesma campanha sem cobrar de novo.
- Falhou depois do débito (IA fora, erro de banco, exceção): **devolução** com `execute_atomic_credit_topup`
  (`refund:growth:<uuid>`, idempotente) e registro em `growth_events`.
- `VERTAL_GROWTH_TEAM_CHARGE=true` liga a cobrança. Administradores não pagam (igual ao resto da plataforma), a não ser com
  `VERTAL_GROWTH_TEAM_CHARGE_ADMINS=true` (usado para o teste de débito real na conta do Laércio).
- O custo estimado das chamadas de modelo continua só no log do roteador (fórmula de varejo não cobra nada).

## Segurança

- Nada sai sem **aprovação** (por mensagem ou "Aprovar todos"); envio é outro clique com confirmação; trava contra envio duplo.
- Portão em cada envio: aprovado, lista de não contatar (a mesma do Prospector), "não contatar", e-mail verificado (arriscado só
  manual e marcado), **limite diário único** Prospector + Growth (`VERTAL_PROSPECTOR_DAILY_CAP`), texto (campos vazios, frases
  proibidas, caixa alta, pontuação, tamanho, ≤2 links) e **anti-abuso** (apostas, pirâmide, "dinheiro fácil", adulto, venda de
  seguidores, phishing, link encurtado). O lançamento também recusa descrição abusiva antes de cobrar.
- **WhatsApp** só por link `wa.me` que o próprio dev toca.
- **Piloto automático** (por campanha): só liga pela op `set_autopilot` com o texto `AUTOPILOT` digitado na tela de
  configurações (`origin: growth_settings`); `update_settings` recusa. Agentes não conseguem ligar (usam outro token, em outra
  função). Ligado, o **Atualizar etapas** aprova e envia o que já venceu e passa no portão, **só para e-mail verificado**, dentro do
  limite diário e da lista de não contatar. Não há envio em segundo plano (sem cron).
- Limites: 3 lançamentos/dia, 10 campanhas ativas, 1.000 contatos e 200 leads por campanha, 40 operações/minuto.

## LGPD

- Captação: só contatos empresariais públicos (legítimo interesse), como no Prospector.
- Clientes/doadores: vêm da conta Stripe do próprio dev (relação contratual) ou de quem o dev declara ter relação.
- Todo e-mail termina com a origem do contato e a saída ("responda parar"), no idioma da campanha.
- **Apagar (LGPD)** remove contato e mensagens e põe o e-mail na lista de não contatar. Apagar campanha remove tudo dela.
- Tabelas com RLS: dono lê e apaga; só a edge function escreve.

## Idioma

Tela em pt-BR, en e es (idioma do navegador do dev, ou o do comando no chat). Rascunhos de conversão/retenção e rodapé saem no
idioma da campanha. Os rascunhos de 1º contato da Captação continuam os do Prospector (pt-BR, mercado brasileiro).

## Flags

| Onde | Nome | Valor |
|---|---|---|
| Edge secret | `VERTAL_GROWTH_TEAM_ENABLED` | `true` liga (e o usuário precisa estar em `VERTAL_PROSPECTOR_USER_IDS`) |
| Edge secret | `VERTAL_GROWTH_TEAM_CHARGE` | `true` cobra 20 créditos no lançamento |
| Edge secret | `VERTAL_GROWTH_TEAM_CHARGE_ADMINS` | `true` cobra também administradores (teste) |
| Edge secret | `VERTAL_GROWTH_TEAM_MAX_LEADS` | teto de leads por campanha (padrão 200, máx. 500) |
| Front | `VITE_VERTAL_GROWTH_TEAM` | `true` mostra botão/rota/comando só para quem o servidor libera |

Abrir para todos os devs = decisão do Laércio (trocar a allowlist); não foi feito.

## Toques em arquivos compartilhados (todos atrás da flag)

| Arquivo | Mudança | Com a flag desligada |
|---|---|---|
| `src/App.tsx` | rota `/vertal-code-ai/growth` | rota não existe |
| `src/components/vertal-chat/VertalChat.tsx` | botão no topo + comando "buscar clientes para meu app…" | botão não renderiza; comando não age |
| `src/pages/BuilderPage.tsx` | botão flutuante **Buscar clientes** (fixo, fora do layout) | não renderiza nada |
| `src/pages/VertalCodeAIPage.tsx` | botão ao lado do Prospector | não renderiza nada |
| `supabase/functions/vertal-code-ai/index.ts` | +bloco `action === "growth"` | 404 |
| `supabase/functions/_shared/vertalProspector/handler.ts` | teto de leads quando a campanha tem `settings.maxLeads`; limite diário soma `growth_messages` | campanhas do Prospector sem `maxLeads` iguais; sem envios do Growth a soma é a mesma |
| `src/pages/VertalProspectorPage.tsx`, `src/lib/vertalProspector/client.ts` | `?campanha=<id>` abre a campanha | sem o parâmetro, igual |
| `scripts/vertal-code-ai/engine-guard.mjs` | aceita linhas `VertalGrowth`; `BuilderPage.tsx` entra nos FLAGGED | — |

O "comando do Prospector" (`encontrar clientes para <empresa>`) continua no Prospector: o do Growth exige "meu/minha/app/projeto…".

## Vertal CRM (CRM padrão)

Com o Vertal CRM liberado, os contatos da equipe entram no CRM depois de **Atualizar etapas** e de adicionar/editar contato
(etapa vira status: captação = morno, conversão = quente, retenção = cliente). Ver [VERTAL-CRM.md](./VERTAL-CRM.md).
