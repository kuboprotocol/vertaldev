# SQL manual (não é migration automática)

Arquivos aplicados uma única vez, à mão, no banco de produção
(`sccizjlpwezsgaxkclot`). Ficam fora de `supabase/migrations/` de propósito:
um banco novo montado pelas migrations já tem esses objetos, e rodar estes
arquivos de novo nele duplicaria políticas.

| Arquivo | O que faz | Aplicado em |
|---|---|---|
| `20261102_restore_missing_objects.sql` | Cria os 63 objetos (tabelas, funções, views, políticas e triggers) que existem nas migrations mas nunca chegaram à produção, que foi montada com os blocos consolidados `part_001`–`part_005`. Extraído só com comandos sobre objetos ausentes; funções e views na definição mais recente. Não redefine nada que já existe. | ver histórico de migrations do projeto (`restore_missing_objects`) |

Objetos deixados de fora porque uma migration posterior os removeu de
propósito: `mcp_api_keys`, `mcp_tool_calls`, `validate_mcp_api_key`,
`find_referrer_by_code`, `get_creative_audit_logs`, `api_credentials_safe`,
`web3_connections_safe`.
