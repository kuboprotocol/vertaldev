// Vertal Growth Team · textos da tela em pt-BR, en e es (idioma do dev: navegador, ou o do pedido no chat).
import type { GrowthLang } from '../../../supabase/functions/_shared/vertalGrowth/core';

export function uiLangFrom(...hints: Array<string | null | undefined>): GrowthLang {
  for (const h of hints) {
    const s = (h ?? '').toLowerCase();
    if (s.startsWith('pt')) return 'pt';
    if (s.startsWith('es')) return 'es';
    if (s.startsWith('en')) return 'en';
  }
  return 'pt';
}

export function browserLang(): GrowthLang {
  return uiLangFrom(typeof navigator !== 'undefined' ? navigator.language : 'pt-BR');
}

/**
 * Idioma nativo do usuário guardado pelo Vertal CRM/Growth (idioma do workspace do CRM ou o que o servidor
 * devolveu), para que as telas não caiam no idioma do navegador (ex.: navegador em inglês de um usuário brasileiro).
 */
export const VERTAL_UI_LANG_KEY = 'vertal-ui-lang';
export function storedUiLang(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(VERTAL_UI_LANG_KEY) : null;
  } catch {
    return null;
  }
}
export function rememberUiLang(lang: string | null | undefined): void {
  if (!lang) return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VERTAL_UI_LANG_KEY, lang);
  } catch { /* modo privado */ }
}
/** Ordem: pedido explícito (?lang / comando do chat) → idioma salvo do usuário → navegador → pt-BR. */
export function preferredUiLang(explicit?: string | null): GrowthLang {
  return uiLangFrom(explicit, storedUiLang(), typeof navigator !== 'undefined' ? navigator.language : null);
}

const pt = {
  title: 'Vertal Growth · equipe de crescimento',
  subtitle: 'Captação, conversão e retenção para o seu projeto. Nada é enviado sem a sua aprovação.',
  back: 'Voltar',
  campaigns: 'Campanhas',
  newCampaign: 'Nova campanha',
  project: 'Projeto',
  pickProject: 'Escolha o projeto…',
  readProject: 'Ler o projeto',
  reading: 'Lendo o projeto…',
  model: 'Modelo do negócio',
  models: { b2b: 'Empresas (B2B)', b2c: 'Pessoas / assinatura (B2C)', nonprofit: 'Causa / ONG (doações)' },
  modelHint: { b2b: 'Busca empresas que compram de você.', b2c: 'Busca empresas parceiras que atendem o seu público (não busca pessoas).', nonprofit: 'Busca empresas que podem doar ou patrocinar a causa.' },
  subscription: 'Tem assinatura (cobrança recorrente)',
  confidence: (n: number) => `Palpite pelo texto do projeto (confiança ${Math.round(n * 100)}%). Confira e mude se precisar.`,
  name: 'Nome do projeto',
  description: 'O que o projeto oferece',
  website: 'Site publicado (opcional)',
  area: 'Região dos alvos (Cidade, UF — opcional)',
  costTitle: 'Custo',
  costLaunch: (n: number) => `${n} créditos, cobrados uma vez ao lançar (perfil do cliente ideal, 1ª busca e 1º lote de rascunhos). Se algo falhar, os créditos voltam.`,
  costLaunchOff: 'A cobrança está desligada nesta conta: lançar não debita créditos.',
  costRun: (n: number) => `Depois, cada execução de um agente da equipe custa ${n} créditos (devolvidos se falhar).`,
  costSafety: 'Nada é enviado a ninguém sem a sua aprovação. WhatsApp é sempre enviado por você.',
  accept: 'Entendi o custo',
  launch: (n: number) => `Lançar equipe (${n} créditos)`,
  launchFree: 'Lançar equipe',
  launchConfirm: (n: number) => `Lançar a equipe de crescimento? Serão debitados ${n} créditos uma vez.`,
  launching: 'Montando a equipe… (pode levar até 2 minutos)',
  launched: 'Equipe lançada. Agora confirme o cliente ideal na Captação.',
  stage: 'Etapa',
  leads: 'Leads', contacted: 'Contatados', replies: 'Respostas', optedOut: 'Não contatar',
  engaged: 'Interessados', conversions: 'Conversões', drafts: 'Rascunhos',
  activeCustomers: 'Clientes ativos', activeDonors: 'Doadores ativos', atRisk: 'Em risco', churned: 'Cancelaram', wonBack: 'Recuperados',
  openCapture: 'Abrir a Captação (ICP, leads e 1º contato)',
  icpPending: 'Confirme o cliente ideal antes de buscar leads.',
  sync: 'Atualizar etapas',
  syncing: 'Atualizando…',
  syncDone: (s: { newLeads: number; engaged: number; customers: number; atRisk: number; drafts: number; autoSent: number }) =>
    `${s.newLeads} lead(s) novo(s), ${s.engaged} interessado(s), ${s.customers} cliente(s)/doador(es), ${s.atRisk} em risco, ${s.drafts} rascunho(s)${s.autoSent ? `, ${s.autoSent} enviado(s) pelo piloto` : ''}.`,
  forwardConfirm: (n: number, c: number) => `Enviar ${n} evento(s) para a equipe de agentes? Cada execução custa ${c} créditos (devolvidos se falhar).`,
  forwarded: (n: number) => `${n} evento(s) enviado(s) à equipe.`,
  approvals: 'Para aprovar',
  noDrafts: 'Nenhum rascunho esperando aprovação.',
  approve: 'Aprovar', reject: 'Recusar', save: 'Salvar', send: 'Enviar', sendConfirm: (to: string) => `Enviar agora para ${to}?`,
  approveAll: 'Aprovar todos', sent: 'Enviado', whatsapp: 'WhatsApp (você envia)', markSent: 'Marcar como enviado',
  readyAt: (d: string) => `sugerido a partir de ${d}`,
  contacts: 'Contatos',
  addContact: 'Adicionar contato',
  email: 'E-mail', contactName: 'Nome',
  consent: 'Essa pessoa já tem relação com o projeto (conta, cadastro, conversa ou doação).',
  add: 'Adicionar',
  deleteContact: 'Apagar (LGPD)',
  team: 'Equipe de agentes',
  teamNone: 'Conecte um CRM ou app de tarefas no Vertal Fluxos (Pipedrive, HubSpot, Notion ou Todoist) para criar os agentes.',
  teamNoAgents: 'Configure o Vertal Agentes no Cofre de segredos para criar a equipe.',
  teamPlan: 'Agentes que serão criados (usam só os apps que você conectou):',
  teamCreate: 'Criar a equipe de agentes',
  teamConfirm: (n: number, c: number) => `Criar ${n} agente(s) no Vertal Agentes? Cada execução custa ${c} créditos (devolvidos se falhar).`,
  teamCreated: 'Equipe de agentes criada.',
  teamReady: (n: number) => `${n} agente(s) trabalhando nesta campanha.`,
  presets: {
    lead_to_crm: 'Lead contatado → CRM', reply_to_deal: 'Resposta positiva → negócio/tarefa de conversão',
    customer_onboarding: 'Cliente novo → onboarding', churn_winback: 'Cancelamento ou inatividade → recuperação',
  },
  needsField: (f: string) => `Precisa do campo: ${f}`,
  settings: 'Configurações',
  bookingLink: 'Link de agenda (https://…)',
  senderName: 'Seu nome (assinatura)',
  inactivityDays: 'Dias sem contato para check-in',
  gmail: 'Conta Gmail para enviar',
  noGmail: 'Conecte o Gmail em Conectores para enviar.',
  reminder: 'Lembrete diário no Agendador para revisar aprovações',
  reminderCreated: 'Lembrete criado no Agendador.',
  autopilot: 'Piloto automático',
  autopilotHelp: 'Envia sozinho os rascunhos que passam nas regras, só para e-mail verificado, respeitando o limite diário, a lista de não contatar e os pedidos de "parar". Roda quando você atualiza as etapas. Só você pode ligar.',
  autopilotOn: 'Ligado', autopilotOff: 'Desligado',
  autopilotType: 'Digite AUTOPILOT para ligar',
  autopilotEnable: 'Ligar piloto automático', autopilotDisable: 'Desligar',
  deleteCampaign: 'Apagar campanha',
  deleteConfirm: 'Apagar esta campanha, os contatos e as mensagens? (Os agentes criados ficam no Vertal Agentes até você desativá-los.)',
  dailyCap: (s: number, c: number) => `Envios hoje: ${s}/${c}`,
  lgpd: 'LGPD: captação só com contatos empresariais públicos; clientes/doadores vêm da sua conta Stripe ou de quem você declara ter relação. Todo e-mail diz a origem do contato e como parar.',
  stripeOn: 'Stripe conectado (só leitura): novas assinaturas viram clientes, cancelamentos viram recuperação.',
  stripeOff: 'Sem Stripe no Cofre (STRIPE_SECRET_KEY): marque clientes à mão ou adicione contatos.',
  status: { lead: 'lead', engaged: 'interessado', converted: 'convertido', active: 'ativo', at_risk: 'em risco', churned: 'cancelou', won_back: 'recuperado', opted_out: 'não contatar' },
  kinds: { conversion1: 'Conversão', conversion2: 'Lembrete de conversão', onboarding: 'Boas-vindas', checkin: 'Check-in', winback: 'Recuperação', thanks: 'Agradecimento' },
  markAs: 'Marcar como',
  events: 'Histórico',
  errors: {
    vertal_growth_disabled: 'O Vertal Growth não está liberado na sua conta.',
    insufficient_credits: 'Créditos insuficientes para lançar (20 créditos).',
    duplicate_request: 'Esse pedido já foi processado. Recarregue a página.',
    launch_slow: 'A montagem da equipe está demorando mais que o normal. Se ela não aparecer em Campanhas em alguns minutos, os créditos voltam sozinhos.',
    timeout: 'O servidor demorou para responder. Tente de novo.',
    network: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
    model_failed: 'A IA não respondeu agora. Nada foi cobrado (créditos devolvidos). Tente de novo.',
    blocked_content: 'Esse conteúdo não pode ser promovido pela equipe.',
    too_many_campaigns: 'Você atingiu o máximo de campanhas ativas.',
    launch_limit: 'Limite de lançamentos de hoje atingido.',
    consent_required: 'Confirme que a pessoa já tem relação com o projeto.',
    contact_exists: 'Esse contato já está na campanha.',
    contact_blocked: 'Esse contato está na lista de não contatar.',
    invalid_email: 'E-mail inválido.',
    send_blocked: 'Envio bloqueado pelas regras de segurança.',
    gmail_account_required: 'Conecte o Gmail em Conectores para enviar.',
    gmail_send_failed: 'O Gmail recusou o envio. Nada foi enviado.',
    invalid_booking_link: 'O link de agenda precisa começar com https://',
    autopilot_needs_confirmation: 'Para ligar o piloto automático, digite AUTOPILOT.',
    rate_limited: 'Muitos pedidos em sequência. Espere um minuto.',
    not_signed_in: 'Entre na sua conta.',
    generic: 'Algo deu errado. Tente de novo.',
  } as Record<string, string>,
};

type Dict = typeof pt;

const en: Dict = {
  ...pt,
  title: 'Vertal Growth · growth team',
  subtitle: 'Lead generation, conversion and retention for your project. Nothing is sent without your approval.',
  back: 'Back', campaigns: 'Campaigns', newCampaign: 'New campaign', project: 'Project', pickProject: 'Pick a project…',
  readProject: 'Read the project', reading: 'Reading the project…', model: 'Business model',
  models: { b2b: 'Businesses (B2B)', b2c: 'People / subscription (B2C)', nonprofit: 'Cause / nonprofit (donations)' },
  modelHint: { b2b: 'Finds companies that buy from you.', b2c: 'Finds partner businesses that serve your audience (it never searches for individuals).', nonprofit: 'Finds companies that can donate to or sponsor the cause.' },
  subscription: 'Has a subscription (recurring billing)',
  confidence: (n: number) => `Guess from the project text (confidence ${Math.round(n * 100)}%). Check it and change it if needed.`,
  name: 'Project name', description: 'What the project offers', website: 'Published site (optional)', area: 'Target region (City, State — optional)',
  costTitle: 'Cost',
  costLaunch: (n: number) => `${n} credits, charged once at launch (ideal customer profile, first search and first batch of drafts). If anything fails, the credits come back.`,
  costLaunchOff: 'Charging is off on this account: launching does not debit credits.',
  costRun: (n: number) => `After that, each run of a team agent costs ${n} credits (refunded if it fails).`,
  costSafety: 'Nothing is sent to anyone without your approval. WhatsApp is always sent by you.',
  accept: 'I understand the cost', launch: (n: number) => `Launch team (${n} credits)`, launchFree: 'Launch team',
  launchConfirm: (n: number) => `Launch the growth team? ${n} credits will be debited once.`,
  launching: 'Setting up the team… (can take up to 2 minutes)', launched: 'Team launched. Now confirm the ideal customer in Lead generation.',
  stage: 'Stage', leads: 'Leads', contacted: 'Contacted', replies: 'Replies', optedOut: 'Do not contact',
  engaged: 'Interested', conversions: 'Conversions', drafts: 'Drafts',
  activeCustomers: 'Active customers', activeDonors: 'Active donors', atRisk: 'At risk', churned: 'Cancelled', wonBack: 'Won back',
  openCapture: 'Open Lead generation (ICP, leads and first contact)', icpPending: 'Confirm the ideal customer before searching for leads.',
  sync: 'Update stages', syncing: 'Updating…',
  syncDone: (s) => `${s.newLeads} new lead(s), ${s.engaged} interested, ${s.customers} customer(s)/donor(s), ${s.atRisk} at risk, ${s.drafts} draft(s)${s.autoSent ? `, ${s.autoSent} sent by autopilot` : ''}.`,
  forwardConfirm: (n: number, c: number) => `Send ${n} event(s) to the agent team? Each run costs ${c} credits (refunded if it fails).`,
  forwarded: (n: number) => `${n} event(s) sent to the team.`,
  approvals: 'To approve', noDrafts: 'No drafts waiting for approval.', approve: 'Approve', reject: 'Reject', save: 'Save', send: 'Send',
  sendConfirm: (to: string) => `Send now to ${to}?`, approveAll: 'Approve all', sent: 'Sent', whatsapp: 'WhatsApp (you send it)', markSent: 'Mark as sent',
  readyAt: (d: string) => `suggested from ${d}`, contacts: 'Contacts', addContact: 'Add contact', email: 'Email', contactName: 'Name',
  consent: 'This person already has a relationship with the project (account, sign-up, conversation or donation).', add: 'Add', deleteContact: 'Delete (privacy)',
  team: 'Agent team', teamNone: 'Connect a CRM or task app in Vertal Fluxos (Pipedrive, HubSpot, Notion or Todoist) to create the agents.',
  teamNoAgents: 'Set up Vertal Agentes in the secrets vault to create the team.', teamPlan: 'Agents to be created (they only use apps you connected):',
  teamCreate: 'Create the agent team', teamConfirm: (n: number, c: number) => `Create ${n} agent(s) in Vertal Agentes? Each run costs ${c} credits (refunded if it fails).`,
  teamCreated: 'Agent team created.', teamReady: (n: number) => `${n} agent(s) working on this campaign.`,
  presets: { lead_to_crm: 'Contacted lead → CRM', reply_to_deal: 'Positive reply → deal/conversion task', customer_onboarding: 'New customer → onboarding', churn_winback: 'Cancellation or inactivity → win-back' },
  needsField: (f: string) => `Needs field: ${f}`, settings: 'Settings', bookingLink: 'Booking link (https://…)', senderName: 'Your name (signature)',
  inactivityDays: 'Days without contact before a check-in', gmail: 'Gmail account to send from', noGmail: 'Connect Gmail in Connectors to send.',
  reminder: 'Daily reminder in the Scheduler to review approvals', reminderCreated: 'Reminder created in the Scheduler.',
  autopilot: 'Autopilot',
  autopilotHelp: 'Sends drafts that pass the rules on its own, only to verified emails, within the daily cap, the do-not-contact list and "stop" requests. Runs when you update the stages. Only you can turn it on.',
  autopilotOn: 'On', autopilotOff: 'Off', autopilotType: 'Type AUTOPILOT to turn it on', autopilotEnable: 'Turn on autopilot', autopilotDisable: 'Turn off',
  deleteCampaign: 'Delete campaign', deleteConfirm: 'Delete this campaign, its contacts and messages? (Agents you created stay in Vertal Agentes until you disable them.)',
  dailyCap: (s: number, c: number) => `Sent today: ${s}/${c}`,
  lgpd: 'Privacy: outreach only to public business contacts; customers/donors come from your Stripe account or people you declare you already have a relationship with. Every email states where the contact came from and how to stop.',
  stripeOn: 'Stripe connected (read-only): new subscriptions become customers, cancellations go to win-back.',
  stripeOff: 'No Stripe in the vault (STRIPE_SECRET_KEY): mark customers by hand or add contacts.',
  status: { lead: 'lead', engaged: 'interested', converted: 'converted', active: 'active', at_risk: 'at risk', churned: 'cancelled', won_back: 'won back', opted_out: 'do not contact' },
  kinds: { conversion1: 'Conversion', conversion2: 'Conversion reminder', onboarding: 'Welcome', checkin: 'Check-in', winback: 'Win-back', thanks: 'Thank you' },
  markAs: 'Mark as', events: 'History',
  errors: {
    ...pt.errors,
    vertal_growth_disabled: 'Vertal Growth is not enabled on your account.', insufficient_credits: 'Not enough credits to launch (20 credits).',
    duplicate_request: 'This request was already processed. Reload the page.',
    launch_slow: 'Setting up the team is taking longer than usual. If it does not show up in Campaigns in a few minutes, the credits come back automatically.',
    timeout: 'The server took too long to answer. Try again.', network: 'No connection to the server. Check your internet and try again.', model_failed: 'The AI did not answer. Nothing was charged (credits refunded). Try again.',
    blocked_content: 'This content cannot be promoted by the team.', too_many_campaigns: 'You reached the maximum number of active campaigns.',
    launch_limit: "Today's launch limit was reached.", consent_required: 'Confirm the person already has a relationship with the project.',
    contact_exists: 'This contact is already in the campaign.', contact_blocked: 'This contact is on the do-not-contact list.', invalid_email: 'Invalid email.',
    send_blocked: 'Sending blocked by the safety rules.', gmail_account_required: 'Connect Gmail in Connectors to send.', gmail_send_failed: 'Gmail refused to send. Nothing was sent.',
    invalid_booking_link: 'The booking link must start with https://', autopilot_needs_confirmation: 'To turn on autopilot, type AUTOPILOT.',
    rate_limited: 'Too many requests. Wait a minute.', not_signed_in: 'Sign in to your account.', generic: 'Something went wrong. Try again.',
  },
};

const es: Dict = {
  ...pt,
  title: 'Vertal Growth · equipo de crecimiento',
  subtitle: 'Captación, conversión y retención para su proyecto. Nada se envía sin su aprobación.',
  back: 'Volver', campaigns: 'Campañas', newCampaign: 'Nueva campaña', project: 'Proyecto', pickProject: 'Elija el proyecto…',
  readProject: 'Leer el proyecto', reading: 'Leyendo el proyecto…', model: 'Modelo de negocio',
  models: { b2b: 'Empresas (B2B)', b2c: 'Personas / suscripción (B2C)', nonprofit: 'Causa / ONG (donaciones)' },
  modelHint: { b2b: 'Busca empresas que le compran.', b2c: 'Busca empresas aliadas que atienden a su público (no busca personas).', nonprofit: 'Busca empresas que pueden donar o patrocinar la causa.' },
  subscription: 'Tiene suscripción (cobro recurrente)',
  confidence: (n: number) => `Suposición por el texto del proyecto (confianza ${Math.round(n * 100)}%). Revise y cambie si hace falta.`,
  name: 'Nombre del proyecto', description: 'Qué ofrece el proyecto', website: 'Sitio publicado (opcional)', area: 'Región objetivo (Ciudad, Estado — opcional)',
  costTitle: 'Costo',
  costLaunch: (n: number) => `${n} créditos, cobrados una vez al lanzar (perfil del cliente ideal, 1ª búsqueda y 1er lote de borradores). Si algo falla, los créditos vuelven.`,
  costLaunchOff: 'El cobro está apagado en esta cuenta: lanzar no descuenta créditos.',
  costRun: (n: number) => `Después, cada ejecución de un agente del equipo cuesta ${n} créditos (devueltos si falla).`,
  costSafety: 'Nada se envía a nadie sin su aprobación. WhatsApp siempre lo envía usted.',
  accept: 'Entiendo el costo', launch: (n: number) => `Lanzar equipo (${n} créditos)`, launchFree: 'Lanzar equipo',
  launchConfirm: (n: number) => `¿Lanzar el equipo de crecimiento? Se descontarán ${n} créditos una vez.`,
  launching: 'Armando el equipo… (puede tardar hasta 2 minutos)', launched: 'Equipo lanzado. Ahora confirme el cliente ideal en Captación.',
  stage: 'Etapa', leads: 'Leads', contacted: 'Contactados', replies: 'Respuestas', optedOut: 'No contactar',
  engaged: 'Interesados', conversions: 'Conversiones', drafts: 'Borradores',
  activeCustomers: 'Clientes activos', activeDonors: 'Donantes activos', atRisk: 'En riesgo', churned: 'Cancelaron', wonBack: 'Recuperados',
  openCapture: 'Abrir Captación (ICP, leads y 1er contacto)', icpPending: 'Confirme el cliente ideal antes de buscar leads.',
  sync: 'Actualizar etapas', syncing: 'Actualizando…',
  syncDone: (s) => `${s.newLeads} lead(s) nuevo(s), ${s.engaged} interesado(s), ${s.customers} cliente(s)/donante(s), ${s.atRisk} en riesgo, ${s.drafts} borrador(es)${s.autoSent ? `, ${s.autoSent} enviado(s) por el piloto` : ''}.`,
  forwardConfirm: (n: number, c: number) => `¿Enviar ${n} evento(s) al equipo de agentes? Cada ejecución cuesta ${c} créditos (devueltos si falla).`,
  forwarded: (n: number) => `${n} evento(s) enviado(s) al equipo.`,
  approvals: 'Por aprobar', noDrafts: 'No hay borradores esperando aprobación.', approve: 'Aprobar', reject: 'Rechazar', save: 'Guardar', send: 'Enviar',
  sendConfirm: (to: string) => `¿Enviar ahora a ${to}?`, approveAll: 'Aprobar todos', sent: 'Enviado', whatsapp: 'WhatsApp (lo envía usted)', markSent: 'Marcar como enviado',
  readyAt: (d: string) => `sugerido desde ${d}`, contacts: 'Contactos', addContact: 'Agregar contacto', email: 'Correo', contactName: 'Nombre',
  consent: 'Esta persona ya tiene relación con el proyecto (cuenta, registro, conversación o donación).', add: 'Agregar', deleteContact: 'Borrar (privacidad)',
  team: 'Equipo de agentes', teamNone: 'Conecte un CRM o app de tareas en Vertal Fluxos (Pipedrive, HubSpot, Notion o Todoist) para crear los agentes.',
  teamNoAgents: 'Configure Vertal Agentes en la bóveda de secretos para crear el equipo.', teamPlan: 'Agentes que se crearán (solo usan apps que usted conectó):',
  teamCreate: 'Crear el equipo de agentes', teamConfirm: (n: number, c: number) => `¿Crear ${n} agente(s) en Vertal Agentes? Cada ejecución cuesta ${c} créditos (devueltos si falla).`,
  teamCreated: 'Equipo de agentes creado.', teamReady: (n: number) => `${n} agente(s) trabajando en esta campaña.`,
  presets: { lead_to_crm: 'Lead contactado → CRM', reply_to_deal: 'Respuesta positiva → negocio/tarea de conversión', customer_onboarding: 'Cliente nuevo → onboarding', churn_winback: 'Cancelación o inactividad → recuperación' },
  needsField: (f: string) => `Necesita el campo: ${f}`, settings: 'Configuración', bookingLink: 'Enlace de agenda (https://…)', senderName: 'Su nombre (firma)',
  inactivityDays: 'Días sin contacto para un check-in', gmail: 'Cuenta de Gmail para enviar', noGmail: 'Conecte Gmail en Conectores para enviar.',
  reminder: 'Recordatorio diario en el Programador para revisar aprobaciones', reminderCreated: 'Recordatorio creado en el Programador.',
  autopilot: 'Piloto automático',
  autopilotHelp: 'Envía solo los borradores que pasan las reglas, solo a correos verificados, respetando el límite diario, la lista de no contactar y los pedidos de "parar". Corre cuando usted actualiza las etapas. Solo usted puede encenderlo.',
  autopilotOn: 'Encendido', autopilotOff: 'Apagado', autopilotType: 'Escriba AUTOPILOT para encenderlo', autopilotEnable: 'Encender piloto automático', autopilotDisable: 'Apagar',
  deleteCampaign: 'Borrar campaña', deleteConfirm: '¿Borrar esta campaña, sus contactos y mensajes? (Los agentes creados quedan en Vertal Agentes hasta que los desactive.)',
  dailyCap: (s: number, c: number) => `Envíos hoy: ${s}/${c}`,
  lgpd: 'Privacidad: captación solo con contactos empresariales públicos; clientes/donantes vienen de su cuenta Stripe o de personas con las que declara tener relación. Cada correo indica el origen del contacto y cómo parar.',
  stripeOn: 'Stripe conectado (solo lectura): nuevas suscripciones se vuelven clientes, cancelaciones van a recuperación.',
  stripeOff: 'Sin Stripe en la bóveda (STRIPE_SECRET_KEY): marque clientes a mano o agregue contactos.',
  status: { lead: 'lead', engaged: 'interesado', converted: 'convertido', active: 'activo', at_risk: 'en riesgo', churned: 'canceló', won_back: 'recuperado', opted_out: 'no contactar' },
  kinds: { conversion1: 'Conversión', conversion2: 'Recordatorio de conversión', onboarding: 'Bienvenida', checkin: 'Check-in', winback: 'Recuperación', thanks: 'Agradecimiento' },
  markAs: 'Marcar como', events: 'Historial',
  errors: {
    ...pt.errors,
    vertal_growth_disabled: 'Vertal Growth no está habilitado en su cuenta.', insufficient_credits: 'Créditos insuficientes para lanzar (20 créditos).',
    duplicate_request: 'Este pedido ya fue procesado. Recargue la página.',
    launch_slow: 'Armar el equipo está tardando más de lo normal. Si no aparece en Campañas en unos minutos, los créditos vuelven solos.',
    timeout: 'El servidor tardó en responder. Intente de nuevo.', network: 'Sin conexión con el servidor. Revise internet e intente de nuevo.', model_failed: 'La IA no respondió. No se cobró nada (créditos devueltos). Intente de nuevo.',
    blocked_content: 'Este contenido no puede ser promovido por el equipo.', too_many_campaigns: 'Llegó al máximo de campañas activas.',
    launch_limit: 'Se alcanzó el límite de lanzamientos de hoy.', consent_required: 'Confirme que la persona ya tiene relación con el proyecto.',
    contact_exists: 'Este contacto ya está en la campaña.', contact_blocked: 'Este contacto está en la lista de no contactar.', invalid_email: 'Correo inválido.',
    send_blocked: 'Envío bloqueado por las reglas de seguridad.', gmail_account_required: 'Conecte Gmail en Conectores para enviar.', gmail_send_failed: 'Gmail rechazó el envío. No se envió nada.',
    invalid_booking_link: 'El enlace de agenda debe empezar con https://', autopilot_needs_confirmation: 'Para encender el piloto automático, escriba AUTOPILOT.',
    rate_limited: 'Demasiados pedidos seguidos. Espere un minuto.', not_signed_in: 'Inicie sesión.', generic: 'Algo salió mal. Intente de nuevo.',
  },
};

export const GROWTH_UI: Record<GrowthLang, Dict> = { pt, en, es };
export type GrowthDict = Dict;
