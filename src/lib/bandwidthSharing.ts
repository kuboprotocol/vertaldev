/**
 * Compartilhamento de banda ociosa: consentimento (opt-in) por usuário + dispositivo.
 *
 * Regras (não negociáveis):
 *   - DESLIGADO por padrão. Só liga quando o próprio usuário aceita na tela de consentimento.
 *   - Nada liga sozinho, nada fica escondido: o estado aparece em Recompensas e no Perfil,
 *     e dá para desligar a qualquer momento.
 *   - Nenhum SDK do parceiro está integrado ainda. Quando estiver, ele só pode rodar se
 *     `canRunBandwidthSharing` devolver true (flag do SDK ligada E consentimento ativo).
 *
 * Armazenamento: função `set_bandwidth_sharing_consent` + tabela `bandwidth_sharing_consents`
 * (migração 20261127180000, ainda não aplicada). Enquanto a migração não existir no banco, a escolha
 * fica salva só neste navegador (localStorage) e é enviada ao servidor na próxima vez que ele responder.
 */
import { supabase } from '@/integrations/supabase/client'
import { BANDWIDTH_SHARING_FLAGS } from '@/config/features'

export const BANDWIDTH_PARTNER_NAME = 'Pawns.app'
export const BANDWIDTH_PROVIDER_ID = 'pawns'
/** Muda quando o texto do consentimento muda de forma relevante (vai junto com cada registro). */
export const BANDWIDTH_CONSENT_VERSION = '2026-11-27'
export const BANDWIDTH_PRIVACY_PATH = '/privacy#compartilhamento-de-banda'
export const BANDWIDTH_SETTINGS_ANCHOR = 'compartilhar-conexao'

const DEVICE_KEY = 'vertal.bandwidth.device_id'
const CONSENT_KEY = 'vertal.bandwidth.consent'
const PROMO_DISMISSED_KEY = 'vertal.bandwidth.promo_dismissed'

export interface BandwidthConsent {
  optedIn: boolean
  /** ISO da última mudança (aceite ou revogação). null = nunca escolheu (desligado). */
  updatedAt: string | null
  optedInAt: string | null
  optedOutAt: string | null
  version: string
  /** true quando a escolha está só neste navegador e ainda precisa ir para o servidor. */
  pendingSync?: boolean
  /** Dono da escolha salva só no navegador (para não valer para outra conta no mesmo aparelho). */
  userId?: string
}

export const DEFAULT_CONSENT: BandwidthConsent = {
  optedIn: false,
  updatedAt: null,
  optedInAt: null,
  optedOutAt: null,
  version: BANDWIDTH_CONSENT_VERSION,
}

/** Única porta para o SDK rodar: flag do SDK ligada E consentimento ativo na versão atual. */
export function canRunBandwidthSharing(
  consent: BandwidthConsent | null | undefined,
  sdkEnabled: boolean = BANDWIDTH_SHARING_FLAGS.sdk,
): boolean {
  return Boolean(sdkEnabled && consent?.optedIn === true && consent.optedInAt)
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Id estável deste navegador/dispositivo (não é fingerprint: é aleatório e fica no localStorage). */
export function getBandwidthDeviceId(): string {
  const s = storage()
  const saved = s?.getItem(DEVICE_KEY)
  if (saved && saved.length >= 8 && saved.length <= 128) return saved
  const id = randomId()
  s?.setItem(DEVICE_KEY, id)
  return id
}

export function readLocalConsent(): BandwidthConsent {
  const raw = storage()?.getItem(CONSENT_KEY)
  if (!raw) return { ...DEFAULT_CONSENT }
  try {
    const v = JSON.parse(raw) as Partial<BandwidthConsent>
    return {
      ...DEFAULT_CONSENT,
      ...v,
      // Consentimento de outra versão do texto não vale: volta a desligado até aceitar de novo.
      optedIn: v.optedIn === true && v.version === BANDWIDTH_CONSENT_VERSION,
    }
  } catch {
    return { ...DEFAULT_CONSENT }
  }
}

export function writeLocalConsent(consent: BandwidthConsent): void {
  storage()?.setItem(CONSENT_KEY, JSON.stringify(consent))
}

export function isPromoDismissed(): boolean {
  return storage()?.getItem(PROMO_DISMISSED_KEY) === '1'
}

export function dismissPromo(): void {
  storage()?.setItem(PROMO_DISMISSED_KEY, '1')
}

/** Escolha nova, feita agora pelo usuário. */
export function nextConsent(prev: BandwidthConsent, optedIn: boolean, now = new Date()): BandwidthConsent {
  const at = now.toISOString()
  return {
    optedIn,
    version: BANDWIDTH_CONSENT_VERSION,
    updatedAt: at,
    optedInAt: optedIn ? at : prev.optedInAt,
    optedOutAt: optedIn ? prev.optedOutAt : at,
  }
}

// ---- Servidor (tipos fora do types.ts gerado, porque a migração ainda não foi aplicada) ----------

interface ConsentRow {
  opted_in: boolean
  consent_version: string
  opted_in_at: string | null
  opted_out_at: string | null
  updated_at: string
}

type LooseResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>
interface LooseClient {
  rpc: (fn: string, args: Record<string, unknown>) => LooseResult<ConsentRow & { ok?: boolean }>
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => { maybeSingle: () => LooseResult<ConsentRow> }
        }
      }
    }
  }
}
const db = supabase as unknown as LooseClient

function fromRow(row: ConsentRow): BandwidthConsent {
  return {
    optedIn: row.opted_in === true && row.consent_version === BANDWIDTH_CONSENT_VERSION,
    version: row.consent_version,
    updatedAt: row.updated_at,
    optedInAt: row.opted_in_at,
    optedOutAt: row.opted_out_at,
  }
}

/** Lê o consentimento deste dispositivo no servidor. `null` = servidor ainda sem a tabela / fora do ar. */
export async function fetchServerConsent(userId: string, deviceId: string): Promise<BandwidthConsent | null | 'none'> {
  try {
    const { data, error } = await db
      .from('bandwidth_sharing_consents')
      .select('opted_in, consent_version, opted_in_at, opted_out_at, updated_at')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .eq('provider', BANDWIDTH_PROVIDER_ID)
      .maybeSingle()
    if (error) return null
    return data ? fromRow(data) : 'none'
  } catch {
    return null
  }
}

/** Grava a escolha no servidor. Devolve o estado salvo, ou null se o servidor não aceitou. */
export async function saveServerConsent(deviceId: string, optedIn: boolean): Promise<BandwidthConsent | null> {
  try {
    const { data, error } = await db.rpc('set_bandwidth_sharing_consent', {
      _device_id: deviceId,
      _opted_in: optedIn,
      _consent_version: BANDWIDTH_CONSENT_VERSION,
      _platform: 'web',
      _provider: BANDWIDTH_PROVIDER_ID,
      _source: 'web',
    })
    if (error || !data) return null
    return fromRow(data)
  } catch {
    return null
  }
}

// ---- Textos (pt-BR, en, es) ---------------------------------------------------------------------

export type BwLang = 'pt' | 'en' | 'es'

export function bwLang(hint: string | null | undefined): BwLang {
  const s = (hint ?? '').toLowerCase()
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('en')) return 'en'
  return 'pt'
}

export interface BwTexts {
  promoEyebrow: string
  promoTitle: string
  promoSubtitle: string
  promoCta: string
  promoDismiss: string
  promoPoints: string[]
  title: string
  intro: string
  sharedTitle: string
  shared: string[]
  notSharedTitle: string
  notShared: string[]
  control: string
  toggleLabel: string
  toggleOn: string
  toggleOff: string
  acceptedAt: (when: string) => string
  revokedAt: (when: string) => string
  privacy: string
  partner: string
  noSdkYet: string
  localOnly: string
  signInToEnable: string
  saved: string
  revoked: string
  saveError: string
  close: string
  openSettings: string
}

export const BW_UI: Record<BwLang, BwTexts> = {
  pt: {
    promoEyebrow: 'Créditos extras',
    promoTitle: 'Compartilhe sua banda e ganhe créditos',
    promoSubtitle: 'Use seus créditos à vontade dentro do Vertal Dev.',
    promoCta: 'Saiba mais e ativar',
    promoDismiss: 'Dispensar',
    promoPoints: ['Opcional e desligado por padrão', 'Só a internet que você não está usando', 'Desligue quando quiser'],
    title: 'Compartilhe sua conexão ociosa e ganhe créditos extras',
    intro:
      `Se você ativar, este dispositivo passa a compartilhar uma parte da internet que você não está usando com a rede de um parceiro (${BANDWIDTH_PARTNER_NAME}). Empresas usam essa rede para tarefas como verificar anúncios, comparar preços e testar sites em outras regiões. Em troca, você ganha créditos extras no Vertal Dev.`,
    sharedTitle: 'O que é compartilhado',
    shared: [
      'Só a banda de internet ociosa (a parte que você não está usando)',
      'O seu endereço IP, como ponto de saída das conexões do parceiro',
    ],
    notSharedTitle: 'O que NÃO é compartilhado',
    notShared: [
      'Seus arquivos, senhas, mensagens ou histórico de navegação',
      'O conteúdo dos seus projetos no Vertal Dev',
      'Acesso à sua rede local ou a outros aparelhos da casa',
    ],
    control:
      'É opcional e fica desligado até você ativar aqui. Você pode desligar a qualquer momento, nesta mesma chave, em Recompensas ou no seu Perfil.',
    toggleLabel: 'Compartilhar minha conexão ociosa',
    toggleOn: 'Ativado neste dispositivo',
    toggleOff: 'Desligado',
    acceptedAt: (w) => `Você aceitou em ${w}.`,
    revokedAt: (w) => `Você desligou em ${w}.`,
    privacy: 'Política de privacidade',
    partner: `Parceiro de rede: ${BANDWIDTH_PARTNER_NAME}`,
    noSdkYet:
      'O compartilhamento ainda não começou: estamos finalizando a integração. Seu aceite fica registrado e nada roda antes disso.',
    localOnly: 'Escolha salva neste navegador; vamos sincronizar com a sua conta assim que possível.',
    signInToEnable: 'Entrar para ativar',
    saved: 'Compartilhamento ativado. Obrigado!',
    revoked: 'Compartilhamento desligado.',
    saveError: 'Não deu para salvar agora. Tente de novo em instantes.',
    close: 'Fechar',
    openSettings: 'Gerenciar',
  },
  en: {
    promoEyebrow: 'Extra credits',
    promoTitle: 'Share your bandwidth and earn credits',
    promoSubtitle: 'Spend your credits however you like inside Vertal Dev.',
    promoCta: 'Learn more and turn on',
    promoDismiss: 'Dismiss',
    promoPoints: ['Optional and off by default', 'Only internet you are not using', 'Turn it off anytime'],
    title: 'Share your idle connection and earn extra credits',
    intro:
      `If you turn this on, this device shares part of the internet you are not using with a partner network (${BANDWIDTH_PARTNER_NAME}). Businesses use that network for things like ad verification, price comparison and testing websites from other regions. In return, you earn extra credits in Vertal Dev.`,
    sharedTitle: 'What is shared',
    shared: ['Only idle internet bandwidth (the part you are not using)', 'Your IP address, as an exit point for the partner’s connections'],
    notSharedTitle: 'What is NOT shared',
    notShared: [
      'Your files, passwords, messages or browsing history',
      'The content of your Vertal Dev projects',
      'Access to your local network or other devices at home',
    ],
    control: 'It is optional and stays off until you turn it on here. You can turn it off anytime, with this same switch, in Rewards or in your Profile.',
    toggleLabel: 'Share my idle connection',
    toggleOn: 'On for this device',
    toggleOff: 'Off',
    acceptedAt: (w) => `You agreed on ${w}.`,
    revokedAt: (w) => `You turned it off on ${w}.`,
    privacy: 'Privacy policy',
    partner: `Network partner: ${BANDWIDTH_PARTNER_NAME}`,
    noSdkYet: 'Sharing has not started yet: we are finishing the integration. Your choice is recorded and nothing runs before then.',
    localOnly: 'Choice saved in this browser; we will sync it to your account as soon as possible.',
    signInToEnable: 'Sign in to turn on',
    saved: 'Sharing turned on. Thank you!',
    revoked: 'Sharing turned off.',
    saveError: 'Could not save right now. Please try again in a moment.',
    close: 'Close',
    openSettings: 'Manage',
  },
  es: {
    promoEyebrow: 'Créditos extra',
    promoTitle: 'Comparte tu ancho de banda y gana créditos',
    promoSubtitle: 'Usa tus créditos como quieras dentro de Vertal Dev.',
    promoCta: 'Más información y activar',
    promoDismiss: 'Descartar',
    promoPoints: ['Opcional y desactivado por defecto', 'Solo internet que no estás usando', 'Desactívalo cuando quieras'],
    title: 'Comparte tu conexión inactiva y gana créditos extra',
    intro:
      `Si lo activas, este dispositivo comparte una parte del internet que no estás usando con la red de un socio (${BANDWIDTH_PARTNER_NAME}). Las empresas usan esa red para verificar anuncios, comparar precios y probar sitios desde otras regiones. A cambio, ganas créditos extra en Vertal Dev.`,
    sharedTitle: 'Qué se comparte',
    shared: ['Solo el ancho de banda inactivo (la parte que no estás usando)', 'Tu dirección IP, como punto de salida de las conexiones del socio'],
    notSharedTitle: 'Qué NO se comparte',
    notShared: [
      'Tus archivos, contraseñas, mensajes o historial de navegación',
      'El contenido de tus proyectos en Vertal Dev',
      'Acceso a tu red local u otros dispositivos de tu casa',
    ],
    control: 'Es opcional y queda desactivado hasta que lo actives aquí. Puedes desactivarlo cuando quieras, con este mismo interruptor, en Recompensas o en tu Perfil.',
    toggleLabel: 'Compartir mi conexión inactiva',
    toggleOn: 'Activado en este dispositivo',
    toggleOff: 'Desactivado',
    acceptedAt: (w) => `Aceptaste el ${w}.`,
    revokedAt: (w) => `Lo desactivaste el ${w}.`,
    privacy: 'Política de privacidad',
    partner: `Socio de red: ${BANDWIDTH_PARTNER_NAME}`,
    noSdkYet: 'El uso compartido aún no comenzó: estamos terminando la integración. Tu elección queda registrada y nada se ejecuta antes.',
    localOnly: 'Elección guardada en este navegador; la sincronizaremos con tu cuenta lo antes posible.',
    signInToEnable: 'Inicia sesión para activar',
    saved: 'Uso compartido activado. ¡Gracias!',
    revoked: 'Uso compartido desactivado.',
    saveError: 'No se pudo guardar ahora. Inténtalo de nuevo en un momento.',
    close: 'Cerrar',
    openSettings: 'Gestionar',
  },
}

export function formatConsentDate(iso: string | null, lang: BwLang): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const locale = lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en'
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
}
