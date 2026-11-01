# SQL manual (não é migration automática)

Arquivos aplicados uma única vez, à mão, no banco de produção
(`sccizjlpwezsgaxkclot`). Ficam fora de `supabase/migrations/` de propósito:
um banco novo montado pelas migrations já tem esses objetos, e rodar estes
arquivos de novo nele duplicaria políticas.

| Arquivo | O que faz | Aplicado em |
|---|---|---|
| `20261102_restore_missing_objects.sql` | Cria os objetos (tabelas, funções, views, políticas e triggers) que existem nas migrations mas nunca chegaram à produção, que foi montada com os blocos consolidados `part_001`–`part_005`. Extraído só com comandos sobre objetos ausentes; funções e views na definição mais recente. Não redefine nada que já existe. | ver histórico de migrations do projeto (`restore_missing_objects`) |

Desvio intencional: as tabelas `app_logos`, `logo_ai_generations`,
`app_integrations`, `app_deployments`, `app_navbar_configs`, `app_analytics` e
`stripe_transactions` são criadas sem a FK `app_id -> public.apps(id)`, porque a
tabela `apps` não existe em nenhuma migration nem em produção.

Endurecimento adicional (não estava nas migrations): RLS em `oauth_states`
(o usuário só insere o próprio state; o callback lê com a service role) e em
`stripe_webhook_events` (só service role).

Também ficaram de fora `enqueue_email`, `delete_email`, `move_to_dlq` e
`read_email_batch`: são atalhos para funções `internal.*` que dependem da
extensão `pgmq`, que não está instalada, e nada no código as chama.

Objetos deixados de fora porque uma migration posterior os removeu de
propósito: `mcp_api_keys`, `mcp_tool_calls`, `validate_mcp_api_key`,
`find_referrer_by_code`, `get_creative_audit_logs`, `api_credentials_safe`,
`web3_connections_safe`.
