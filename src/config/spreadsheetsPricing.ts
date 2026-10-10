// Spreadsheet Pricing Configuration
// Model: Llama 2 70B (FREE via OpenRouter)
// Cost per sheet: ~$0.0025 (near free)
// Credit cost: 2 credits per spreadsheet
// Economics: User pays R$0.80 (2 credits × R$0.40), Vertal profit ~99%

export const SPREADSHEET_TEMPLATES = {
  sales: {
    label: 'Vendas',
    icon: '💰',
    description: 'Planilha de vendas com produtos, quantidades e valores',
  },
  inventory: {
    label: 'Inventário',
    icon: '📦',
    description: 'Planilha de estoque com SKU, quantidades e status',
  },
  finance: {
    label: 'Financeiro',
    icon: '💵',
    description: 'Planilha de receitas, despesas e lucro',
  },
  hrrecords: {
    label: 'RH',
    icon: '👥',
    description: 'Planilha de funcionários com dados pessoais e salariais',
  },
  productlist: {
    label: 'Produtos',
    icon: '🛒',
    description: 'Planilha de catálogo de produtos',
  },
  custom: {
    label: 'Customizado',
    icon: '✨',
    description: 'Criar planilha personalizada',
  },
};

export const SPREADSHEET_PRICING = {
  costPerSpreadsheet: 2, // 2 credits por planilha
  costInReais: 0.80, // R$ 0.80 (2 × R$0.40)
  actualCostUSD: 0.0025, // ~$0.0025 (FREE tier Llama 2)
  profitMargin: 0.996, // 99.6% profit margin
};

export const CREDIT_PACKAGES = [
  {
    name: 'Iniciante',
    credits: 10,
    price: 5,
    spreadsheetsIncluded: 5,
    popular: false,
    badge: 'Comece aqui',
  },
  {
    name: 'Profissional',
    credits: 50,
    price: 20,
    spreadsheetsIncluded: 25,
    popular: true,
    badge: 'Mais vendido',
  },
  {
    name: 'Empresarial',
    credits: 500,
    price: 150,
    spreadsheetsIncluded: 250,
    popular: false,
    badge: 'Para empresas',
  },
];

export const FREE_TIER = {
  spreadsheetsPerMonth: 2,
  maxTemplates: 6,
};

export function getSpreadsheetCost(count: number): number {
  return Math.max(2, count * SPREADSHEET_PRICING.costPerSpreadsheet);
}

export function getCostMessage(count: number, creditsAvailable: number): string {
  const cost = getSpreadsheetCost(count);
  const costInReais = cost * 0.40;

  if (cost > creditsAvailable) {
    const needed = cost - creditsAvailable;
    return `❌ Créditos insuficientes: faltam ${needed} créditos (Custo: ${cost} = R$ ${costInReais.toFixed(2)})`;
  }

  return `✅ ${cost} crédito(s) = R$ ${costInReais.toFixed(2)}`;
}
