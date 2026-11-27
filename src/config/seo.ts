/**
 * Títulos e descrições das páginas públicas. Usados no navegador
 * (`usePageSeo`) e no HTML pré-renderizado do build (`vite-plugins/seo.ts`),
 * para que buscadores e redes sociais vejam o mesmo texto sem rodar JavaScript.
 */
import { APP_NAME, BRAND } from './brand'
import { ALTERNATIVES, type Alternative } from './alternatives'

/** Limites que Bing e Google mostram sem cortar (o Bing aponta como problema acima disso). */
export const TITLE_MAX = 65
export const DESCRIPTION_MAX = 155

/** Corta no último espaço antes do limite e fecha com "…". */
export function clampText(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, '')}…`
}

export interface RouteSeo {
  title: string
  description: string
}

const searchedNames = ALTERNATIVES.filter((a) => a.category !== 'concept')
  .map((a) => a.name)
  .join(', ')

/** Home ("/") is written in English (see src/pages/Index.tsx). */
export const HOME_SEO: RouteSeo = {
  title: `${APP_NAME}: build apps with AI | Vibe coding and Web3`,
  description: `Describe your idea and ${APP_NAME} builds the app with AI, including the backend, Web3, connectors, and your own domain. Free plan available.`,
}

export const ALTERNATIVES_INDEX_SEO: RouteSeo = {
  title: `Alternativas a Lovable, Replit e Cursor — ${APP_NAME}`,
  description: `Compare o ${APP_NAME} com ${searchedNames}. Crie apps com IA, backend, Web3 e domínio em um só lugar.`,
}

/** Demais páginas públicas (as do sitemap). */
export const ROUTE_SEO: Record<string, RouteSeo> = {
  '/': HOME_SEO,
  '/alternativas': ALTERNATIVES_INDEX_SEO,
  // English pages (see src/config/siteLanguage.ts).
  '/pricing': {
    title: `Pricing and plans | ${APP_NAME}`,
    description: `${APP_NAME} plans: start for free and pay with clear credits to build apps with AI, a backend and Web3.`,
  },
  '/download': {
    title: `Download the app and the local agent | ${APP_NAME}`,
    description: `Download ${APP_NAME} for Windows, macOS, Linux and mobile, and the extension for VS Code.`,
  },
  '/docs': {
    title: `Documentation | ${APP_NAME}`,
    description: `${APP_NAME} guides: build apps with AI, backend, connectors, Web3, domains and deploys.`,
  },
  '/support': {
    title: `Support | ${APP_NAME}`,
    description: `Contact the ${APP_NAME} team and get help to build and publish your apps.`,
  },
  '/anywhere': {
    title: `Vertal Anywhere | ${APP_NAME}`,
    description: `Use the ${APP_NAME} agent on your computer and on your phone, from anywhere.`,
  },
  '/terms': {
    title: `Terms of Service | ${APP_NAME}`,
    description: `Terms of Service of ${APP_NAME}, a product of ${BRAND.company}.`,
  },
  '/privacy': {
    title: `Privacy Policy | ${APP_NAME}`,
    description: `How ${APP_NAME}, a product of ${BRAND.company}, handles your data.`,
  },
}

export function alternativeSeo(alt: Alternative): RouteSeo & { heading: string } {
  if (alt.category === 'concept') {
    return {
      heading: `${alt.name}: crie apps com IA no ${APP_NAME}`,
      title: `${alt.name}: a plataforma para criar apps com IA — ${APP_NAME}`,
      description: `${alt.summary} No ${APP_NAME} (${BRAND.domain}) você vai da ideia ao app publicado com backend, Web3 e domínio.`,
    }
  }
  return {
    heading: `Alternativa ao ${alt.name}: ${APP_NAME} vs ${alt.name}`,
    title: `Alternativa ao ${alt.name} — ${APP_NAME} vs ${alt.name}`,
    description: `${alt.summary} Veja quando o ${APP_NAME} (${BRAND.domain}) é a melhor escolha: IA, backend, Web3 e domínio em um só lugar.`,
  }
}
