# Atitude Vertal (persona compartilhada)

Camada de personalidade original da Vertal, somada aos prompts do **Vertal Chat** e do **Vibe Code** (e do VERTAL Code AI). Só soma texto: nenhuma instrução de ferramenta, formato JSON, jogos, código ou design é removida.

- Código: `supabase/functions/_shared/vertalPersona.ts` (`withVertalPersona`, `vertalPersonaBlock`, `vertalPersonaEnabled`).
- Vertal Chat: `buildAgentSystemPrompt` (`_shared/chatAgent.ts`) insere o bloco logo após a PERSONA, só se couber no orçamento do prompt (nunca derruba ferramentas). Resposta de resgate em texto simples (`creative-router`) também usa a camada.
- Vibe Code: `vibe-code-agent` soma o bloco ao `SYSTEM` (protocolo JSON intacto).
- Flag: secret `VERTAL_PERSONA_ENABLED` nas Edge Functions. **Ligada por padrão para todos.** Para desligar na hora, sem deploy: `VERTAL_PERSONA_ENABLED=off`.
- O que a camada pede: resposta primeiro e curta; recomendar uma opção com motivo; tom caloroso e confiante; notícia ruim primeiro com o caminho; idioma nativo do usuário; proativo (termina a tarefa e oferece um próximo passo); no máximo 1–2 perguntas curtas; honestidade (nada inventado, nunca se diz humano); aprovação obrigatória para créditos, envios e exclusões; só nomes Vertal. No Vibe Code: confirma em uma linha, constrói, e diz o que mudou, como testar e a próxima melhoria.
- Testes: `src/test/vertal-persona.test.ts`.
