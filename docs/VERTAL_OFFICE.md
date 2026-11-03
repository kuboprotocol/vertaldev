# Vertal Office

Suíte de escritório do Painel Criativo: documentos, planilhas e (em evolução) apresentações, com a IA do Vertal como ajuda opcional.

## Modelo de cobrança

- **Grátis para usar:** editor de documentos, editor de planilhas, exportação (HTML, Markdown, texto, CSV, Excel `.xlsx`) e rascunhos salvos no navegador. Não há cobrança por abrir, editar ou exportar.
- **Pago só o uso da IA:** cada ação de IA (escrever documento, preencher planilha) custa **1 crédito por uso**. Se a IA falhar ou devolver um resultado inválido, o crédito é devolvido automaticamente.
- **Nada é obrigatório:** o usuário pode usar o Vertal Office inteiro sem nunca tocar na IA.

## O que já funciona

| Área | Situação |
|------|----------|
| Documento | Blocos de título, parágrafo e item de lista. Exporta HTML, Markdown e texto. |
| Planilha | Grade de até 200 linhas × 26 colunas. Fórmulas: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`, `ABS`, operadores `+ - * / ^` e parênteses. Erros: `#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, `#CYCLE!`. Exporta CSV e `.xlsx`. |
| IA | Escreve documento e preenche planilha a partir de um pedido e de material colado opcional. 1 crédito por uso. |
| Armazenamento | Rascunho local no navegador (um documento e uma planilha por vez). |

## O que ainda não funciona

- Exportação para `.docx` e `.pptx`.
- Apresentações (slides) dentro do Vertal Office.
- Várias abas ou vários documentos por conta. Hoje há um documento e uma planilha por navegador.
- Busca na web ao vivo pela IA. A IA organiza o pedido e o material que o usuário colar.

## Agentes e e-mail (planejado)

Os agentes do Vertal poderão **ler arquivos do Vertal Office e enviá-los por e-mail**, por exemplo pelo Gmail (já existe a função `gmail-send-message`, hoje só com texto, sem anexo) e, depois, por outras contas de e-mail que forem instaladas.

Regras que valem para essa integração:

1. **Confirmação antes de cada envio.** O agente prepara o e-mail (destinatário, assunto, texto e anexo) e o usuário confirma antes de sair. Nenhum agente envia e-mail sozinho.
2. **Só com conta conectada pelo próprio usuário.** O agente usa somente contas que o usuário autorizou, com OAuth e tokens criptografados, como o Gmail já funciona.
3. **Anexos são gerados a partir do arquivo do usuário**, nos formatos já suportados (`.xlsx`, `.html`, `.md`, `.txt`, `.csv`).
4. **Custo (confirmado):** a preparação do e-mail pela IA consome 1 crédito por uso, como qualquer outra ação de IA. O envio em si não é cobrado.

Status: **não implementado**. O envio com anexo e a confirmação no painel ainda precisam ser construídos.

## Arquitetura (resumo)

- `src/lib/office/`: motor de fórmulas, modelos de documento e planilha, exportação.
- `src/components/office/OfficeSuite.tsx`: interface do Vertal Office.
- `supabase/functions/office-ai/`: edge function da IA, com cobrança de 1 crédito, idempotência e reembolso em falha.
- `supabase/functions/_shared/officeAi.ts`: prompts e validação da saída da IA.
