/**
 * English copy of the connector catalog, for the logged-in connector pages
 * (/connectors, /connectors/:slug, /setup, /about).
 *
 * The catalog in `connectorsConfig.ts` stays in Portuguese on purpose: it is
 * also the source of the pt-BR /integracoes pages and of their 21-language
 * translations (src/config/integrations). Changing it would change those pages.
 * So the English text lives here, keyed by slug, and `localizeConnector()`
 * returns a copy of the config with the English text in place.
 *
 * Only copy changes here. Slugs, routes, auth type, Fluxos app keys and every
 * other field the code uses are taken from the original config unchanged.
 *
 * Vertal Vibe Pay copy follows the compliance rule: never call it a bank.
 */
import type { ConnectorConfig, ConnectorSetupStep } from './connectorsConfig'

export interface ConnectorCopy {
  name?: string
  badge?: string
  description: string
  longDescription: string
  features: string[]
  apiKeyLabel?: string
  apiKeyPlaceholder?: string
  apiKeyHelp?: string
  setupSteps: ConnectorSetupStep[]
}

const COPY: Record<string, ConnectorCopy> = {
  'vertal-vibe-pay': {
    description: 'Your digital account in Vertal Dev: Pix, boleto, cards, payment links and a global account in more than one currency.',
    longDescription:
      'Vertal Vibe Pay brings together the Brazil account (ASAAS: Pix, boleto, cards, payment links and outgoing Pix) and the global account (Stripe Connect: receive in 16 currencies and pay out in your country), with one balance, one statement and saved cards. Accounts and payments are provided by Stripe and ASAAS. Vertal is not a financial institution.',
    features: ['Pix (QR code and copy and paste) and boleto', 'Cards and payment links', 'Global account in more than one currency (Stripe)', 'One balance and one statement'],
    apiKeyLabel: 'Vertal Vibe Pay account',
    apiKeyHelp: 'No key needed: you open the account inside Vertal Dev, at /pay.',
    setupSteps: [
      { title: 'Open Vertal Vibe Pay', description: 'Select the card to go to /pay. You are already signed in.' },
      { title: 'Open your accounts', description: 'In the Accounts tab, open the Brazil account (Pix and boleto) and the global account (choose your country).' },
      { title: 'Start receiving', description: 'In the Receive tab, create a Pix, a boleto, a card payment request or a payment link.' },
    ],
  },
  'vertal-app': {
    description: 'Deploy your apps from a repository with AI help. Open it here or connect it with MCP.',
    longDescription:
      'Vertal.app is the deploy platform of the Vertal ecosystem. The AI detects the stack, the build and the environment variables, then deploys the app and shows its status and logs. Open the dashboard inside Vertal Dev, or give your agent the deploy tools with MCP.',
    features: ['Opens inside Vertal Dev', 'Remote MCP server with OAuth', 'Stack detection by AI', 'Encrypted environment variables'],
    apiKeyLabel: 'Vertal.app account',
    apiKeyHelp: 'The MCP connection uses OAuth: your client opens the Vertal.app sign-in by itself.',
    setupSteps: [
      { title: 'Open Vertal.app', description: 'Use the "Open here" button to see the dashboard without leaving Vertal Dev.' },
      { title: 'Connect with MCP', description: 'Add the URL https://vertal.app/mcp to your MCP client (Vertal Chat or any compatible client).' },
      { title: 'Sign in', description: 'Allow access with your Vertal.app account.' },
    ],
  },
  'vertal-run': {
    description: 'Isolated sandboxes where AI agents run code. Open it here or connect it with MCP.',
    longDescription:
      'Vertal Run is where code runs in the Vertal ecosystem. Each run uses a clean sandbox with no network access and resource limits, and usage is counted per run. Open Vertal Run inside Vertal Dev, or give your agent the run_code tool with MCP.',
    features: ['Opens inside Vertal Dev', 'MCP server with run_code and get_usage', 'Python, JavaScript and Bash', 'Quota, rate limit and audit log per key'],
    apiKeyLabel: 'Vertal Run API key',
    apiKeyHelp: 'Create the key in the Vertal Run dashboard. It is shown only once.',
    setupSteps: [
      { title: 'Create your Vertal Run account', description: 'Use the "Open here" button, then sign in or sign up.' },
      { title: 'Create an API key', description: 'In the dashboard, create a kubo_sk_… key and keep it in a safe place.' },
      { title: 'Set up MCP', description: 'Add the vertal-run server settings and your key to your MCP client.' },
    ],
  },
  github: {
    description: 'Sync repositories and deploy from them.',
    longDescription: 'Connect your GitHub account to sync repositories, deploy from them and manage your code from Vertal.',
    features: ['Repository sync', 'Deploy from a repository', 'Webhooks', 'CI/CD', 'Also in Vertal Fluxos'],
    apiKeyLabel: 'GitHub personal access token (PAT)',
    apiKeyHelp: 'Advanced: create a classic personal access token on GitHub with the repo and read:user scopes.',
    setupSteps: [
      { title: 'Click Sign in with GitHub', description: 'You go to the GitHub sign-in. If you are already signed in, you only confirm.' },
      { title: 'Authorize Vertal', description: 'Vertal can read and create repositories and see your profile and email. You can revoke this at any time.' },
      { title: 'Done', description: 'You come back to the connector page, connected. Prefer a token? Use "Advanced: use a token".' },
    ],
  },
  automatisch: {
    description: 'Create, list and run automation flows in Vertal Fluxos from Vertal Chat.',
    longDescription:
      'Connect Vertal Fluxos, the automation engine of the Vertal ecosystem, to Vertal Chat. The chat creates flows, sets up triggers and actions, tests each step, publishes the flow and shows the result of each run. You approve every call. The address, email and password stay in the Secrets vault: sign-in happens only on the server and never goes through the chat.',
    features: ['Create and set up flows in the chat', 'Test steps and publish flows', 'See runs and the result of each step', 'You approve every call; credentials stay in the vault'],
    apiKeyLabel: 'Secrets in the vault: AUTOMATISCH_URL, AUTOMATISCH_EMAIL and AUTOMATISCH_PASSWORD',
    apiKeyPlaceholder: 'https://flows.yourcompany.com',
    apiKeyHelp: 'Use a Vertal Fluxos user. The chat only uses the secret names; the values stay encrypted in the vault.',
    setupSteps: [
      { title: 'Instance address', description: 'In the Secrets vault, create AUTOMATISCH_URL with the https address of your Vertal Fluxos (for example https://flows.yourcompany.com).' },
      { title: 'Vertal Fluxos user', description: 'Create AUTOMATISCH_EMAIL and AUTOMATISCH_PASSWORD with the sign-in of a user of that instance.' },
      { title: 'Ask in the chat', description: 'For example, say "list my Vertal Fluxos flows". The chat asks for your permission before each call.' },
    ],
  },
  huginn: {
    description: 'Agents that watch websites, feeds and APIs and react to events, from Vertal Chat and linked to Vertal Fluxos.',
    longDescription:
      'Connect Vertal Agentes, the monitoring agents of the Vertal ecosystem, to Vertal Chat. The chat lists your agents and events, creates agents from a JSON spec, imports scenarios, runs, turns on or turns off agents, and sends events to a WebhookAgent. It also links Vertal Agentes and Vertal Fluxos both ways: when an agent sends an event, a Vertal Fluxos flow runs, and a Vertal Fluxos step can notify Vertal Agentes. You approve every call. The address, user and password stay in the Secrets vault: sign-in happens only on the server and never goes through the chat.',
    features: ['List agents, events and scenarios', 'Create agents and import scenarios in the chat', 'Run, turn on and turn off agents', 'Link between Vertal Agentes and Vertal Fluxos (webhooks)', 'You approve every call; credentials stay in the vault'],
    apiKeyLabel: 'Secrets in the vault: HUGINN_URL, HUGINN_USERNAME and HUGINN_PASSWORD',
    apiKeyPlaceholder: 'https://agents.yourcompany.com',
    apiKeyHelp: 'Use a Vertal Agentes user (username or email). The chat only uses the secret names; the values stay encrypted in the vault.',
    setupSteps: [
      { title: 'Instance address', description: 'In the Secrets vault, create HUGINN_URL with the https address of your Vertal Agentes (for example https://agents.yourcompany.com).' },
      { title: 'Vertal Agentes user', description: 'Create HUGINN_USERNAME (username or email) and HUGINN_PASSWORD with the sign-in of a user of that instance.' },
      { title: 'Ask in the chat', description: 'For example, say "list my Vertal Agentes agents" or "when Vertal Agentes detects X, run the Vertal Fluxos flow Y". The chat asks for your permission before each call.' },
    ],
  },
  stripe: {
    description: 'Manage payments and subscriptions.',
    longDescription: 'Connect Stripe to take payments, manage subscriptions and use Stripe Connect.',
    features: ['Card payments', 'Subscriptions', 'Stripe Connect', 'Payment webhooks', 'Also in Vertal Fluxos'],
    apiKeyLabel: 'Secret API key',
    apiKeyPlaceholder: 'sk_live_... or sk_test_...',
    apiKeyHelp: 'Use a secret key, not the publishable key. We suggest a restricted key with only the permissions you need.',
    setupSteps: [
      { title: 'Open the Stripe Dashboard', description: 'Go to Developers → API keys.' },
      { title: 'Create a restricted key', description: 'Select only the permissions you need (Charges, Customers and so on).' },
      { title: 'Paste the key here', description: 'The key is encrypted before it is saved.' },
    ],
  },
  figma: {
    description: 'Import designs and components from Figma.',
    longDescription: 'Connect Figma to bring designs, design tokens and components into your projects.',
    features: ['Import frames', 'Design tokens', 'Components'],
    apiKeyLabel: 'Personal access token',
    apiKeyHelp: 'Create a personal access token in your Figma settings.',
    setupSteps: [
      { title: 'Open Settings in Figma', description: 'Account → Personal access tokens.' },
      { title: 'Create a token', description: 'Give it a name (for example "Vertal") and copy the value.' },
      { title: 'Paste the token here', description: 'After that you can import files without signing in again.' },
    ],
  },
  'mais-retorno': {
    description: 'Brazilian financial market data for your AI, with MCP.',
    longDescription:
      'Connect the Mais Retorno MCP server to your agent to look up funds, stocks, REITs (FIIs), ETFs, Brazilian treasury bonds and fund portfolios (CVM data) in plain language. Sign-in uses OAuth: your client opens the Mais Retorno sign-in, with no API key or headers. Queries use the credits of your Mais Retorno plan.',
    features: ['Remote MCP server with OAuth', 'Funds, stocks, FIIs, ETFs and treasury bonds', 'Prices, returns and indicators (Sharpe, volatility, drawdown)', 'Fund portfolios (CVM)'],
    apiKeyLabel: 'Mais Retorno account',
    apiKeyHelp: 'The MCP connection uses OAuth: your client registers itself and opens the Mais Retorno sign-in. There is no client ID.',
    setupSteps: [
      { title: 'Check your plan', description: 'You need a Mais Retorno data API plan (the free plan has 500 credits per month), Retorno Prime or RetornoPRO.' },
      { title: 'Add the MCP server', description: 'Add the URL https://data.maisretorno.com/mr-data/v4/mcp/oauth to your MCP client.' },
      { title: 'Sign in', description: 'Allow access in the Mais Retorno sign-in, and you are done.' },
    ],
  },
  supabase: {
    description: 'Database, auth and storage for your backend.',
    longDescription: 'Connect Supabase for authentication, a realtime database, storage and edge functions.',
    features: ['Authentication', 'Realtime database', 'Storage', 'Edge Functions'],
    apiKeyLabel: 'Service role key',
    apiKeyHelp: 'Find the service role key in Project Settings → API. Never put this key in front-end code.',
    setupSteps: [
      { title: 'Open your Supabase project', description: 'Project Settings → API.' },
      { title: 'Copy the service role key', description: 'It is the key that starts with eyJ...' },
      { title: 'Paste it here', description: 'Vertal stores it encrypted and uses it only on the server.' },
    ],
  },
  resend: {
    description: 'Send transactional and marketing emails.',
    longDescription: 'Use Resend to send transactional emails, marketing campaigns and notifications with your own templates.',
    features: ['Transactional emails', 'React templates', 'Analytics', 'Custom domain'],
    apiKeyLabel: 'Resend API key',
    apiKeyHelp: 'Create an API key in the Resend dashboard.',
    setupSteps: [
      { title: 'Open Resend', description: 'Dashboard → API Keys.' },
      { title: 'Create a key', description: 'Choose the permission (Full access or Sending access).' },
      { title: 'Paste it here', description: 'Vertal sends emails for you with this key.' },
    ],
  },
  gmail: {
    description: 'Connect Gmail accounts so the AI can read and send email.',
    longDescription:
      'Official Google sign-in (OAuth). You can connect more than one account. Tokens are encrypted, and Vertal asks only for read and send access (gmail.readonly and gmail.send).',
    features: ['Google sign-in', 'More than one account', 'Read your inbox', 'Send email', 'Encrypted tokens', 'Also in Vertal Fluxos'],
    apiKeyHelp: 'This connection uses OAuth, so you do not need a key.',
    setupSteps: [
      { title: 'Click Connect account', description: 'You go to the Google sign-in.' },
      { title: 'Allow access', description: 'Read (gmail.readonly) and send (gmail.send).' },
      { title: 'Done', description: 'The account shows on the connector page, and AI agents can use it.' },
    ],
  },
  spotify: {
    description: 'Ask for songs in the chat and play them here, with your Spotify account.',
    longDescription:
      'Official Spotify sign-in (OAuth) with playback access. Search and the built-in player work without Premium. Controlling your own device needs Premium. The refresh token is encrypted on the server.',
    features: ['Spotify sign-in', 'Song search', 'Player in the chat', 'Device control (Premium)', 'Encrypted tokens', 'Also in Vertal Fluxos'],
    apiKeyHelp: 'This connection uses OAuth, so you do not need a key.',
    setupSteps: [
      { title: 'Click Connect Spotify', description: 'You go to the Spotify sign-in.' },
      { title: 'Allow access', description: 'Only read access and playback control.' },
      { title: 'Done', description: 'Ask for a song in the chat and it plays in the player.' },
    ],
  },
  slack: {
    description: 'Slack workspaces for messages, channels and AI bots.',
    longDescription:
      'Connect a Slack workspace with the Vertal bot (OAuth). Send and read messages, and work with channels, users, threads and blocks. AI agents and automations can use it.',
    features: ['Bot sign-in (OAuth)', 'Send messages, threads and blocks', 'Channel inbox', 'User list', 'Activity log', 'Also in Vertal Fluxos'],
    apiKeyHelp: 'This connection uses OAuth managed by Vertal, so you do not need a key.',
    setupSteps: [
      { title: 'Connect the workspace', description: 'Allow the Vertal app in Slack when asked.' },
      { title: 'Adjust scopes', description: 'In Connectors → Slack, add or remove scopes as needed.' },
      { title: 'Done', description: 'The bot is available in public channels.' },
    ],
  },
  instagram: {
    description: 'Sign in with your Instagram professional account and use it from Vertal Chat: posts, Reels, insights and DMs.',
    longDescription:
      'Instagram professional account (Business or Creator) through the official Meta API. Tap "Sign in with Instagram", sign in to Meta (with Instagram or Facebook) and choose the accounts Vertal Dev can use. Vertal Chat posts photos and Reels, reads insights and media, and reads and answers DMs, always after you confirm. Meta only allows free-form replies up to 24 hours after the contact\'s last message. The operator channel (webhook with server secrets) is still under "Advanced".',
    features: ['Sign in with Instagram (official Meta sign-in)', 'Post photos and Reels from the chat, after you confirm', 'Account insights and media', 'Read and answer DMs (Meta 24-hour window)', 'Advanced: operator channel with a webhook'],
    apiKeyHelp: 'The secrets stay on the server (Edge Functions → Secrets). See the connector page for the steps.',
    setupSteps: [
      { title: 'Professional account', description: 'Use an Instagram professional account (Business or Creator). If you sign in with Facebook, it must be linked to a Page.' },
      { title: 'Sign in with Instagram', description: 'On the Instagram page, tap "Sign in with Instagram", sign in to Meta and allow the Page and the account.' },
      { title: 'Use it in the chat', description: 'Ask Vertal Chat to post, show insights or answer DMs. Every action asks you to confirm.' },
    ],
  },
  whatsapp: {
    description: 'Connect your WhatsApp Business account (official Meta API) with a token and send messages from Vertal Chat.',
    longDescription:
      'Official Meta WhatsApp Business Cloud API, with no monthly fee. Paste the permanent system user token and the phone number ID, test the connection, and Vertal Chat can send text messages and approved templates, always after you confirm. Free-form text is only allowed up to 24 hours after the customer\'s last message. After that you need an approved template. One-click sign-in with Facebook comes after Meta verification.',
    features: ['Token connection (official Cloud API)', 'Test the connection before saving', 'Send text and templates from the chat, after you confirm', 'Token encrypted on the server', 'Follows the Meta 24-hour window'],
    apiKeyHelp: 'The token is encrypted on the server. See the connector page for the steps.',
    setupSteps: [
      { title: 'Meta app', description: 'On developers.facebook.com, create an app with the WhatsApp use case (the test number is free).' },
      { title: 'Token and IDs', description: 'Create the permanent system user token and copy the phone number ID (and the account ID, optional).' },
      { title: 'Paste and test', description: 'On the WhatsApp page, paste the values, tap "Test connection", then "Save and connect".' },
    ],
  },
  render: {
    description: 'Deploys, logs, rollbacks and automatic restarts for your Render services.',
    longDescription:
      'Connect Render with your API key (stored encrypted). List services, start deploys, restart and roll back, and turn on auto-healing, which checks health checks and deploy status every 2 minutes. You can also start end-to-end tests with a webhook (for example GitHub Actions).',
    features: ['API key encrypted per user', 'Logs', 'Restart, deploy and roll back', 'Scheduled auto-healing', 'Post-deploy test webhooks', 'Action log'],
    apiKeyLabel: 'Render API key',
    apiKeyHelp: 'Create it at dashboard.render.com → Account Settings → API Keys.',
    setupSteps: [
      { title: 'Open Account Settings', description: 'Render Dashboard → API Keys.' },
      { title: 'Create an API key', description: 'Copy the rnd_… token.' },
      { title: 'Paste it in the panel', description: 'Vertal checks the key and encrypts it before saving.' },
    ],
  },
  discord: {
    description: 'Bots and notifications on Discord.',
    longDescription: 'Connect Discord to send notifications, run bots and manage communities from Vertal.',
    features: ['Webhooks', 'Bot commands', 'Notifications', 'Community management', 'Also in Vertal Fluxos'],
    apiKeyLabel: 'Bot token',
    apiKeyHelp: 'Create an application in the Discord Developer Portal and copy the bot token.',
    setupSteps: [
      { title: 'Create an application', description: 'Discord Developer Portal → New Application.' },
      { title: 'Add a bot', description: 'Bot → Add Bot → Reset Token.' },
      { title: 'Paste the token here', description: 'Vertal sends notifications with this bot.' },
    ],
  },
  cloudflare: {
    description: 'Deploys on the edge, CDN, DNS and DDoS protection.',
    longDescription: 'Publish your apps with Cloudflare Workers and Pages, with the Cloudflare CDN, DNS management and DDoS protection.',
    features: ['Deploy (Workers and Pages)', 'CDN', 'DNS management', 'DDoS protection'],
    apiKeyLabel: 'API token',
    apiKeyHelp: 'Advanced: use an API token (never the Global API Key). The link below opens Cloudflare with the permissions already selected.',
    setupSteps: [
      { title: 'Open the token link', description: 'It already has the right permissions: Zone (read), DNS, Workers Scripts, Workers Routes and Pages (edit).' },
      { title: 'Choose accounts and domains', description: 'In Account and Zone Resources, limit the token to the accounts and domains Vertal can use → Continue → Create Token.' },
      { title: 'Paste the token here', description: 'Vertal checks the token and encrypts it before saving.' },
    ],
  },
  mongodb: {
    description: 'Flexible NoSQL database.',
    longDescription: 'Connect MongoDB Atlas clusters to store documents, vector indexes and data that changes in real time.',
    features: ['Atlas clusters', 'JSON documents', 'Vector search', 'Triggers'],
    apiKeyLabel: 'Connection string',
    apiKeyHelp: 'Use the SRV connection string of your Atlas cluster, with a user that has only the access it needs.',
    setupSteps: [
      { title: 'Open MongoDB Atlas', description: 'Database → Connect → Drivers.' },
      { title: 'Create a database user', description: 'Database Access → Add new user (readWrite).' },
      { title: 'Paste the connection string here', description: 'Vertal stores it encrypted and uses it only on the server.' },
    ],
  },
  docker: {
    description: 'Publish and manage container images.',
    longDescription: 'Connect Docker Hub to push, pull and version the container images you use in your deploys.',
    features: ['Push and pull images', 'Private repositories', 'Tags and versions', 'CI/CD'],
    apiKeyLabel: 'Personal access token',
    apiKeyHelp: 'Create a personal access token on Docker Hub with Read & Write access.',
    setupSteps: [
      { title: 'Open Account Settings', description: 'Docker Hub → Security → New Access Token.' },
      { title: 'Choose the access', description: 'Read & Write is the right choice for CI/CD.' },
      { title: 'Paste the token here', description: 'Vertal uses it to publish images for you.' },
    ],
  },
  alchemy: {
    description: 'Web3 infrastructure and blockchain RPC.',
    longDescription: 'Use Alchemy RPC nodes, Enhanced APIs and Web3 tools for Ethereum, Polygon, Base and other chains.',
    features: ['RPC nodes', 'NFT API', 'On-chain webhooks', 'Several chains'],
    apiKeyLabel: 'Alchemy API key',
    apiKeyHelp: 'Create an app in the Alchemy dashboard and copy the API key.',
    setupSteps: [
      { title: 'Open the Alchemy dashboard', description: 'Apps → Create new App.' },
      { title: 'Choose the chain', description: 'Ethereum, Polygon, Base, Arbitrum and others.' },
      { title: 'Paste the API key here', description: 'Vertal uses it for Web3 calls on the server.' },
    ],
  },
  infura: {
    description: 'EVM RPC from ConsenSys.',
    longDescription: 'RPC provider for Ethereum, Polygon, Arbitrum, Optimism and other chains.',
    features: ['EVM RPC', 'Several chains', 'WebSockets', 'Archive nodes'],
    apiKeyLabel: 'Infura project ID',
    apiKeyHelp: 'Create an API key (project ID) at app.infura.io.',
    setupSteps: [
      { title: 'Open the Infura dashboard', description: 'API Keys → Create New Key.' },
      { title: 'Turn on the networks', description: 'Select Ethereum, Polygon, Arbitrum and others.' },
      { title: 'Paste the project ID here', description: 'Vertal uses it for RPC calls on the server.' },
    ],
  },
  'custom-rpc': {
    description: 'Connect your own RPC endpoint.',
    longDescription: 'Use QuickNode, Moralis, Chainstack, your own node or any compatible JSON-RPC or REST endpoint.',
    features: ['EVM JSON-RPC', 'Solana RPC', 'UTXO REST', 'Bring your own node'],
    apiKeyLabel: 'API key (optional)',
    apiKeyPlaceholder: 'Optional, if your RPC needs auth',
    apiKeyHelp: 'If the key is already in the URL, leave this empty.',
    setupSteps: [
      { title: 'Get your RPC URL', description: 'Your own node, QuickNode, Moralis, Chainstack and others.' },
      { title: 'Choose the network', description: 'EVM, Solana or UTXO (BTC, LTC, DOGE).' },
      { title: 'Test and save', description: 'Vertal checks the endpoint with a ping before saving.' },
    ],
  },
  'web-wallet': {
    description: 'Connect a Web3 wallet (MetaMask, WalletConnect).',
    longDescription: 'Link a Web3 wallet to your workspace to sign transactions, contract deploys and on-chain payments.',
    features: ['MetaMask', 'WalletConnect', 'Sign transactions', 'Deploy contracts'],
    apiKeyLabel: 'Wallet address',
    apiKeyHelp: 'Paste the public address of your wallet. Your wallet signs; we never ask for your private key.',
    setupSteps: [
      { title: 'Open your wallet', description: 'MetaMask, Rabby, Coinbase Wallet or similar.' },
      { title: 'Copy the public address', description: 'It starts with 0x and has 42 characters.' },
      { title: 'Paste it here', description: 'Vertal asks you to sign with WalletConnect when needed.' },
    ],
  },
  'vertal-crm': {
    badge: 'Free · AI 1 credit',
    description: 'Free Vertal CRM: contacts, companies, pipelines, tasks and reports. Only the AI costs credits (1 credit).',
    longDescription:
      'Vertal CRM is the CRM built into Vertal Dev: contacts, companies, deals on a Kanban board with several pipelines, tasks and reminders, notes, timeline, tags, custom fields, CSV, attachments, team roles, API and webhooks. It receives leads from Vertal Prospector and Growth Team and has triggers and actions in Vertal Fluxos. Connecting a paid CRM (Pipedrive, HubSpot, Salesforce) costs 4 credits to turn on and 2 credits for each AI sync.',
    features: ['Free to use', 'AI at 1 credit per use', 'Kanban with several pipelines', 'API, webhooks and Vertal Fluxos', 'Syncs with paid CRMs'],
    apiKeyLabel: 'Vertal account',
    apiKeyHelp: 'It uses your Vertal Dev account; there is nothing to set up.',
    setupSteps: [
      { title: 'Open Vertal CRM', description: 'Tap the card: your CRM is created right away, with a sales pipeline ready to use.' },
      { title: 'Bring your contacts', description: 'Import a CSV, or leads from Vertal Prospector or Growth Team.' },
      { title: 'Use the AI when you want', description: 'Summary, follow-up email, score and next step: 1 credit each, and you see the cost first.' },
    ],
  },
  'fluxos-google-play-console': {
    description: 'Sign in with Google and manage reviews, release tracks and products of your Android apps.',
    longDescription:
      'Google Play Console through Vertal Fluxos: sign in with your Google account (OAuth) and Vertal Chat reads reviews, release tracks (production, open, closed, internal), subscriptions and products, and answers reviews after you approve. You give access to each app in Play Console itself (Users and permissions).',
    features: ['Sign in with Google (OAuth)', 'Reviews and replies', 'Release tracks', 'Subscriptions and products', 'Through Vertal Fluxos'],
    apiKeyHelp: 'This connection uses Google sign-in, so you do not need a key.',
    setupSteps: [
      { title: 'Sign in with Google', description: 'Use the Google account that has access to Play Console.' },
      { title: 'Give access in Play Console', description: 'Play Console → Users and permissions: invite this account and give it access to the apps.' },
      { title: 'Use it in the chat', description: 'For example, ask "show the reviews of the app com.company.app".' },
    ],
  },
  'android-studio': {
    description: 'Sign in with Google (the same account as Play Console) and open your project in Android Studio from GitHub.',
    longDescription:
      'Android Studio is a desktop app with no OAuth sign-in and no API. In Vertal Dev it uses the Google Play Console sign-in (the same connection) and a ready path to open your project in Android Studio: clone from GitHub, create the Android project with Capacitor and open it.',
    features: ['Sign in with Google (Play Console connection)', 'Clone from GitHub in Android Studio', 'Android project with Capacitor', 'Download the repository as a ZIP'],
    apiKeyHelp: 'Android Studio has no OAuth; the connection is the Google Play Console sign-in.',
    setupSteps: [
      { title: 'Sign in with Google', description: 'The same connection as Google Play Console.' },
      { title: 'Choose the repository', description: 'From your connected GitHub (or paste the URL).' },
      { title: 'Open in Android Studio', description: 'File → New → Project from Version Control, or follow the Capacitor commands.' },
    ],
  },
  'ios-xcode': {
    description: 'Connect App Store Connect with your team API key and open the project in Xcode from GitHub.',
    longDescription:
      'Apple does not offer third-party OAuth for Xcode or App Store Connect. In Vertal Dev you connect with your team API key (Issuer ID, Key ID and .p8 file), stored encrypted on the server, and Vertal Chat lists apps, builds uploaded from Xcode and reviews. For the code: clone from GitHub in Xcode and create the iOS project with Capacitor (you need a Mac).',
    features: ['App Store Connect API key', 'Apps, builds and reviews', 'Clone from GitHub in Xcode', 'iOS project with Capacitor'],
    apiKeyHelp: 'Apple has no OAuth for this: use the App Store Connect team API key.',
    setupSteps: [
      { title: 'Create the API key', description: 'App Store Connect → Users and Access → Integrations → Team Keys.' },
      { title: 'Paste Issuer ID, Key ID and .p8', description: 'They are stored encrypted on the Vertal server.' },
      { title: 'Open in Xcode', description: 'Clone the repository from GitHub and run the Capacitor commands on a Mac.' },
    ],
  },
  metamask: {
    description: 'Connect your MetaMask wallet by signing a message (Sign-In with Ethereum). No seed phrase, no private key.',
    longDescription:
      'Connect MetaMask to Vertal Dev by signing a message (Sign-In with Ethereum, EIP-4361). Vertal keeps only the public address, the network and the connection date. See balance, network and recent transactions, download the Web3 starter (wagmi + viem) for your apps, and try the prompt Trader on the Sepolia testnet: you sign each operation in MetaMask.',
    features: ['Sign-In with Ethereum (EIP-4361)', 'Browser extension (EIP-6963) and phone', 'Balance, network and transactions (read only)', 'Web3 starter: wagmi + viem', 'Prompt Trader (testnet)'],
    apiKeyHelp: 'You connect by signing in MetaMask. Never paste a seed phrase or private key anywhere.',
    setupSteps: [
      { title: 'Open MetaMask', description: 'The extension on your computer or the app on your phone.' },
      { title: 'Sign the message', description: 'It only proves the wallet is yours. It spends nothing and approves no transaction.' },
      { title: 'Done', description: 'Disconnect whenever you want.' },
    ],
  },
}

/** Vertal Fluxos apps whose catalog name is in Portuguese. */
const FLUXOS_NAMES: Record<string, string> = {
  facebook: 'Facebook Pages',
  'microsoft-365': 'Microsoft 365 (OneDrive and To Do)',
  'microsoft-outlook': 'Outlook (email and calendar)',
  youtube: 'YouTube',
}

function fluxosCopy(app: string, original: string): ConnectorCopy {
  const name = FLUXOS_NAMES[app] ?? original
  return {
    name,
    description: `${name} through Vertal Fluxos: use it in automations, triggers and actions.`,
    longDescription: `${name} is a built-in Vertal Fluxos app. Connect your account here (${name} sign-in or access key) and Vertal Chat can use the ${name} actions and searches for you. Actions that change something ask for your approval.`,
    features: ['Through Vertal Fluxos', 'Actions and searches from Vertal Chat', 'Credentials stored on the server'],
    apiKeyHelp: 'You connect through Vertal Fluxos, so there is no key here.',
    setupSteps: [
      { title: `Connect ${name}`, description: `In Connectors → ${name}, sign in with your account or enter the access key.` },
      { title: 'Use it in the chat', description: `For example, ask "use ${name} to …". Actions that change something ask for your approval.` },
      { title: 'Or in flows', description: `${name} is also available in Vertal Fluxos flows.` },
    ],
  }
}

/** English copy for a connector, or undefined when there is none. */
export function connectorCopyEn(c: Pick<ConnectorConfig, 'slug' | 'name' | 'fluxosApp'>): ConnectorCopy | undefined {
  if (COPY[c.slug]) return COPY[c.slug]
  if (c.slug.startsWith('fluxos-') && c.fluxosApp) return fluxosCopy(c.fluxosApp, c.name)
  return undefined
}

/** Copy of the connector config with English text. Code fields are unchanged. */
export function localizeConnector<T extends ConnectorConfig | undefined>(c: T): T {
  if (!c) return c
  const en = connectorCopyEn(c)
  if (!en) return c
  return {
    ...c,
    name: en.name ?? c.name,
    badge: en.badge ?? c.badge,
    description: en.description,
    longDescription: en.longDescription,
    features: en.features,
    apiKeyLabel: en.apiKeyLabel ?? c.apiKeyLabel,
    apiKeyPlaceholder: en.apiKeyPlaceholder ?? c.apiKeyPlaceholder,
    apiKeyHelp: en.apiKeyHelp ?? c.apiKeyHelp,
    setupSteps: en.setupSteps.length === c.setupSteps.length ? en.setupSteps : c.setupSteps,
  } as T
}

/** Category labels in English (the catalog keeps the Portuguese ones for /integracoes). */
export const CATEGORY_LABELS_EN: Record<string, string> = {
  all: 'All',
  ecosystem: 'Vertal ecosystem',
  development: 'Development',
  payments: 'Payments',
  design: 'Design',
  infrastructure: 'Infrastructure',
  communication: 'Communication',
  analytics: 'Analytics',
}
