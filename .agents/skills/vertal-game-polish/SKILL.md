---
name: vertal-game-polish
description: Dá acabamento visual e de feedback a um jogo do Vertal Dev (contraste, transições, partículas, responsividade, acessibilidade). Use quando o jogo já funciona e precisa ficar bonito e agradável de jogar.
---

# Acabamento de jogo (Vertal)

Objetivo: o jogo transmite o pilar definido no blueprint, sem perder performance.

## Feedback ao jogador ("juice")
- Toda ação relevante tem resposta visível em até 100 ms: um brilho, um pequeno deslocamento ou um som.
- Use no máximo 3 efeitos ao mesmo tempo para evitar ruído visual.
- Partículas: limite de quantidade por cena. Desligue quando a aba não está visível.

## Visual
- Paleta: 1 cor de destaque, 1 de fundo e neutras. A cor de destaque sai do `art_direction` do blueprint.
- Contraste mínimo de 4.5:1 para texto e elementos de interface.
- Transições de tela curtas (200–400 ms). Respeite `prefers-reduced-motion`: reduza movimento, não remova informação.

## Áudio
- Efeitos curtos e discretos. Música com opção de desligar.
- Áudio só começa após um gesto do usuário (política do navegador).

## Responsividade
- Controles de toque com alvo mínimo de 44 px.
- Teste em tela estreita antes de dar o acabamento por concluído.

## Não faça
- Não adicione dependência de biblioteca de efeito só para um efeito simples.
- Não use animação que não tenha função (decoração que atrapalha a leitura).
