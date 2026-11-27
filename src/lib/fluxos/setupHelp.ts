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
    login: 'You sign in to monday.com and authorize the Vertal Dev app (the first time, monday asks you to install the app in your account). Then ask Vertal Chat to create items, boards or columns, or to comment on items, always after you confirm.',
    advanced: [
      'On monday.com, click your photo → Developers.',
      'Open "My access tokens" → Show → copy the token.',
      'Paste it below and connect. The token has the same permissions as your account.',
    ],
  },
  'firefly-iii': {
    ownClient: [
      'In your Firefly III: Options → Profile → OAuth tab → "Create new client".',
      'Name: Vertal Dev. Redirect URL: ' + REDIRECT('firefly-iii') + '. Keep "Confidential" checked and create it.',
      'Copy the Client ID and Client Secret and paste them below, with the address of your instance (for example https://firefly.yourdomain.com).',
      'Click "Sign in with Firefly III": you sign in to your instance and authorize. The client is only used by your connection.',
    ],
    advanced: [
      'In Firefly III: Options → Profile → OAuth tab → "Personal Access Tokens" → "Create new token".',
      'Copy the token (it is shown only once), fill in the instance address above and paste the token below.',
    ],
  },
  freescout: {
    noOAuth: true,
    fields: [
      'FreeScout has no official OAuth sign-in: the API uses a key, from the "API & Webhooks" module (turn it on in Manage → Modules).',
      'Copy the key in Manage → Settings → API & Webhooks (or your personal key in "My API Keys").',
      'Enter the address of your instance (for example https://support.yourdomain.com) and the key.',
    ],
  },
  airbrake: {
    noOAuth: true,
    fields: [
      'Airbrake does not offer OAuth: the API uses your User API key.',
      'In Airbrake: profile photo → Profile → copy the "User API key" (not the project key).',
      'Keep the API address as https://api.airbrake.io and paste the key.',
    ],
  },
  virtualq: {
    noOAuth: true,
    fields: [
      'VirtualQ does not offer OAuth: the API uses a token.',
      'In the VirtualQ dashboard (dashboard.virtualq.tech): Contact Center → API Tokens tab → New token.',
      'Copy the token right away (it is shown only once) and paste it below.',
    ],
  },
}

export function fluxosSetupHelp(app: string): FluxosSetupHelp | undefined {
  return FLUXOS_SETUP_HELP[app]
}
