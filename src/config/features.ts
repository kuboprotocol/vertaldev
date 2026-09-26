/**
 * Chaves de lançamento de módulos do ecossistema.
 *
 * `creativeEconomy`: enquanto `false`, quem clica em "Economia Criativa" vê o
 * aviso "Economia Criativa em Construção" e as rotas /creative/* mostram a
 * mesma tela. Admins continuam acessando o módulo para testes.
 */
export const FEATURES = {
  creativeEconomy: false,
} as const

export const CREATIVE_ECONOMY_COPY = {
  title: 'Economia Criativa em Construção',
  message: 'Estamos construindo um ecossistema poderoso pra você e por você.',
} as const

export function canAccessCreativeEconomy(isAdmin: boolean): boolean {
  return FEATURES.creativeEconomy || isAdmin
}
