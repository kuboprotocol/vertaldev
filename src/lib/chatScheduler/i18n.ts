// Vertal Chat · Agendador — textos da tela em pt-BR / en / es.
// O app não tem um sistema de i18n global; este dicionário vale só para o Agendador.
// Idioma: Ajustes → Idioma (se não for "automático") → idioma do navegador → pt-BR.
import { normLang, uiLang, type UiLang } from '../../../supabase/functions/_shared/chatScheduler';

export type { UiLang };

export function browserLocale(): string | null {
  try {
    return typeof navigator !== 'undefined' ? navigator.language || null : null;
  } catch {
    return null;
  }
}

/** Idioma da tela do Agendador. `setting` = valor salvo em Ajustes ("auto" ou um idioma). */
export function schedulerUiLang(setting?: string | null, browser: string | null = browserLocale()): UiLang {
  return uiLang(normLang(setting) ?? normLang(browser) ?? 'pt-BR');
}

export function dateLocale(l: UiLang): string {
  return l === 'en' ? 'en-US' : l === 'es' ? 'es-ES' : 'pt-BR';
}

const pt = {
  name: 'Tarefas agendadas',
  button: 'Tarefas',
  description: 'Peça no chat: "me lembre amanhã às 9h", "todo dia às 8h…", "agende uma consulta…" ou "quando eu receber um e-mail de…".',
  tabTasks: 'Tarefas', tabAgenda: 'Agenda', tabSettings: 'Ajustes',
  refresh: 'Atualizar', loading: 'Carregando…', empty: 'Nenhuma tarefa ainda. Ideias para pedir no chat:', copied: 'Copiado. Cole no chat.',
  next: 'Próxima', last: 'Última', runs: (n: number) => `${n} execução(ões)`, error: 'Erro', sendTo: 'Pode enviar e-mail para',
  pause: 'Pausar', activate: 'Ativar', runNow: 'Rodar agora', history: 'Histórico', del: 'Apagar', confirmDelete: (t: string) => `Apagar "${t}"?`,
  ranNow: 'Rodou agora. O resultado está na conversa da tarefa.', neverRan: 'Ainda não rodou.',
  agendaEmpty: 'Nenhum compromisso. Peça no chat: "agende uma consulta…".', inGoogle: 'No seu Google Agenda', addGoogle: 'Adicionar ao Google Agenda',
  timezone: 'Fuso horário', quiet: 'Horário de silêncio (gatilhos e repetições automáticas esperam; hora marcada sempre toca)', until: 'até', save: 'Salvar',
  notifyEmail: 'Também me avisar por e-mail (para a sua própria conta do Gmail)', saved: 'Ajustes salvos.',
  language: 'Idioma', languageHint: 'Lembretes, resultados e avisos saem neste idioma. "Automático" usa o idioma em que você pediu a tarefa.',
  langAuto: 'Automático', toastFallback: 'Rodou agora. Veja o resultado na conversa.', taskFallback: 'Tarefa agendada',
  cardHost: 'Vertal Chat · Tarefas agendadas', warning: 'Aviso', newTask: 'nova tarefa', task: 'tarefa',
  deleteReason: 'Apagar esta tarefa agendada (e o compromisso da agenda, se houver). Não dá para desfazer.',
  permSendTo: (l: string) => `Passa a poder enviar e-mail para: ${l}`,
  permApps: 'Passa a poder executar ações nos seus apps conectados (Vertal Fluxos)', permNotify: 'Também avisa você por e-mail',
  kind: { task: 'Tarefa', reminder: 'Lembrete', appointment: 'Consulta', email_trigger: 'Gatilho de e-mail' },
  status: { active: 'Ativa', paused: 'Pausada', done: 'Concluída', failed: 'Falhou' },
  runStatus: { running: 'rodando', ok: 'ok', error: 'erro', skipped: 'pulada' } as Record<string, string>,
  runTrigger: { schedule: 'agendada', retry: 'nova tentativa', manual: 'manual', email: 'e-mail' } as Record<string, string>,
  errors: {
    not_found: 'As tarefas agendadas ainda não estão liberadas para a sua conta.',
    task_not_found: 'Não achei essa tarefa.',
    Unauthorized: 'Sua sessão expirou. Entre novamente.',
    save_failed: 'Não consegui salvar agora. Tente de novo em instantes.',
    rate: 'Muitos pedidos em pouco tempo. Aguarde um minuto.',
    generic: 'Não consegui falar com as tarefas agendadas agora.',
    notOk: 'Não deu certo.',
  } as Record<string, string>,
};

type Dict = typeof pt;

const en: Dict = {
  name: 'Scheduled tasks',
  button: 'Tasks',
  description: 'Ask in the chat: "remind me tomorrow at 9am", "every day at 8am…", "schedule an appointment…" or "when I get an email from…".',
  tabTasks: 'Tasks', tabAgenda: 'Calendar', tabSettings: 'Settings',
  refresh: 'Refresh', loading: 'Loading…', empty: 'No tasks yet. Ideas to ask in the chat:', copied: 'Copied. Paste it in the chat.',
  next: 'Next', last: 'Last', runs: (n: number) => `${n} run(s)`, error: 'Error', sendTo: 'May send email to',
  pause: 'Pause', activate: 'Activate', runNow: 'Run now', history: 'History', del: 'Delete', confirmDelete: (t: string) => `Delete "${t}"?`,
  ranNow: 'Ran just now. The result is in the task\'s conversation.', neverRan: 'Has not run yet.',
  agendaEmpty: 'No appointments. Ask in the chat: "schedule an appointment…".', inGoogle: 'In your Google Calendar', addGoogle: 'Add to Google Calendar',
  timezone: 'Time zone', quiet: 'Quiet hours (triggers and automatic repeats wait; times you set always fire)', until: 'to', save: 'Save',
  notifyEmail: 'Also notify me by email (to your own Gmail account)', saved: 'Settings saved.',
  language: 'Language', languageHint: 'Reminders, results and notices use this language. "Automatic" uses the language you asked for the task in.',
  langAuto: 'Automatic', toastFallback: 'Ran just now. See the result in the conversation.', taskFallback: 'Scheduled task',
  cardHost: 'Vertal Chat · Scheduled tasks', warning: 'Note', newTask: 'new task', task: 'task',
  deleteReason: 'Delete this scheduled task (and its calendar appointment, if any). This cannot be undone.',
  permSendTo: (l: string) => `Will be allowed to email: ${l}`,
  permApps: 'Will be allowed to run actions in your connected apps (Vertal Fluxos)', permNotify: 'Also notifies you by email',
  kind: { task: 'Task', reminder: 'Reminder', appointment: 'Appointment', email_trigger: 'Email trigger' },
  status: { active: 'Active', paused: 'Paused', done: 'Done', failed: 'Failed' },
  runStatus: { running: 'running', ok: 'ok', error: 'error', skipped: 'skipped' },
  runTrigger: { schedule: 'scheduled', retry: 'retry', manual: 'manual', email: 'email' },
  errors: {
    not_found: 'Scheduled tasks are not enabled for your account yet.',
    task_not_found: 'I couldn\'t find that task.',
    Unauthorized: 'Your session expired. Please sign in again.',
    save_failed: 'Couldn\'t save right now. Try again in a moment.',
    rate: 'Too many requests in a short time. Wait a minute.',
    generic: 'Couldn\'t reach scheduled tasks right now.',
    notOk: 'That didn\'t work.',
  },
};

const es: Dict = {
  name: 'Tareas programadas',
  button: 'Tareas',
  description: 'Pídelo en el chat: "recuérdame mañana a las 9", "todos los días a las 8…", "agenda una cita…" o "cuando reciba un correo de…".',
  tabTasks: 'Tareas', tabAgenda: 'Agenda', tabSettings: 'Ajustes',
  refresh: 'Actualizar', loading: 'Cargando…', empty: 'Aún no hay tareas. Ideas para pedir en el chat:', copied: 'Copiado. Pégalo en el chat.',
  next: 'Próxima', last: 'Última', runs: (n: number) => `${n} ejecución(es)`, error: 'Error', sendTo: 'Puede enviar correo a',
  pause: 'Pausar', activate: 'Activar', runNow: 'Ejecutar ahora', history: 'Historial', del: 'Borrar', confirmDelete: (t: string) => `¿Borrar "${t}"?`,
  ranNow: 'Se ejecutó ahora. El resultado está en la conversación de la tarea.', neverRan: 'Aún no se ha ejecutado.',
  agendaEmpty: 'No hay citas. Pídelo en el chat: "agenda una cita…".', inGoogle: 'En tu Google Calendar', addGoogle: 'Añadir a Google Calendar',
  timezone: 'Zona horaria', quiet: 'Horario de silencio (disparadores y repeticiones automáticas esperan; la hora que fijes siempre suena)', until: 'hasta', save: 'Guardar',
  notifyEmail: 'Avisarme también por correo (a tu propia cuenta de Gmail)', saved: 'Ajustes guardados.',
  language: 'Idioma', languageHint: 'Recordatorios, resultados y avisos salen en este idioma. "Automático" usa el idioma en que pediste la tarea.',
  langAuto: 'Automático', toastFallback: 'Se ejecutó ahora. Mira el resultado en la conversación.', taskFallback: 'Tarea programada',
  cardHost: 'Vertal Chat · Tareas programadas', warning: 'Aviso', newTask: 'nueva tarea', task: 'tarea',
  deleteReason: 'Borrar esta tarea programada (y la cita de la agenda, si la hay). No se puede deshacer.',
  permSendTo: (l: string) => `Podrá enviar correo a: ${l}`,
  permApps: 'Podrá ejecutar acciones en tus apps conectadas (Vertal Fluxos)', permNotify: 'También te avisa por correo',
  kind: { task: 'Tarea', reminder: 'Recordatorio', appointment: 'Cita', email_trigger: 'Disparador de correo' },
  status: { active: 'Activa', paused: 'Pausada', done: 'Completada', failed: 'Falló' },
  runStatus: { running: 'en curso', ok: 'ok', error: 'error', skipped: 'omitida' },
  runTrigger: { schedule: 'programada', retry: 'reintento', manual: 'manual', email: 'correo' },
  errors: {
    not_found: 'Las tareas programadas aún no están habilitadas para tu cuenta.',
    task_not_found: 'No encontré esa tarea.',
    Unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    save_failed: 'No pude guardar ahora. Inténtalo de nuevo en un momento.',
    rate: 'Demasiadas solicitudes en poco tiempo. Espera un minuto.',
    generic: 'No pude conectar con las tareas programadas ahora.',
    notOk: 'No funcionó.',
  },
};

export const SCHEDULER_UI: Record<UiLang, Dict> = { pt, en, es };

export function schedUi(l: UiLang): Dict {
  return SCHEDULER_UI[l] ?? pt;
}

/** Opções do seletor "Idioma" em Ajustes (rótulos no próprio idioma). */
export const LANG_CHOICES: Array<{ value: string; label: (l: UiLang) => string }> = [
  { value: 'auto', label: (l) => schedUi(l).langAuto },
  { value: 'pt-BR', label: () => 'Português (Brasil)' },
  { value: 'en', label: () => 'English' },
  { value: 'es', label: () => 'Español' },
];
