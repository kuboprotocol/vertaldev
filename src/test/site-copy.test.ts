/**
 * Guards the copy of the pages moved to the shared Apple-style design system
 * and to English: plain words that translate well, no hype phrases, no emoji,
 * no em-dash chains, and no Portuguese left in the UI. Reads the source files.
 * Also keeps the English route list in index.html in sync with siteLanguage.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH_PREFIXES, ENGLISH_ROUTES, isEnglishRoute } from '@/config/siteLanguage'
import { ROUTE_SEO } from '@/config/seo'

const ROOT = join(__dirname, '..')

/** Files whose visible copy was rewritten in plain English. */
const FILES = [
  'components/site/siteUi.tsx',
  'components/site/SiteNav.tsx',
  'components/site/SiteFooter.tsx',
  'components/site/SitePage.tsx',
  'components/site/AppShell.tsx',
  'components/landing/Navbar.tsx',
  'pages/PricingPage.tsx',
  'components/pricing/ContactDialog.tsx',
  'pages/EcosystemPage.tsx',
  'components/ecosystem/EcosystemShowcase.tsx',
  'components/ecosystem/EcosystemDialogs.tsx',
  'lib/ecosystem.ts',
  'pages/DownloadPage.tsx',
  'components/download/LocalAgentTokens.tsx',
  'pages/SupportPage.tsx',
  'pages/DataDeletionPage.tsx',
  'pages/DocsMcpPage.tsx',
  'pages/NotFound.tsx',
  'pages/ResetPasswordPage.tsx',
  // Logged-in panels (batch 2)
  'pages/DashboardPage.tsx',
  'components/dashboard/PromoCards.tsx',
  'pages/ProfilePage.tsx',
  'pages/RewardsPage.tsx',
  'components/shortlinks/DailyChecklistCard.tsx',
  'components/shortlinks/RewardedVideoPanel.tsx',
  'components/shortlinks/KuboMusicPanel.tsx',
  'components/shortlinks/VertalNodeCard.tsx',
  'pages/AffiliateProgramPage.tsx',
  'components/affiliate/AffiliateInstallsManager.tsx',
  // Connector pages (batch 3)
  'lib/connectorsCopyEn.ts',
  'lib/fluxos/setupHelp.ts',
  'pages/ConnectorsHubPage.tsx',
  'pages/ConnectorAboutPage.tsx',
  'pages/ConnectorSetupPage.tsx',
  'pages/ConnectorDetailPage.tsx',
  'pages/ConnectorGmailPage.tsx',
  'pages/ConnectorSpotifyPage.tsx',
  'pages/ConnectorSlackPage.tsx',
  'pages/ConnectorChannelPage.tsx',
  'pages/ConnectorRenderPage.tsx',
  'pages/ConnectorWeb3HubPage.tsx',
  'pages/ConnectorWeb3Page.tsx',
  'pages/FluxosOAuthCallbackPage.tsx',
  'components/connectors/FluxosConnectPanel.tsx',
  'components/connectors/Web3ConnectionForm.tsx',
  'components/connectors/Web3ConnectionList.tsx',
  'components/connectors/GitHubReposList.tsx',
  'components/connectors/GlobalActivityPanel.tsx',
  // Agents (batch 4)
  'pages/AgentsHubPage.tsx',
  'pages/AgentDetailPage.tsx',
  'pages/VibeAgentsPage.tsx',
  'components/huginn/HuginnAgentsCard.tsx',
  'components/huginn/FluxosAgentBuilder.tsx',
  // Loose logged-in pages
  'pages/DomainsPage.tsx',
  'pages/SecretsVaultPage.tsx',
  'components/secrets/OrchestratorPanel.tsx',
  'components/secrets/SecretAccessDialog.tsx',
  'components/secrets/SecretFormDialog.tsx',
  'pages/McpAccessPage.tsx',
  'lib/mcpClientConfig.ts',
  'pages/LeaderboardPage.tsx',
  'pages/EmailDashboardPage.tsx',
  'pages/PlanPage.tsx',
  // Admin and internal
  'pages/AdminPage.tsx',
  'components/admin/AdminRewardsActivity.tsx',
  'pages/AdminSkillsPage.tsx',
  'pages/OrchestratorPage.tsx',
  'pages/PwaTelemetry.tsx',
  'pages/PwaExportJobDetails.tsx',
  'components/pwa-telemetry/AuditView.tsx',
  'components/pwa-telemetry/MetricsView.tsx',
  'components/pwa-telemetry/ExportJobsView.tsx',
  'components/connectors/LogSimulator.tsx',
  // Vertal Vibe Pay (batch 5)
  'pages/VertalBankPage.tsx',
  'components/bank/BankStatement.tsx',
  'components/bank/BankSend.tsx',
  'components/bank/BankReceive.tsx',
  'components/bank/BankAccounts.tsx',
  'components/bank/PayOnboarding.tsx',
  'components/profile/WalletSection.tsx',
  'components/vibepay/VibePayPromo.tsx',
  'components/vibepay/VibePayDevGate.tsx',
  // Creative hub, investigation and audit (batch 4b)
  'components/creative/ManusLauncher.tsx',
  'components/creative/ApiStatusPanel.tsx',
  'components/creative/RetryIndicator.tsx',
  'pages/creative/InvestigationPage.tsx',
  'pages/creative/AuditTrailPage.tsx',
  // VERTAL Code AI and game screens (presentational pass)
  'components/vertal-code-ai/VertalCodeAiMemoryPanel.tsx',
  'components/vertal-code-ai/VertalTeamProgress.tsx',
  'components/canvas/CanvasInfoPanel.tsx',
  'components/WGSLSandbox.tsx',
  'pages/GameBuilderPage.tsx',
  'pages/GameMetaversePage.tsx',
]

function visibleText(file: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const jsxText = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1])
  const strings = [...src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)]
    .map((m) => m[2])
    .filter((s) => /\s/.test(s))
  return [...jsxText, ...strings].join('\n')
}

const BANNED = [
  /\bunleash/i,
  /\bsupercharg/i,
  /\brevolutioni[sz]e/i,
  /\bseamless/i,
  /\beffortless/i,
  /\belevate/i,
  /\bempower/i,
  /game[- ]changer/i,
  /\bamazing\b/i,
  /superpower/i,
  /\bblazing/i,
  /—/, // no em-dash chains
]

const PORTUGUESE =
  /\b(você|seu|sua|créditos|grátis|começar|pagamentos|integrações|alternativas|ecossistema|recompensas|conta|aqui|não|para|criar|entrar|salvar|carregando|erro|planos|preços|suporte|mensagem|enviar|baixar|em breve)\b/i

const EMOJI = /\p{Extended_Pictographic}/u

describe('site copy (English, Apple-style pages)', () => {
  for (const file of FILES) {
    it(`${file} has plain English copy`, () => {
      // Route paths like "/alternativas" or "/recompensas" are links, not copy.
      const text = visibleText(file).replace(/\/[a-z0-9-/]+/g, '')
      for (const re of BANNED) expect(text, `${file}: ${re}`).not.toMatch(re)
      expect(text, `${file}: Portuguese word`).not.toMatch(PORTUGUESE)
      expect(text, `${file}: emoji`).not.toMatch(EMOJI)
    })
  }

  it('index.html lists the same English routes as siteLanguage.ts', () => {
    const html = readFileSync(join(ROOT, '..', 'index.html'), 'utf8')
    const m = html.match(/var en = (\[[^\]]*\]);/)
    expect(m).not.toBeNull()
    expect(JSON.parse(m![1])).toEqual([...ENGLISH_ROUTES])
    const mp = html.match(/var enp = (\[[^\]]*\]);/)
    expect(mp).not.toBeNull()
    expect(JSON.parse(mp![1])).toEqual([...ENGLISH_PREFIXES])
  })

  it('English prefixes cover the routes under them only', () => {
    expect(isEnglishRoute('/connectors')).toBe(true)
    expect(isEnglishRoute('/connectors/github/setup')).toBe(true)
    expect(isEnglishRoute('/connectorsx')).toBe(false)
  })

  it('routes in Portuguese multilingual sets are not marked English', () => {
    for (const p of ['/alternativas', '/alternativas/lovable', '/integracoes', '/vibe-pay', '/crm-gratis', '/en/free-crm']) {
      expect(isEnglishRoute(p), p).toBe(false)
    }
    expect(isEnglishRoute('/pricing/')).toBe(true)
  })

  it('SEO titles of English routes are in English', () => {
    for (const p of ENGLISH_ROUTES) {
      const seo = ROUTE_SEO[p]
      if (!seo) continue
      expect(`${seo.title} ${seo.description}`, p).not.toMatch(PORTUGUESE)
    }
  })
})
