# Vertal Agentes ↔ Vertal Fluxos: um sistema só, por usuário

O Vertal Agentes (agentes que vigiam e reagem a eventos) e o Vertal Fluxos (apps conectados e
fluxos) agora trabalham juntos para cada usuário do Vertal Dev, sem credenciais separadas.
Nenhuma Edge Function nova: tudo passa pelo `creative-router`.

## 1. Agentes usam os apps conectados do Fluxos

- Op nova da ferramenta `huginn`: **`create_fluxos_agent`** (`app`, `kind` = `action`|`search`,
  `key`, `parameters{}`, `source_ids[]` ou `schedule`, `name?`). O servidor:
  1. confere em `fluxos_connections` que o app está **conectado pelo próprio usuário** e que a
     ação/busca existe no motor (`fluxos_apps describe`);
  2. gera o token do usuário `vat1_<user_id>_<HMAC>` (derivado de `FLUXOS_BROKER_SECRET` com outro
     prefixo; separado da chave `vfk1` do Fluxos — uma não vale como a outra);
  3. cria no Vertal Agentes um **PostAgent** que faz `POST` no `creative-router` com o cabeçalho
     `X-Vertal-Agent-Token` e o payload `{op:"run", app, kind, key, parameters}`
     (`no_merge: true`, `emit_events: true`, `parse_body: true`).
- `parameters` aceita Liquid (`{{ title }}`) com dados do evento que chega ao agente.
- A resposta (JSON) vira um **evento** do agente, que alimenta outros agentes ou um fluxo.
- O `creative-router` (cabeçalho `X-Vertal-Agent-Token`, `handleAgentBridge`) aceita só
  `status` / `describe` / `run` e chama `handleFluxosApps` com o usuário do token. **Escopo**: o
  usuário vem só do token assinado; a conexão usada é a linha `(user_id, app_key)` dele. Nada de
  Cofre, nada de token de provedor, nada de `user_id` no corpo.
- **Créditos**: 2 por execução (`FLUXOS_ACTION_COST`, motivo `agentes_fluxos_<app>`, metadado
  `source: vertal_agentes`), devolvidos se falhar (`withRefundOnFailure`, resposta não-2xx).
- **Aprovação**: dada ao criar o agente (cartão de permissão no chat / confirmação no painel),
  como um fluxo publicado. Revogar: desativar/apagar o agente, ou trocar `FLUXOS_BROKER_SECRET`
  (revoga todos os tokens e chaves).
- O token fica nas opções do agente na conta do próprio usuário no Vertal Agentes; quando o Vertal
  lê o agente, `redactOptions` mostra `[oculto]` (nomes `token`, `authorization`, `apikey`).

## 2. Eventos nos dois sentidos

**Agentes → Fluxos**
- Gatilho novo no app **Vertal** do motor: **“Novo evento do Vertal Agentes”** (`newAgentEvent`,
  consulta a cada 15 min, dedup por id do evento). O fluxo escolhe o agente numa lista.
- Continua valendo `connect_to_automatisch` (PostAgent → gatilho Webhook do fluxo).

**Fluxos → Agentes**
- Ações novas no app **Vertal**: **“Enviar para Vertal Agentes”** (`sendToAgents`: evento JSON para
  um agente receptor/webhook) e **“Rodar um agente do Vertal Agentes”** (`runAgent`).
- O motor chama o corretor (`X-Vertal-Fluxos-Key`, chave `vfk1` do usuário) com as ops
  `agentes_list`, `agentes_events`, `agentes_event`, `agentes_run`; o `creative-router` usa o
  Vertal Agentes **do mesmo usuário** (segredos `HUGINN_*` do Cofre dele). URL, login e segredo
  de webhook nunca vão para o motor.
- Continua valendo `connect_from_automatisch`.

## 3. Chat e painel

- Vertal Chat: o prompt da ferramenta `huginn` explica `create_fluxos_agent` (chaves vindas de
  `fluxos actions`). Cada chamada passa pelo cartão de permissão.
- Painel de agentes (`/agents`, `/vibe-agents`): botão **“Criar agente com um app do Vertal Fluxos”**
  (`FluxosAgentBuilder`): lista só apps conectados, ação/busca, parâmetros, e “numa agenda” ou
  “quando outro agente emitir um evento”. Agentes criados assim aparecem como “usa Vertal Fluxos”.

## Limites conhecidos
- Usuário precisa ter o Vertal Agentes configurado no Cofre (`HUGINN_URL/USERNAME/PASSWORD`).
- Apps compartilhados conectados só no Vertal (Gmail etc. da “Conta do Vertal”) entram nos agentes
  quando também conectados pelo fluxo de conectores do Vertal Fluxos (linha em `fluxos_connections`).
- Gatilho “Novo evento” é por consulta (15 min), não instantâneo; para instantâneo use
  `connect_to_automatisch` (webhook).
