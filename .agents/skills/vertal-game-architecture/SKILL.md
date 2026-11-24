---
name: vertal-game-architecture
description: Organiza o código de um jogo do Vertal Dev em módulos com eventos desacoplados (loop, cena, entidades, áudio, UI). Use ao criar ou revisar a estrutura de um jogo gerado, antes de escrever a lógica de gameplay.
---

# Arquitetura de jogo (Vertal)

Objetivo: o código do jogo sobrevive a mudanças de mecânica sem reescrever o núcleo.

## Camadas
- **Núcleo (loop):** um único laço de atualização com passo de tempo fixo para a lógica. Renderização roda separada.
- **Cena:** carrega o `scene` do blueprint e cria as entidades. Não contém regra de jogo.
- **Entidades:** dados + comportamento pequeno. Cada tipo (`player`, `npc`, `enemy`, `prop`, `portal`) tem o seu módulo.
- **Eventos:** módulos conversam por eventos nomeados (ex.: `enemy.defeated`, `portal.entered`), não por referência direta. Um evento tem nome, payload pequeno e nenhum efeito colateral escondido.
- **Áudio e UI:** assinam eventos. Nunca são chamados pela lógica diretamente.

## Regras
1. Lógica de gameplay não importa código de renderização.
2. Toda entidade criada precisa de uma forma de ser destruída. Sem isso, o jogo vaza memória.
3. Configuração vem de `config` do jogo, nunca de constante escondida no meio do código.
4. Um arquivo novo por responsabilidade. Se um arquivo passa de ~300 linhas, separe.
5. Dimensão 2D, 3D ou VR muda só a camada de renderização; o núcleo é o mesmo.

## Verificação
- Trocar a renderização (ex.: de Phaser para outro) não deve exigir mudança no núcleo.
- Um teste unitário do núcleo roda sem navegador.
