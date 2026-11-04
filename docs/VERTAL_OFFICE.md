# Vertal Office

Suíte de escritório do Painel Criativo: documentos, planilhas e (em evolução) apresentações, com a IA do Vertal como ajuda opcional.

## Modelo de cobrança

- **Grátis para usar:** editores de documento, planilha e apresentação, exportação (HTML, Markdown, texto, CSV, Excel `.xlsx`, Word `.docx`, PowerPoint `.pptx`, PDF) e rascunhos salvos no navegador. Não há cobrança por abrir, editar ou exportar.
- **Pago só o uso da IA:** cada ação de IA (escrever documento, preencher planilha) custa **1 crédito por uso**. Se a IA falhar ou devolver um resultado inválido, o crédito é devolvido automaticamente.
- **Nada é obrigatório:** o usuário pode usar o Vertal Office inteiro sem nunca tocar na IA.

## O que já funciona

| Área | Situação |
|------|----------|
| Documento | Blocos de título, parágrafo e item de lista. Exporta HTML, Markdown e texto. |
| Planilha | Grade de até 200 linhas × 26 colunas. Fórmulas: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`, `ABS`, operadores `+ - * / ^` e parênteses. Erros: `#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, `#CYCLE!`. Exporta CSV e `.xlsx`. |
| IA | Escreve documento, preenche planilha e gera slides a partir de um pedido e de material colado opcional. 1 crédito por uso. |
| Apresentação | Slides com título e tópicos. A IA gera a apresentação inteira ou adiciona slides depois do atual (1 crédito por uso). Exporta PDF (paisagem), HTML, texto e PowerPoint (`.pptx`). |
| Word | Exporta documento em `.docx`. |
| Armazenamento | Rascunho local no navegador (um documento, uma planilha e uma apresentação por vez). |

## O que ainda não funciona

- Várias abas ou vários documentos por conta. Hoje há um documento e uma planilha por navegador.
- Busca na web ao vivo pela IA. A IA organiza o pedido e o material que o usuário colar.

## Enviar por e-mail

O usuário pode enviar um documento ou uma planilha como anexo pela própria conta Gmail, conectada em `/connectors/gmail`.

Fluxo, na ordem:

1. **Escolhe a conta e o destinatário**, e o formato do anexo.
2. **(Opcional) A IA prepara o assunto e o texto** a partir do conteúdo do arquivo. Custa **1 crédito por uso**.
3. **Revisa** o assunto e o texto.
4. **Marca a confirmação** ("Revisei o e-mail e confirmo o envio").
5. **Confirma o envio.** Só então o e-mail sai.

Regras:

- **Nenhum envio acontece sem confirmação.** A confirmação é exigida também no servidor (`confirmed: true`), não só na tela. Editar o assunto ou o texto desfaz a confirmação.
- **Nenhum agente envia e-mail sozinho.** A função de envio só roda a partir de uma ação do usuário.
- **Anexos permitidos:** `.xlsx`, `.csv`, `.html`, `.md`, `.txt`. O tipo do arquivo vem da extensão, não do cliente. Limite de 10 MB.
- **Só contas conectadas pelo próprio usuário**, com OAuth e tokens criptografados, como o Gmail já funciona.
- **Custo:** a preparação do texto pela IA consome 1 crédito por uso. O envio não é cobrado.

Limitações atuais:

- **Só Gmail.** Outras contas de e-mail serão adicionadas depois.
- **Sem agente automático.** Hoje o envio começa sempre pela interface do usuário.

## Agentes do Vertal (planejado)

Os agentes poderão, no futuro, preparar um e-mail com anexo e pedir a confirmação do usuário pela mesma tela. A regra de confirmação antes do envio continua valendo.

## Arquitetura (resumo)

- `src/lib/office/`: motor de fórmulas, modelos de documento e planilha, exportação.
- `src/components/office/OfficeSuite.tsx`: interface do Vertal Office.
- `supabase/functions/office-ai/`: edge function da IA (ações `sheet`, `doc` e `email`), com cobrança de 1 crédito, idempotência e reembolso em falha.
- `supabase/functions/office-email-send/`: envio pelo Gmail com anexo. Exige `confirmed: true`.
- `supabase/functions/_shared/officeEmail.ts`: montagem MIME, nomes de anexo e cabeçalhos seguros.
- `src/components/office/OfficeEmailDialog.tsx`: diálogo de envio com confirmação.
- `supabase/functions/_shared/officeAi.ts`: prompts e validação da saída da IA.
