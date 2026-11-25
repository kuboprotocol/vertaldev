// Vertal CRM · textos da tela em pt-BR (padrão), en e es — idioma nativo do usuário
// (Ajuste do workspace → idioma do navegador → pt-BR).
import type { CrmLang } from '../../../supabase/functions/_shared/vertalCrm/core';

export type { CrmLang };

export function uiLangFrom(...hints: Array<string | null | undefined>): CrmLang {
  for (const h of hints) {
    const s = (h ?? '').toLowerCase();
    if (s.startsWith('pt')) return 'pt';
    if (s.startsWith('es')) return 'es';
    if (s.startsWith('en')) return 'en';
  }
  return 'pt';
}
export const browserLang = (): CrmLang => uiLangFrom(typeof navigator !== 'undefined' ? navigator.language : 'pt-BR');

const pt = {
  title: 'Vertal CRM',
  subtitle: 'CRM grátis. Você só paga quando usa a IA (1 crédito).',
  back: 'Voltar',
  loading: 'Carregando…',
  tabs: { dashboard: 'Painel', contacts: 'Contatos', companies: 'Empresas', deals: 'Negócios', tasks: 'Tarefas', settings: 'Configurações' },
  search: 'Buscar…',
  aiSearch: 'Busca com IA',
  aiSearchPlaceholder: 'Ex.: leads quentes sem contato há 30 dias',
  new: 'Novo',
  save: 'Salvar',
  cancel: 'Cancelar',
  delete: 'Apagar',
  edit: 'Editar',
  close: 'Fechar',
  confirmDelete: 'Apagar de vez? Não dá para desfazer.',
  saved: 'Salvo.',
  deleted: 'Apagado.',
  error: 'Algo deu errado. Tente de novo.',
  empty: 'Nada por aqui ainda.',
  firstName: 'Nome', lastName: 'Sobrenome', email: 'E-mail', phone: 'Telefone', jobTitle: 'Cargo', company: 'Empresa',
  website: 'Site', city: 'Cidade', sector: 'Setor', size: 'Tamanho', taxId: 'CNPJ / ID fiscal', address: 'Endereço',
  background: 'Observações', status: 'Status', tags: 'Etiquetas', score: 'Pontuação', source: 'Origem', owner: 'Responsável',
  dealName: 'Nome do negócio', amount: 'Valor', stage: 'Etapa', pipeline: 'Funil', closeDate: 'Fechamento previsto', category: 'Categoria', description: 'Descrição',
  contactStatus: { cold: 'Frio', warm: 'Morno', hot: 'Quente', 'in-contract': 'Cliente' } as Record<string, string>,
  taskTypes: { none: 'Tarefa', email: 'E-mail', demo: 'Demonstração', lunch: 'Almoço', meeting: 'Reunião', 'follow-up': 'Follow-up', 'thank-you': 'Agradecimento', ship: 'Entrega', call: 'Ligação' } as Record<string, string>,
  notes: 'Notas', addNote: 'Adicionar nota', notePlaceholder: 'Escreva uma nota…',
  tasks: 'Tarefas', addTask: 'Nova tarefa', taskText: 'O que fazer?', due: 'Prazo', done: 'Feita', overdue: 'Atrasada', today: 'Hoje', upcoming: 'Próximas', remind: 'Lembrete',
  timeline: 'Linha do tempo', attachments: 'Anexos', upload: 'Enviar arquivo', deals: 'Negócios', contacts: 'Contatos',
  kanbanHint: 'Arraste os cartões entre as etapas.',
  won: 'Ganho', lost: 'Perdido', open: 'Aberto',
  dash: {
    pipelineValue: 'Valor em aberto', forecast: 'Previsão ponderada', winRate: 'Taxa de ganho', wonValue: 'Ganho no total',
    openDeals: 'negócios abertos', byStage: 'Por etapa', byMonth: 'Previsão por mês', tasksToday: 'Tarefas e lembretes', hot: 'Contatos quentes',
    latest: 'Atividade recente', noDate: 'sem data',
  },
  ai: {
    title: 'IA do Vertal CRM',
    cost: (n: number) => `Custa ${n} crédito${n === 1 ? '' : 's'}. Se falhar, devolvemos.`,
    confirm: 'Usar IA',
    summary: 'Resumo com IA', email: 'E-mail de follow-up com IA', score: 'Pontuar lead com IA', next_action: 'Próxima ação com IA', search: 'Buscar com IA',
    goal: 'Objetivo do e-mail (opcional)', draftOnly: 'É só um rascunho: copie e envie você mesmo. Nada é enviado pelo CRM.',
    copy: 'Copiar', copied: 'Copiado.', createTask: 'Criar a tarefa sugerida', saveAsNote: 'Salvar como nota',
    charged: (n: number) => (n ? `${n} crédito usado.` : 'Sem custo nesta conta.'), refunded: 'A IA falhou e o crédito foi devolvido.',
    noCredits: 'Créditos insuficientes.',
  },
  emailCapture: 'Trazer e-mails do Gmail', emailCaptured: (n: number) => `${n} e-mail(s) virou(aram) nota(s).`, gmailMissing: 'Conecte o Gmail em Conectores para trazer e-mails.',
  csv: { import: 'Importar CSV', export: 'Exportar CSV', imported: (n: number, s: number) => `${n} contato(s) importado(s)${s ? `, ${s} linha(s) ignorada(s)` : ''}.`, hint: 'Aceita o formato do Atomic CRM e colunas como nome, sobrenome, e-mail, telefone, empresa, cargo.' },
  settings: {
    workspace: 'Workspace', name: 'Nome', currency: 'Moeda', language: 'Idioma', autoImport: 'Receber leads do Vertal Prospector e do Growth Team automaticamente',
    pipelines: 'Funis e etapas', addPipeline: 'Novo funil', addStage: 'Nova etapa', probability: 'Probabilidade (%)',
    kind: { open: 'Aberta', won: 'Ganho', lost: 'Perdido' } as Record<string, string>,
    tags: 'Etiquetas', addTag: 'Nova etiqueta', fields: 'Campos personalizados', addField: 'Novo campo', fieldKey: 'Chave', fieldLabel: 'Rótulo', fieldType: 'Tipo',
    entity: { contact: 'Contato', company: 'Empresa', deal: 'Negócio' } as Record<string, string>,
    team: 'Equipe e papéis', invite: 'Adicionar membro', inviteHint: 'A pessoa precisa ter conta no Vertal Dev. Nenhum e-mail é enviado.',
    roles: { owner: 'Dono', admin: 'Admin', member: 'Membro', viewer: 'Leitura' } as Record<string, string>,
    integrations: 'CRMs externos', integrationsHint: 'Conecte o Vertal CRM a um CRM pago pelas conexões do Vertal Fluxos.',
    activate: (n: number) => `Ativar (${n} créditos, uma vez)`, syncAi: (n: number) => `Sincronizar com IA (${n} créditos)`,
    syncPlain: (n: number) => (n ? `Sincronizar sem IA (${n} créditos)` : 'Sincronizar sem IA (grátis)'),
    connectFirst: 'Conecte primeiro em Conectores → Vertal Fluxos.', comingSoon: 'Em breve', active: 'Ativo', push: 'Enviar contatos', pull: 'Trazer contatos',
    api: 'API e webhooks', newKey: 'Nova chave da API', keyOnce: 'Copie agora: a chave aparece só uma vez.', revoke: 'Revogar',
    webhooks: 'Webhooks', newWebhook: 'Novo webhook (https)', secretOnce: 'Segredo de assinatura (aparece só uma vez):',
    importFrom: 'Importar do Prospector / Growth Team', importProspector: 'Importar leads do Prospector', importGrowth: 'Importar contatos do Growth Team',
    imported: (n: number) => `${n} contato(s) novo(s) no CRM.`, fluxos: 'No Vertal Fluxos, use o app “Vertal” (gatilhos e ações do Vertal CRM).',
    dangerZone: 'Zona de perigo',
  },
  pinnedConnector: 'Grátis · IA 1 crédito',
};

export type CrmUi = typeof pt;

const en: CrmUi = {
  ...pt,
  subtitle: 'Free CRM. You only pay when you use AI (1 credit).',
  back: 'Back', loading: 'Loading…',
  tabs: { dashboard: 'Dashboard', contacts: 'Contacts', companies: 'Companies', deals: 'Deals', tasks: 'Tasks', settings: 'Settings' },
  search: 'Search…', aiSearch: 'AI search', aiSearchPlaceholder: 'E.g.: hot leads with no contact in 30 days', new: 'New', save: 'Save', cancel: 'Cancel',
  delete: 'Delete', edit: 'Edit', close: 'Close', confirmDelete: 'Delete permanently? This cannot be undone.', saved: 'Saved.', deleted: 'Deleted.',
  error: 'Something went wrong. Try again.', empty: 'Nothing here yet.',
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', jobTitle: 'Title', company: 'Company', website: 'Website', city: 'City',
  sector: 'Sector', size: 'Size', taxId: 'Tax ID', address: 'Address', background: 'Background', status: 'Status', tags: 'Tags', score: 'Score', source: 'Source', owner: 'Owner',
  dealName: 'Deal name', amount: 'Amount', stage: 'Stage', pipeline: 'Pipeline', closeDate: 'Expected close', category: 'Category', description: 'Description',
  contactStatus: { cold: 'Cold', warm: 'Warm', hot: 'Hot', 'in-contract': 'Customer' },
  taskTypes: { none: 'Task', email: 'Email', demo: 'Demo', lunch: 'Lunch', meeting: 'Meeting', 'follow-up': 'Follow-up', 'thank-you': 'Thank you', ship: 'Ship', call: 'Call' },
  notes: 'Notes', addNote: 'Add note', notePlaceholder: 'Write a note…', tasks: 'Tasks', addTask: 'New task', taskText: 'What to do?', due: 'Due', done: 'Done',
  overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', remind: 'Reminder', timeline: 'Timeline', attachments: 'Attachments', upload: 'Upload file', deals: 'Deals', contacts: 'Contacts',
  kanbanHint: 'Drag cards between stages.', won: 'Won', lost: 'Lost', open: 'Open',
  dash: { pipelineValue: 'Open pipeline', forecast: 'Weighted forecast', winRate: 'Win rate', wonValue: 'Total won', openDeals: 'open deals', byStage: 'By stage', byMonth: 'Forecast by month', tasksToday: 'Tasks & reminders', hot: 'Hot contacts', latest: 'Recent activity', noDate: 'no date' },
  ai: {
    title: 'Vertal CRM AI', cost: (n: number) => `Costs ${n} credit${n === 1 ? '' : 's'}. Refunded if it fails.`, confirm: 'Use AI',
    summary: 'AI summary', email: 'AI follow-up email', score: 'AI lead score', next_action: 'AI next best action', search: 'AI search',
    goal: 'Email goal (optional)', draftOnly: 'Draft only: copy it and send it yourself. The CRM sends nothing.', copy: 'Copy', copied: 'Copied.',
    createTask: 'Create the suggested task', saveAsNote: 'Save as note', charged: (n: number) => (n ? `${n} credit used.` : 'No charge on this account.'),
    refunded: 'AI failed and the credit was refunded.', noCredits: 'Not enough credits.',
  },
  emailCapture: 'Pull emails from Gmail', emailCaptured: (n: number) => `${n} email(s) saved as notes.`, gmailMissing: 'Connect Gmail in Connectors to pull emails.',
  csv: { import: 'Import CSV', export: 'Export CSV', imported: (n: number, s: number) => `${n} contact(s) imported${s ? `, ${s} row(s) skipped` : ''}.`, hint: 'Accepts the Atomic CRM format and columns like first name, last name, email, phone, company, title.' },
  settings: {
    ...pt.settings,
    workspace: 'Workspace', name: 'Name', currency: 'Currency', language: 'Language', autoImport: 'Receive leads from Vertal Prospector and Growth Team automatically',
    pipelines: 'Pipelines & stages', addPipeline: 'New pipeline', addStage: 'New stage', probability: 'Probability (%)', kind: { open: 'Open', won: 'Won', lost: 'Lost' },
    tags: 'Tags', addTag: 'New tag', fields: 'Custom fields', addField: 'New field', fieldKey: 'Key', fieldLabel: 'Label', fieldType: 'Type',
    entity: { contact: 'Contact', company: 'Company', deal: 'Deal' }, team: 'Team & roles', invite: 'Add member', inviteHint: 'They need a Vertal Dev account. No email is sent.',
    roles: { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }, integrations: 'External CRMs', integrationsHint: 'Connect Vertal CRM to a paid CRM through your Vertal Fluxos connections.',
    activate: (n: number) => `Activate (${n} credits, once)`, syncAi: (n: number) => `Sync with AI (${n} credits)`, syncPlain: (n: number) => (n ? `Sync without AI (${n} credits)` : 'Sync without AI (free)'),
    connectFirst: 'Connect it first in Connectors → Vertal Fluxos.', comingSoon: 'Coming soon', active: 'Active', push: 'Push contacts', pull: 'Pull contacts',
    api: 'API & webhooks', newKey: 'New API key', keyOnce: 'Copy it now: the key is shown only once.', revoke: 'Revoke', webhooks: 'Webhooks', newWebhook: 'New webhook (https)',
    secretOnce: 'Signing secret (shown only once):', importFrom: 'Import from Prospector / Growth Team', importProspector: 'Import Prospector leads', importGrowth: 'Import Growth Team contacts',
    imported: (n: number) => `${n} new contact(s) in the CRM.`, fluxos: 'In Vertal Fluxos, use the “Vertal” app (Vertal CRM triggers and actions).', dangerZone: 'Danger zone',
  },
  pinnedConnector: 'Free · AI 1 credit',
};

const es: CrmUi = {
  ...en,
  subtitle: 'CRM gratis. Solo pagas cuando usas la IA (1 crédito).',
  back: 'Volver', loading: 'Cargando…',
  tabs: { dashboard: 'Panel', contacts: 'Contactos', companies: 'Empresas', deals: 'Negocios', tasks: 'Tareas', settings: 'Configuración' },
  search: 'Buscar…', aiSearch: 'Búsqueda con IA', aiSearchPlaceholder: 'Ej.: leads calientes sin contacto hace 30 días', new: 'Nuevo', save: 'Guardar', cancel: 'Cancelar',
  delete: 'Borrar', edit: 'Editar', close: 'Cerrar', confirmDelete: '¿Borrar definitivamente? No se puede deshacer.', saved: 'Guardado.', deleted: 'Borrado.',
  error: 'Algo salió mal. Inténtalo de nuevo.', empty: 'Nada por aquí todavía.',
  firstName: 'Nombre', lastName: 'Apellido', email: 'Correo', phone: 'Teléfono', jobTitle: 'Cargo', company: 'Empresa', website: 'Sitio', city: 'Ciudad', sector: 'Sector',
  size: 'Tamaño', taxId: 'ID fiscal', address: 'Dirección', background: 'Observaciones', status: 'Estado', tags: 'Etiquetas', score: 'Puntuación', source: 'Origen', owner: 'Responsable',
  dealName: 'Nombre del negocio', amount: 'Valor', stage: 'Etapa', pipeline: 'Embudo', closeDate: 'Cierre previsto', category: 'Categoría', description: 'Descripción',
  contactStatus: { cold: 'Frío', warm: 'Tibio', hot: 'Caliente', 'in-contract': 'Cliente' },
  taskTypes: { none: 'Tarea', email: 'Correo', demo: 'Demostración', lunch: 'Almuerzo', meeting: 'Reunión', 'follow-up': 'Seguimiento', 'thank-you': 'Agradecimiento', ship: 'Entrega', call: 'Llamada' },
  notes: 'Notas', addNote: 'Agregar nota', notePlaceholder: 'Escribe una nota…', tasks: 'Tareas', addTask: 'Nueva tarea', taskText: '¿Qué hacer?', due: 'Plazo', done: 'Hecha',
  overdue: 'Atrasada', today: 'Hoy', upcoming: 'Próximas', remind: 'Recordatorio', timeline: 'Historial', attachments: 'Adjuntos', upload: 'Subir archivo', deals: 'Negocios', contacts: 'Contactos',
  kanbanHint: 'Arrastra las tarjetas entre etapas.', won: 'Ganado', lost: 'Perdido', open: 'Abierto',
  dash: { pipelineValue: 'Valor abierto', forecast: 'Previsión ponderada', winRate: 'Tasa de cierre', wonValue: 'Total ganado', openDeals: 'negocios abiertos', byStage: 'Por etapa', byMonth: 'Previsión por mes', tasksToday: 'Tareas y recordatorios', hot: 'Contactos calientes', latest: 'Actividad reciente', noDate: 'sin fecha' },
  ai: {
    ...en.ai, title: 'IA de Vertal CRM', cost: (n: number) => `Cuesta ${n} crédito${n === 1 ? '' : 's'}. Si falla, lo devolvemos.`, confirm: 'Usar IA',
    summary: 'Resumen con IA', email: 'Correo de seguimiento con IA', score: 'Puntuar lead con IA', next_action: 'Próxima acción con IA', search: 'Buscar con IA',
    goal: 'Objetivo del correo (opcional)', draftOnly: 'Es solo un borrador: cópialo y envíalo tú. El CRM no envía nada.', copy: 'Copiar', copied: 'Copiado.',
    createTask: 'Crear la tarea sugerida', saveAsNote: 'Guardar como nota', charged: (n: number) => (n ? `${n} crédito usado.` : 'Sin costo en esta cuenta.'),
    refunded: 'La IA falló y el crédito fue devuelto.', noCredits: 'Créditos insuficientes.',
  },
  emailCapture: 'Traer correos de Gmail', emailCaptured: (n: number) => `${n} correo(s) guardado(s) como nota.`, gmailMissing: 'Conecta Gmail en Conectores para traer correos.',
  csv: { import: 'Importar CSV', export: 'Exportar CSV', imported: (n: number, s: number) => `${n} contacto(s) importado(s)${s ? `, ${s} fila(s) ignorada(s)` : ''}.`, hint: 'Acepta el formato de Atomic CRM y columnas como nombre, apellido, correo, teléfono, empresa, cargo.' },
  settings: {
    ...en.settings,
    workspace: 'Espacio', name: 'Nombre', currency: 'Moneda', language: 'Idioma', autoImport: 'Recibir leads de Vertal Prospector y Growth Team automáticamente',
    pipelines: 'Embudos y etapas', addPipeline: 'Nuevo embudo', addStage: 'Nueva etapa', probability: 'Probabilidad (%)', kind: { open: 'Abierta', won: 'Ganado', lost: 'Perdido' },
    tags: 'Etiquetas', addTag: 'Nueva etiqueta', fields: 'Campos personalizados', addField: 'Nuevo campo', fieldKey: 'Clave', fieldLabel: 'Etiqueta', fieldType: 'Tipo',
    entity: { contact: 'Contacto', company: 'Empresa', deal: 'Negocio' }, team: 'Equipo y roles', invite: 'Agregar miembro', inviteHint: 'Necesita cuenta en Vertal Dev. No se envía ningún correo.',
    roles: { owner: 'Dueño', admin: 'Admin', member: 'Miembro', viewer: 'Lectura' }, integrations: 'CRMs externos', integrationsHint: 'Conecta Vertal CRM a un CRM pago con tus conexiones de Vertal Fluxos.',
    activate: (n: number) => `Activar (${n} créditos, una vez)`, syncAi: (n: number) => `Sincronizar con IA (${n} créditos)`, syncPlain: (n: number) => (n ? `Sincronizar sin IA (${n} créditos)` : 'Sincronizar sin IA (gratis)'),
    connectFirst: 'Conéctalo primero en Conectores → Vertal Fluxos.', comingSoon: 'Próximamente', active: 'Activo', push: 'Enviar contactos', pull: 'Traer contactos',
    api: 'API y webhooks', newKey: 'Nueva clave de API', keyOnce: 'Cópiala ahora: la clave se muestra una sola vez.', revoke: 'Revocar', webhooks: 'Webhooks', newWebhook: 'Nuevo webhook (https)',
    secretOnce: 'Secreto de firma (se muestra una sola vez):', importFrom: 'Importar de Prospector / Growth Team', importProspector: 'Importar leads de Prospector', importGrowth: 'Importar contactos de Growth Team',
    imported: (n: number) => `${n} contacto(s) nuevo(s) en el CRM.`, fluxos: 'En Vertal Fluxos, usa la app “Vertal” (disparadores y acciones de Vertal CRM).', dangerZone: 'Zona de peligro',
  },
  pinnedConnector: 'Gratis · IA 1 crédito',
};

export const CRM_UI: Record<CrmLang, CrmUi> = { pt, en, es };
export const crmUi = (lang: CrmLang = browserLang()) => CRM_UI[lang] ?? pt;

/** Mensagem amigável para códigos de erro do servidor. */
export function crmErrorText(code: string, t: CrmUi): string {
  if (code === 'insufficient_credits') return t.ai.noCredits;
  if (code === 'provider_not_connected') return t.settings.connectFirst;
  if (code === 'gmail_not_connected') return t.gmailMissing;
  return `${t.error} (${code})`;
}
