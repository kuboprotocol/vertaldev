export type CardFunding = 'credit' | 'debit' | 'prepaid' | 'unknown'

export const FUNDING_LABEL: Record<CardFunding, string> = {
  credit: 'Crédito',
  debit: 'Débito',
  prepaid: 'Pré-pago',
  unknown: 'Cartão',
}

export function brandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', elo: 'Elo',
    hipercard: 'Hipercard', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay',
  }
  return map[brand?.toLowerCase()] ?? (brand ? brand[0].toUpperCase() + brand.slice(1) : 'Cartão')
}

export function isExpired(card: Pick<WalletCard, 'expMonth' | 'expYear'>, now = new Date()): boolean {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return card.expYear < y || (card.expYear === y && card.expMonth < m)
}
