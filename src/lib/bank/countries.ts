// Países em que a conta global (Stripe Connect Express) pode ser aberta a
// partir de uma plataforma no Brasil, com direct charges (o dinheiro fica na
// própria conta conectada, sem transferência internacional da plataforma).
// Cada país precisa estar habilitado em Stripe → Connect → Settings → Onboarding.
// Espelho de supabase/functions/_shared/bankCountries.ts (teste garante igualdade).

export interface ConnectCountry { code: string; name: string; flag: string; currency: string }

export const CONNECT_COUNTRIES: ConnectCountry[] = [
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'USD' },
  { code: 'CA', name: 'Canadá', flag: '🇨🇦', currency: 'CAD' },
  { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'MXN' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', currency: 'GBP' },
  { code: 'IE', name: 'Irlanda', flag: '🇮🇪', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'EUR' },
  { code: 'ES', name: 'Espanha', flag: '🇪🇸', currency: 'EUR' },
  { code: 'FR', name: 'França', flag: '🇫🇷', currency: 'EUR' },
  { code: 'DE', name: 'Alemanha', flag: '🇩🇪', currency: 'EUR' },
  { code: 'IT', name: 'Itália', flag: '🇮🇹', currency: 'EUR' },
  { code: 'NL', name: 'Países Baixos', flag: '🇳🇱', currency: 'EUR' },
  { code: 'BE', name: 'Bélgica', flag: '🇧🇪', currency: 'EUR' },
  { code: 'AT', name: 'Áustria', flag: '🇦🇹', currency: 'EUR' },
  { code: 'LU', name: 'Luxemburgo', flag: '🇱🇺', currency: 'EUR' },
  { code: 'FI', name: 'Finlândia', flag: '🇫🇮', currency: 'EUR' },
  { code: 'GR', name: 'Grécia', flag: '🇬🇷', currency: 'EUR' },
  { code: 'EE', name: 'Estônia', flag: '🇪🇪', currency: 'EUR' },
  { code: 'LV', name: 'Letônia', flag: '🇱🇻', currency: 'EUR' },
  { code: 'LT', name: 'Lituânia', flag: '🇱🇹', currency: 'EUR' },
  { code: 'SK', name: 'Eslováquia', flag: '🇸🇰', currency: 'EUR' },
  { code: 'SI', name: 'Eslovênia', flag: '🇸🇮', currency: 'EUR' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', currency: 'EUR' },
  { code: 'CY', name: 'Chipre', flag: '🇨🇾', currency: 'EUR' },
  { code: 'HR', name: 'Croácia', flag: '🇭🇷', currency: 'EUR' },
  { code: 'CH', name: 'Suíça', flag: '🇨🇭', currency: 'CHF' },
  { code: 'DK', name: 'Dinamarca', flag: '🇩🇰', currency: 'DKK' },
  { code: 'SE', name: 'Suécia', flag: '🇸🇪', currency: 'SEK' },
  { code: 'NO', name: 'Noruega', flag: '🇳🇴', currency: 'NOK' },
  { code: 'PL', name: 'Polônia', flag: '🇵🇱', currency: 'PLN' },
  { code: 'CZ', name: 'Tchéquia', flag: '🇨🇿', currency: 'CZK' },
  { code: 'HU', name: 'Hungria', flag: '🇭🇺', currency: 'HUF' },
  { code: 'RO', name: 'Romênia', flag: '🇷🇴', currency: 'RON' },
  { code: 'BG', name: 'Bulgária', flag: '🇧🇬', currency: 'BGN' },
  { code: 'AU', name: 'Austrália', flag: '🇦🇺', currency: 'AUD' },
  { code: 'NZ', name: 'Nova Zelândia', flag: '🇳🇿', currency: 'NZD' },
  { code: 'JP', name: 'Japão', flag: '🇯🇵', currency: 'JPY' },
  { code: 'SG', name: 'Singapura', flag: '🇸🇬', currency: 'SGD' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', currency: 'HKD' },
  { code: 'AE', name: 'Emirados Árabes', flag: '🇦🇪', currency: 'AED' },
  { code: 'TH', name: 'Tailândia', flag: '🇹🇭', currency: 'THB' },
  { code: 'MY', name: 'Malásia', flag: '🇲🇾', currency: 'MYR' },
]

export const CONNECT_COUNTRY_CODES = CONNECT_COUNTRIES.map((c) => c.code)

export function findConnectCountry(code: string | null | undefined) {
  return CONNECT_COUNTRIES.find((c) => c.code === String(code ?? '').toUpperCase()) ?? null
}
