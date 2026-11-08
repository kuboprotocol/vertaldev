# Cofre de segredos e orquestrador (painel secreto)

Rota: `/secrets` (exige login, não aparece em nenhum menu, envia `noindex`).

O cofre guarda valores que não são conectores: chaves de API, tokens, senhas.
Conectores (`api_credentials`, `github_connections`) continuam separados e
não são alterados por esta feature.

## Quem vê o quê

| Papel | Vê nome e dica mascarada | Revela o valor | Usa na orquestração | Edita / troca / exclui / concede acesso |
|---|---|---|---|---|
| Dono (quem criou) | sim | sim | sim | sim |
| Convidado (`can_reveal = false`) | sim | não | sim | não |
| Convidado (`can_reveal = true`) | sim | sim | sim | não |

Nenhum valor sai do servidor fora de `reveal`. A página mostra só a dica mascarada
(`sk-l••••7890`). Ao revelar, o valor fica na tela por 20 segundos e some sozinho.

## Arquitetura

```
src/pages/SecretsVaultPage.tsx       painel (Segredos · Orquestrador · Auditoria)
src/hooks/useKuboSecrets.ts          único cliente; só chama Edge Functions
        │
        └─ kubo-secrets              CRUD, revelar, conceder, revogar, auditoria
                                     + orquestrador: targets, plan, overview (sem valores)
                    │
supabase/functions/_shared/
  kuboSecretsCore.ts   regras puras (validação, máscara, plano) — testado no Vitest
  kuboSecrets.ts       camada de servidor: auditoria, segredos visíveis,
                       resolveEnvForRun (injeção no servidor)
  connectorCrypto.ts   AES-GCM (mesmo CONNECTOR_ENC_KEY dos conectores)
```

Tabelas (`supabase/migrations/20261108120000_kubo_secrets_vault.sql`):

- `kubo_secrets`: valor cifrado, dono, nome, `env_key`, grupo, destino (`bound_to`).
- `kubo_secret_grants`: concessões por segredo, com `can_reveal`.
- `kubo_secret_audit`: trilha append-only (trigger bloqueia UPDATE/DELETE). Sem FK,
  então sobrevive à exclusão do segredo. Nunca guarda valores.

RLS: `anon` e `authenticated` não têm nenhum privilégio nessas tabelas. Só o service
role acessa, e as Edge Functions aplicam as regras acima.

## Orquestrador

Destinos conhecidos (`ORCHESTRATION_TARGETS` em `kuboSecretsCore.ts`):
provedores de IA, GitHub, pagamentos, e-mail e infraestrutura.

Para cada destino, `plan` diz para cada variável exigida:

- `ready` com origem `owner` ou `grant`, ou `missing`;
- aviso se o valor não é trocado há mais de 90 dias;
- se o conector correspondente (quando existe) está conectado. Isso é só
  consultado: cofre e conector não são mesclados.

Para uma execução, `resolveEnvForRun(admin, userId, keys, {runId, target})`
devolve o mapa de variáveis que o usuário pode usar, decifrado só dentro do
servidor, e grava uma linha `inject` por segredo na auditoria do dono.

## Revelação e limites

- Revelar exige ação explícita. Limite de 30 revelações por usuário em 10 minutos.
- Cada revelação, troca de valor, concessão e injeção entra na auditoria.
- Respostas com valores têm `Cache-Control: no-store`.
- Erros de infraestrutura passam por `sanitizeError`, que não devolve detalhes de banco.

Cofre e orquestrador ficam numa função só (`kubo-secrets`) porque o plano do
Supabase limita o número de Edge Functions do projeto.

## Pendências conhecidas

- A migration foi aplicada em produção (projeto kubovibe) pelo SQL Editor, sem registro em `supabase_migrations`; ela é idempotente, então um `supabase db push` futuro não quebra nada.
- Nada chama `resolveEnvForRun` ainda. Ele está pronto para as funções que
  executam agentes ou deploys usarem.
- `CONNECTOR_ENC_KEY` é compartilhada com os conectores. Trocar essa chave exige
  recifrar os dois.
