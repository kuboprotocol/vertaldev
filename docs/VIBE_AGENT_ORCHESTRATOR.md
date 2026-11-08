# Orquestrador do agente Vibe Code

O agente do Vibe Code agora decide, a cada pedido, **qual IA usar**, **quais
conectores e chaves a aplicação precisa** e **como o dev consegue cada um**, e
aprende com os próprios erros.

## 1. Escolha do modelo (`_shared/modelRouter.ts`)

Para cada pedido:

1. Classifica o tipo de tarefa (código, correção, arquitetura…) e a complexidade
   (`flash` = dia a dia, `pro` = complexo).
2. Considera só os modelos cuja chave está configurada na plataforma.
3. Dá uma nota por tipo de tarefa (1–5) e exige nota mínima maior em tarefa complexa.
4. Pesa o custo conforme a política. Em tarefa simples o custo pesa 1,5× mais.
5. Penaliza modelos que vêm falhando (últimos 7 dias de `ai_gateway_runs`).
6. Usa o primeiro colocado e deixa os dois seguintes como reserva. A tarefa
   inteira segue no mesmo modelo, e uma troca por falha aparece na timeline.

Escolhas com todas as chaves configuradas:

| Política | Tarefa simples | Tarefa complexa |
|---|---|---|
| `economy` | Claude Haiku 5.5 | DeepSeek Reasoner |
| `balanced` (padrão) | Claude Haiku 5.5 | Claude Sonnet 5.5 |
| `quality` | Claude Opus 5.5 | Claude Opus 5.5 |

Só com `DEEPSEEK_API_KEY` configurada, o agente continua usando a DeepSeek.

### Modelos e créditos

| Modelo | Chave | US$/1M (entrada/saída) | Créditos |
|---|---|---|---|
| DeepSeek Chat / Reasoner | `DEEPSEEK_API_KEY` | 0,27/1,10 · 0,55/2,19 | ×1 |
| Claude Haiku 5.5 | `ANTHROPIC_API_KEY` | 0,10/0,50 | ×1 |
| Claude Sonnet 5.5 | `ANTHROPIC_API_KEY` | 2/10 | ×3 |
| Claude Opus 5.5 (só em `quality`) | `ANTHROPIC_API_KEY` | 4/20 | ×5 |
| Llama 3.3 70B (Groq) | `GROQ_API_KEY` | 0,59/0,79 | ×1, nunca no agente de código (JSON instável) |

Créditos cobrados = custo base do tier (`flash` 1, `pro` 4) × peso do modelo.

### Claude

O Claude é chamado pelo SDK oficial (`npm:@anthropic-ai/sdk`) na Messages API
(`_shared/anthropicProvider.ts`):

- não envia `temperature`;
- usa `effort` `medium` (tarefa simples) ou `high` (complexa);
- Opus 5.5 e Sonnet 5.5 usam o fallback do servidor (`fallbacks: "default"`).

Uma recusa ou uma chave inválida passa para o próximo modelo da reserva.

### Configuração (secrets das Edge Functions)

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Libera os modelos Claude. |
| `VIBE_AGENT_MODEL_POLICY` | `economy`, `balanced` (padrão), `quality` ou `deepseek_only` (comportamento antigo, sem deploy). |
| `VIBE_MODEL_OVERRIDES` | JSON para ajustar notas, preços e créditos sem deploy, por exemplo `{"claude-sonnet-5-5":{"creditMultiplier":2}}`. |

## 2. Conectores e chaves

Para cada conector ou API que a aplicação precisa:

- **Tem conector no Vertal** → botão "Conectar" e link "Onde pegar a chave".
- **Não tem conector** → links "Criar conta" e "Onde pegar a chave" (páginas
  oficiais do catálogo) e um campo para colar a chave ali mesmo. A chave vai
  cifrada para o Cofre de segredos (`kubo-secrets`) e o campo some.
- **Chave já no cofre** → aparece como "no cofre" e não é pedida de novo. O
  servidor confere o cofre antes de responder.

Links sugeridos pelo modelo, para APIs fora do catálogo, só entram se forem `https`,
sem IP e sem credencial embutida, e aparecem marcados como sugestão.

A resposta do agente explica tudo isso em texto, um item por linha, com os links clicáveis.

## 3. Aprender com os erros

- **Modelos:** falhas recentes derrubam a nota, e o modelo volta quando se estabiliza.
- **Código:** o que a auto-revisão precisou corrigir vira uma "lição aprendida"
  na memória do Prime (até 2 por pedido, sem repetir) e entra no prompt dos
  próximos pedidos.

## Limites conhecidos

- As notas por tarefa são uma tabela inicial, não medida. O ideal é calibrá-las
  com `VIBE_MODEL_OVERRIDES` a partir dos resultados reais.
- A saúde dos modelos é global (todas as execuções), não por usuário.
- Nenhuma chamada real a provedores foi feita nesta mudança. Os testes usam respostas simuladas.
