# Vertal Chat · Tarefas agendadas (Agendador)

Sistema de tarefas agendadas do Vertal Chat: o usuário pede em linguagem natural e o chat
agenda. Cobre lembretes, tarefas únicas e recorrentes, consultas/compromissos na agenda e
gatilhos "quando eu receber um e-mail…" com ramo positivo/negativo.

Tudo é **aditivo** e **desligado por padrão**. Nenhum motor existente (Vibe Code, game/code/design,
prompts, modelos, agentes, fluxos) foi alterado. Os únicos toques em arquivos compartilhados
estão atrás da flag e estão listados abaixo.

## Como o usuário usa

No Vertal Chat:

- "Me lembre amanhã às 9h de pagar o boleto" → lembrete (uma vez).
- "Todo dia às 8h me mande as 5 principais notícias de tecnologia" → tarefa recorrente (a IA roda com busca na web e posta o resultado na conversa).
- "Agende uma consulta no dentista sexta às 15h e me lembre 1 hora antes" → compromisso na agenda + lembrete.
- "Quando eu receber um e-mail do RH com assunto proposta: se for aprovado, me avise e …; se for recusado, …" → gatilho de e-mail com ramos.
- "Liste / pause / retome / apague / rode agora a tarefa X", "histórico da tarefa X", "o que tenho na agenda".

Antes de criar, o chat mostra um **cartão de confirmação** com: o que, quando (com fuso), gatilho,
ramos positivo/negativo, para quem pode enviar e-mail, se pode agir em apps conectados e avisos.
Nada é criado sem o clique em "Permitir".

O botão **Tarefas** no topo do chat abre o painel: lista (próxima execução, status, última execução,
erro), ligar/pausar, rodar agora, histórico, apagar; aba **Agenda** (com "Adicionar ao Google Agenda");
aba **Ajustes** (fuso, horário de silêncio, aviso por e-mail). Quando uma tarefa roda, aparece um
aviso no app (toast + contador no botão) e o resultado é postado na conversa onde a tarefa foi
criada (ou na conversa "Tarefas agendadas", criada automaticamente).

## Arquitetura

| Peça | Onde |
| --- | --- |
| Contrato, datas em português, cron, fuso, silêncio, backoff, classificação | `supabase/functions/_shared/chatScheduler.ts` (puro; testado no Vitest) |
| Edge function nova (API do usuário + tick do cron) | `supabase/functions/vertal-chat-scheduler/index.ts` |
| Motor (executa, gatilho de e-mail, agenda, posta no chat, tentativas) | `supabase/functions/vertal-chat-scheduler/engine.ts` |
| Tabelas | `supabase/migrations/20261125090000_vertal_chat_scheduler.sql` |
| Front: cliente/acesso | `src/lib/chatScheduler/client.ts` |
| Front: ação "agendador" no chat | `src/lib/chatScheduler/runScheduler.ts` |
| Front: painel e botão | `src/components/vertal-chat/scheduler/*` |

### Execução no servidor

Quando uma tarefa vence, o `pg_cron` (a cada minuto) chama `vertal-chat-scheduler` com
`{"action":"tick"}` e a chave `x-vertal-scheduler-key`. A função pega as tarefas vencidas com
`chat_scheduler_claim` (FOR UPDATE SKIP LOCKED, trava de 4 min), roda em segundo plano
(`EdgeRuntime.waitUntil`) e:

- **Lembrete / consulta**: posta o lembrete na conversa (sem IA, custo zero).
- **Tarefa**: roda um mini agente no servidor com as ferramentas que funcionam sem o usuário na
  tela, reusando o que já existe: `web_search`/`web_read` (chatBrain), Gmail conectado
  (`gmail_search`; `gmail_send` só para o próprio usuário ou para os destinatários dados na
  criação), apps do Vertal Fluxos (`fluxos`: buscas sempre; ações só com `allow_app_actions`,
  com a cobrança normal de 2 créditos e reembolso se falhar).
- **Gatilho de e-mail**: busca no Gmail conectado (`from:`/`subject:`/busca + `after:`), só e-mails
  que chegaram depois da criação; dedupe atômico em `chat_email_trigger_seen` (cada e-mail dispara
  uma vez); classifica com a IA em positivo/negativo/neutro (critério do usuário quando houver) e
  roda o ramo correspondente.
- **Falhas**: novas tentativas em 1, 5 e 15 min; depois disso, aviso de falha na conversa (e por
  e-mail se ligado). Tarefa única vira "Falhou"; recorrente segue para o próximo horário.
- **Horário de silêncio**: vale para o que é automático (intervalos e gatilhos de e-mail), que
  esperam o fim do silêncio. Hora marcada pelo usuário sempre toca.

### Agenda (consultas)

- Se a conta Gmail conectada tiver escopo de agenda (`calendar.events`), o evento vai para o
  Google Agenda principal (e é apagado junto com a tarefa).
- Senão, fica na agenda interna do Vertal (`chat_agenda_events`) com um link "Adicionar ao Google
  Agenda" (não precisa de permissão). **Hoje o conector Gmail pede só leitura/envio**: para criar
  direto no Google Agenda é preciso decidir adicionar o escopo `calendar.events` ao conector e
  reconectar (ver "Pendências").

### Créditos

Nada novo é cobrado. Cada execução grava o custo estimado da IA em `chat_task_runs.est_cost_usd`
e os créditos das ações que já custam (Vertal Fluxos) em `est_credits`.

## Flags e rollout

| Onde | Nome | Valor |
| --- | --- | --- |
| Edge secret | `VERTAL_CHAT_SCHEDULER_ENABLED` | `true` liga (qualquer outro valor = desligado) |
| Edge secret | `VERTAL_CHAT_SCHEDULER_USER_IDS` | ids separados por vírgula. **Vazio = ninguém** |
| Edge secret | `VERTAL_CHAT_SCHEDULER_CRON_KEY` | chave do tick (a mesma do Vault) |
| Vault (DB) | `vertal_chat_scheduler_cron_key` | mesma chave, lida pelo job do pg_cron |
| Front (`.env.production`) | `VITE_VERTAL_CHAT_SCHEDULER` | `true` mostra o botão só para quem o servidor libera |

Desligar tudo: `VERTAL_CHAT_SCHEDULER_ENABLED=false` (o prompt do chat volta a ser o de antes, a
API responde 404 e o tick não faz nada). Para pausar só o cron:
`select cron.unschedule('vertal-chat-scheduler-tick');`.

### Job do pg_cron (aplicado à mão)

```sql
-- chave aleatória guardada no Vault (o mesmo valor vai no segredo VERTAL_CHAT_SCHEDULER_CRON_KEY)
select vault.create_secret('<chave>', 'vertal_chat_scheduler_cron_key');
select cron.schedule('vertal-chat-scheduler-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/vertal-chat-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-vertal-scheduler-key', (select decrypted_secret from vault.decrypted_secrets where name = 'vertal_chat_scheduler_cron_key')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 10000)
$$);
```

### Deploy

A função `vertal-chat-scheduler` é nova: o deploy automático só atualiza funções que já existem
(teto do plano), então ela foi criada uma vez à mão pela Management API; depois disso o workflow
`deploy.yml` a atualiza a cada merge. Migração aplicada à mão (o histórico de migrações de
produção diverge do repositório), com backup antes.

## Toques em arquivos compartilhados (todos atrás da flag)

| Arquivo | Mudança | Com a flag desligada |
| --- | --- | --- |
| `supabase/functions/_shared/chatAgent.ts` | +ferramenta `agendador` no tipo, custo, `parseAgentAction`; bloco do prompt só com `ctx.scheduler` | prompt byte a byte igual (teste `promptBaseline.test.ts` com SHA-256 do main) |
| `supabase/functions/creative-router/index.ts` | passa `scheduler: true` só se `schedulerAllowed()` e a conversa fala de agendar | nada muda |
| `src/lib/chatAgent/runAction.ts` | `case 'agendador'` + rótulo de progresso | o modelo nunca devolve a ação |
| `src/components/vertal-chat/VertalChat.tsx` | `<SchedulerEntryButton />` no topo; rótulo "Resumo" no cartão quando o método é `TAREFA AGENDADA` | botão não renderiza nada (teste) |
| `supabase/config.toml` | `verify_jwt = false` para a função nova | — |
| `.env.production` | `VITE_VERTAL_CHAT_SCHEDULER=true` | servidor decide por usuário |

## Testes

- `src/lib/chatScheduler/core.test.ts`: português → data/hora, fuso (inclui horário de verão),
  próximo disparo (diário, semanal, mensal, intervalo, cron), normalização, cartão, silêncio,
  backoff, busca do Gmail, sentimento, flag.
- `src/lib/chatScheduler/integration.test.tsx`: prompt com a flag, parse da ação, cartão de
  confirmação obrigatório, mudança de permissão pede confirmação, botão some com a flag desligada.
- `src/lib/chatScheduler/promptBaseline.test.ts`: regressão do prompt do Vertal Chat.
- `deno check` em `vertal-chat-scheduler/index.ts` e `creative-router/index.ts` (sem erros novos;
  os 7 erros de tipo já existentes no main continuam iguais).

## Limites conhecidos

- Precisão de até 1 minuto (o pg_cron confere a cada minuto).
- No servidor a tarefa usa um subconjunto das ferramentas (web, Gmail, Vertal Fluxos). Ferramentas
  que rodam no navegador (imagem, app, música, navegador na nuvem, Vibe Code) não rodam sozinhas:
  a tarefa avisa o que preparou e o que o usuário precisa abrir.
- Gatilho de e-mail usa checagem periódica (2–60 min, padrão 5), não push do Gmail.
- Aviso por e-mail vai só para a própria conta Gmail conectada; não há push no celular ainda.
- Um usuário só tem 50 tarefas ativas/pausadas.
