/**
 * Passos de conexão por app do Vertal Fluxos, mostrados em /connectors/fluxos-<app>/setup.
 * - login: texto do login OAuth (cliente do Vertal ou cliente próprio do usuário).
 * - ownClient: passos para criar o cliente OAuth no próprio provedor/instância (sem cliente global do Vertal).
 * - fields: passos para a chave/token quando o app só conecta por chave (sem OAuth).
 * - advanced: passos do token pessoal em "Avançado" (alternativa ao login).
 * - noOAuth: o provedor não oferece OAuth — dito com clareza na tela.
 */
export interface FluxosSetupHelp {
  login?: string
  ownClient?: string[]
  fields?: string[]
  advanced?: string[]
  noOAuth?: boolean
}

const REDIRECT = (app: string) => `https://vertal.dev/fluxos/oauth/${app}`

export const FLUXOS_SETUP_HELP: Record<string, FluxosSetupHelp> = {
  monday: {
    login: 'Você entra no monday.com e autoriza o app Vertal Dev (na primeira vez o monday pede para instalar o app na sua conta). Depois, peça no Vertal Chat para criar itens, boards, colunas ou comentar em itens — sempre com a sua confirmação.',
    advanced: [
      'No monday.com, clique na sua foto → Developers.',
      'Abra "My access tokens" → Show → copie o token.',
      'Cole abaixo e conecte. O token tem as mesmas permissões que a sua conta.',
    ],
  },
  'firefly-iii': {
    ownClient: [
      'No seu Firefly III: Options → Profile → aba OAuth → "Create new client".',
      'Nome: Vertal Dev. Redirect URL: ' + REDIRECT('firefly-iii') + '. Deixe "Confidential" marcado e crie.',
      'Copie o Client ID e o Client Secret e cole abaixo, junto com o endereço da sua instância (ex.: https://firefly.seudominio.com).',
      'Clique em "Entrar com Firefly III": você faz login na sua instância e autoriza. O cliente fica só na sua conexão.',
    ],
    advanced: [
      'No Firefly III: Options → Profile → aba OAuth → "Personal Access Tokens" → "Create new token".',
      'Copie o token (aparece uma vez só), preencha o endereço da instância acima e cole o token abaixo.',
    ],
  },
  freescout: {
    noOAuth: true,
    fields: [
      'O FreeScout não tem login OAuth oficial: a API usa chave, pelo módulo "API & Webhooks" (ative em Manage → Modules).',
      'Copie a chave em Manage → Settings → API & Webhooks (ou a sua chave pessoal em "My API Keys").',
      'Informe o endereço da sua instância (ex.: https://suporte.seudominio.com) e a chave.',
    ],
  },
  airbrake: {
    noOAuth: true,
    fields: [
      'O Airbrake não oferece OAuth: a API usa a sua User API key.',
      'No Airbrake: foto do perfil → Profile → copie a "User API key" (não é a chave do projeto).',
      'Mantenha o endereço da API em https://api.airbrake.io e cole a chave.',
    ],
  },
  virtualq: {
    noOAuth: true,
    fields: [
      'O VirtualQ não oferece OAuth: a API usa token.',
      'No painel do VirtualQ (dashboard.virtualq.tech): Contact Center → aba API Tokens → New token.',
      'Copie o token na hora (ele aparece uma vez só) e cole abaixo.',
    ],
  },
}

export function fluxosSetupHelp(app: string): FluxosSetupHelp | undefined {
  return FLUXOS_SETUP_HELP[app]
}
