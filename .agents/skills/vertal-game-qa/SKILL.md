---
name: vertal-game-qa
description: Verifica um jogo gerado antes de entregar ao usuário: checa o blueprint, roda o jogo no navegador e registra erros de console e de carregamento. Use depois de gerar ou alterar um jogo, e antes de publicar.
---

# QA de jogo (Vertal)

Objetivo: nenhum jogo é entregue sem uma passagem objetiva de verificação.

## Etapa 1 — Blueprint (estática)
Rode a checagem de qualidade do blueprint (`validateBlueprint` em `src/components/builder/blueprintQuality.ts`). Ela devolve problemas com severidade:
- `error`: impede a entrega (campo obrigatório ausente, entidade sem posição finita, nenhum `player`).
- `warning`: entregue, mas avise o usuário (pilares vazios, roadmap com um marco só).

## Etapa 2 — Execução (no navegador)
1. Abra o jogo gerado e espere o carregamento.
2. Capture erros de console e falhas de rede. Qualquer erro não tratado é `error`.
3. Confirme que pelo menos uma entidade da cena aparece na tela.
4. Dê alguns segundos de execução e verifique que o loop continua (o quadro muda).

## Etapa 3 — Relatório
Liste em uma tabela: verificação, resultado (passou/falhou) e evidência (mensagem de erro ou captura). Não diga "passou" sem ter executado a etapa.

## Não faça
- Não marque como pronto um jogo que não foi executado.
- Não esconda erros de console como "ruído" sem olhar.
