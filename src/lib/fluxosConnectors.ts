import { Workflow } from 'lucide-react'
import type { ConnectorConfig } from './connectorsConfig'

/**
 * Apps nativos do Vertal Fluxos que o Vertal Dev ainda não tinha como conector próprio.
 * Aparecem na página de conectores como "via Vertal Fluxos": a conexão é feita dentro do
 * Vertal Fluxos e fica disponível para os fluxos. `app` é a chave do app no motor de fluxos.
 */
interface FluxosApp {
  app: string
  name: string
  category: ConnectorConfig['category']
  docsUrl?: string
}

export const FLUXOS_NATIVE_APPS: FluxosApp[] = [
  { app: "airbrake", name: "Airbrake", category: "infrastructure", docsUrl: "https://www.airbrake.io" },
  { app: "airtable", name: "Airtable", category: "development", docsUrl: "https://airtable.com" },
  { app: "amazon-ads", name: "Amazon Ads", category: "analytics", docsUrl: "https://advertising.amazon.com/API/docs" },
  { app: "anthropic", name: "Anthropic", category: "development", docsUrl: "https://anthropic.com" },
  { app: "appwrite", name: "Appwrite", category: "infrastructure", docsUrl: "https://appwrite.io" },
  { app: "asana", name: "Asana", category: "development", docsUrl: "https://asana.com" },
  { app: "azure-openai", name: "Azure OpenAI", category: "development" },
  { app: "better-stack", name: "Better Stack", category: "infrastructure", docsUrl: "https://betterstack.com" },
  { app: "brave-search", name: "Brave Search", category: "development", docsUrl: "https://search.brave.com" },
  { app: "carbone", name: "Carbone", category: "design", docsUrl: "https://carbone.io" },
  { app: "changedetection", name: "Changedetection", category: "analytics", docsUrl: "https://changedetection.io" },
  { app: "clickup", name: "ClickUp", category: "development", docsUrl: "https://clickup.com" },
  { app: "deepl", name: "DeepL", category: "development", docsUrl: "https://deepl.com" },
  { app: "disqus", name: "Disqus", category: "communication", docsUrl: "https://disqus.com" },
  { app: "dropbox", name: "Dropbox", category: "infrastructure", docsUrl: "https://dropbox.com" },
  { app: "ebay", name: "eBay", category: "payments", docsUrl: "https://developer.ebay.com/develop/selling-apps" },
  { app: "eventbrite", name: "Eventbrite", category: "communication", docsUrl: "https://www.eventbrite.com" },
  { app: "facebook", name: "Facebook Páginas", category: "communication", docsUrl: "https://developers.facebook.com/docs/pages-api" },
  { app: "firefly-iii", name: "Firefly III", category: "payments", docsUrl: "https://firefly-iii.org" },
  { app: "flickr", name: "Flickr", category: "design", docsUrl: "https://www.flickr.com/" },
  { app: "flowers-software", name: "Flowers Software", category: "development", docsUrl: "https://flowers-software.com" },
  { app: "frappe", name: "Frappe / ERPNext", category: "development" },
  { app: "freescout", name: "FreeScout", category: "communication", docsUrl: "https://freescout.net" },
  { app: "ghost", name: "Ghost", category: "communication", docsUrl: "https://ghost.org" },
  { app: "gitea", name: "Gitea", category: "infrastructure", docsUrl: "https://www.gitea.com" },
  { app: "gitlab", name: "GitLab", category: "infrastructure", docsUrl: "https://gitlab.com" },
  { app: "google-admob", name: "Google AdMob", category: "analytics", docsUrl: "https://developers.google.com/admob/api" },
  { app: "google-ads", name: "Google Ads", category: "analytics", docsUrl: "https://developers.google.com/google-ads/api" },
  { app: "google-adsense", name: "Google AdSense", category: "analytics", docsUrl: "https://developers.google.com/adsense/management" },
  { app: "google-calendar", name: "Google Calendar", category: "development", docsUrl: "https://calendar.google.com" },
  { app: "google-docs", name: "Google Docs", category: "development", docsUrl: "https://docs.google.com/document" },
  { app: "google-drive", name: "Google Drive", category: "infrastructure", docsUrl: "https://drive.google.com" },
  { app: "google-forms", name: "Google Forms", category: "analytics", docsUrl: "https://docs.google.com/forms" },
  { app: "google-sheets", name: "Google Sheets", category: "development", docsUrl: "https://docs.google.com/spreadsheets" },
  { app: "google-tasks", name: "Google Tasks", category: "development", docsUrl: "https://calendar.google.com/calendar/u/0/r/tasks" },
  { app: "helix", name: "Helix", category: "development", docsUrl: "https://tryhelix.ai" },
  { app: "hubspot", name: "HubSpot", category: "development", docsUrl: "https://www.hubspot.com" },
  { app: "instagram", name: "Instagram Business", category: "communication", docsUrl: "https://developers.facebook.com/docs/instagram-platform" },
  { app: "invoice-ninja", name: "Invoice Ninja", category: "payments", docsUrl: "https://invoiceninja.com" },
  { app: "jotform", name: "Jotform", category: "analytics", docsUrl: "https://www.jotform.com" },
  { app: "kwai-ads", name: "Kwai Ads", category: "analytics", docsUrl: "https://developers.kwai.com/documentation" },
  { app: "linkedin", name: "LinkedIn", category: "communication", docsUrl: "https://learn.microsoft.com/linkedin/consumer/" },
  { app: "libretranslate", name: "LibreTranslate", category: "development", docsUrl: "https://libretranslate.com" },
  { app: "mailchimp", name: "Mailchimp", category: "communication", docsUrl: "https://mailchimp.com" },
  { app: "mailerlite", name: "MailerLite", category: "communication", docsUrl: "https://www.mailerlite.com" },
  { app: "mattermost", name: "Mattermost", category: "communication", docsUrl: "https://mattermost.com" },
  { app: "meta-ads", name: "Meta Ads", category: "analytics", docsUrl: "https://developers.facebook.com/docs/marketing-apis" },
  { app: "microsoft-365", name: "Microsoft 365 (OneDrive e To Do)", category: "infrastructure", docsUrl: "https://learn.microsoft.com/graph/overview" },
  { app: "microsoft-outlook", name: "Outlook (e-mail e calendário)", category: "communication", docsUrl: "https://learn.microsoft.com/graph/outlook-mail-concept-overview" },
  { app: "microsoft-teams", name: "Microsoft Teams", category: "communication", docsUrl: "https://learn.microsoft.com/graph/teams-concept-overview" },
  { app: "miro", name: "Miro", category: "design", docsUrl: "https://miro.com" },
  { app: "mistral-ai", name: "Mistral AI", category: "development", docsUrl: "https://mistral.ai" },
  { app: "monday", name: "monday.com", category: "development", docsUrl: "https://monday.com" },
  { app: "notion", name: "Notion", category: "development", docsUrl: "https://notion.com" },
  { app: "ntfy", name: "Ntfy", category: "communication", docsUrl: "https://ntfy.sh" },
  { app: "odoo", name: "Odoo", category: "development", docsUrl: "https://odoo.com" },
  { app: "openai", name: "OpenAI", category: "development", docsUrl: "https://openai.com" },
  { app: "openrouter", name: "OpenRouter", category: "development", docsUrl: "https://openrouter.ai" },
  { app: "pdfmonkey", name: "PDFMonkey", category: "design", docsUrl: "https://pdfmonkey.io" },
  { app: "perplexity", name: "Perplexity", category: "development", docsUrl: "https://perplexity.ai" },
  { app: "pipedrive", name: "Pipedrive", category: "development", docsUrl: "https://www.pipedrive.com" },
  { app: "placetel", name: "Placetel", category: "communication", docsUrl: "https://placetel.de" },
  { app: "postgresql", name: "PostgreSQL", category: "infrastructure" },
  { app: "pushover", name: "Pushover", category: "communication", docsUrl: "https://pushover.net" },
  { app: "reddit", name: "Reddit", category: "communication", docsUrl: "https://www.reddit.com" },
  { app: "removebg", name: "Remove.bg", category: "design", docsUrl: "https://www.remove.bg" },
  { app: "rss", name: "RSS", category: "analytics" },
  { app: "salesforce", name: "Salesforce", category: "development", docsUrl: "https://salesforce.com" },
  { app: "self-hosted-llm", name: "Self-hosted LLM", category: "infrastructure" },
  { app: "signalwire", name: "SignalWire", category: "communication", docsUrl: "https://signalwire.com" },
  { app: "smtp", name: "SMTP", category: "communication" },
  { app: "strava", name: "Strava", category: "analytics", docsUrl: "https://www.strava.com" },
  { app: "surveymonkey", name: "SurveyMonkey", category: "analytics", docsUrl: "https://www.surveymonkey.com" },
  { app: "telegram-bot", name: "Telegram", category: "communication", docsUrl: "https://telegram.org" },
  { app: "tiktok-ads", name: "TikTok Ads", category: "analytics", docsUrl: "https://business-api.tiktok.com/portal/docs" },
  { app: "todoist", name: "Todoist", category: "development", docsUrl: "https://todoist.com" },
  { app: "together-ai", name: "Together AI", category: "development", docsUrl: "https://together.ai" },
  { app: "trello", name: "Trello", category: "development", docsUrl: "https://trello.com/" },
  { app: "twilio", name: "Twilio", category: "communication", docsUrl: "https://twilio.com" },
  { app: "twitter", name: "X (Twitter)", category: "communication", docsUrl: "https://developer.x.com" },
  { app: "typeform", name: "Typeform", category: "analytics", docsUrl: "https://typeform.com" },
  { app: "virtualq", name: "VirtualQ", category: "communication", docsUrl: "https://www.virtualq.tech" },
  { app: "vtiger-crm", name: "Vtiger CRM", category: "development", docsUrl: "https://www.vtiger.com" },
  { app: "whatsapp", name: "WhatsApp Business", category: "communication", docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api" },
  { app: "wordpress", name: "WordPress", category: "communication", docsUrl: "https://wordpress.com" },
  { app: "xero", name: "Xero", category: "payments", docsUrl: "https://go.xero.com" },
  { app: "you-need-a-budget", name: "You Need A Budget", category: "payments", docsUrl: "https://app.ynab.com" },
  { app: "youtube", name: "Youtube", category: "communication", docsUrl: "https://www.youtube.com/" },
  { app: "zendesk", name: "Zendesk", category: "communication", docsUrl: "https://zendesk.com/" },
]

/** Conectores do Vertal Dev que também existem nativamente no Vertal Fluxos (mesma base). */
export const FLUXOS_SHARED_APPS: Record<string, string> = {
  gmail: 'gmail',
  spotify: 'spotify',
  slack: 'slack',
  github: 'github',
  stripe: 'stripe',
  discord: 'discord',
}

/** Logos oficiais de apps do Vertal Fluxos, por chave do app (arquivos em public/connectors). */
const FLUXOS_APP_LOGOS: Record<string, string> = {
  airbrake: '/connectors/airbrake.png',
  airtable: '/connectors/airtable.png',
  'amazon-ads': '/connectors/amazon-ads.png',
  anthropic: '/connectors/anthropic.png',
  appwrite: '/connectors/appwrite.png',
  asana: '/connectors/asana.png',
  'azure-openai': '/connectors/microsoft.png',
  'better-stack': '/connectors/better-stack.png',
  'brave-search': '/connectors/brave-search.png',
  carbone: '/connectors/carbone.png',
  changedetection: '/connectors/changedetection.png',
  clickup: '/connectors/clickup.png',
  deepl: '/connectors/deepl.png',
  disqus: '/connectors/disqus.png',
  dropbox: '/connectors/dropbox.png',
  ebay: '/connectors/ebay.png',
  eventbrite: '/connectors/eventbrite.png',
  facebook: '/connectors/facebook.png',
  'firefly-iii': '/connectors/firefly-iii.png',
  flickr: '/connectors/flickr.jpg',
  'flowers-software': '/connectors/flowers-software.png',
  frappe: '/connectors/frappe.png',
  freescout: '/connectors/freescout.png',
  ghost: '/connectors/ghost.png',
  gitea: '/connectors/gitea.png',
  gitlab: '/connectors/gitlab.png',
  'google-admob': '/connectors/google-admob.png',
  'google-ads': '/connectors/google-ads.png',
  'google-adsense': '/connectors/google-adsense.png',
  'google-calendar': '/connectors/google-calendar.png',
  'google-docs': '/connectors/google-docs.png',
  'google-drive': '/connectors/google-drive.png',
  'google-forms': '/connectors/google-forms.png',
  'google-sheets': '/connectors/google-sheets.png',
  'google-tasks': '/connectors/google-tasks.webp',
  helix: '/connectors/helix.png',
  hubspot: '/connectors/hubspot.png',
  instagram: '/connectors/instagram.png',
  'invoice-ninja': '/connectors/invoice-ninja.png',
  jotform: '/connectors/jotform.png',
  'kwai-ads': '/connectors/kwai-ads.png',
  libretranslate: '/connectors/libretranslate.png',
  linkedin: '/connectors/linkedin.svg',
  mailchimp: '/connectors/mailchimp.png',
  mailerlite: '/connectors/mailerlite.png',
  mattermost: '/connectors/mattermost.png',
  'meta-ads': '/connectors/meta-ads.png',
  'microsoft-365': '/connectors/microsoft-365.png',
  'microsoft-outlook': '/connectors/microsoft-outlook.png',
  'microsoft-teams': '/connectors/microsoft-teams.png',
  miro: '/connectors/miro.png',
  'mistral-ai': '/connectors/mistral-ai.png',
  monday: '/connectors/monday.png',
  notion: '/connectors/notion.png',
  ntfy: '/connectors/ntfy.png',
  odoo: '/connectors/odoo.png',
  pdfmonkey: '/connectors/pdfmonkey.png',
  pipedrive: '/connectors/pipedrive.png',
  postgresql: '/connectors/postgresql.png',
  pushover: '/connectors/pushover.png',
  reddit: '/connectors/reddit.png',
  removebg: '/connectors/removebg.png',
  rss: '/connectors/rss.png',
  salesforce: '/connectors/salesforce.png',
  signalwire: '/connectors/signalwire.png',
  surveymonkey: '/connectors/surveymonkey.png',
  'telegram-bot': '/connectors/telegram.png',
  'tiktok-ads': '/connectors/tiktok-ads.png',
  todoist: '/connectors/todoist.png',
  trello: '/connectors/trello.png',
  twilio: '/connectors/twilio.png',
  twitter: '/connectors/twitter.png',
  typeform: '/connectors/typeform.png',
  'vtiger-crm': '/connectors/vtiger-crm.png',
  virtualq: '/connectors/virtualq.png',
  whatsapp: '/connectors/whatsapp.png',
  wordpress: '/connectors/wordpress.png',
  xero: '/connectors/xero.png',
  'you-need-a-budget': '/connectors/you-need-a-budget.png',
  youtube: '/connectors/youtube.png',
  zendesk: '/connectors/zendesk.png',
}

/**
 * Apps fora do catálogo de /connectors (o motor, os fluxos e os dados continuam; nada é apagado).
 * - Flickr: a chave de API só sai para assinantes do Flickr Pro (pago), então o Vertal não tem cliente
 *   OAuth (decisão do Laércio, 26/11/2026).
 * - Strava: criar app da API exige assinatura paga do Strava (para o Vertal e para quem quisesse usar app
 *   próprio) e dados de treino não servem ao público do Vertal Dev (26/11/2026).
 * - OpenAI, OpenRouter e Azure OpenAI: o Vertal vende a própria IA (white-label) para devs, então marcas de
 *   fornecedores de IA não aparecem como conectores (Laércio, 26/11/2026). Só o catálogo público: o backend de
 *   IA do Vertal (vertal-code-ai etc.) segue usando esses provedores por dentro. Na data, 0 conexões de usuário.
 * - Anthropic, Mistral AI, Together AI, Perplexity e Helix (tryhelix.ai): mesma regra (Laércio, 26/11/2026),
 *   0 conexões de usuário na data. Ficam: Self-hosted LLM (genérico, sem marca), DeepL/LibreTranslate
 *   (tradução), Remove.bg (imagem) e Brave Search (busca), que não são fornecedores de modelos de IA.
 * - Auditoria dos conectores sem OAuth (Laércio, 26/11/2026; 0 conexões de usuário em todos):
 *   Airbrake (só 1 gatilho de erro, ferramenta de nicho; o público usa outras de monitoramento),
 *   Flowers Software (BPM alemão de nicho, só 1 gatilho), FreeScout (helpdesk auto-hospedado, só 1 gatilho),
 *   Placetel (telefonia alemã, só 1 gatilho), VirtualQ (fila de ligações alemã) e Firefly III
 *   (finanças pessoais auto-hospedadas, só gatilhos): fora do público de devs Brasil/global.
 *   Depois (Laércio, 26/11/2026) FreeScout, Firefly III, VirtualQ e Airbrake voltaram ao catálogo, cada um com
 *   página própria de SEO para buscas de nicho, ações novas e OAuth onde o provedor oferece (Firefly III, por
 *   cliente do próprio usuário). Flowers Software e Placetel continuam fora.
 * Antes de esconder: conferir que nenhum usuário tem conexão (tabela fluxos_connections) — com conexão, a
 * conexão continua funcionando pelo chat/fluxos (o servidor só esconde para quem não tem conexão; ver
 * supabase/functions/_shared/hiddenFluxosApps.ts, mantenha as duas listas iguais).
 */
export const HIDDEN_FLUXOS_APPS = new Set([
  'flickr', 'strava',
  // Sem uso para o público do Vertal Dev ou sem função real (auditoria de conectores sem OAuth, 26/11/2026).
  // FreeScout, Firefly III, VirtualQ e Airbrake voltaram (Laércio, 26/11/2026: páginas de nicho para SEO).
  'flowers-software', 'placetel',
  // Fornecedores de modelos de IA (white-label):
  'openai', 'openrouter', 'azure-openai', 'anthropic', 'mistral-ai', 'together-ai', 'perplexity', 'helix',
])

export const fluxosConnectors: ConnectorConfig[] = FLUXOS_NATIVE_APPS.filter(a => !HIDDEN_FLUXOS_APPS.has(a.app)).map(a => ({
  name: a.name,
  slug: `fluxos-${a.app}`,
  icon: Workflow,
  logoUrl: FLUXOS_APP_LOGOS[a.app],
  color: '#0059F7',
  authType: 'manual',
  category: a.category,
  description: `${a.name} via Vertal Fluxos: use em automações, gatilhos e ações.`,
  longDescription: `${a.name} está disponível como app nativo do Vertal Fluxos. Conecte a sua conta aqui mesmo (login do ${a.name} ou chave de acesso) e o Vertal Chat passa a usar as ações e buscas do ${a.name} por você; ações que mudam algo pedem a sua aprovação.`,
  features: ['Via Vertal Fluxos', 'Ações e buscas pelo Vertal Chat', 'Credenciais guardadas no servidor'],
  docsUrl: a.docsUrl,
  status: 'available',
  fluxosApp: a.app,
  apiKeyLabel: '',
  apiKeyPlaceholder: '',
  apiKeyHelp: 'A conexão é feita pelo Vertal Fluxos — sem chave aqui.',
  setupSteps: [
    { title: `Conecte ${a.name}`, description: `Em Conectores → ${a.name}, entre com a sua conta ou informe a chave de acesso.` },
    { title: 'Use pelo chat', description: `Peça, por exemplo, “use o ${a.name} para …”. Ações que mudam algo pedem a sua aprovação.` },
    { title: 'Ou em fluxos', description: `${a.name} também fica disponível nos fluxos do Vertal Fluxos.` },
  ],
}))
