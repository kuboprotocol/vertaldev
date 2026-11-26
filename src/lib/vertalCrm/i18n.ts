// Vertal CRM · textos da tela nos 21 idiomas das páginas de SEO do CRM grátis (pt-BR padrão, en e es aqui;
// os outros 18 em ./locales). Idioma nativo do usuário: ?lang → ajuste do workspace → idioma do workspace → salvo → navegador → pt-BR.
import type { CrmLang } from '../../../supabase/functions/_shared/vertalCrm/core';
import { resolveUiLang, uiLocale, uiDir, UI_LANG_NAMES, UI_LANGS } from '../../../supabase/functions/_shared/vertalUiLang';
import { CRM_LOCALE_SOURCES } from './locales';

export type { CrmLang };
export { uiDir, UI_LANGS };

export function uiLangFrom(...hints: Array<string | null | undefined>): CrmLang {
  return resolveUiLang(...hints);
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
    results: (n: number) => `${n} resultado${n === 1 ? '' : 's'}`,
    slow: 'A IA ainda está trabalhando… (pode levar até 2 minutos)',
    slowGaveUp: 'A IA está demorando demais. Se o resultado não vier, o crédito volta sozinho em até 10 minutos.',
    planRequired: 'A IA do CRM faz parte de qualquer plano pago do Vertal Dev. O resto do CRM continua grátis. Veja os planos em vertal.dev/pricing.',
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
  docTitle: 'Vertal CRM — CRM grátis | Vertal Dev',
  connectorsTitle: 'Conectores | Vertal Dev',
  you: 'você',
  openDealsN: (n: number) => `${n} ${n === 1 ? 'negócio aberto' : 'negócios abertos'}`,
  exported: (n: number) => `CSV baixado: ${n} contato(s).`,
  languageNames: UI_LANG_NAMES as Record<string, string>,
  activity: {
    'contact.created': 'Contato criado', 'contact.updated': 'Contato atualizado', 'contact.deleted': 'Contato apagado',
    'company.created': 'Empresa criada', 'company.updated': 'Empresa atualizada', 'company.deleted': 'Empresa apagada',
    'deal.created': 'Negócio criado', 'deal.updated': 'Negócio atualizado', 'deal.stage_changed': 'Negócio mudou de etapa', 'deal.won': 'Negócio ganho', 'deal.lost': 'Negócio perdido', 'deal.deleted': 'Negócio apagado',
    'task.created': 'Tarefa criada', 'task.updated': 'Tarefa atualizada', 'task.completed': 'Tarefa concluída', 'task.deleted': 'Tarefa apagada',
    'note.created': 'Nota adicionada', 'note.updated': 'Nota editada', 'note.deleted': 'Nota apagada',
  } as Record<string, string>,
  sources: { manual: 'manual', ai: 'IA', csv: 'CSV', prospector: 'Vertal Prospector', growth: 'Vertal Growth', gmail: 'Gmail', api: 'API', fluxos: 'Vertal Fluxos', email: 'e-mail' } as Record<string, string>,
  dnd: {
    instructions: 'Para mover um negócio: pressione espaço ou Enter para pegar, use as setas para mudar de etapa e espaço ou Enter para soltar. Esc cancela.',
    start: (deal: string) => `Pegou o negócio ${deal}.`,
    over: (deal: string, stage: string) => `Negócio ${deal} sobre a etapa ${stage}.`,
    end: (deal: string, stage: string) => `Negócio ${deal} solto na etapa ${stage}.`,
    cancel: (deal: string) => `Movimento do negócio ${deal} cancelado.`,
  },
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
    refunded: 'AI failed and the credit was refunded.', noCredits: 'Not enough credits.', results: (n: number) => `${n} result${n === 1 ? '' : 's'}`,
    slow: 'The AI is still working… (can take up to 2 minutes)', slowGaveUp: 'The AI is taking too long. If no result arrives, the credit comes back automatically within 10 minutes.',
    planRequired: 'CRM AI is included in any paid Vertal Dev plan. The rest of the CRM stays free. See plans at vertal.dev/pricing.',
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
  docTitle: 'Vertal CRM — Free CRM | Vertal Dev',
  connectorsTitle: 'Connectors | Vertal Dev',
  you: 'you',
  openDealsN: (n: number) => `${n} open ${n === 1 ? 'deal' : 'deals'}`,
  exported: (n: number) => `CSV downloaded: ${n} contact(s).`,
  activity: {
    'contact.created': 'Contact created', 'contact.updated': 'Contact updated', 'contact.deleted': 'Contact deleted',
    'company.created': 'Company created', 'company.updated': 'Company updated', 'company.deleted': 'Company deleted',
    'deal.created': 'Deal created', 'deal.updated': 'Deal updated', 'deal.stage_changed': 'Deal changed stage', 'deal.won': 'Deal won', 'deal.lost': 'Deal lost', 'deal.deleted': 'Deal deleted',
    'task.created': 'Task created', 'task.updated': 'Task updated', 'task.completed': 'Task completed', 'task.deleted': 'Task deleted',
    'note.created': 'Note added', 'note.updated': 'Note edited', 'note.deleted': 'Note deleted',
  },
  sources: { manual: 'manual', ai: 'AI', csv: 'CSV', prospector: 'Vertal Prospector', growth: 'Vertal Growth', gmail: 'Gmail', api: 'API', fluxos: 'Vertal Fluxos', email: 'email' },
  dnd: {
    instructions: 'To move a deal: press space or Enter to pick it up, use the arrow keys to change stage, and space or Enter to drop it. Esc cancels.',
    start: (deal: string) => `Picked up deal ${deal}.`,
    over: (deal: string, stage: string) => `Deal ${deal} is over stage ${stage}.`,
    end: (deal: string, stage: string) => `Deal ${deal} dropped in stage ${stage}.`,
    cancel: (deal: string) => `Moving deal ${deal} was cancelled.`,
  },
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
    refunded: 'La IA falló y el crédito fue devuelto.', noCredits: 'Créditos insuficientes.', results: (n: number) => `${n} resultado${n === 1 ? '' : 's'}`,
    slow: 'La IA sigue trabajando… (puede tardar hasta 2 minutos)', slowGaveUp: 'La IA está tardando demasiado. Si no llega el resultado, el crédito vuelve solo en hasta 10 minutos.',
    planRequired: 'La IA del CRM está incluida en cualquier plan de pago de Vertal Dev. El resto del CRM sigue siendo gratis. Mira los planes en vertal.dev/pricing.',
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
  docTitle: 'Vertal CRM — CRM gratis | Vertal Dev',
  connectorsTitle: 'Conectores | Vertal Dev',
  you: 'tú',
  openDealsN: (n: number) => `${n} ${n === 1 ? 'negocio abierto' : 'negocios abiertos'}`,
  exported: (n: number) => `CSV descargado: ${n} contacto(s).`,
  activity: {
    'contact.created': 'Contacto creado', 'contact.updated': 'Contacto actualizado', 'contact.deleted': 'Contacto borrado',
    'company.created': 'Empresa creada', 'company.updated': 'Empresa actualizada', 'company.deleted': 'Empresa borrada',
    'deal.created': 'Negocio creado', 'deal.updated': 'Negocio actualizado', 'deal.stage_changed': 'Negocio cambió de etapa', 'deal.won': 'Negocio ganado', 'deal.lost': 'Negocio perdido', 'deal.deleted': 'Negocio borrado',
    'task.created': 'Tarea creada', 'task.updated': 'Tarea actualizada', 'task.completed': 'Tarea completada', 'task.deleted': 'Tarea borrada',
    'note.created': 'Nota agregada', 'note.updated': 'Nota editada', 'note.deleted': 'Nota borrada',
  },
  sources: { manual: 'manual', ai: 'IA', csv: 'CSV', prospector: 'Vertal Prospector', growth: 'Vertal Growth', gmail: 'Gmail', api: 'API', fluxos: 'Vertal Fluxos', email: 'correo' },
  dnd: {
    instructions: 'Para mover un negocio: pulse espacio o Enter para tomarlo, use las flechas para cambiar de etapa y espacio o Enter para soltarlo. Esc cancela.',
    start: (deal: string) => `Tomó el negocio ${deal}.`,
    over: (deal: string, stage: string) => `Negocio ${deal} sobre la etapa ${stage}.`,
    end: (deal: string, stage: string) => `Negocio ${deal} soltado en la etapa ${stage}.`,
    cancel: (deal: string) => `Se canceló el movimiento del negocio ${deal}.`,
  },
};

// ─── Os outros 18 idiomas: textos simples + modelos com {marcadores} (./locales) ─────────────
type Fn = (...a: never[]) => unknown;
/** CrmUi sem as funções (as frases com números/nomes ficam em `fx`) e sem os nomes dos idiomas (iguais em todos). */
export type StripFns<T> = {
  [K in keyof T as T[K] extends Fn ? never : K]: T[K] extends string ? string : StripFns<T[K]>;
};
export interface CrmFx {
  /** {n} */ aiCost: string; aiCharged: string; aiChargedFree: string; aiResults: string;
  /** {n} */ emailCaptured: string;
  /** {n} e {skipped} (= csvSkipped com {s}, ou vazio) */ csvImported: string; csvSkipped: string;
  /** {n} */ activate: string; syncAi: string; syncPlain: string; syncPlainFree: string; imported: string; openDealsN: string; exported: string;
  /** {deal} / {stage} */ dndStart: string; dndOver: string; dndEnd: string; dndCancel: string;
}
export type CrmLocaleSource = Omit<StripFns<CrmUi>, 'languageNames'> & { fx: CrmFx };

/** Troca {chave} pelo valor. */
export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function buildCrmUi(src: CrmLocaleSource): CrmUi {
  const { fx, ...rest } = src;
  return {
    ...rest,
    languageNames: UI_LANG_NAMES as Record<string, string>,
    ai: {
      ...rest.ai,
      cost: (n: number) => fill(fx.aiCost, { n }),
      charged: (n: number) => (n ? fill(fx.aiCharged, { n }) : fx.aiChargedFree),
      results: (n: number) => fill(fx.aiResults, { n }),
    },
    emailCaptured: (n: number) => fill(fx.emailCaptured, { n }),
    csv: { ...rest.csv, imported: (n: number, s: number) => fill(fx.csvImported, { n, skipped: s ? fill(fx.csvSkipped, { s }) : '' }) },
    settings: {
      ...rest.settings,
      activate: (n: number) => fill(fx.activate, { n }),
      syncAi: (n: number) => fill(fx.syncAi, { n }),
      syncPlain: (n: number) => (n ? fill(fx.syncPlain, { n }) : fx.syncPlainFree),
      imported: (n: number) => fill(fx.imported, { n }),
    },
    openDealsN: (n: number) => fill(fx.openDealsN, { n }),
    exported: (n: number) => fill(fx.exported, { n }),
    dnd: {
      ...rest.dnd,
      start: (deal: string) => fill(fx.dndStart, { deal }),
      over: (deal: string, stage: string) => fill(fx.dndOver, { deal, stage }),
      end: (deal: string, stage: string) => fill(fx.dndEnd, { deal, stage }),
      cancel: (deal: string) => fill(fx.dndCancel, { deal }),
    },
  } as CrmUi;
}

export const CRM_UI: Record<CrmLang, CrmUi> = {
  pt, en, es,
  ...(Object.fromEntries(Object.entries(CRM_LOCALE_SOURCES).map(([k, v]) => [k, buildCrmUi(v)])) as Record<Exclude<CrmLang, 'pt' | 'en' | 'es'>, CrmUi>),
};
export const crmUi = (lang: CrmLang = browserLang()) => CRM_UI[lang] ?? pt;

/** Locale de datas/números: pt → pt-BR (dd/mm/aaaa, 24 h), es → es-ES, en → en-US, os outros pelo próprio código. */
export const crmLocale = (lang: CrmLang): string => uiLocale(lang);
export function crmDateTime(iso: string | null | undefined, lang: CrmLang): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(crmLocale(lang), { dateStyle: 'short', timeStyle: 'short', hour12: lang === 'en' ? true : lang === 'pt' || lang === 'es' ? false : undefined });
}
/** Data sem hora (ex.: previsão de fechamento "2026-12-01" → "01/12/2026" em pt-BR), sem deslocar o dia pelo fuso. */
export function crmDate(isoDate: string | null | undefined, lang: CrmLang): string {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(crmLocale(lang), { timeZone: m ? 'UTC' : undefined });
}
/** Texto legível de um evento técnico (deal.stage_changed → "Negócio mudou de etapa"). */
export function crmActivityText(kind: string, t: CrmUi): string {
  return t.activity[kind] ?? String(kind ?? '').replace(/[._]/g, ' ');
}
export const crmSourceText = (src: string | null | undefined, t: CrmUi): string => (src ? t.sources[src] ?? src : '—');
/** Corta com reticências (antes o texto da nota sumia no meio da palavra). */
export const ellipsis = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Mensagem amigável para códigos de erro do servidor. */
export function crmErrorText(code: string, t: CrmUi): string {
  if (code === 'insufficient_credits') return t.ai.noCredits;
  if (code === 'plan_required') return t.ai.planRequired;
  if (code === 'provider_not_connected') return t.settings.connectFirst;
  if (code === 'gmail_not_connected') return t.gmailMissing;
  return `${t.error} (${code})`;
}
