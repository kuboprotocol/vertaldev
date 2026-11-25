// WhatsApp por token (Cloud API oficial da Meta): validação dos campos e textos da tela
// em pt-BR, en e es. O login pelo Facebook (Embedded Signup) fica "em breve" até o
// Vertal ter o app da Meta verificado (segredos FLUXOS_OAUTH_META_*).

export type WaLang = 'pt' | 'en' | 'es'
export type WaField = 'accessToken' | 'phoneNumberId' | 'wabaId'
export interface WaValues { accessToken: string; phoneNumberId: string; wabaId: string }

/** App do motor usado pelo modo token (o app "whatsapp" é o do login pelo Facebook). */
export const WHATSAPP_TOKEN_APP = 'whatsapp-cloud'
export const WHATSAPP_OAUTH_APP = 'whatsapp'

const ID_RE = /^\d{5,25}$/

export function waLang(hint: string | null | undefined): WaLang {
  const s = (hint ?? '').toLowerCase()
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('en')) return 'en'
  return 'pt'
}

/** Erros por campo (chaves de WA_UI[lang].errors). Vazio = pode testar/salvar. */
export function validateWhatsAppToken(v: WaValues): Partial<Record<WaField, 'required' | 'tokenShort' | 'tokenSpaces' | 'idDigits'>> {
  const out: Partial<Record<WaField, 'required' | 'tokenShort' | 'tokenSpaces' | 'idDigits'>> = {}
  const token = v.accessToken.trim()
  if (!token) out.accessToken = 'required'
  else if (/\s/.test(token)) out.accessToken = 'tokenSpaces'
  else if (token.length < 20) out.accessToken = 'tokenShort'
  const phone = v.phoneNumberId.trim()
  if (!phone) out.phoneNumberId = 'required'
  else if (!ID_RE.test(phone)) out.phoneNumberId = 'idDigits'
  const waba = v.wabaId.trim()
  if (waba && !ID_RE.test(waba)) out.wabaId = 'idDigits'
  return out
}

export function cleanWhatsAppValues(v: WaValues): Record<string, string> {
  const out: Record<string, string> = { accessToken: v.accessToken.trim(), phoneNumberId: v.phoneNumberId.trim() }
  if (v.wabaId.trim()) out.wabaId = v.wabaId.trim()
  return out
}

interface Step { title: string; body: string; link?: { label: string; href: string } }

interface WaText {
  title: string
  connected: string
  notConnected: string
  tabToken: string
  tabOAuth: string
  soon: string
  intro: string
  oauthSoon: string
  fields: Record<WaField, { label: string; placeholder: string; help: string }>
  optional: string
  test: string
  testing: string
  save: string
  saving: string
  disconnect: string
  replace: string
  account: string
  testOk: (name: string) => string
  saved: string
  disconnected: string
  errors: Record<'required' | 'tokenShort' | 'tokenSpaces' | 'idDigits', string>
  testErrors: Record<string, string>
  guideTitle: string
  steps: Step[]
  testNumberNote: string
  pricingNote: { text: string; link: string }
  inboundNote: string
  canDo: string
  securityNote: string
}

export const WA_UI: Record<WaLang, WaText> = {
  pt: {
    title: 'Conectar WhatsApp',
    connected: 'Conectado',
    notConnected: 'Não conectado',
    tabToken: 'Conectar com token',
    tabOAuth: 'Entrar com Facebook',
    soon: 'Em breve',
    intro: 'Use a API oficial do WhatsApp (Cloud API da Meta), sem mensalidade. Cole o token e o ID do número; o Vertal confere com a Meta antes de salvar.',
    oauthSoon: 'O login com um clique pelo Facebook chega assim que a verificação da Meta for concluída. Até lá, conecte com token: funciona igual.',
    fields: {
      accessToken: { label: 'Token de acesso', placeholder: 'EAA…', help: 'Token permanente do usuário do sistema (passo 4). O token temporário da tela "Configuração da API" expira em 24 h.' },
      phoneNumberId: { label: 'ID do número de telefone', placeholder: 'ex.: 123456789012345', help: 'WhatsApp → Configuração da API → "Phone number ID" (não é o número de telefone).' },
      wabaId: { label: 'ID da conta do WhatsApp Business', placeholder: 'ex.: 102290129340398', help: 'Opcional. Serve para listar seus templates e números.' },
    },
    optional: 'opcional',
    test: 'Testar conexão',
    testing: 'Testando…',
    save: 'Salvar e conectar',
    saving: 'Conectando…',
    disconnect: 'Desconectar',
    replace: 'Trocar token',
    account: 'Conta',
    testOk: (name) => `Conexão ok: ${name}`,
    saved: 'WhatsApp conectado.',
    disconnected: 'WhatsApp desconectado.',
    errors: {
      required: 'Obrigatório.',
      tokenShort: 'Token curto demais: copie o token inteiro.',
      tokenSpaces: 'O token não pode ter espaços ou quebras de linha.',
      idDigits: 'Use só os números do ID (5 a 25 dígitos).',
    },
    testErrors: {
      token_invalid: 'A Meta recusou o token (inválido ou expirado). Gere um token permanente do usuário do sistema.',
      permission: 'O token não tem permissão para este número/conta. Dê ao usuário do sistema acesso ao app e à conta do WhatsApp, com whatsapp_business_messaging e whatsapp_business_management.',
      bad_id: 'A Meta não encontrou este ID. Confira o "Phone number ID" (e o ID da conta) na Configuração da API.',
      rate_limited: 'A Meta limitou os pedidos agora. Tente de novo em alguns minutos.',
      unreachable: 'Não deu para falar com a Meta agora. Tente de novo em instantes.',
      generic: 'A Meta recusou os dados informados.',
    },
    guideTitle: 'Passo a passo (uns 10 minutos)',
    steps: [
      { title: 'Crie o app na Meta', body: 'Entre em developers.facebook.com, toque em "Criar app", escolha o caso de uso "Conectar-se com clientes pelo WhatsApp" e selecione (ou crie) o seu portfólio empresarial.', link: { label: 'Abrir Meta for Developers', href: 'https://developers.facebook.com/apps/creation/' } },
      { title: 'Abra a Configuração da API', body: 'No app, vá em WhatsApp → Configuração da API ("API Setup") e toque em "Começar a usar a API". A Meta já cria um número de teste grátis.', link: { label: 'Guia oficial (Get started)', href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started' } },
      { title: 'Copie os IDs', body: 'Na mesma tela, copie o "Phone number ID" e o "WhatsApp Business Account ID". Em "Para" (To), cadastre os números que vão receber os testes.' },
      { title: 'Gere o token permanente', body: 'Em Configurações do negócio → Usuários do sistema: adicione um usuário (Admin), em "Atribuir ativos" dê controle total do app e da conta do WhatsApp, depois "Gerar token" com validade "Nunca" e as permissões business_management, whatsapp_business_messaging e whatsapp_business_management.', link: { label: 'Abrir Usuários do sistema', href: 'https://business.facebook.com/settings/system-users' } },
      { title: 'Cole aqui e teste', body: 'Cole o token e os IDs abaixo, toque em "Testar conexão" para ver o nome do número e depois em "Salvar e conectar".' },
    ],
    testNumberNote: 'Número de teste grátis: só envia para até 5 números cadastrados em "Para" até você adicionar um número próprio e verificar a empresa na Meta.',
    pricingNote: { text: 'A Cloud API não tem mensalidade. Respostas dentro de 24 h da última mensagem do cliente são gratuitas; templates (marketing, utilidade, autenticação) podem ser cobrados pela Meta.', link: 'https://developers.facebook.com/docs/whatsapp/pricing' },
    inboundNote: 'Receber mensagens novas como gatilho de fluxo chega em uma próxima versão. Hoje o Vertal envia mensagens e consulta o número e os templates.',
    canDo: 'Depois de conectar, peça no Vertal Chat: "mande pelo WhatsApp para 5511… a mensagem …" ou "envie o template hello_world". Todo envio pede a sua aprovação.',
    securityNote: 'O token fica guardado criptografado no servidor e nunca volta para o navegador.',
  },
  en: {
    title: 'Connect WhatsApp',
    connected: 'Connected',
    notConnected: 'Not connected',
    tabToken: 'Connect with token',
    tabOAuth: 'Log in with Facebook',
    soon: 'Coming soon',
    intro: 'Use the official WhatsApp API (Meta Cloud API), with no monthly fee. Paste the token and the phone number ID; Vertal checks them with Meta before saving.',
    oauthSoon: 'One-click login with Facebook arrives as soon as Meta finishes verifying us. Until then, connect with a token: it works the same.',
    fields: {
      accessToken: { label: 'Access token', placeholder: 'EAA…', help: 'Permanent system user token (step 4). The temporary token from "API Setup" expires in 24 h.' },
      phoneNumberId: { label: 'Phone number ID', placeholder: 'e.g. 123456789012345', help: 'WhatsApp → API Setup → "Phone number ID" (not the phone number itself).' },
      wabaId: { label: 'WhatsApp Business Account ID', placeholder: 'e.g. 102290129340398', help: 'Optional. Used to list your templates and numbers.' },
    },
    optional: 'optional',
    test: 'Test connection',
    testing: 'Testing…',
    save: 'Save and connect',
    saving: 'Connecting…',
    disconnect: 'Disconnect',
    replace: 'Replace token',
    account: 'Account',
    testOk: (name) => `Connection ok: ${name}`,
    saved: 'WhatsApp connected.',
    disconnected: 'WhatsApp disconnected.',
    errors: {
      required: 'Required.',
      tokenShort: 'Token too short: copy the whole token.',
      tokenSpaces: 'The token cannot contain spaces or line breaks.',
      idDigits: 'Use only the digits of the ID (5 to 25).',
    },
    testErrors: {
      token_invalid: 'Meta rejected the token (invalid or expired). Generate a permanent system user token.',
      permission: 'The token has no permission for this number/account. Give the system user access to the app and the WhatsApp account, with whatsapp_business_messaging and whatsapp_business_management.',
      bad_id: 'Meta could not find this ID. Check the "Phone number ID" (and the account ID) in API Setup.',
      rate_limited: 'Meta is rate limiting requests right now. Try again in a few minutes.',
      unreachable: 'Could not reach Meta right now. Try again in a moment.',
      generic: 'Meta rejected the data you entered.',
    },
    guideTitle: 'Step by step (about 10 minutes)',
    steps: [
      { title: 'Create the Meta app', body: 'Go to developers.facebook.com, click "Create app", choose the "Connect with customers through WhatsApp" use case and select (or create) your business portfolio.', link: { label: 'Open Meta for Developers', href: 'https://developers.facebook.com/apps/creation/' } },
      { title: 'Open API Setup', body: 'In the app, go to WhatsApp → API Setup and click "Start using the API". Meta creates a free test number for you.', link: { label: 'Official guide (Get started)', href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started' } },
      { title: 'Copy the IDs', body: 'On the same page, copy the "Phone number ID" and the "WhatsApp Business Account ID". Under "To", add the numbers that will receive your tests.' },
      { title: 'Generate the permanent token', body: 'In Business Settings → System users: add a user (Admin), under "Assign assets" give full control of the app and the WhatsApp account, then "Generate token" with expiration "Never" and the permissions business_management, whatsapp_business_messaging and whatsapp_business_management.', link: { label: 'Open System users', href: 'https://business.facebook.com/settings/system-users' } },
      { title: 'Paste here and test', body: 'Paste the token and IDs below, click "Test connection" to see the number\'s name, then "Save and connect".' },
    ],
    testNumberNote: 'Free test number: it can only message up to 5 numbers added under "To" until you add your own number and verify your business with Meta.',
    pricingNote: { text: 'The Cloud API has no monthly fee. Replies within 24 h of the customer\'s last message are free; templates (marketing, utility, authentication) may be charged by Meta.', link: 'https://developers.facebook.com/docs/whatsapp/pricing' },
    inboundNote: 'Receiving new messages as a flow trigger comes in a next version. Today Vertal sends messages and reads the number and templates.',
    canDo: 'Once connected, ask in Vertal Chat: "send on WhatsApp to 5511… the message …" or "send the hello_world template". Every send asks for your approval.',
    securityNote: 'The token is stored encrypted on the server and never comes back to the browser.',
  },
  es: {
    title: 'Conectar WhatsApp',
    connected: 'Conectado',
    notConnected: 'No conectado',
    tabToken: 'Conectar con token',
    tabOAuth: 'Entrar con Facebook',
    soon: 'Próximamente',
    intro: 'Usa la API oficial de WhatsApp (Cloud API de Meta), sin mensualidad. Pega el token y el ID del número; Vertal los comprueba con Meta antes de guardar.',
    oauthSoon: 'El inicio de sesión con un clic por Facebook llega en cuanto Meta termine nuestra verificación. Mientras tanto, conecta con token: funciona igual.',
    fields: {
      accessToken: { label: 'Token de acceso', placeholder: 'EAA…', help: 'Token permanente del usuario del sistema (paso 4). El token temporal de "Configuración de la API" caduca en 24 h.' },
      phoneNumberId: { label: 'ID del número de teléfono', placeholder: 'ej.: 123456789012345', help: 'WhatsApp → Configuración de la API → "Phone number ID" (no es el número de teléfono).' },
      wabaId: { label: 'ID de la cuenta de WhatsApp Business', placeholder: 'ej.: 102290129340398', help: 'Opcional. Sirve para listar tus plantillas y números.' },
    },
    optional: 'opcional',
    test: 'Probar conexión',
    testing: 'Probando…',
    save: 'Guardar y conectar',
    saving: 'Conectando…',
    disconnect: 'Desconectar',
    replace: 'Cambiar token',
    account: 'Cuenta',
    testOk: (name) => `Conexión ok: ${name}`,
    saved: 'WhatsApp conectado.',
    disconnected: 'WhatsApp desconectado.',
    errors: {
      required: 'Obligatorio.',
      tokenShort: 'Token demasiado corto: copia el token completo.',
      tokenSpaces: 'El token no puede tener espacios ni saltos de línea.',
      idDigits: 'Usa solo los números del ID (de 5 a 25 dígitos).',
    },
    testErrors: {
      token_invalid: 'Meta rechazó el token (inválido o caducado). Genera un token permanente del usuario del sistema.',
      permission: 'El token no tiene permiso para este número/cuenta. Da al usuario del sistema acceso a la app y a la cuenta de WhatsApp, con whatsapp_business_messaging y whatsapp_business_management.',
      bad_id: 'Meta no encontró este ID. Revisa el "Phone number ID" (y el ID de la cuenta) en Configuración de la API.',
      rate_limited: 'Meta está limitando las solicitudes ahora. Inténtalo en unos minutos.',
      unreachable: 'No se pudo hablar con Meta ahora. Inténtalo en un momento.',
      generic: 'Meta rechazó los datos indicados.',
    },
    guideTitle: 'Paso a paso (unos 10 minutos)',
    steps: [
      { title: 'Crea la app en Meta', body: 'Entra en developers.facebook.com, pulsa "Crear app", elige el caso de uso "Conectar con clientes a través de WhatsApp" y selecciona (o crea) tu portfolio comercial.', link: { label: 'Abrir Meta for Developers', href: 'https://developers.facebook.com/apps/creation/' } },
      { title: 'Abre Configuración de la API', body: 'En la app, ve a WhatsApp → Configuración de la API ("API Setup") y pulsa "Empezar a usar la API". Meta crea un número de prueba gratis.', link: { label: 'Guía oficial (Get started)', href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started' } },
      { title: 'Copia los IDs', body: 'En la misma pantalla, copia el "Phone number ID" y el "WhatsApp Business Account ID". En "Para" (To), añade los números que recibirán las pruebas.' },
      { title: 'Genera el token permanente', body: 'En Configuración del negocio → Usuarios del sistema: añade un usuario (Admin), en "Asignar activos" da control total de la app y de la cuenta de WhatsApp, y luego "Generar token" con caducidad "Nunca" y los permisos business_management, whatsapp_business_messaging y whatsapp_business_management.', link: { label: 'Abrir Usuarios del sistema', href: 'https://business.facebook.com/settings/system-users' } },
      { title: 'Pega aquí y prueba', body: 'Pega el token y los IDs abajo, pulsa "Probar conexión" para ver el nombre del número y después "Guardar y conectar".' },
    ],
    testNumberNote: 'Número de prueba gratis: solo envía a hasta 5 números añadidos en "Para" hasta que agregues un número propio y verifiques la empresa en Meta.',
    pricingNote: { text: 'La Cloud API no tiene mensualidad. Las respuestas dentro de las 24 h desde el último mensaje del cliente son gratis; las plantillas (marketing, utilidad, autenticación) pueden tener costo de Meta.', link: 'https://developers.facebook.com/docs/whatsapp/pricing' },
    inboundNote: 'Recibir mensajes nuevos como disparador de flujo llega en una próxima versión. Hoy Vertal envía mensajes y consulta el número y las plantillas.',
    canDo: 'Después de conectar, pide en Vertal Chat: "envía por WhatsApp a 5511… el mensaje …" o "envía la plantilla hello_world". Cada envío pide tu aprobación.',
    securityNote: 'El token se guarda cifrado en el servidor y nunca vuelve al navegador.',
  },
}

/** Mensagem de erro do "Testar conexão" a partir da resposta do servidor. */
export function waTestErrorText(lang: WaLang, code: string | undefined, hint: string | null | undefined): string {
  const t = WA_UI[lang].testErrors
  if (hint && t[hint]) return t[hint]
  if (code === 'test_unreachable') return t.unreachable
  if (code === 'test_invalid_id') return t.bad_id
  return t.generic
}
