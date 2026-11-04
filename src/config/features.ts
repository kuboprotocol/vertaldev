/**
 * Chaves de lançamento de módulos do ecossistema.
 *
 * `creativeEconomy`: aberto ao público desde 2026-11-04 (painel criativo e
 * Canvas para todos os usuários logados). Se voltar a `false`, quem clica em
 * "Economia Criativa" vê o aviso "em construção" e só admins acessam.
 */
export const FEATURES = {
  creativeEconomy: true,
} as const

export const CREATIVE_ECONOMY_COPY = {
  title: 'Painel de Economia Criativa em construção',
  message: 'O Painel de Economia Criativa está em construção, estamos criando algo poderoso pra você e por você.',
  founderCta: 'Quero ser Fundador(a)',
  founderPitch:
    'Entre para a lista de Fundadores: você é avisado(a) primeiro quando o painel abrir e seu número de Fundador fica marcado no ecossistema.',
  founderWelcome: (n: number) => `Você é o Fundador nº ${n} da Economia Criativa. Bem-vindo(a) ao ecossistema!`,
} as const

export function canAccessCreativeEconomy(isAdmin: boolean): boolean {
  return FEATURES.creativeEconomy || isAdmin
}
