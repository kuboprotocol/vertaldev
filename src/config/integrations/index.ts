/**
 * Páginas públicas de integração (SEO): uma por conector do catálogo público de
 * /connectors, em /integracoes/<slug>, mais o índice /integracoes.
 *
 * Tudo sai do catálogo (`src/lib/connectorsConfig.ts`): conector novo ganha página
 * sozinho e conector escondido (HIDDEN_FLUXOS_APPS) ou "em breve" nunca ganha. O
 * mesmo modelo alimenta o React (`IntegrationsPage`) e o HTML pré-renderizado do
 * build (`vite-plugins/integrations.ts`), então buscador sem JavaScript lê o mesmo texto.
 *
 * White-label: nada de nomes do motor por trás do Vertal Fluxos/Agentes nem de
 * fornecedores de IA (teste em src/test/integrations-seo.test.ts).
 * Imports relativos: este arquivo também roda no Node durante o build.
 */
import { APP_NAME } from '../brand'
import { DESCRIPTION_MAX, TITLE_MAX } from '../seo'
import { connectors, categories, type ConnectorConfig } from '../../lib/connectorsConfig'
import { ENGINE_APPS, type EngineAppInfo } from './engineApps'
import { INTEGRATION_CONTENT } from './content'

export const INTEGRATIONS_PATH = '/integracoes'

/** Custo de cada ação executada pelo Vertal Chat num app conectado (devolvido se falhar). */
export const CHAT_ACTION_CREDITS = 2

export type IntegrationCategory = ConnectorConfig['category']

export interface IntegrationStep {
  title: string
  description: string
}

export type ConnectKind =
  | 'override' | 'base-mcp' | 'base-oauth' | 'base-account' | 'base-whatsapp' | 'base-key'
  | 'fluxos-oauth' | 'fluxos-own' | 'fluxos-key' | 'fluxos-nofields'

export interface Integration {
  slug: string
  name: string
  category: IntegrationCategory
  categoryLabel: string
  /** Caminho do logo em /public (ou undefined). */
  logoUrl?: string
  /** Página do conector dentro do app (exige login). */
  appPath: string
  /** Cadastro/login que volta para o conector. */
  signupPath: string
  about: string
  /** Resumo do catálogo (o que o Vertal Dev faz com o app). */
  summary: string
  /** Primeiro parágrafo da página. */
  lead: string
  /** Produto do próprio Ecossistema Vertal (sem aviso de marca de terceiros). */
  own: boolean
  details: string
  aliases: string[]
  features: string[]
  actions: { name: string; description: string }[]
  triggers: { name: string; description: string }[]
  connectMode: 'oauth' | 'own-app' | 'key' | 'account'
  /** Qual texto de conexão foi usado (as traduções montam o mesmo texto). */
  connectKind: ConnectKind
  /** Campos pedidos no formulário (rótulos pt-BR). */
  fields: string[]
  /** Card do catálogo é um app do Vertal Fluxos (`fluxos-*`). */
  fluxosCard: boolean
  /** App do motor de onde vêm ações e gatilhos. */
  engineApp?: string
  connectSummary: string
  steps: IntegrationStep[]
  uses: string[]
  faq: { q: string; a: string }[]
  related: string[]
  officialUrl?: string
}

/** Slug público por slug do catálogo (sem prefixo "fluxos-" e sem nomes internos). */
const SLUG_OVERRIDES: Record<string, string> = {
  automatisch: 'vertal-fluxos',
  huginn: 'vertal-agentes',
  'fluxos-telegram-bot': 'telegram',
  'fluxos-twitter': 'x-twitter',
  'fluxos-removebg': 'remove-bg',
  'fluxos-microsoft-outlook': 'outlook',
}

/** Ids do catálogo que não podem aparecer em página pública (white-label). */
const INTERNAL_IDS = new Set(['automatisch', 'huginn'])

/**
 * Itens do catálogo que viram a mesma página de outro (mesmo produto com dois cartões):
 * evita duas páginas quase iguais competindo na busca.
 */
const MERGED_INTO: Record<string, string> = {
  'fluxos-instagram': 'instagram',
  'fluxos-whatsapp': 'whatsapp',
}

/** App do motor que cada cartão "nativo" usa por dentro (ações listadas na página). */
const ENGINE_APP_FOR_NATIVE: Record<string, string> = {
  instagram: 'instagram',
  whatsapp: 'whatsapp',
  cloudflare: 'cloudflare',
}

/** Logos de apps nativos que não têm logoUrl no cartão do catálogo. */
const LOGO_FALLBACK: Record<string, string> = {
  instagram: '/connectors/instagram.png',
}

/** Passos de conexão próprios (os do catálogo citam detalhes internos). */
const STEP_OVERRIDES: Record<string, IntegrationStep[]> = {
  'vertal-fluxos': [
    { title: 'Tenha uma instância do Vertal Fluxos', description: 'Use o endereço https da sua instância e um usuário dela.' },
    { title: 'Guarde no Cofre de segredos', description: 'Em Conectores → Vertal Fluxos, salve o endereço, o e-mail e a senha no Cofre: ficam cifrados e o login é feito só no servidor.' },
    { title: 'Peça no chat', description: 'Diga, por exemplo, “liste meus fluxos”. O Vertal Chat pede a sua permissão antes de cada chamada.' },
  ],
  'vertal-agentes': [
    { title: 'Tenha uma instância do Vertal Agentes', description: 'Use o endereço https da sua instância e um usuário dela.' },
    { title: 'Guarde no Cofre de segredos', description: 'Em Conectores → Vertal Agentes, salve o endereço, o usuário e a senha no Cofre: ficam cifrados e o login é feito só no servidor.' },
    { title: 'Peça no chat', description: 'Diga, por exemplo, “liste meus agentes” ou “quando um agente detectar X, rode o fluxo Y”. O chat pede a sua permissão antes de cada chamada.' },
  ],
}

/** Palavras que nunca podem aparecer numa página pública (white-label). */
export const BANNED_PUBLIC_TERMS = [
  'automatisch', 'huginn', 'n8n', 'zapier', 'openai', 'openrouter', 'anthropic', 'claude', 'chatgpt',
  'gpt-', 'mistral', 'perplexity', 'together ai', 'tryhelix', 'gemini',
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.label]))

const CATEGORY_USES: Record<IntegrationCategory, (n: string) => string[]> = {
  ecosystem: (n) => [`Abrir o ${n} dentro do ${APP_NAME}.`, `Usar o ${n} pelo Vertal Chat.`, `Combinar o ${n} com os outros conectores em fluxos.`],
  development: (n) => [`Pedir ao Vertal Chat para consultar ou atualizar dados no ${n}.`, `Criar fluxos que reagem a eventos do ${n}.`, `Levar dados do ${n} para planilhas, CRMs ou mensagens.`],
  payments: (n) => [`Acompanhar transações do ${n} em tempo real.`, `Registrar pagamentos numa planilha automaticamente.`, `Avisar o time quando algo importante acontecer no ${n}.`],
  design: (n) => [`Gerar arquivos com o ${n} a partir de dados do app.`, `Automatizar tarefas repetitivas do ${n}.`, `Usar o ${n} pelo Vertal Chat.`],
  infrastructure: (n) => [`Consultar o ${n} pelo Vertal Chat.`, `Ligar o ${n} ao app criado no ${APP_NAME}.`, `Disparar alertas a partir de eventos do ${n}.`],
  communication: (n) => [`Enviar mensagens pelo ${n} a partir de um fluxo.`, `Avisar o time no ${n} sobre vendas, leads ou erros.`, `Responder pelo Vertal Chat com a sua aprovação.`],
  analytics: (n) => [`Receber relatórios do ${n} automaticamente.`, `Juntar números do ${n} numa planilha.`, `Ser avisado quando uma métrica do ${n} mudar.`],
}

/** Tira menções internas (nomes de segredos, motor) dos textos herdados do catálogo. */
function clean(text: string): string {
  return text
    .replace(/\s*\(?\b(AUTOMATISCH|HUGINN)_[A-Z_]+\b\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function integrationSlug(c: Pick<ConnectorConfig, 'slug'>): string {
  return SLUG_OVERRIDES[c.slug] ?? c.slug.replace(/^fluxos-/, '')
}

/** "1 ação", "3 ações". */
export function countPt(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Resumo de conexão próprio (o padrão do tipo de credencial não descreve bem). */
const CONNECT_SUMMARY_OVERRIDES: Record<string, string> = {
  'vertal-fluxos': 'Você guarda o endereço e o login da sua instância do Vertal Fluxos no Cofre de segredos; o login é feito só no servidor e nunca passa pela conversa.',
  'vertal-agentes': 'Você guarda o endereço e o login da sua instância do Vertal Agentes no Cofre de segredos; o login é feito só no servidor e nunca passa pela conversa.',
  'custom-rpc': 'Você informa a URL do seu endpoint RPC (e a chave, se ele exigir). O Vertal testa com um ping antes de salvar.',
}

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

function engineFor(c: ConnectorConfig): EngineAppInfo | undefined {
  const key = c.fluxosApp ?? ENGINE_APP_FOR_NATIVE[c.slug]
  return key ? ENGINE_APPS[key] : undefined
}

function connectInfo(c: ConnectorConfig, engine: EngineAppInfo | undefined): Pick<Integration, 'connectMode' | 'connectKind' | 'connectSummary' | 'steps'> {
  const n = c.name
  const isFluxosCard = c.slug.startsWith('fluxos-')
  if (!isFluxosCard) {
    const steps = STEP_OVERRIDES[integrationSlug(c)] ?? c.setupSteps.map((s) => ({ title: clean(s.title), description: clean(s.description) }))
    const override = CONNECT_SUMMARY_OVERRIDES[integrationSlug(c)]
    if (override) return { connectMode: 'key', connectKind: 'override', connectSummary: override, steps }
    if (c.mcpUrl || c.slug === 'vertal-app') {
      return { connectMode: 'oauth', connectKind: 'base-mcp', connectSummary: `A conexão usa OAuth: você entra com a sua conta do ${n} e autoriza, sem chave para copiar.`, steps }
    }
    if (c.authType === 'oauth') {
      return { connectMode: 'oauth', connectKind: 'base-oauth', connectSummary: `Você entra com a sua conta do ${n} (login oficial, OAuth) e autoriza o acesso. Não há chave para copiar.`, steps }
    }
    if (c.authType === 'manual' && c.slug.startsWith('vertal-')) {
      return { connectMode: 'account', connectKind: 'base-account', connectSummary: `Usa a sua própria conta do ${APP_NAME}: é só abrir, sem chave nem configuração.`, steps }
    }
    if (c.slug === 'whatsapp') {
      return { connectMode: 'key', connectKind: 'base-whatsapp', connectSummary: 'Você cola o token da WhatsApp Business Cloud API e o ID do número, testa a conexão e salva. O token fica cifrado no servidor.', steps }
    }
    return { connectMode: 'key', connectKind: 'base-key', connectSummary: `Você cola a credencial do ${n} (chave ou token) no formulário. Ela fica cifrada no servidor e nunca volta para o navegador.`, steps }
  }
  const open = { title: `Abra Conectores → ${n}`, description: `Crie a sua conta grátis no ${APP_NAME} e abra o cartão do ${n} em Conectores.` }
  const use = { title: 'Use pelo chat ou em fluxos', description: `Peça ao Vertal Chat, por exemplo, “use o ${n} para …”, ou monte um fluxo no Vertal Fluxos. Ações que mudam algo pedem a sua aprovação.` }
  const fields = engine?.fields.length ? joinPt(engine.fields) : ''
  if (engine?.auth === 'vertal-oauth') {
    return {
      connectMode: 'oauth',
      connectKind: 'fluxos-oauth',
      connectSummary: `Botão “Entrar com ${n}”: você faz login no próprio ${n} e autoriza o ${APP_NAME}. Não há chave para copiar.`,
      steps: [open, { title: `Toque em “Entrar com ${n}”`, description: `Você vai para o login oficial do ${n}, escolhe a conta e autoriza. O acesso fica guardado cifrado no servidor e pode ser revogado quando quiser.` }, use],
    }
  }
  if (engine?.auth === 'own-oauth') {
    return {
      connectMode: 'own-app',
      connectKind: 'fluxos-own',
      connectSummary: `Você informa ${fields || 'os dados do seu app'} do ${n} e entra com a sua conta para autorizar (login OAuth com o seu próprio app).`,
      steps: [open, { title: 'Informe os dados do seu app', description: `Preencha ${fields || 'os dados pedidos'} (o endereço de retorno aparece na tela) e entre com a sua conta do ${n} para autorizar.` }, use],
    }
  }
  return {
    connectMode: 'key',
    connectKind: fields ? 'fluxos-key' : 'fluxos-nofields',
    connectSummary: fields
      ? `Você informa ${fields} do ${n}. O ${APP_NAME} confere e guarda tudo cifrado no servidor.`
      : `Você informa o endereço que quer acompanhar; não há login nem chave.`,
    steps: [open, { title: fields ? 'Preencha o formulário' : 'Informe o endereço', description: fields ? `Informe ${fields}. Os dados ficam cifrados no servidor e nunca voltam para o navegador.` : 'Informe o endereço que o fluxo deve acompanhar.' }, use],
  }
}

const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** Parágrafo "o que o Vertal faz" dos apps do Vertal Fluxos, a partir das ações reais. */
function engineDetails(name: string, engine: EngineAppInfo | undefined): string {
  const acts = (engine?.actions ?? []).slice(0, 4).map(([n]) => lcFirst(n))
  const trig = (engine?.triggers ?? []).slice(0, 3).map(([n]) => lcFirst(n))
  const parts: string[] = []
  if (acts.length) parts.push(`o Vertal Chat pode ${joinPt(acts)} por você`)
  if (trig.length) parts.push(`os fluxos do Vertal Fluxos usam gatilhos e buscas como ${joinPt(trig)}`)
  const body = parts.length ? `Com o ${name} conectado, ${parts.join(', e ')}.` : `O ${name} fica disponível no Vertal Chat e nos fluxos.`
  return `${body} Tudo roda com a sua própria conta do ${name}, as credenciais ficam cifradas no servidor e ações que mudam algo pedem a sua aprovação antes.`
}

function faqFor(i: Omit<Integration, 'faq' | 'related'>): { q: string; a: string }[] {
  const n = i.name
  const examples = [...i.actions, ...i.triggers].slice(0, 4).map((a) => a.name.toLowerCase())
  const can = examples.length
    ? `O ${APP_NAME} oferece ${joinPt([i.actions.length ? countPt(i.actions.length, 'ação', 'ações') : '', i.triggers.length ? countPt(i.triggers.length, 'gatilho ou busca', 'gatilhos e buscas') : ''].filter(Boolean))}, por exemplo: ${joinPt(examples)}. Você usa pelo Vertal Chat (em português) ou monta fluxos no Vertal Fluxos.`
    : `${i.summary} Os recursos: ${joinPt(i.features)}.`
  const last = i.own
    ? { q: `O ${n} é do próprio Vertal?`, a: `Sim. O ${n} faz parte do Ecossistema Vertal e funciona junto com o ${APP_NAME}, o Vertal Chat e os outros conectores.` }
    : {
        q: `O ${APP_NAME} é parceiro oficial do ${n}?`,
        a: `Não. ${n} é marca de seus respectivos donos. O ${APP_NAME} se conecta pela API pública do serviço, com a sua autorização, e não tem afiliação nem endosso do ${n}.`,
      }
  return [
    { q: `Como fazer a integração do ${n} com o ${APP_NAME}?`, a: `${i.connectSummary} Depois disso o ${n} fica disponível no Vertal Chat e nos fluxos.` },
    { q: `O que dá para automatizar no ${n} com IA?`, a: can },
    { q: `Preciso saber programar para conectar o ${n}?`, a: `Não. Você descreve o que quer em português e o Vertal Chat usa o ${n} por você; toda ação que muda algo pede a sua aprovação antes. Quem programa pode ligar o ${n} aos apps criados no ${APP_NAME}.` },
    {
      q: `Quanto custa usar o ${n} no ${APP_NAME}?`,
      a: `Criar a conta e conectar o ${n} não tem custo no ${APP_NAME}. Ações executadas pelo Vertal Chat usam créditos do seu plano (${CHAT_ACTION_CREDITS} créditos por ação em apps do Vertal Fluxos, devolvidos se falhar).${i.own ? '' : ` O ${n} pode ter preços próprios.`}`,
    },
    last,
  ]
}

function build(): Integration[] {
  const list: Integration[] = []
  const bySlug = new Map<string, Integration>()
  for (const c of connectors) {
    if (c.status !== 'available') continue
    if (MERGED_INTO[c.slug]) continue
    const slug = integrationSlug(c)
    if (bySlug.has(slug)) throw new Error(`integrações: slug repetido "${slug}"`)
    const engine = engineFor(c)
    const content = INTEGRATION_CONTENT[slug]
    const fluxosCard = c.slug.startsWith('fluxos-')
    const item: Omit<Integration, 'faq' | 'related'> = {
      slug,
      name: c.name,
      category: c.category,
      categoryLabel: CATEGORY_LABEL[c.category] ?? c.category,
      logoUrl: c.logoUrl ?? LOGO_FALLBACK[c.slug],
      appPath: `/connectors/${c.slug}`,
      // Cartões com id interno (Vertal Fluxos/Agentes) voltam para o hub de Conectores.
      signupPath: `/auth?redirect=${encodeURIComponent(INTERNAL_IDS.has(c.slug) ? '/connectors' : fluxosCard ? `/connectors/${c.slug}/setup` : `/connectors/${c.slug}`)}`,
      about: content?.about ?? clean(c.description),
      summary: fluxosCard ? `${c.name} no Vertal Chat e no Vertal Fluxos: ações, gatilhos e buscas com a sua conta.` : clean(c.description),
      lead: fluxosCard || engine
        ? `Conecte o ${c.name} com IA: automação pelo Vertal Chat e em fluxos do Vertal Fluxos, sem programar.`
        : `Conecte o ${c.name} ao ${APP_NAME} e use com IA, sem programar.`,
      own: c.category === 'ecosystem' || c.slug === 'automatisch' || c.slug === 'huginn',
      details: fluxosCard ? engineDetails(c.name, engine) : clean(c.longDescription),
      aliases: content?.aliases ?? [],
      features: c.features.map(clean),
      actions: (engine?.actions ?? []).map(([name, description]) => ({ name, description })),
      triggers: (engine?.triggers ?? []).map(([name, description]) => ({ name, description })),
      ...connectInfo(c, engine),
      fields: fluxosCard ? (engine?.fields ?? []) : [],
      fluxosCard,
      engineApp: c.fluxosApp ?? ENGINE_APP_FOR_NATIVE[c.slug],
      uses: content?.uses?.length ? content.uses : CATEGORY_USES[c.category](c.name),
      officialUrl: c.docsUrl,
    }
    const full: Integration = { ...item, faq: faqFor(item), related: [] }
    bySlug.set(slug, full)
    list.push(full)
  }
  // Links internos: até 6 da mesma categoria (vizinhos na ordem alfabética) + populares.
  const POPULAR = ['google-sheets', 'gmail', 'notion', 'whatsapp', 'slack', 'hubspot']
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  for (const i of list) {
    const same = sorted.filter((o) => o.category === i.category && o.slug !== i.slug)
    const idx = sorted.indexOf(i)
    same.sort((a, b) => Math.abs(sorted.indexOf(a) - idx) - Math.abs(sorted.indexOf(b) - idx))
    const rel = same.slice(0, 6).map((o) => o.slug)
    for (const p of POPULAR) if (rel.length < 8 && p !== i.slug && !rel.includes(p) && bySlug.has(p)) rel.push(p)
    i.related = rel
  }
  return sorted
}

/** Todas as páginas de integração, em ordem alfabética. */
export const INTEGRATIONS: Integration[] = build()

export function findIntegration(slug: string | undefined): Integration | undefined {
  return slug ? INTEGRATIONS.find((i) => i.slug === slug) : undefined
}

export function integrationPath(i: Pick<Integration, 'slug'>): string {
  return `${INTEGRATIONS_PATH}/${i.slug}`
}

/** Grupos do índice, na ordem das categorias do catálogo. */
export function integrationGroups(): { id: IntegrationCategory; label: string; items: Integration[] }[] {
  return categories
    .filter((c) => c.id !== 'all')
    .map((c) => ({ id: c.id as IntegrationCategory, label: c.label, items: INTEGRATIONS.filter((i) => i.category === c.id) }))
    .filter((g) => g.items.length)
}

function firstFitting(options: string[], max: number): string {
  return options.find((o) => o.length <= max) ?? options[options.length - 1]
}

export interface IntegrationSeo {
  title: string
  description: string
  heading: string
  keywords: string
}

export function integrationSeo(i: Integration): IntegrationSeo {
  // Nome curto para título/descrição: "Microsoft 365 (OneDrive e To Do)" → "Microsoft 365".
  const n = i.name.length > 22 ? i.name.replace(/\s*\([^)]*\)\s*$/, '') : i.name
  const title = firstFitting(
    [
      `Integração ${n} com IA: automação e API | ${APP_NAME}`,
      `Integração ${n} com IA e automação | ${APP_NAME}`,
      `Integração ${n} com IA | ${APP_NAME}`,
      `${n} + ${APP_NAME}`,
    ],
    TITLE_MAX,
  )
  const all = [...i.actions, ...i.triggers].map((a) => a.name.charAt(0).toLowerCase() + a.name.slice(1))
  const total = all.length
  const lcAbout = (i.about.charAt(0).toLowerCase() + i.about.slice(1)).replace(/\.$/, '')
  const what = (ex: string[]) =>
    total >= 3 ? `${total} ações e gatilhos, como ${joinPt(ex)}` : `recursos como ${joinPt(ex)}`
  const description = firstFitting(
    [
      ...(total
        ? [
            `Conecte ${n} com IA no ${APP_NAME}: ${what(all.slice(0, 2))}. Automação pelo chat e em fluxos. Comece grátis.`,
            `Conecte ${n} com IA no ${APP_NAME}: ${what(all.slice(0, 2))}. Comece grátis.`,
            `Conecte ${n} com IA no ${APP_NAME}: ${what(all.slice(0, 1))}. Comece grátis.`,
          ]
        : [
            `Integração ${n} com IA no ${APP_NAME}: ${lcAbout}. Comece grátis.`,
          ]),
      `Conecte ${n} com IA no ${APP_NAME}: automação pelo chat e em fluxos, sem programar. Comece grátis.`,
      `Integração ${n} com IA no ${APP_NAME}. Comece grátis.`,
    ],
    DESCRIPTION_MAX,
  )
  const keywords = [
    `${n} integração`, `integração ${n}`, `${n} API automação`, `conectar ${n} com IA`, `${n} + Vertal`,
    ...i.aliases.map((a) => `${a} integração`),
  ].join(', ')
  return { title, description, heading: `Integração ${i.name} com o ${APP_NAME}`, keywords }
}

export const INTEGRATIONS_INDEX_SEO = {
  title: firstFitting(
    [`Integrações: ${INTEGRATIONS.length} conectores com IA | ${APP_NAME}`, `Integrações | ${APP_NAME}`],
    TITLE_MAX,
  ),
  description: firstFitting(
    [
      `Conecte Gmail, Google Sheets, Notion, WhatsApp, Slack, HubSpot e mais ${INTEGRATIONS.length - 6} apps ao ${APP_NAME}. Automação com IA pelo chat e em fluxos.`,
      `${INTEGRATIONS.length} integrações com IA no ${APP_NAME}.`,
    ],
    DESCRIPTION_MAX,
  ),
  heading: `Integrações do ${APP_NAME}`,
}

export const TRADEMARK_NOTICE = `Todas as marcas citadas pertencem aos respectivos donos. O ${APP_NAME} não tem afiliação, parceria ou endosso dessas empresas; os nomes aparecem só para identificar os apps que você pode conectar.`
