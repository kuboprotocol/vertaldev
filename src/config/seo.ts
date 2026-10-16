/**
 * Títulos e descrições das páginas públicas. Usados no navegador
 * (`usePageSeo`) e no HTML pré-renderizado do build (`vite-plugins/seo.ts`),
 * para que buscadores e redes sociais vejam o mesmo texto sem rodar JavaScript.
 */
import { APP_NAME, BRAND } from './brand'
import { ALTERNATIVES, type Alternative } from './alternatives'

export interface RouteSeo {
  title: string
  description: string
}

const searchedNames = ALTERNATIVES.filter((a) => a.category !== 'concept')
  .map((a) => a.name)
  .join(', ')

export const HOME_SEO: RouteSeo = {
  title: `${APP_NAME} — Crie apps com IA | Vibe coding, backend e Web3`,
  description: `Descreva sua ideia e a IA do ${APP_NAME} cria o app com backend, banco, autenticação, Web3, conectores e domínio próprio. Plataforma de vibe coding com plano gratuito.`,
}

export const ALTERNATIVES_INDEX_SEO: RouteSeo = {
  title: `Alternativas a Lovable, Replit, Cursor, Vercel e mais — ${APP_NAME}`,
  description: `Compare o ${APP_NAME} com ${searchedNames}. Crie apps com IA, backend, Web3 e domínio em um só lugar.`,
}

/** Demais páginas públicas (as do sitemap). */
export const ROUTE_SEO: Record<string, RouteSeo> = {
  '/': HOME_SEO,
  '/alternativas': ALTERNATIVES_INDEX_SEO,
  '/pricing': {
    title: `Preços e planos — ${APP_NAME}`,
    description: `Planos do ${APP_NAME}: comece grátis e pague por créditos transparentes para criar apps com IA, backend e Web3.`,
  },
  '/download': {
    title: `Download do app e do agente local — ${APP_NAME}`,
    description: `Baixe o ${APP_NAME} para Windows, macOS, Linux e celular, e a extensão para VS Code.`,
  },
  '/docs': {
    title: `Documentação — ${APP_NAME}`,
    description: `Guias do ${APP_NAME}: criar apps com IA, backend, conectores, Web3, domínios e deploy.`,
  },
  '/support': {
    title: `Suporte — ${APP_NAME}`,
    description: `Fale com o time do ${APP_NAME} e encontre ajuda para criar e publicar seus apps.`,
  },
  '/anywhere': {
    title: `Kubo Anywhere — ${APP_NAME}`,
    description: `Use o agente do ${APP_NAME} no seu computador e no celular, de qualquer lugar.`,
  },
  '/terms': {
    title: `Termos de uso — ${APP_NAME}`,
    description: `Termos de uso do ${APP_NAME}, produto da ${BRAND.company}.`,
  },
  '/privacy': {
    title: `Política de privacidade — ${APP_NAME}`,
    description: `Como o ${APP_NAME}, produto da ${BRAND.company}, trata seus dados.`,
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
