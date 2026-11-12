// Moedas aceitas nas cobranças da Carteira (Stripe) e conversão para a
// menor unidade. A taxa da plataforma é sempre 1 unidade mínima da moeda
// da cobrança: R$ 0,01, US$ 0,01, € 0,01, ¥ 1...
// Espelho de src/lib/wallet/currency.ts (teste garante igualdade).

export interface ChargeCurrency { code: string; name: string; flag: string; decimals: 0 | 2 }

export const CHARGE_CURRENCIES: ChargeCurrency[] = [
  { code: 'BRL', name: 'Real', flag: '🇧🇷', decimals: 2 },
  { code: 'USD', name: 'Dólar americano', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', name: 'Libra esterlina', flag: '🇬🇧', decimals: 2 },
  { code: 'CAD', name: 'Dólar canadense', flag: '🇨🇦', decimals: 2 },
  { code: 'AUD', name: 'Dólar australiano', flag: '🇦🇺', decimals: 2 },
  { code: 'CHF', name: 'Franco suíço', flag: '🇨🇭', decimals: 2 },
  { code: 'MXN', name: 'Peso mexicano', flag: '🇲🇽', decimals: 2 },
  { code: 'ARS', name: 'Peso argentino', flag: '🇦🇷', decimals: 2 },
  { code: 'CLP', name: 'Peso chileno', flag: '🇨🇱', decimals: 0 },
  { code: 'COP', name: 'Peso colombiano', flag: '🇨🇴', decimals: 2 },
  { code: 'PEN', name: 'Sol peruano', flag: '🇵🇪', decimals: 2 },
  { code: 'UYU', name: 'Peso uruguaio', flag: '🇺🇾', decimals: 2 },
  { code: 'JPY', name: 'Iene', flag: '🇯🇵', decimals: 0 },
  { code: 'CNY', name: 'Yuan', flag: '🇨🇳', decimals: 2 },
  { code: 'INR', name: 'Rúpia indiana', flag: '🇮🇳', decimals: 2 },
]

/** Taxa fixa da plataforma por cobrança, na menor unidade da moeda. */
export const PLATFORM_FEE_MINOR = 1

export function findCurrency(code: string): ChargeCurrency | undefined {
  return CHARGE_CURRENCIES.find((c) => c.code === code.toUpperCase())
}

/** 12.34 BRL -> 1234; 500 JPY -> 500. Retorna null se inválido. */
export function toMinorUnits(amount: number, code: string): number | null {
  const c = findCurrency(code)
  if (!c || !Number.isFinite(amount) || amount <= 0) return null
  const minor = Math.round(amount * 10 ** c.decimals)
  if (minor <= PLATFORM_FEE_MINOR || minor > 99_999_999) return null
  return minor
}

export function formatMinor(minor: number, code: string, locale = 'pt-BR'): string {
  const c = findCurrency(code)
  const decimals = c?.decimals ?? 2
  return new Intl.NumberFormat(locale, { style: 'currency', currency: code.toUpperCase(), minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .format(minor / 10 ** decimals)
}
