# Vertal Office

Suíte de escritório do Painel Criativo: documentos, planilhas, apresentações e PDF, com a IA do Vertal como ajuda opcional.

## Modelo de cobrança

- **Grátis para usar:** editores de documento, planilha, apresentação e PDF, exportação (HTML, Markdown, texto, CSV, Excel `.xlsx`, Word `.docx`, PowerPoint `.pptx`, PDF) e rascunhos salvos no navegador. Não há cobrança por abrir, editar ou exportar.
- **Pago só o uso da IA:** cada ação de IA (escrever documento, preencher planilha) custa **1 crédito por uso**. Se a IA falhar ou devolver um resultado inválido, o crédito é devolvido automaticamente.
- **Nada é obrigatório:** o usuário pode usar o Vertal Office inteiro sem nunca tocar na IA.

## O que já funciona

| Área | Situação |
|------|----------|
| Documento | Blocos de título, parágrafo e item de lista. Modelos prontos (carta, relatório, ata, proposta, contrato de serviços, currículo). Exporta HTML, Markdown, texto, Word e PDF (paginado, com número de página). |
| Planilha | Grade de até 200 linhas × 26 colunas. Fórmulas: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`, `ABS`, operadores `+ - * / ^` e parênteses. Erros: `#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, `#CYCLE!`. Modelos: orçamento e controle financeiro, com totais calculados. Exporta CSV, `.xlsx` e PDF (paisagem, com a formatação das células). |
| PDF | Abrir ou arrastar um PDF (até 10 MB). Editar: texto, destaque, cobrir área com branco, girar página, apagar página, página em branco, anexar outro PDF. Cada ação grava o PDF na hora e "Desfazer" volta uma ação (até 15). Criar: PDF em branco ou a partir de um texto colado. Baixa o PDF editado ou o original. |
| IA | Escreve documento, preenche planilha e gera slides a partir de um pedido e de material colado opcional. 1 crédito por uso. |
| Apresentação | Slides com título e tópicos. A IA gera a apresentação inteira ou adiciona slides depois do atual (1 crédito por uso). Exporta PDF (paisagem), HTML, texto e PowerPoint (`.pptx`). |
| Word | Exporta documento em `.docx`. |
| Armazenamento | Rascunho local no navegador (um documento, uma planilha e uma apresentação por vez). O PDF em edição fica na memória da aba: some ao recarregar a página. |

## O que ainda não funciona

- Várias abas ou vários documentos por conta. Hoje há um documento e uma planilha por navegador.
- Busca na web ao vivo pela IA. A IA organiza o pedido e o material que o usuário colar.
- PDF: a fonte padrão (Helvetica) aceita o alfabeto latino com acentos. Outros caracteres (ex.: chinês, emoji) viram `?` no texto inserido.
- PDF: "Cobrir" põe uma área branca por cima e não apaga o texto que já estava na página. Não há remoção de texto nem edição de texto existente.
- PDF: não há assinatura digital, formulários preenchíveis nem OCR de PDF escaneado.

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
- `src/lib/office/pdfEdit.ts`: edição de PDF existente (pdf-lib). Converte cliques da tela para o espaço do PDF, considerando a rotação da página.
- `src/lib/office/pdfGenerate.ts`: geração de PDF de documento, planilha e texto livre (pdf-lib, com paginação).
- `src/lib/office/templates.ts`: modelos de documento e de planilha.
- `src/lib/office/download.ts`: download de arquivos gerados no navegador.
- `src/components/office/PdfTab.tsx`: aba PDF (abrir, anexar, editar, criar e baixar). Usa pdf.js para exibir as páginas.
- `src/components/office/OfficeSuite.tsx`: interface do Vertal Office.
- `supabase/functions/office-ai/`: edge function da IA (ações `sheet`, `doc` e `email`), com cobrança de 1 crédito, idempotência e reembolso em falha.
- `supabase/functions/office-email-send/`: envio pelo Gmail com anexo. Exige `confirmed: true`.
- `supabase/functions/_shared/officeEmail.ts`: montagem MIME, nomes de anexo e cabeçalhos seguros.
- `src/components/office/OfficeEmailDialog.tsx`: diálogo de envio com confirmação.
- `supabase/functions/_shared/officeAi.ts`: prompts e validação da saída da IA.

## Galeria

A galeria guarda os documentos de cada usuário na conta (Supabase), não só no navegador.

- Acesse pelo app **Galeria** (primeiro item da barra lateral). Busca por título e conteúdo, filtro por tipo e ordenação.
- **Salvar na galeria** (cabeçalho): guarda o item aberto. O indicador âmbar mostra alterações ainda não salvas.
- **Abrir** reabre o item no editor certo. **Renomear**, **Duplicar**, **Baixar** (no formato nativo: .docx, .xlsx, .pptx ou .pdf) e **Excluir** (com confirmação).
- Segurança: cada linha pertence a um usuário e as políticas RLS impedem acesso a itens de outras pessoas. PDFs ficam no bucket privado `office-files`, em uma pasta por usuário.
- Limites: 1 MB por documento estruturado e 10 MB por PDF. A lista mostra os 500 itens mais recentes.
- Migração: `supabase/migrations/20261108150000_office_documents.sql`. Os tipos em `src/integrations/supabase/types.ts` foram escritos à mão; regenere com `supabase gen types` depois de aplicar a migração.
