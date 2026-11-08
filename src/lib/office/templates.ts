// Modelos prontos do Vertal Office: tipos de documento (texto) e de planilha (com fórmulas).
// Os campos entre colchetes são para o usuário substituir. Modelos de contrato são referência,
// não substituem análise jurídica.
import { BlockFormat, BlockType, DocBlock, makeBlock } from './documentModel';
import { SheetData, sheetFromTable } from './sheetModel';

type Line = { type: BlockType; text: string; format?: BlockFormat };

export interface DocTemplate {
  id: string;
  label: string;
  description: string;
  lines: Line[];
}

const P = (text: string, format?: BlockFormat): Line => ({ type: 'paragraph', text, format });
const H = (text: string): Line => ({ type: 'heading', text });
const B = (text: string): Line => ({ type: 'bullet', text });
const NOTE = (text: string): Line => ({ type: 'paragraph', text, format: { italic: true, size: 'sm' } });

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'carta',
    label: 'Carta',
    description: 'Carta comercial ou ofício com cabeçalho, corpo e assinatura.',
    lines: [
      P('[Nome da sua empresa]', { bold: true }),
      P('[Cidade], [dia] de [mês] de [ano]'),
      P(''),
      P('Ao(À) [nome do destinatário]'),
      P('[Cargo e empresa do destinatário]'),
      P('Assunto: [assunto da carta]', { bold: true }),
      P(''),
      P('Prezado(a) [nome],'),
      P('[Primeiro parágrafo: contexto e motivo da carta.]'),
      P('[Segundo parágrafo: o que você pede, informa ou propõe, com datas e valores quando houver.]'),
      P('Fico à disposição para qualquer esclarecimento.'),
      P(''),
      P('Atenciosamente,'),
      P(''),
      P('[Seu nome]'),
      P('[Cargo]'),
    ],
  },
  {
    id: 'relatorio',
    label: 'Relatório',
    description: 'Relatório com resumo, contexto, resultados e próximos passos.',
    lines: [
      P('[Título do relatório]', { bold: true, size: 'lg' }),
      P('Período: [início] a [fim]  ·  Responsável: [nome]', { italic: true }),
      H('Resumo executivo'),
      P('[Objetivo, período e a conclusão principal em um parágrafo.]'),
      H('Contexto'),
      P('[Por que este trabalho foi feito e qual era a situação antes.]'),
      H('Resultados'),
      B('[Resultado 1, com número quando houver]'),
      B('[Resultado 2]'),
      B('[Resultado 3]'),
      H('Conclusões e próximos passos'),
      P('[O que os resultados significam e o que deve acontecer a seguir.]'),
    ],
  },
  {
    id: 'ata',
    label: 'Ata de reunião',
    description: 'Ata com participantes, pauta, decisões e responsáveis.',
    lines: [
      P('Ata de reunião — [assunto]', { bold: true, size: 'lg' }),
      P('Data: [dd/mm/aaaa]   Horário: [hh:mm]   Local: [sala ou link]'),
      H('Participantes'),
      B('[Nome — cargo]'),
      B('[Nome — cargo]'),
      H('Pauta'),
      B('[Item 1 da pauta]'),
      B('[Item 2 da pauta]'),
      H('Decisões'),
      B('[Decisão tomada e o motivo]'),
      H('Ações e responsáveis'),
      B('[Ação — responsável — prazo]'),
      H('Próxima reunião'),
      P('[Data prevista e pauta principal]'),
    ],
  },
  {
    id: 'proposta',
    label: 'Proposta comercial',
    description: 'Proposta com entendimento, entregas, prazo, investimento e aceite.',
    lines: [
      P('Proposta comercial', { bold: true, size: 'lg' }),
      P('Para: [cliente]   ·   De: [sua empresa]   ·   Validade: [dias] dias', { italic: true }),
      H('Entendimento do problema'),
      P('[Descreva, com as palavras do cliente, o desafio que a proposta resolve.]'),
      H('Solução proposta'),
      B('[Entrega 1, com o resultado esperado]'),
      B('[Entrega 2]'),
      B('[Entrega 3]'),
      H('Prazo e investimento'),
      P('Prazo: [semanas]. Investimento: [valor]. Forma de pagamento: [condições].'),
      H('Próximos passos'),
      P('Para aceitar, responda este documento ou assine abaixo. Após o aceite, iniciamos na data combinada.'),
      P(''),
      P('______________________________'),
      P('[Nome e empresa do cliente] — data'),
    ],
  },
  {
    id: 'contrato',
    label: 'Contrato de serviços',
    description: 'Modelo simples de prestação de serviços (referência).',
    lines: [
      P('Contrato de prestação de serviços', { bold: true, size: 'lg' }),
      P(
        'Pelo presente instrumento, de um lado [CONTRATANTE], [qualificação completa], e de outro lado [CONTRATADO], [qualificação completa], ajustam o seguinte:',
      ),
      H('1. Objeto'),
      P('[Descreva os serviços a serem prestados, com entregas e critérios de aceite.]'),
      H('2. Prazo'),
      P('[Data de início e prazo de término, ou a duração do serviço.]'),
      H('3. Valor e pagamento'),
      P('[Valor, forma de pagamento e data de vencimento de cada parcela.]'),
      H('4. Obrigações das partes'),
      P('[Obrigações do contratante e do contratado.]'),
      H('5. Confidencialidade'),
      P('As partes se comprometem a não divulgar informações confidenciais recebidas em razão deste contrato.'),
      H('6. Rescisão'),
      P('[Condições e aviso prévio para encerrar o contrato antes do prazo.]'),
      H('7. Foro'),
      P('Fica eleito o foro da comarca de [cidade] para dirimir eventuais dúvidas.'),
      P(''),
      P('[Cidade], [data].'),
      P(''),
      P('______________________________        ______________________________'),
      P('CONTRATANTE                                        CONTRATADO'),
      NOTE('Modelo de referência. Revise com um advogado antes de usar.'),
    ],
  },
  {
    id: 'curriculo',
    label: 'Currículo',
    description: 'Currículo com resumo, experiência, formação e habilidades.',
    lines: [
      P('[Seu nome completo]', { bold: true, size: 'lg' }),
      P('[Cidade, UF]  ·  [telefone]  ·  [e-mail]  ·  [LinkedIn]'),
      H('Resumo profissional'),
      P('[Duas ou três linhas sobre sua trajetória e seus diferenciais.]'),
      H('Experiência'),
      P('[Cargo] — [Empresa] ([início] a [fim])', { bold: true }),
      B('[Realização com resultado mensurável]'),
      B('[Outra realização]'),
      H('Formação'),
      P('[Curso] — [Instituição] ([ano de conclusão])'),
      H('Habilidades'),
      B('[Habilidade]'),
      H('Idiomas'),
      B('[Idioma — nível]'),
    ],
  },
];

export function docTemplateBlocks(id: string): DocBlock[] {
  const tpl = DOC_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return [];
  return tpl.lines.map((l) => {
    const b = makeBlock(l.type, l.text);
    return l.format ? { ...b, format: { ...l.format } } : b;
  });
}

export interface SheetTemplate {
  id: string;
  label: string;
  description: string;
  build: (title: string) => SheetData;
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'orcamento',
    label: 'Orçamento',
    description: 'Itens com quantidade e valor. O total de cada linha e o total geral são calculados.',
    build: (title) =>
      sheetFromTable(
        title,
        ['Item', 'Quantidade', 'Valor unitário', 'Total'],
        [
          ['[Serviço ou produto 1]', 1, 1500, '=B2*C2'],
          ['[Serviço ou produto 2]', 12, 80, '=B3*C3'],
          ['[Serviço ou produto 3]', 1, 60, '=B4*C4'],
          ['Total geral', '', '', '=SUM(D2:D4)'],
        ],
      ),
  },
  {
    id: 'controle',
    label: 'Controle financeiro',
    description: 'Receitas e despesas do mês com total e saldo calculados.',
    build: (title) =>
      sheetFromTable(
        title,
        ['Data', 'Descrição', 'Categoria', 'Receita', 'Despesa'],
        [
          ['[dd/mm]', '[Venda ou entrada]', '[Categoria]', 1200, ''],
          ['[dd/mm]', '[Compra ou saída]', '[Categoria]', '', 350],
          ['Total', '', '', '=SUM(D2:D3)', '=SUM(E2:E3)'],
          ['Saldo', '', '', '', '=D4-E4'],
        ],
      ),
  },
];
