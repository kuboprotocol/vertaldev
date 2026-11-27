/**
 * Language of each page of the React app.
 *
 * The site is moving to English (one language, plain words, easy for browser
 * translation). Routes listed here are written in English; every other route
 * still reports pt-BR. Pages that are part of a multilingual set with hreflang
 * (/alternativas, /integracoes, /vibe-pay, /crm-gratis, /<lang>/...) keep their
 * own language and are not listed.
 *
 * index.html has an inline copy of this list (it runs before the bundle, so
 * browsers offer the right translation on first paint). A test keeps both in sync.
 */
export const ENGLISH_ROUTES: readonly string[] = [
  '/',
  '/pricing',
  '/ecossistema',
  '/download',
  '/support',
  '/docs',
  '/docs/mcp',
  '/terms',
  '/privacy',
  '/data-deletion',
  '/anywhere',
  '/reset-password',
  // Logged-in panels
  '/dashboard',
  '/profile',
  '/recompensas',
  '/affiliate-program',
  '/domains',
  '/secrets',
  '/mcp',
  '/leaderboard',
  '/emails',
  // Admin and internal
  '/orchestrator',
  // Connectors
  '/connect',
  // Agents
  '/vibe-agents',
  // Vertal Vibe Pay app
  '/pay',
  // Creative hub and its investigation and audit pages
  '/creative',
  '/creative/investigation',
  '/creative/audit',
]

/**
 * Route prefixes written in English: the prefix itself and every route under it
 * (for example /connectors, /connectors/github/setup). index.html has a copy too.
 */
export const ENGLISH_PREFIXES: readonly string[] = [
  '/connectors',
  '/fluxos/oauth',
  '/agents',
  '/plan',
  '/admin',
  '/pwa/telemetry',
]

/** True when the route (without query or hash) is written in English. */
export function isEnglishRoute(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return ENGLISH_ROUTES.includes(p) || ENGLISH_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))
}
