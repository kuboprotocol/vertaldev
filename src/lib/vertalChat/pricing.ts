/**
 * Vertal Chat — precificação em créditos.
 *
 * Regra: preço = custo / (1 - margemAlvo). O crédito é arredondado PARA CIMA,
 * então a margem real nunca fica abaixo da alvo. Se o custo for menor que o mínimo
 * de cobrança, o mínimo vale (1 crédito).
 *
 * ATENÇÃO: os valores de `ASSUMED_RATES` e `CREDIT_VALUE_USD` são PREMISSAS.
 * Substituir pelas faturas reais dos provedores e pela tabela de planos antes de cobrar.
 */

/** Valor de 1 crédito em dólar (premissa; confirmar com a tabela de planos). */
export const CREDIT_VALUE_USD = 0.01;

/** Margem bruta que a Vibe Dev quer sobre o custo variável. */
export const TARGET_GROSS_MARGIN = 0.5;

/** Piso absoluto: nenhuma ação pode ter margem bruta abaixo disso. */
export const MIN_GROSS_MARGIN = 0.4;

/** Cobrança mínima por ação de IA. */
export const MIN_CHARGE_CREDITS = 1;

export interface UnitRates {
  llmInputUsdPerMTok: number;
  llmOutputUsdPerMTok: number;
  ocrUsdPerPage: number;
  outboundMessageUsd: number;
}

/** PREMISSAS de custo unitário. Trocar pelos preços reais do provedor escolhido. */
export const ASSUMED_RATES: UnitRates = {
  llmInputUsdPerMTok: 1,
  llmOutputUsdPerMTok: 5,
  ocrUsdPerPage: 0.002,
  outboundMessageUsd: 0,
};

export interface Usage {
  llmInputTokens?: number;
  llmOutputTokens?: number;
  /** Páginas extraídas/OCR. Arquivo já indexado não gera extração de novo. */
  pagesExtracted?: number;
  outboundMessages?: number;
  /** Custo extra já conhecido em dólar (ex.: armazenamento), sem rate table. */
  extraCostUsd?: number;
}

export interface Quote {
  credits: number;
  costUsd: number;
  priceUsd: number;
  marginUsd: number;
  grossMargin: number;
}

const EPS = 1e-9;

export function costUsd(usage: Usage, rates: UnitRates = ASSUMED_RATES): number {
  const llm =
    ((usage.llmInputTokens ?? 0) * rates.llmInputUsdPerMTok +
      (usage.llmOutputTokens ?? 0) * rates.llmOutputUsdPerMTok) /
    1_000_000;
  const ocr = (usage.pagesExtracted ?? 0) * rates.ocrUsdPerPage;
  const messages = (usage.outboundMessages ?? 0) * rates.outboundMessageUsd;
  const extra = usage.extraCostUsd ?? 0;
  return roundUsd(llm + ocr + messages + extra);
}

export function quote(usage: Usage, rates: UnitRates = ASSUMED_RATES): Quote {
  const cost = costUsd(usage, rates);
  const priceUsdRaw = cost / (1 - TARGET_GROSS_MARGIN);
  const credits = Math.max(MIN_CHARGE_CREDITS, Math.ceil(priceUsdRaw / CREDIT_VALUE_USD - EPS));
  const priceUsd = roundUsd(credits * CREDIT_VALUE_USD);
  const marginUsd = roundUsd(priceUsd - cost);
  return {
    credits,
    costUsd: cost,
    priceUsd,
    marginUsd,
    grossMargin: priceUsd > 0 ? marginUsd / priceUsd : 0,
  };
}

/**
 * Cobrança de leitura de arquivo. Se o arquivo já foi indexado, a extração (OCR)
 * não é cobrada de novo: o usuário paga só a pergunta e a resposta. Esse é o
 * benefício que deixa o uso recorrente barato para quem usa.
 */
export function fileReadUsage(input: {
  pages: number;
  alreadyIndexed: boolean;
  questionTokens: number;
  answerTokens: number;
  contextTokens: number;
}): Usage {
  return {
    pagesExtracted: input.alreadyIndexed ? 0 : input.pages,
    llmInputTokens: input.questionTokens + input.contextTokens,
    llmOutputTokens: input.answerTokens,
  };
}

/** Verifica que uma cobrança respeita o piso de margem. Usado em testes e na edge function. */
export function meetsMarginFloor(q: Quote): boolean {
  return q.grossMargin + EPS >= MIN_GROSS_MARGIN;
}

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
