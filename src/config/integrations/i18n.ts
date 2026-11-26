/**
 * Traduções das páginas de integração (21 idiomas além do pt-BR).
 *
 * Todo texto traduzível tem uma chave estável (`integrationSourceStrings()` devolve o
 * texto-fonte em pt-BR). As traduções ficam em `i18n/<código>.json` (geradas por
 * `scripts/integrations-i18n.ts` e revisáveis à mão). No build, cada página de cada idioma
 * é montada a partir desses dados; chave sem tradução cai no inglês e, sem inglês, no
 * pt-BR — então conector novo ganha página em todos os idiomas no mesmo build e o texto
 * traduzido chega quando o script roda de novo.
 * Nomes de apps e de produtos (Vertal Chat, Vertal Fluxos…) nunca são traduzidos.
 */
import { APP_NAME } from '../brand'
import { categories } from '../../lib/connectorsConfig'
import { ENGINE_APPS } from './engineApps'
import { INTEGRATION_CONTENT } from './content'
import { INTEGRATIONS, CHAT_ACTION_CREDITS, TRADEMARK_NOTICE, type Integration } from './index'
import type { IntegrationLocale } from './locales'

export type Dict = Record<string, string>

/** Modelos com marcadores: {name} app, {app} produto, {n}/{a}/{t} números, {list}/{fields} listas. */
export const TEMPLATES_PT: Dict = {
  hub: 'Integrações',
  hubHeading: 'Integrações do {app}',
  hubTitle: 'Integrações: {n} conectores com IA | {app}',
  hubDesc: 'Conecte Gmail, Google Sheets, Notion, WhatsApp, Slack, HubSpot e mais {n} apps ao {app}. Automação com IA pelo chat e em fluxos.',
  hubIntro: 'Cada integração tem uma página com o que dá para fazer, como conectar e exemplos.',
  title1: 'Integração {name} com IA: automação e API | {app}',
  title2: 'Integração {name} com IA e automação | {app}',
  title3: 'Integração {name} com IA | {app}',
  desc1: 'Conecte {name} com IA no {app}: {n} ações e gatilhos, como {list}. Automação pelo chat e em fluxos. Comece grátis.',
  desc2: 'Conecte {name} com IA no {app}: {n} ações e gatilhos, como {list}. Comece grátis.',
  descFew: 'Conecte {name} com IA no {app}: recursos como {list}. Comece grátis.',
  descGeneric: 'Conecte {name} com IA no {app}: automação pelo chat e em fluxos, sem programar. Comece grátis.',
  descShort: 'Integração {name} com IA no {app}. Comece grátis.',
  keywords: 'integração {name}, {name} API, automação {name}, conectar {name} com IA, {name} + Vertal',
  heading: 'Integração {name} com o {app}',
  leadFlow: 'Conecte o {name} com IA: automação pelo Vertal Chat e em fluxos do Vertal Fluxos, sem programar.',
  leadBase: 'Conecte o {name} ao {app} e use com IA, sem programar.',
  summaryFlow: '{name} no Vertal Chat e no Vertal Fluxos: ações, gatilhos e buscas com a sua conta.',
  detailsFlow: 'Com o {name} conectado, o Vertal Chat executa por você as ações listadas abaixo e os fluxos do Vertal Fluxos usam os gatilhos e as buscas. Tudo roda com a sua própria conta do {name}, as credenciais ficam cifradas no servidor e ações que mudam algo pedem a sua aprovação antes.',
  alsoSearched: 'Também pesquisado como:',
  ctaConnect: 'Conectar o {name} grátis',
  ctaSignup: 'Criar conta grátis e conectar o {name}',
  ctaStart: 'Começar grátis no {app}',
  hWhat: 'O que é o {name}',
  hDoes: 'O que o {app} faz com o {name}',
  hActions: 'Ações do {name}',
  hTriggers: 'Gatilhos e buscas do {name}',
  hConnect: 'Como conectar o {name}',
  hUses: 'Exemplos de uso do {name} com IA',
  hFaq: 'Perguntas frequentes sobre a integração {name}',
  hRelated: 'Integrações relacionadas',
  relatedItem: 'Integração {name}',
  seeAll: 'Ver todas as {n} integrações',
  docs: 'Documentação de conectores',
  official: 'Site oficial:',
  logoAlt: 'Logo do {name}',
  languages: 'Idiomas',
  trademark: TRADEMARK_NOTICE,
  cBaseMcp: 'A conexão usa OAuth: você entra com a sua conta do {name} e autoriza, sem chave para copiar.',
  cBaseOauth: 'Você entra com a sua conta do {name} (login oficial, OAuth) e autoriza o acesso. Não há chave para copiar.',
  cBaseAccount: 'Usa a sua própria conta do {app}: é só abrir, sem chave nem configuração.',
  cBaseWhatsapp: 'Você cola o token da WhatsApp Business Cloud API e o ID do número, testa a conexão e salva. O token fica cifrado no servidor.',
  cBaseKey: 'Você cola a credencial do {name} (chave ou token) no formulário. Ela fica cifrada no servidor e nunca volta para o navegador.',
  cFlowOauth: 'Botão “Entrar com {name}”: você faz login no próprio {name} e autoriza o {app}. Não há chave para copiar.',
  cFlowOwn: 'Você informa {fields} do seu app no {name} e entra com a sua conta para autorizar (login OAuth com o seu próprio app).',
  cFlowKey: 'Você informa {fields} do {name}. O {app} confere e guarda tudo cifrado no servidor.',
  cFlowNoFields: 'Você informa o endereço que quer acompanhar; não há login nem chave.',
  sOpenT: 'Abra Conectores → {name}',
  sOpenD: 'Crie a sua conta grátis no {app} e abra o cartão do {name} em Conectores.',
  sOauthT: 'Toque em “Entrar com {name}”',
  sOauthD: 'Você vai para o login oficial do {name}, escolhe a conta e autoriza. O acesso fica guardado cifrado no servidor e pode ser revogado quando quiser.',
  sOwnT: 'Informe os dados do seu app',
  sOwnD: 'Preencha {fields} (o endereço de retorno aparece na tela) e entre com a sua conta do {name} para autorizar.',
  sKeyT: 'Preencha o formulário',
  sKeyD: 'Informe {fields}. Os dados ficam cifrados no servidor e nunca voltam para o navegador.',
  sNoFieldsT: 'Informe o endereço',
  sNoFieldsD: 'Informe o endereço que o fluxo deve acompanhar.',
  sUseT: 'Use pelo chat ou em fluxos',
  sUseD: 'Peça ao Vertal Chat, por exemplo, “use o {name} para …”, ou monte um fluxo no Vertal Fluxos. Ações que mudam algo pedem a sua aprovação.',
  fq1: 'Como fazer a integração do {name} com o {app}?',
  fa1: 'Depois disso o {name} fica disponível no Vertal Chat e nos fluxos.',
  fq2: 'O que dá para automatizar no {name} com IA?',
  fa2Engine: 'Ações: {a}. Gatilhos e buscas: {t}. Exemplos: {list}. Você usa pelo Vertal Chat ou monta fluxos no Vertal Fluxos.',
  fa2Base: 'Recursos: {list}.',
  fq3: 'Preciso saber programar para conectar o {name}?',
  fa3: 'Não. Você descreve o que quer no Vertal Chat e ele usa o {name} por você; toda ação que muda algo pede a sua aprovação antes. Quem programa pode ligar o {name} aos apps criados no {app}.',
  fq4: 'Quanto custa usar o {name} no {app}?',
  fa4: 'Criar a conta e conectar o {name} não tem custo no {app}. Ações executadas pelo Vertal Chat usam créditos do seu plano ({n} créditos por ação em apps do Vertal Fluxos, devolvidos se falhar).',
  fa4Third: 'O {name} pode ter preços próprios.',
  fq5: 'O {app} é parceiro oficial do {name}?',
  fa5: 'Não. {name} é marca de seus respectivos donos. O {app} se conecta pela API pública do serviço, com a sua autorização, e não tem afiliação nem endosso do {name}.',
  fq5Own: 'O {name} é do próprio Vertal?',
  fa5Own: 'Sim. O {name} faz parte do Ecossistema Vertal e funciona junto com o {app}, o Vertal Chat e os outros conectores.',
}

const FLUXOS_FEATURES = ['Via Vertal Fluxos', 'Ações e buscas pelo Vertal Chat', 'Credenciais guardadas no servidor']

/** Todo texto-fonte (pt-BR) por chave. */
export function integrationSourceStrings(): Dict {
  const out: Dict = {}
  for (const [k, v] of Object.entries(TEMPLATES_PT)) out[`t.${k}`] = v
  for (const c of categories) if (c.id !== 'all') out[`cat.${c.id}`] = c.label
  FLUXOS_FEATURES.forEach((f, idx) => (out[`ff.${idx}`] = f))
  for (const app of Object.values(ENGINE_APPS)) for (const f of app.fields) out[`f.${f}`] = f
  const usedApps = new Set(INTEGRATIONS.map((i) => i.engineApp).filter(Boolean) as string[])
  for (const [key, app] of Object.entries(ENGINE_APPS)) {
    if (!usedApps.has(key)) continue
    app.actions.forEach(([n, d], idx) => { out[`e.${key}.a.${idx}.n`] = n; out[`e.${key}.a.${idx}.d`] = d })
    app.triggers.forEach(([n, d], idx) => { out[`e.${key}.t.${idx}.n`] = n; out[`e.${key}.t.${idx}.d`] = d })
  }
  for (const i of INTEGRATIONS) {
    const p = `c.${i.slug}`
    out[`${p}.about`] = i.about
    i.uses.forEach((u, idx) => (out[`${p}.use.${idx}`] = u))
    const extraFaq = INTEGRATION_CONTENT[i.slug]?.faq ?? []
    extraFaq.forEach((f, idx) => { out[`${p}.faq.${idx}.q`] = f.q; out[`${p}.faq.${idx}.a`] = f.a })
    if (!i.fluxosCard) {
      out[`${p}.summary`] = i.summary
      out[`${p}.details`] = i.details
      i.features.forEach((f, idx) => (out[`${p}.feature.${idx}`] = f))
      i.steps.forEach((s, idx) => { out[`${p}.step.${idx}.t`] = s.title; out[`${p}.step.${idx}.d`] = s.description })
      if (i.connectKind === 'override') out[`${p}.connect`] = i.connectSummary
    }
  }
  // Conteúdo escrito à mão para conectores que ainda não estão no catálogo não entra.
  return out
}

export interface LocalizedIntegration {
  slug: string
  name: string
  logoUrl?: string
  aliases: string[]
  category: string
  title: string
  description: string
  keywords: string
  heading: string
  summary: string
  lead: string
  about: string
  details: string
  features: string[]
  actions: { name: string; description: string }[]
  triggers: { name: string; description: string }[]
  connectSummary: string
  steps: { title: string; description: string }[]
  uses: string[]
  faq: { q: string; a: string }[]
  related: string[]
  signupPath: string
  officialUrl?: string
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

function listFormat(lang: string, items: string[]): string {
  if (!items.length) return ''
  try {
    // Intl.ListFormat (ES2021) existe no Node e nos navegadores; o lib do tsconfig é mais antigo.
    const LF = (Intl as unknown as { ListFormat: new (l: string, o: object) => { format(i: string[]): string } }).ListFormat
    return new LF(lang, { style: 'long', type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

const firstFitting = (options: string[], max: number) => options.find((o) => o.length <= max) ?? options[options.length - 1]

/** Texto traduzido de uma chave: idioma → inglês → pt-BR. */
export function makeT(dict: Dict, en: Dict, src: Dict) {
  return (key: string): string => dict[key] || en[key] || src[key] || ''
}

export function localizeIntegration(
  i: Integration,
  l: IntegrationLocale,
  tr: (key: string) => string,
  limits: { title: number; description: number },
): LocalizedIntegration {
  const name = i.name
  const shortName = name.length > 22 ? name.replace(/\s*\([^)]*\)\s*$/, '') : name
  const v = { name, app: APP_NAME }
  const T = (k: string, extra: Record<string, string | number> = {}) => fill(tr(`t.${k}`), { ...v, ...extra })
  const p = `c.${i.slug}`
  const eng = i.engineApp ? ENGINE_APPS[i.engineApp] : undefined
  const actions = eng ? eng.actions.map((_, idx) => ({ name: tr(`e.${i.engineApp}.a.${idx}.n`), description: tr(`e.${i.engineApp}.a.${idx}.d`) })) : []
  const triggers = eng ? eng.triggers.map((_, idx) => ({ name: tr(`e.${i.engineApp}.t.${idx}.n`), description: tr(`e.${i.engineApp}.t.${idx}.d`) })) : []
  const fields = listFormat(l.lang, i.fields.map((f) => tr(`f.${f}`)))
  const all = [...actions, ...triggers].map((a) => a.name)

  const connectSummary = {
    override: tr(`${p}.connect`),
    'base-mcp': T('cBaseMcp'),
    'base-oauth': T('cBaseOauth'),
    'base-account': T('cBaseAccount'),
    'base-whatsapp': T('cBaseWhatsapp'),
    'base-key': T('cBaseKey'),
    'fluxos-oauth': T('cFlowOauth'),
    'fluxos-own': T('cFlowOwn', { fields }),
    'fluxos-key': T('cFlowKey', { fields }),
    'fluxos-nofields': T('cFlowNoFields'),
  }[i.connectKind]

  let steps: { title: string; description: string }[]
  if (!i.fluxosCard) {
    steps = i.steps.map((_, idx) => ({ title: tr(`${p}.step.${idx}.t`), description: tr(`${p}.step.${idx}.d`) }))
  } else {
    const middle = {
      'fluxos-oauth': { title: T('sOauthT'), description: T('sOauthD') },
      'fluxos-own': { title: T('sOwnT'), description: T('sOwnD', { fields }) },
      'fluxos-key': { title: T('sKeyT'), description: T('sKeyD', { fields }) },
    }[i.connectKind as 'fluxos-oauth' | 'fluxos-own' | 'fluxos-key'] ?? { title: T('sNoFieldsT'), description: T('sNoFieldsD') }
    steps = [{ title: T('sOpenT'), description: T('sOpenD') }, middle, { title: T('sUseT'), description: T('sUseD') }]
  }

  const features = i.fluxosCard ? FLUXOS_FEATURES.map((_, idx) => tr(`ff.${idx}`)) : i.features.map((_, idx) => tr(`${p}.feature.${idx}`))
  const summary = i.fluxosCard ? T('summaryFlow') : tr(`${p}.summary`)
  const faq = [
    { q: T('fq1'), a: `${connectSummary} ${T('fa1')}` },
    {
      q: T('fq2'),
      a: all.length
        ? T('fa2Engine', { a: actions.length, t: triggers.length, list: listFormat(l.lang, all.slice(0, 4)) })
        : `${summary} ${T('fa2Base', { list: listFormat(l.lang, features) })}`,
    },
    ...(INTEGRATION_CONTENT[i.slug]?.faq ?? []).map((_, idx) => ({ q: tr(`${p}.faq.${idx}.q`), a: tr(`${p}.faq.${idx}.a`) })),
    { q: T('fq3'), a: T('fa3') },
    { q: T('fq4'), a: `${T('fa4', { n: CHAT_ACTION_CREDITS })}${i.own ? '' : ` ${T('fa4Third')}`}` },
    i.own ? { q: T('fq5Own'), a: T('fa5Own') } : { q: T('fq5'), a: T('fa5') },
  ]

  const sv = { name: shortName, app: APP_NAME }
  const title = firstFitting(['title1', 'title2', 'title3'].map((k) => fill(tr(`t.${k}`), sv)), limits.title)
  const many = all.length >= 3
  const ex = (n: number) => listFormat(l.lang, all.slice(0, n))
  const description = firstFitting(
    [
      ...(all.length
        ? many
          ? [fill(tr('t.desc1'), { ...sv, n: all.length, list: ex(2) }), fill(tr('t.desc2'), { ...sv, n: all.length, list: ex(2) }), fill(tr('t.desc2'), { ...sv, n: all.length, list: ex(1) })]
          : [fill(tr('t.descFew'), { ...sv, list: ex(2) })]
        : []),
      fill(tr('t.descGeneric'), sv),
      fill(tr('t.descShort'), sv),
    ],
    limits.description,
  )

  return {
    slug: i.slug,
    name,
    logoUrl: i.logoUrl,
    aliases: i.aliases,
    category: tr(`cat.${i.category}`),
    title,
    description,
    keywords: [fill(tr('t.keywords'), v), ...i.aliases].join(', '),
    heading: T('heading'),
    summary,
    lead: i.fluxosCard || i.engineApp ? T('leadFlow') : T('leadBase'),
    about: tr(`${p}.about`),
    details: i.fluxosCard ? T('detailsFlow') : tr(`${p}.details`),
    features,
    actions,
    triggers,
    connectSummary,
    steps,
    uses: i.uses.map((_, idx) => tr(`${p}.use.${idx}`)),
    faq,
    related: i.related,
    signupPath: i.signupPath,
    officialUrl: i.officialUrl,
  }
}
