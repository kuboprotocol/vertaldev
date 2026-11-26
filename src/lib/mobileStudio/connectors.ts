import { Smartphone, Workflow } from 'lucide-react'
import type { ConnectorConfig } from '@/lib/connectorsConfig'

/**
 * Conectores mobile do Vertal Dev (aditivo, nov/2026):
 * - Google Play Console: app `google-play-console` do Vertal Fluxos, login com Google (OAuth real,
 *   cliente "Vertal Fluxos", escopo androidpublisher).
 * - Android Studio: IDE de desktop, sem OAuth/API. A entrada é o mesmo login Google do Play Console
 *   (conexão compartilhada) + abrir/clonar o projeto no Android Studio pelo GitHub (Capacitor).
 * - iOS / Xcode ("iOS Studio" no pedido): a Apple não tem OAuth de terceiros para Xcode nem para o
 *   App Store Connect. A entrada é a chave de API do time (Issuer ID, Key ID, .p8), guardada
 *   criptografada no servidor (app `app-store-connect` do Vertal Fluxos) + clonar no Xcode.
 *
 * Os cartões só aparecem no catálogo com VITE_VERTAL_MOBILE_STUDIO=true (padrão: desligado).
 * Desligado, as páginas de configuração continuam abrindo pelo link direto (para teste do dono).
 */
export const MOBILE_STUDIO_SLUGS = {
  play: 'fluxos-google-play-console',
  android: 'android-studio',
  ios: 'ios-xcode',
} as const

export const PLAY_APP = 'google-play-console'
export const ASC_APP = 'app-store-connect'

export function isMobileStudioEnabled(env: Record<string, unknown> = import.meta.env as Record<string, unknown>): boolean {
  const v = String(env?.VITE_VERTAL_MOBILE_STUDIO ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'on'
}

export function isMobileStudioSlug(slug: string): boolean {
  return (Object.values(MOBILE_STUDIO_SLUGS) as string[]).includes(slug)
}

export const mobileStudioConnectors: ConnectorConfig[] = [
  {
    name: 'Google Play Console',
    slug: MOBILE_STUDIO_SLUGS.play,
    icon: Workflow,
    logoUrl: '/connectors/google-play-console.svg',
    color: '#01875F',
    authType: 'oauth',
    category: 'development',
    description: 'Entre com Google e gerencie avaliações, faixas de lançamento e produtos dos seus apps Android.',
    longDescription: 'Google Play Console via Vertal Fluxos: entre com a sua conta Google (OAuth) e o Vertal Chat lê avaliações, faixas de lançamento (produção, aberta, fechada, interna), assinaturas e produtos, e responde avaliações com a sua aprovação. O acesso a cada app é dado no próprio Play Console (Usuários e permissões).',
    features: ['Entrar com Google (OAuth)', 'Avaliações e respostas', 'Faixas de lançamento', 'Assinaturas e produtos', 'Via Vertal Fluxos'],
    docsUrl: 'https://developers.google.com/android-publisher',
    status: 'available',
    fluxosApp: PLAY_APP,
    internalRoute: `/connectors/${MOBILE_STUDIO_SLUGS.play}/setup`,
    apiKeyLabel: '',
    apiKeyPlaceholder: '',
    apiKeyHelp: 'A conexão é pelo login do Google — sem chave aqui.',
    setupSteps: [
      { title: 'Entre com Google', description: 'Use a conta Google que tem acesso ao Play Console.' },
      { title: 'Libere o acesso no Play Console', description: 'Play Console → Usuários e permissões: convide essa conta e dê acesso aos apps.' },
      { title: 'Use pelo chat', description: 'Peça, por exemplo, “mostre as avaliações do app com.empresa.app”.' },
    ],
  },
  {
    name: 'Android Studio',
    slug: MOBILE_STUDIO_SLUGS.android,
    icon: Smartphone,
    logoUrl: '/connectors/android-studio.svg',
    color: '#3DDC84',
    authType: 'oauth',
    category: 'development',
    description: 'Entre com Google (mesma conta do Play Console) e abra o seu projeto no Android Studio pelo GitHub.',
    longDescription: 'O Android Studio é um app de desktop e não tem login OAuth nem API. No Vertal Dev ele usa o login Google do Google Play Console (a mesma conexão) e um caminho pronto para abrir o seu projeto no Android Studio: clonar do GitHub, gerar o projeto Android com Capacitor e abrir.',
    features: ['Entrar com Google (conexão do Play Console)', 'Clonar do GitHub no Android Studio', 'Projeto Android com Capacitor', 'Baixar ZIP do repositório'],
    docsUrl: 'https://developer.android.com/studio',
    status: 'available',
    internalRoute: `/connectors/${MOBILE_STUDIO_SLUGS.android}/setup`,
    apiKeyLabel: '',
    apiKeyPlaceholder: '',
    apiKeyHelp: 'O Android Studio não tem OAuth; a conexão é o login Google do Play Console.',
    setupSteps: [
      { title: 'Entre com Google', description: 'Mesma conexão do Google Play Console.' },
      { title: 'Escolha o repositório', description: 'Do seu GitHub conectado (ou cole a URL).' },
      { title: 'Abra no Android Studio', description: 'File → New → Project from Version Control, ou siga os comandos do Capacitor.' },
    ],
  },
  {
    name: 'iOS / Xcode',
    slug: MOBILE_STUDIO_SLUGS.ios,
    icon: Smartphone,
    logoUrl: '/connectors/xcode.png',
    color: '#147EFB',
    authType: 'api_key',
    category: 'development',
    description: 'Conecte o App Store Connect com a chave de API do time e abra o projeto no Xcode pelo GitHub.',
    longDescription: 'A Apple não oferece OAuth de terceiros para o Xcode nem para o App Store Connect. No Vertal Dev você conecta com a chave de API do time (Issuer ID, Key ID e arquivo .p8), guardada criptografada no servidor, e o Vertal Chat lista apps, builds enviados pelo Xcode e avaliações. Para o código: clonar do GitHub no Xcode e gerar o projeto iOS com Capacitor (precisa de um Mac).',
    features: ['Chave de API do App Store Connect', 'Apps, builds e avaliações', 'Clonar do GitHub no Xcode', 'Projeto iOS com Capacitor'],
    docsUrl: 'https://developer.apple.com/documentation/appstoreconnectapi',
    status: 'available',
    internalRoute: `/connectors/${MOBILE_STUDIO_SLUGS.ios}/setup`,
    apiKeyLabel: '',
    apiKeyPlaceholder: '',
    apiKeyHelp: 'Sem OAuth da Apple: use a chave de API do time do App Store Connect.',
    setupSteps: [
      { title: 'Crie a chave de API', description: 'App Store Connect → Usuários e Acesso → Integrações → Chaves do time.' },
      { title: 'Cole Issuer ID, Key ID e .p8', description: 'Fica criptografado no servidor do Vertal.' },
      { title: 'Abra no Xcode', description: 'Clone o repositório do GitHub e rode os comandos do Capacitor num Mac.' },
    ],
  },
]

/** Cartões que entram no catálogo /connectors (vazio com o flag desligado). */
export function mobileStudioCatalog(env?: Record<string, unknown>): ConnectorConfig[] {
  return isMobileStudioEnabled(env) ? mobileStudioConnectors : []
}

export function getMobileStudioConnector(slug: string): ConnectorConfig | undefined {
  return mobileStudioConnectors.find((c) => c.slug === slug)
}

/** "owner/repo" ou URL do GitHub → { owner, repo } (null se não for um repositório do GitHub). */
export function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const m = s.match(/^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/)
  if (!m || m[2] === '.' || m[2] === '..') return null
  return { owner: m[1], repo: m[2] }
}

/** Nome do app → appId Capacitor sugerido (com.<owner>.<repo>, só letras/números). */
export function suggestAppId(owner: string, repo: string): string {
  const part = (v: string, fb: string) => {
    let p = v.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!p) p = fb
    if (!/^[a-z]/.test(p)) p = `a${p}`
    return p.slice(0, 30)
  }
  return `com.${part(owner, 'vertal')}.${part(repo, 'app')}`
}

export interface StudioRecipe {
  cloneUrl: string
  zipUrl: string
  webUrl: string
  commands: string[]
}

/** Comandos para abrir o projeto (web + Capacitor) no Android Studio ou no Xcode. */
export function studioRecipe(platform: 'android' | 'ios', owner: string, repo: string, appName?: string): StudioRecipe {
  const appId = suggestAppId(owner, repo)
  const name = (appName || repo).replace(/["`$\\]/g, '').slice(0, 60) || 'App'
  return {
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    zipUrl: `https://github.com/${owner}/${repo}/archive/HEAD.zip`,
    webUrl: `https://github.com/${owner}/${repo}`,
    commands: [
      `git clone https://github.com/${owner}/${repo}.git`,
      `cd ${repo}`,
      'npm install',
      `npm install @capacitor/core @capacitor/cli @capacitor/${platform}`,
      `npx cap init "${name}" ${appId} --web-dir dist  # só se ainda não existir capacitor.config`,
      'npm run build',
      `npx cap add ${platform}`,
      `npx cap sync ${platform}`,
      `npx cap open ${platform}`,
    ],
  }
}
