---
name: vertal-game-blueprint
description: Transforma uma ideia de jogo em um blueprint estruturado (pilares, loop, mecânicas, cena) antes de qualquer código. Use quando o usuário descreve um jogo novo ou pede para planejar um game no Vertal Dev.
---

# Blueprint de jogo (Vertal)

Objetivo: sair de uma frase para um plano verificável antes de escrever código.

## Quando usar
- O usuário descreve um jogo novo ("quero um jogo de...").
- Um jogo existente vai ganhar mecânica nova grande.

## Passos
1. **Pilares:** 2 a 4 frases que definem a experiência (ex.: "tensão", "exploração", "ritmo"). Sem pilar, não há critério para cortar features.
2. **Loop de gameplay:** a sequência que o jogador repete a cada 30–60 s, em no máximo 5 passos.
3. **Mecânicas:** lista curta. Cada uma precisa responder "o que o jogador faz e o que muda no mundo".
4. **Cena inicial:** entidades com `kind` (`player`, `npc`, `enemy`, `prop`, `portal`), `name`, `position` finita e uma cor. Mantém o tamanho pequeno: até 200 entidades.
5. **Dimensão:** escolha entre `2D`, `3D`, `VR` ou `Hybrid` e justifique em uma frase.
6. **Roadmap:** 3 a 6 marcos, do mais simples ao mais completo. O primeiro marco tem que ser jogável.

## Saída esperada
Um objeto com `title`, `genre`, `dimension`, `pillars`, `lore`, `gameplay_loop`, `mechanics`, `art_direction`, `scene` e `roadmap`. É o mesmo formato que o `game-ai-architect` devolve, então a saída pode ir direto para `config.blueprint`.

## Não faça
- Não invente sistemas de monetização, login ou rede sem pedido explícito.
- Não gere código nesta etapa.
- Não copie blueprints de outros jogos: descreva o que é próprio desta ideia.
