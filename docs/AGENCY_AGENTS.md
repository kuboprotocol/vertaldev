# Agency Agents

Catálogo de 283 especialistas de IA (18 divisões) do projeto [The Agency](https://github.com/msitarzewski/agency-agents), licença MIT. O cliente navega pelo catálogo, contrata um especialista para a própria equipe e executa tarefas com ele.

Acesso: Dashboard → **Agency Agents** (`/agency-agents`), ou pelo botão no topo de **Vibe Agents**.

## Como funciona

1. **Explorar** — busca sem acento, filtro por divisão e cards com a frase de efeito de cada especialista.
2. **Perfil** — abre a persona completa em Markdown, sem sair da página.
3. **Contratar** — salva o especialista como um agente do Vibe Agents (`vibe_agents`), com:
   - a persona completa, precedida de um preâmbulo que pede resposta em português do Brasil;
   - a ferramenta `web_fetch` ligada por padrão; as demais aparecem com o estado de conexão (Explain Mode).
4. **Executar** — roda a tarefa com o motor do Vibe Agents (`vibe-agents`): cobrança por créditos, reembolso em falha, linha do tempo de cada passo.

Contratar e executar usam a mesma regra de créditos do Vibe Agents, documentada em [VIBE_AGENTS.md](./VIBE_AGENTS.md#créditos).

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/data/agency-agents/` | Cópia do upstream: uma pasta por divisão, com os `.md` sem alteração, `LICENSE`, `divisions.json` e `catalog.json` |
| `scripts/sync-agency-agents.mjs` | Gera a cópia e o `catalog.json` a partir de um clone do upstream |
| `src/lib/agencyAgents.ts` | Catálogo tipado, busca, leitura lazy das personas e montagem das instruções |
| `src/pages/AgencyAgentsPage.tsx` | Página, cards, perfil e fluxo contratar/executar |
| `src/lib/vibeAgentsApi.ts` | Cliente da função `vibe-agents` (compartilhado com Vibe Agents) |
| `src/components/vibe-agents/RunTimeline.tsx` | Linha do tempo de execução (compartilhado com Vibe Agents) |
| `src/test/agency-agents-core.test.ts`, `src/test/agency-agents-page.test.tsx` | Testes do catálogo e do fluxo da página |

## Atualizar o catálogo

```bash
git clone --depth 1 https://github.com/msitarzewski/agency-agents /tmp/agency-agents
node scripts/sync-agency-agents.mjs /tmp/agency-agents
```

O script copia apenas as divisões listadas em `divisions.json` e os arquivos com frontmatter `name:`. Playbooks e READMEs ficam de fora. Depois da sincronização, rode `npx vitest run src/test/agency-agents-core.test.ts`: o teste confere a contagem de 283 agentes e 18 divisões, então ele vai falhar se o número mudar, e aí a contagem esperada precisa ser atualizada junto com a mudança.

Nunca edite os arquivos em `src/data/agency-agents/` à mão: a próxima sincronização sobrescreve.

## Limites e custo

| Item | Valor | Onde |
|---|---|---|
| Caracteres de instruções por agente | 40 000 | `VIBE_AGENT_LIMITS.maxInstructionsChars` (era 4 000) |
| Agentes por usuário | 50 | `VIBE_AGENT_LIMITS.maxAgentsPerUser` |
| Créditos por execução | 1 + 1 por passo da IA (mínimo 2) | `VIBE_AGENT_PRICING` |

A maior persona tem cerca de 35 mil caracteres. Como a persona completa vai em cada passo da IA, cada passo consome em torno de 10 mil tokens de entrada, e uma execução pode ter até 12 passos. Se a margem não cobrir isso, reduza o limite ou revise o preço por execução.

## Deploy

A alteração de `supabase/functions/_shared/vibeAgentsConfig.ts` só vale no servidor depois do deploy da função `vibe-agents`. Sem o deploy, personas acima de 4 000 caracteres chegam truncadas.

Checklist antes de liberar:

- [ ] Função `vibe-agents` deployada com a versão deste PR.
- [ ] `OPENROUTER_API_KEY` configurada em produção (sem ela a execução falha com `agent_model_not_configured`).
- [ ] Custo por execução revisado, dado o tamanho das personas.

## Critério de conclusão

O PR #174 está mergeado na `main`, a função `vibe-agents` foi deployada, e em produção um usuário logado abre `/agency-agents`, contrata um especialista e vê uma tarefa executada com os créditos descontados.

## Limitações conhecidas

- As personas estão em inglês. O preâmbulo faz o especialista responder em português, mas o conteúdo dos perfis não foi traduzido.
- O fluxo ponta a ponta com login real e chamadas reais ainda não foi testado. Os testes automatizados cobrem a página com a função mockada.
- Contratar pelo nome: se o usuário já tiver um agente com o mesmo nome, a página considera o especialista "na equipe" e reaproveita esse agente.

## Atribuição

O catálogo é do projeto The Agency (msitarzewski/agency-agents), licença MIT. A cópia completa da licença está em `src/data/agency-agents/LICENSE`, e o aviso aparece em `THIRD_PARTY_NOTICES.md`.
