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
  { app: "eventbrite", name: "Eventbrite", category: "communication", docsUrl: "https://www.eventbrite.com" },
  { app: "firefly-iii", name: "Firefly III", category: "payments", docsUrl: "https://firefly-iii.org" },
  { app: "flickr", name: "Flickr", category: "design", docsUrl: "https://www.flickr.com/" },
  { app: "flowers-software", name: "Flowers Software", category: "development", docsUrl: "https://flowers-software.com" },
  { app: "frappe", name: "Frappe / ERPNext", category: "development" },
  { app: "freescout", name: "FreeScout", category: "communication", docsUrl: "https://freescout.net" },
  { app: "ghost", name: "Ghost", category: "communication", docsUrl: "https://ghost.org" },
  { app: "gitea", name: "Gitea", category: "infrastructure", docsUrl: "https://www.gitea.com" },
  { app: "gitlab", name: "GitLab", category: "infrastructure", docsUrl: "https://gitlab.com" },
  { app: "google-calendar", name: "Google Calendar", category: "development", docsUrl: "https://calendar.google.com" },
  { app: "google-docs", name: "Google Docs", category: "development", docsUrl: "https://docs.google.com/document" },
  { app: "google-drive", name: "Google Drive", category: "infrastructure", docsUrl: "https://drive.google.com" },
  { app: "google-forms", name: "Google Forms", category: "analytics", docsUrl: "https://docs.google.com/forms" },
  { app: "google-sheets", name: "Google Sheets", category: "development", docsUrl: "https://docs.google.com/spreadsheets" },
  { app: "google-tasks", name: "Google Tasks", category: "development", docsUrl: "https://calendar.google.com/calendar/u/0/r/tasks" },
  { app: "helix", name: "Helix", category: "development", docsUrl: "https://tryhelix.ai" },
  { app: "hubspot", name: "HubSpot", category: "development", docsUrl: "https://www.hubspot.com" },
  { app: "invoice-ninja", name: "Invoice Ninja", category: "payments", docsUrl: "https://invoiceninja.com" },
  { app: "jotform", name: "Jotform", category: "analytics", docsUrl: "https://www.jotform.com" },
  { app: "libretranslate", name: "LibreTranslate", category: "development", docsUrl: "https://libretranslate.com" },
  { app: "mailchimp", name: "Mailchimp", category: "communication", docsUrl: "https://mailchimp.com" },
  { app: "mailerlite", name: "MailerLite", category: "communication", docsUrl: "https://www.mailerlite.com" },
  { app: "mattermost", name: "Mattermost", category: "communication", docsUrl: "https://mattermost.com" },
  { app: "miro", name: "Miro", category: "design", docsUrl: "https://miro.com" },
  { app: "mistral-ai", name: "Mistral AI", category: "development", docsUrl: "https://mistral.ai" },
  { app: "monday", name: "Monday", category: "development", docsUrl: "https://monday.com" },
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
  { app: "todoist", name: "Todoist", category: "development", docsUrl: "https://todoist.com" },
  { app: "together-ai", name: "Together AI", category: "development", docsUrl: "https://together.ai" },
  { app: "trello", name: "Trello", category: "development", docsUrl: "https://trello.com/" },
  { app: "twilio", name: "Twilio", category: "communication", docsUrl: "https://twilio.com" },
  { app: "twitter", name: "Twitter", category: "communication", docsUrl: "https://twitter.com" },
  { app: "typeform", name: "Typeform", category: "analytics", docsUrl: "https://typeform.com" },
  { app: "virtualq", name: "VirtualQ", category: "communication", docsUrl: "https://www.virtualq.tech" },
  { app: "vtiger-crm", name: "Vtiger CRM", category: "development", docsUrl: "https://www.vtiger.com" },
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
  anthropic: '/connectors/anthropic.png',
  appwrite: '/connectors/appwrite.png',
}

export const fluxosConnectors: ConnectorConfig[] = FLUXOS_NATIVE_APPS.map(a => ({
  name: a.name,
  slug: `fluxos-${a.app}`,
  icon: Workflow,
  logoUrl: FLUXOS_APP_LOGOS[a.app],
  color: '#0059F7',
  authType: 'manual',
  category: a.category,
  description: `${a.name} via Vertal Fluxos: use em automações, gatilhos e ações.`,
  longDescription: `${a.name} está disponível como app nativo do Vertal Fluxos. Conecte a conta uma vez dentro do Vertal Fluxos e use-a em qualquer fluxo; o Vertal Chat pode criar e rodar esses fluxos para você, pedindo permissão a cada chamada.`,
  features: ['Via Vertal Fluxos', 'Gatilhos e ações em fluxos', 'Credenciais guardadas no servidor'],
  docsUrl: a.docsUrl,
  status: 'available',
  fluxosApp: a.app,
  apiKeyLabel: '',
  apiKeyPlaceholder: '',
  apiKeyHelp: 'A conexão é feita dentro do Vertal Fluxos — não requer chave aqui.',
  setupSteps: [
    { title: 'Ligue o Vertal Fluxos', description: 'Conecte o Vertal Fluxos na página de conectores, se ainda não conectou.' },
    { title: `Conecte ${a.name} no Vertal Fluxos`, description: `Em um fluxo, escolha ${a.name} como gatilho ou ação e adicione a sua conta.` },
    { title: 'Use pelo chat', description: `Peça, por exemplo, “crie um fluxo com ${a.name} no Vertal Fluxos”.` },
  ],
}))
