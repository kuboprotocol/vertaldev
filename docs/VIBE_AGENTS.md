# Vibe Agents

Agentes de IA que o próprio cliente cria descrevendo em português. O agente escolhe ferramentas, usa as conexões do cliente (Slack, Gmail, GitHub), roda Python numa sandbox e pode criar e executar outros agentes.

Acesso: Dashboard → **Vibe Agents** (`/vibe-agents`).

## Como funciona

1. **Projetar** — o cliente descreve o agente ("Todo dia leia as issues abertas do meu GitHub e poste um resumo no #dev do Slack"). A IA devolve nome, instruções passo a passo e ferramentas, escolhidas só do catálogo.
2. **Explain Mode** — a tela mostra as ferramentas que o agente vai usar (o cliente liga e desliga cada uma) e as conexões necessárias:
   - conector do cliente faltando → botão **Conectar** (ex.: "Slack não conectado");
   - capacidade da plataforma ainda não ativada → "aguardando ativação" (ex.: Sandbox Python sem `E2B_API_KEY`).
3. **Salvar e executar** — a execução chama o modelo com *function calling* e grava cada passo (pensamento, ferramenta com argumentos e resultado, resposta final). O **Modo avançado** mostra os argumentos e resultados brutos.

## Ferramentas

| Ferramenta | Conexão | Efeito externo |
|---|---|---|
| 🌐 Ler páginas da web (`web_fetch`) | — | não |
| 💬 Postar no Slack (`slack_post`) | Slack do cliente | sim |
| ✉️ Enviar e-mail (`email_send`) | Gmail do cliente | sim |
| 🐙 Ler repositórios do GitHub (`github_list_repos`) | GitHub do cliente | não |
| 📝 Criar issue no GitHub (`github_create_issue`) | GitHub do cliente | sim |
| 🐍 Executar Python (`python_run`) | Sandbox Python (plataforma) | não |
| 🧬 Criar outros agentes (`create_agent`) | — | não |
| 🤝 Executar outros agentes (`run_agent`) | — | não |

O catálogo fica em `supabase/functions/_shared/vibeAgentsConfig.ts` e é o mesmo para o servidor e para a tela (`src/config/vibeAgents.ts` reexporta), então o que aparece no Explain Mode é exatamente o que o agente pode executar.

## Créditos

Cobrança medida, igual ao resto do Vertal, mais 1 crédito por execução:

| Item | Créditos | Referência |
|---|---|---|
| Taxa por execução | 1 | — |
| Cada passo da IA (inclusive de sub-agentes) | 1 | igual a uma mensagem do Kubo Chat |
| Cada execução de Python | 1 | igual a uma geração (imagem) |

- A taxa é cobrada no início com a chave de idempotência do clique (clique duplo não cobra duas vezes).
- Cada passo é cobrado **antes** de chamar o modelo; cada Python, antes de rodar.
- Se os créditos acabarem no meio, o agente para, entrega o que fez e só cobra o que usou.
- Se não houver saldo nem para o primeiro passo, ou se a execução falhar, **tudo é devolvido** (`withRefundOnFailure`).
- Execução mínima: 2 créditos (taxa + 1 passo). Máxima: 1 + 12 passos + execuções de Python.

Valores em `VIBE_AGENT_PRICING`.

## Limites e segurança

- O agente só usa as ferramentas que o cliente aprovou; chamadas fora disso voltam `tool_not_allowed`.
- Um agente criado por outro nunca recebe mais ferramentas que o criador.
- Por execução (somando sub-agentes): 12 passos da IA, 5 efeitos externos (envios, issues), profundidade 2 de agentes.
- `web_fetch` só abre páginas `https` públicas; redirecionamentos são seguidos um a um, cada salto revalidado contra IPs privados e metadados.
- E-mail: quebras de linha removidas de destinatário/assunto (sem injeção de cabeçalho).
- Credenciais são do próprio cliente (`api_credentials` criptografado, `github_connections`, `gmail_accounts`). A chave de Slack única da plataforma **não** é usada.

## Python (sandbox E2B)

- Uma sandbox por execução, criada no primeiro `python_run`, compartilhada com sub-agentes e destruída no fim (inclusive em falha).
- Template padrão `code-interpreter-v1` (Pandas, NumPy, scikit-learn, Matplotlib já instalados); troque com `VIBE_SANDBOX_TEMPLATE`.
- O código vai em base64 (o shell não interpreta nada dele), 60 s por execução, saída limitada, `pipefail` para erros do Python aparecerem com o traceback.
- `pip install` só de uma lista permitida (`PYTHON_PACKAGES`).

## Configuração (segredos das Edge Functions)

| Segredo | Para quê |
|---|---|
| `OPENROUTER_API_KEY` | modelo dos agentes (obrigatório) |
| `VIBE_AGENT_MODEL` | opcional; padrão `openai/gpt-4o-mini` |
| `E2B_API_KEY` | ativa o Python na sandbox |
| `VIBE_SANDBOX_TEMPLATE` | opcional; padrão `code-interpreter-v1` |
| `CONNECTOR_ENC_KEY` | já existente; descriptografa as conexões |

## Dados

- `vibe_agents` — agentes (nome, instruções, ferramentas).
- `vibe_agent_runs` — execuções (tarefa, status, passos, saída, `credits_spent`).
- RLS: o cliente lê só as próprias linhas e pode apagar os próprios agentes; toda escrita passa pela função `vibe-agents`.

Migration: `supabase/migrations/20261011150000_vibe_agents.sql`.

## API (`vibe-agents`)

Todas as chamadas são `POST` com login.

| `action` | Corpo | Retorno |
|---|---|---|
| `design` | `description` | `agent` (nome, instruções, ferramentas) + `connectors` |
| `readiness` | `tools` | `connectors` (conectado? rota para conectar) |
| `save` | `name`, `instructions`, `tools`, `agent_id?` | `agent` |
| `run` | `agent_id`, `task` (+ cabeçalho `X-Idempotency-Key`) | `status`, `output`, `steps`, `credits_charged` |
