// Vertal Chat · Agendador — dicionário ÚNICO dos textos fixos (servidor + tela + cartão de permissão).
//
// Uma estrutura só: cada idioma é um mapa plano chave → texto, com marcadores {n}, {t}, {title}…
// Ordem de busca de uma chave: o próprio idioma → o idioma-base de uma variante (de-CH → de)
// → um apelido no mesmo idioma (ex.: tabTasks = button) → pt-BR. Ou seja: chave faltando cai no pt-BR.
//
// pt-BR, en e es ficam aqui (sempre carregados; a tela usa direto). Os demais idiomas ficam em
// `chatSchedulerLangs/` e são registrados com `registerSchedulerLangs` (servidor: no import da função;
// navegador: import dinâmico só quando o Agendador está liberado, para não pesar o app de ninguém).
//
// As traduções fora de pt/en/es foram feitas por máquina (IA) e precisam de revisão nativa.

// ─── Chaves ──────────────────────────────────────────────────────────────

/** Chaves que TODO idioma precisa ter (o teste confere). */
export const SCHED_REQUIRED_KEYS = [
  // nomes
  "name", "button", "description", "taskWord", "kindTask", "kindReminder", "kindAppt", "kindEmail",
  // quando
  "once", "daily", "weekdays", "weekly", "monthly", "everyH", "everyMin", "cron", "email",
  // cartão de confirmação
  "when", "until", "place", "agenda", "agendaVertal", "reminderBefore", "next", "from", "subject", "search", "trigger",
  "criteria", "ifPos", "ifNeg", "ifNeu", "todo", "sendTo", "noSend", "appActions", "notifyEmail", "tz", "language",
  // erros e avisos da criação
  "errFromSubject", "errBranches", "errApptTime", "errPast", "errCron", "errWhen", "noTime", "remindSoon",
  // o que a tarefa posta
  "apptReminder", "inGoogle", "addGoogle", "failed", "noResult", "needsGmail", "gmailMissing", "mailArrived", "classified",
  "noAction", "actionFailed", "noNewMail", "sentPos", "sentNeg", "sentNeu", "nothing", "tooMany", "pastEdit",
  // painel
  "tabSettings", "refresh", "loading", "empty", "copied", "last", "runs", "error", "pause", "activate", "runNow", "history", "del",
  "confirmDelete", "ranNow", "neverRan", "agendaEmpty", "quiet", "save", "notifyMe", "saved", "languageHint", "langAuto",
  "warning", "deleteReason", "permSendTo", "stActive", "stPaused", "stDone", "stFailed", "rsRunning", "rsSkipped",
  "trScheduled", "trRetry", "trManual", "errNotEnabled", "errSession", "errGeneric", "errRate",
  // cartão "Permitir esta ação?"
  "dlgTitle", "dlgDesc", "dlgService", "dlgCall", "dlgSummary", "dlgDeny", "dlgAllow",
  // modelos prontos
  "tplDaily", "tplWeekly", "tplApproval", "tplPayment", "exReminder", "exDaily", "exWeekly", "exAppt", "exApproval", "exPayment",
] as const;

/** Chaves opcionais: sem valor no idioma, viram o apelido abaixo (no MESMO idioma). */
export const SCHED_OPTIONAL_KEYS = [
  "dow", "at", "uiKindAppt", "defaultTask", "defaultAppt", "reminder", "taskHeader", "failSubject", "trig", "agendaGoogle",
  "emailFooter", "errNoNext", "tabTasks", "tabAgenda", "uiNext", "uiInGoogle", "uiTz", "uiUntil", "toastFallback",
  "taskFallback", "cardHost", "newTask", "task", "permApps", "permNotify", "rsError", "trEmail", "errTaskNotFound",
  "errSaveFailed", "errNotOk", "tplReminder", "tplAppt", "dlgMethod",
] as const;

export type SchedRequiredKey = typeof SCHED_REQUIRED_KEYS[number];
export type SchedOptionalKey = typeof SCHED_OPTIONAL_KEYS[number];
export type SchedKey = SchedRequiredKey | SchedOptionalKey;
export type SchedStrings = Partial<Record<SchedKey, string>>;

type Get = (k: SchedKey) => string;
const cap = (s: string, loc: string) => (s ? s.charAt(0).toLocaleUpperCase(loc) + s.slice(1) : s);
const low = (s: string, loc: string) => s.toLocaleLowerCase(loc);

/** Apelidos das chaves opcionais. */
const ALIAS: Record<SchedOptionalKey, (g: Get, loc: string) => string> = {
  dow: () => "",
  at: () => "",
  uiKindAppt: (g) => g("kindAppt"),
  defaultTask: (g) => g("taskWord"),
  defaultAppt: (g) => g("uiKindAppt"),
  reminder: (g) => g("kindReminder"),
  taskHeader: (g) => g("kindTask"),
  failSubject: (g) => g("stFailed"),
  trig: (g) => g("kindEmail"),
  agendaGoogle: (g) => g("inGoogle"),
  emailFooter: (g) => `— Vertal Chat · ${g("name")}`,
  errNoNext: (g) => g("errWhen"),
  tabTasks: (g) => g("button"),
  tabAgenda: (g) => g("agenda"),
  uiNext: (g, loc) => cap(g("next"), loc),
  uiInGoogle: (g) => g("inGoogle"),
  uiTz: (g) => g("tz"),
  uiUntil: (g) => g("until"),
  toastFallback: (g) => g("ranNow"),
  taskFallback: (g) => g("kindTask"),
  cardHost: (g) => `Vertal Chat · ${g("name")}`,
  newTask: (g, loc) => low(g("taskWord"), loc),
  task: (g, loc) => low(g("taskWord"), loc),
  permApps: (g) => g("appActions"),
  permNotify: (g) => g("notifyEmail"),
  rsError: (g, loc) => low(g("error"), loc),
  trEmail: (g) => g("kindEmail"),
  errTaskNotFound: (g) => g("errGeneric"),
  errSaveFailed: (g) => g("errGeneric"),
  errNotOk: (g) => g("errGeneric"),
  tplReminder: (g) => g("kindReminder"),
  tplAppt: (g) => g("uiKindAppt"),
  dlgMethod: (g, loc) => g("kindTask").toLocaleUpperCase(loc),
};

// ─── Idiomas ─────────────────────────────────────────────────────────────

export interface SchedLangMeta {
  code: string;
  /** Nome no próprio idioma (seletor de Ajustes). */
  native: string;
  english: string;
  /** Nome em português (vai no prompt do executor: "escreva SEMPRE em …"). */
  pt: string;
  /** Locale do Intl (datas). */
  intl: string;
  /** Variante: herda as chaves que não tiver. */
  parent?: string;
  rtl?: boolean;
  /** Ajuste aplicado a todo texto da variante (de-CH: sem ß). */
  transform?: (s: string) => string;
}

const M = (code: string, native: string, english: string, pt: string, intl: string, x: Partial<SchedLangMeta> = {}): SchedLangMeta =>
  ({ code, native, english, pt, intl, ...x });

export const SCHED_LANGS: SchedLangMeta[] = [
  M("pt-BR", "Português (Brasil)", "Portuguese (Brazil)", "português do Brasil", "pt-BR"),
  M("pt-PT", "Português (Portugal)", "Portuguese (Portugal)", "português de Portugal", "pt-PT", { parent: "pt-BR" }),
  M("en", "English", "English", "inglês (English)", "en-US"),
  M("es", "Español", "Spanish", "espanhol (español)", "es-ES"),
  M("fr", "Français", "French", "francês (français)", "fr-FR"),
  M("fr-BE", "Français (Belgique)", "French (Belgium)", "francês da Bélgica (français)", "fr-BE", { parent: "fr" }),
  M("fr-CH", "Français (Suisse)", "French (Switzerland)", "francês da Suíça (français)", "fr-CH", { parent: "fr" }),
  M("de", "Deutsch", "German", "alemão (Deutsch)", "de-DE"),
  M("de-CH", "Deutsch (Schweiz)", "German (Switzerland)", "alemão da Suíça (Deutsch, sem ß: use ss)", "de-CH",
    { parent: "de", transform: (s) => s.replace(/ß/g, "ss") }),
  M("it", "Italiano", "Italian", "italiano", "it-IT"),
  M("it-CH", "Italiano (Svizzera)", "Italian (Switzerland)", "italiano da Suíça", "it-CH", { parent: "it" }),
  M("nl", "Nederlands", "Dutch", "holandês (Nederlands)", "nl-NL"),
  M("nl-BE", "Nederlands (België)", "Dutch (Belgium, Flemish)", "holandês da Bélgica / flamengo (Nederlands)", "nl-BE", { parent: "nl" }),
  M("rm", "Rumantsch", "Romansh", "romanche (rumantsch grischun)", "rm-CH"),
  M("ru", "Русский", "Russian", "russo (русский)", "ru-RU"),
  M("tr", "Türkçe", "Turkish", "turco (Türkçe)", "tr-TR"),
  M("zh-Hans", "简体中文", "Chinese (Simplified)", "chinês simplificado (简体中文)", "zh-CN"),
  M("zh-Hant", "繁體中文", "Chinese (Traditional)", "chinês tradicional (繁體中文)", "zh-TW"),
  M("ar", "العربية", "Arabic", "árabe (العربية)", "ar", { rtl: true }),
  M("ko", "한국어", "Korean", "coreano (한국어)", "ko-KR"),
  M("ms", "Bahasa Melayu", "Malay", "malaio (Bahasa Melayu)", "ms-MY"),
  M("pl", "Polski", "Polish", "polonês (polski)", "pl-PL"),
  M("ja", "日本語", "Japanese", "japonês (日本語)", "ja-JP"),
  M("hi", "हिन्दी", "Hindi", "híndi (हिन्दी)", "hi-IN"),
  M("cs", "Čeština", "Czech", "tcheco (čeština)", "cs-CZ"),
  M("he", "עברית", "Hebrew", "hebraico (עברית)", "he-IL", { rtl: true }),
  M("sv", "Svenska", "Swedish", "sueco (svenska)", "sv-SE"),
  M("nb", "Norsk (bokmål)", "Norwegian", "norueguês (norsk bokmål)", "nb-NO"),
  M("da", "Dansk", "Danish", "dinamarquês (dansk)", "da-DK"),
  M("fi", "Suomi", "Finnish", "finlandês (suomi)", "fi-FI"),
  M("el", "Ελληνικά", "Greek", "grego (ελληνικά)", "el-GR"),
  M("hu", "Magyar", "Hungarian", "húngaro (magyar)", "hu-HU"),
  M("ro", "Română", "Romanian", "romeno (română)", "ro-RO"),
  M("uk", "Українська", "Ukrainian", "ucraniano (українська)", "uk-UA"),
  M("bg", "Български", "Bulgarian", "búlgaro (български)", "bg-BG"),
  M("hr", "Hrvatski", "Croatian", "croata (hrvatski)", "hr-HR"),
  M("vi", "Tiếng Việt", "Vietnamese", "vietnamita (Tiếng Việt)", "vi-VN"),
  M("th", "ไทย", "Thai", "tailandês (ไทย)", "th-TH"),
  M("id", "Bahasa Indonesia", "Indonesian", "indonésio (Bahasa Indonesia)", "id-ID"),
  M("fil", "Filipino", "Filipino", "filipino (Filipino/Tagalog)", "fil-PH"),
  M("fa", "فارسی", "Persian", "persa (فارسی)", "fa-IR", { rtl: true }),
  M("ur", "اردو", "Urdu", "urdu (اردو)", "ur-PK", { rtl: true }),
  M("bn", "বাংলা", "Bengali", "bengali (বাংলা)", "bn-BD"),
  M("sw", "Kiswahili", "Swahili", "suaíli (Kiswahili)", "sw-KE"),
  M("ca", "Català", "Catalan", "catalão (català)", "ca-ES"),
  M("sk", "Slovenčina", "Slovak", "eslovaco (slovenčina)", "sk-SK"),
  M("sl", "Slovenščina", "Slovenian", "esloveno (slovenščina)", "sl-SI"),
  M("sr", "Српски", "Serbian", "sérvio (српски, alfabeto cirílico)", "sr-Cyrl-RS"),
  M("lt", "Lietuvių", "Lithuanian", "lituano (lietuvių)", "lt-LT"),
  M("lv", "Latviešu", "Latvian", "letão (latviešu)", "lv-LV"),
  M("et", "Eesti", "Estonian", "estoniano (eesti)", "et-EE"),
  M("is", "Íslenska", "Icelandic", "islandês (íslenska)", "is-IS"),
  M("ga", "Gaeilge", "Irish", "irlandês (Gaeilge)", "ga-IE"),
  M("cy", "Cymraeg", "Welsh", "galês (Cymraeg)", "cy-GB"),
  M("eu", "Euskara", "Basque", "basco (euskara)", "eu-ES"),
  M("gl", "Galego", "Galician", "galego", "gl-ES"),
  M("sq", "Shqip", "Albanian", "albanês (shqip)", "sq-AL"),
  M("mk", "Македонски", "Macedonian", "macedônio (македонски)", "mk-MK"),
  M("bs", "Bosanski", "Bosnian", "bósnio (bosanski)", "bs-Latn-BA"),
  M("hy", "Հայերեն", "Armenian", "armênio (հայերեն)", "hy-AM"),
  M("ka", "ქართული", "Georgian", "georgiano (ქართული)", "ka-GE"),
  M("az", "Azərbaycan dili", "Azerbaijani", "azerbaijano (azərbaycan dili)", "az-Latn-AZ"),
  M("kk", "Қазақ тілі", "Kazakh", "cazaque (қазақ тілі)", "kk-KZ"),
  M("uz", "Oʻzbekcha", "Uzbek", "uzbeque (oʻzbekcha, alfabeto latino)", "uz-Latn-UZ"),
  M("ta", "தமிழ்", "Tamil", "tâmil (தமிழ்)", "ta-IN"),
];

export const SCHED_LANG_CODES = SCHED_LANGS.map((m) => m.code);
const META = new Map(SCHED_LANGS.map((m) => [m.code, m]));
const META_LOWER = new Map(SCHED_LANGS.map((m) => [m.code.toLowerCase(), m.code]));

export function langMeta(code: string | null | undefined): SchedLangMeta | undefined {
  return code ? META.get(code) : undefined;
}

// ─── Normalização do código de idioma ────────────────────────────────────

const PRIMARY_ALIAS: Record<string, string> = { iw: "he", in: "id", tl: "fil", no: "nb", nn: "nb", ji: "yi", jw: "jv", mo: "ro" };

const LANG_BY_NAME: Record<string, string> = (() => {
  const out: Record<string, string> = {
    portugues: "pt-BR", "português": "pt-BR", portuguese: "pt-BR", english: "en", ingles: "en", "inglês": "en", "inglés": "en",
    spanish: "es", espanol: "es", "español": "es", espanhol: "es", chinese: "zh-Hans", "中文": "zh-Hans", norwegian: "nb", norsk: "nb",
    flemish: "nl-BE", vlaams: "nl-BE", tagalog: "fil", farsi: "fa", "indiano": "hi", "israelita": "he",
  };
  for (const m of SCHED_LANGS) {
    out[m.english.toLowerCase()] ??= m.code;
    out[m.native.toLowerCase()] ??= m.code;
  }
  return out;
})();

/**
 * "pt", "pt_BR", "en-US", "es-419", "fr", "zh-TW", "de-CH", "English" → código do Agendador
 * ("pt-BR", "en", "es", "fr", "zh-Hant", "de-CH"…). Código desconhecido de 2–3 letras volta como veio
 * (o texto fixo cai no inglês). "auto"/inválido → null.
 */
export function normLang(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/_/g, "-").toLowerCase();
  if (!s || s === "auto" || s === "automatico" || s === "automático") return null;
  if (LANG_BY_NAME[s]) return LANG_BY_NAME[s];
  const m = /^([a-z]{2,3})((?:-[a-z0-9]{2,8})*)$/.exec(s);
  if (!m) return null;
  const primary = PRIMARY_ALIAS[m[1]] ?? m[1];
  const subs = m[2].split("-").filter(Boolean);
  if (primary === "pt") return subs[0] === "pt" ? "pt-PT" : "pt-BR";
  if (primary === "zh") {
    if (subs.includes("hant") || subs.some((x) => x === "tw" || x === "hk" || x === "mo")) return "zh-Hant";
    return "zh-Hans";
  }
  for (const sub of subs) {
    const v2 = META_LOWER.get(`${primary}-${sub}`);
    if (v2) return v2;
  }
  return primary;
}

/** Código suportado para os textos fixos: idioma conhecido → ele; desconhecido → inglês; nenhum → pt-BR. */
export function schedLang(lang: string | null | undefined): string {
  if (!lang) return "pt-BR";
  if (META.has(lang)) return lang;
  const n = normLang(lang);
  if (n && META.has(n)) return n;
  return "en";
}

export function intlLocale(lang: string | null | undefined): string {
  return META.get(schedLang(lang))!.intl;
}

export function isRtl(lang: string | null | undefined): boolean {
  return META.get(schedLang(lang))?.rtl === true;
}

// ─── pt-BR, en, es (sempre carregados) ───────────────────────────────────

const PT: SchedStrings = {
  name: "Tarefas agendadas", button: "Tarefas",
  description: "Peça no chat: \"me lembre amanhã às 9h\", \"todo dia às 8h…\", \"agende uma consulta…\" ou \"quando eu receber um e-mail de…\".",
  taskWord: "Tarefa", kindTask: "Tarefa agendada", kindReminder: "Lembrete", kindAppt: "Consulta/compromisso", uiKindAppt: "Consulta", kindEmail: "Gatilho de e-mail",
  dow: "dom.,seg.,ter.,qua.,qui.,sex.,sáb.", at: "às",
  once: "uma vez, {dt}", daily: "todo dia às {t}", weekdays: "dias úteis às {t}", weekly: "toda {days} às {t}", monthly: "todo mês, dia {d}, às {t}",
  everyH: "a cada {n} h", everyMin: "a cada {n} min", cron: "regra {expr}", email: "ao chegar o e-mail (confere a cada {n} min)",
  when: "Quando", until: "até", place: "Local", agenda: "Agenda", agendaGoogle: "Google Agenda conectada",
  agendaVertal: "Agenda do Vertal (com link para adicionar ao Google Agenda)", reminderBefore: "Lembrete: {n} min antes",
  next: "próxima", from: "de", subject: "assunto", search: "busca",
  trigger: "Gatilho: e-mail {p} (só e-mails que chegarem a partir de agora; cada e-mail dispara uma vez)",
  criteria: "Critério", ifPos: "Se positivo", ifNeg: "Se negativo", ifNeu: "Se neutro", todo: "Fazer",
  sendTo: "Pode enviar e-mail para", noSend: "Não envia e-mail a terceiros",
  appActions: "Pode executar ações nos seus apps conectados (Vertal Fluxos; custo normal de cada ação)",
  notifyEmail: "Também avisa você por e-mail", tz: "Fuso", language: "Idioma",
  errFromSubject: "Diga de quem ou com que assunto é o e-mail que dispara a tarefa.",
  errBranches: "Diga o que fazer quando o e-mail chegar (se positivo / se negativo).",
  errApptTime: "Faltou o dia e a hora da consulta.", errPast: "Esse horário já passou.",
  errCron: "Expressão cron inválida (use 5 campos: minuto hora dia mês dia-da-semana).",
  errWhen: "Não entendi quando. Diga, por exemplo, \"amanhã às 9h\" ou \"toda segunda às 8h\".",
  errNoNext: "Não há próximo horário para essa regra.",
  noTime: "Sem hora: usei {t}.", remindSoon: "O lembrete ficou para daqui a 1 minuto (a consulta está perto).",
  apptReminder: "Lembrete de compromisso", inGoogle: "Está no seu Google Agenda.", addGoogle: "Adicionar ao Google Agenda",
  failed: "⚠️ **A tarefa \"{title}\" falhou** depois de {n} novas tentativas.\nMotivo: {err}\nVocê pode rodar de novo em Tarefas agendadas.",
  failSubject: "Falha", noResult: "A IA não devolveu resultado.",
  needsGmail: "⚠️ O gatilho \"{title}\" precisa do Gmail conectado. Conecte em Conectores → Gmail e retome a tarefa em Tarefas agendadas.",
  gmailMissing: "O Gmail não está conectado: conecte em Conectores → Gmail para o gatilho funcionar.",
  trig: "Gatilho", mailArrived: "Chegou e-mail de {from} — \"{subj}\".", classified: "Classificado como", noAction: "Nenhuma ação definida para esse caso.",
  actionFailed: "⚠️ A ação \"{i}\" falhou: {e}", noNewMail: "Nenhum e-mail novo que combine com o gatilho.",
  sentPos: "positivo", sentNeg: "negativo", sentNeu: "neutro", emailFooter: "— Tarefas agendadas do Vertal Chat",
  nothing: "Faltou dizer o que agendar.", tooMany: "Você já tem {n} tarefas; apague alguma antes.", pastEdit: "Esse horário já passou. Edite a data para reativar.",
  tabSettings: "Ajustes", refresh: "Atualizar", loading: "Carregando…", empty: "Nenhuma tarefa ainda. Ideias para pedir no chat:", copied: "Copiado. Cole no chat.",
  last: "Última", runs: "{n} execução(ões)", error: "Erro", pause: "Pausar", activate: "Ativar", runNow: "Rodar agora", history: "Histórico", del: "Apagar",
  confirmDelete: "Apagar \"{t}\"?", ranNow: "Rodou agora. O resultado está na conversa da tarefa.", neverRan: "Ainda não rodou.",
  agendaEmpty: "Nenhum compromisso. Peça no chat: \"agende uma consulta…\".", uiInGoogle: "No seu Google Agenda", uiTz: "Fuso horário",
  quiet: "Horário de silêncio (gatilhos e repetições automáticas esperam; hora marcada sempre toca)", save: "Salvar",
  notifyMe: "Também me avisar por e-mail (para a sua própria conta do Gmail)", saved: "Ajustes salvos.",
  languageHint: "Lembretes, resultados e avisos saem neste idioma. \"Automático\" usa o idioma em que você pediu a tarefa.",
  langAuto: "Automático", toastFallback: "Rodou agora. Veja o resultado na conversa.", warning: "Aviso", newTask: "nova tarefa",
  deleteReason: "Apagar esta tarefa agendada (e o compromisso da agenda, se houver). Não dá para desfazer.",
  permSendTo: "Passa a poder enviar e-mail para: {l}", permApps: "Passa a poder executar ações nos seus apps conectados (Vertal Fluxos)",
  stActive: "Ativa", stPaused: "Pausada", stDone: "Concluída", stFailed: "Falhou", rsRunning: "rodando", rsSkipped: "pulada",
  trScheduled: "agendada", trRetry: "nova tentativa", trManual: "manual", trEmail: "e-mail",
  errNotEnabled: "As tarefas agendadas ainda não estão liberadas para a sua conta.", errTaskNotFound: "Não achei essa tarefa.",
  errSession: "Sua sessão expirou. Entre novamente.", errSaveFailed: "Não consegui salvar agora. Tente de novo em instantes.",
  errRate: "Muitos pedidos em pouco tempo. Aguarde um minuto.", errGeneric: "Não consegui falar com as tarefas agendadas agora.", errNotOk: "Não deu certo.",
  dlgTitle: "Permitir esta ação?", dlgDesc: "O chat precisa da sua permissão para agir fora dele e concluir o seu pedido.",
  dlgService: "Serviço", dlgCall: "Chamada", dlgSummary: "Resumo (o que, quando, gatilho e permissões)", dlgDeny: "Não permitir", dlgAllow: "Permitir",
  tplDaily: "Resumo diário", tplWeekly: "Relatório semanal", tplApproval: "E-mail de aprovação", tplPayment: "Pagamento",
  exReminder: "Me lembre amanhã às 9h de pagar o boleto",
  exDaily: "Todo dia às 8h me mande as 5 principais notícias de tecnologia",
  exWeekly: "Toda segunda às 9h pesquise o preço do dólar e me dê um resumo da semana",
  exAppt: "Agende uma consulta no dentista sexta às 15h e me lembre 1 hora antes",
  exApproval: "Quando eu receber um e-mail do RH com assunto proposta: se for aprovado, me avise e crie um lembrete para assinar; se for recusado, me avise",
  exPayment: "Quando chegar e-mail do banco sobre pagamento: se confirmado, me avise; se falhou, me avise com urgência",
};

const EN: SchedStrings = {
  name: "Scheduled tasks", button: "Tasks",
  description: "Ask in the chat: \"remind me tomorrow at 9am\", \"every day at 8am…\", \"schedule an appointment…\" or \"when I get an email from…\".",
  taskWord: "Task", kindTask: "Scheduled task", kindReminder: "Reminder", kindAppt: "Appointment", kindEmail: "Email trigger",
  dow: "Sun,Mon,Tue,Wed,Thu,Fri,Sat", at: "at",
  once: "once, {dt}", daily: "every day at {t}", weekdays: "weekdays at {t}", weekly: "every {days} at {t}", monthly: "every month on day {d} at {t}",
  everyH: "every {n} h", everyMin: "every {n} min", cron: "rule {expr}", email: "when the email arrives (checks every {n} min)",
  when: "When", until: "until", place: "Location", agenda: "Calendar", agendaGoogle: "Connected Google Calendar",
  agendaVertal: "Vertal calendar (with a link to add it to Google Calendar)", reminderBefore: "Reminder: {n} min before",
  next: "next", from: "from", subject: "subject", search: "search",
  trigger: "Trigger: email {p} (only emails arriving from now on; each email fires once)",
  criteria: "Criteria", ifPos: "If positive", ifNeg: "If negative", ifNeu: "If neutral", todo: "Do",
  sendTo: "May send email to", noSend: "Does not email anyone else",
  appActions: "May run actions in your connected apps (Vertal Fluxos; normal cost per action)",
  notifyEmail: "Also notifies you by email", tz: "Time zone", language: "Language",
  errFromSubject: "Say who the triggering email is from or what its subject is.",
  errBranches: "Say what to do when the email arrives (if positive / if negative).",
  errApptTime: "The appointment's date and time are missing.", errPast: "That time has already passed.",
  errCron: "Invalid cron expression (use 5 fields: minute hour day month weekday).",
  errWhen: "I didn't understand when. Say, for example, \"tomorrow at 9am\" or \"every Monday at 8am\".",
  errNoNext: "There is no next time for that rule.",
  noTime: "No time given: used {t}.", remindSoon: "The reminder was set for 1 minute from now (the appointment is close).",
  apptReminder: "Appointment reminder", inGoogle: "It's in your Google Calendar.", addGoogle: "Add to Google Calendar",
  failed: "⚠️ **The task \"{title}\" failed** after {n} retries.\nReason: {err}\nYou can run it again in Scheduled tasks.",
  noResult: "The AI returned no result.",
  needsGmail: "⚠️ The trigger \"{title}\" needs Gmail connected. Connect it in Connectors → Gmail and resume the task in Scheduled tasks.",
  gmailMissing: "Gmail is not connected: connect it in Connectors → Gmail for the trigger to work.",
  trig: "Trigger", mailArrived: "Email from {from} arrived — \"{subj}\".", classified: "Classified as", noAction: "No action set for this case.",
  actionFailed: "⚠️ The action \"{i}\" failed: {e}", noNewMail: "No new email matches the trigger.",
  sentPos: "positive", sentNeg: "negative", sentNeu: "neutral", emailFooter: "— Vertal Chat scheduled tasks",
  nothing: "You didn't say what to schedule.", tooMany: "You already have {n} tasks; delete one first.", pastEdit: "That time has already passed. Edit the date to reactivate it.",
  tabSettings: "Settings", refresh: "Refresh", loading: "Loading…", empty: "No tasks yet. Ideas to ask in the chat:", copied: "Copied. Paste it in the chat.",
  last: "Last", runs: "{n} run(s)", error: "Error", pause: "Pause", activate: "Activate", runNow: "Run now", history: "History", del: "Delete",
  confirmDelete: "Delete \"{t}\"?", ranNow: "Ran just now. The result is in the task's conversation.", neverRan: "Has not run yet.",
  agendaEmpty: "No appointments. Ask in the chat: \"schedule an appointment…\".", uiInGoogle: "In your Google Calendar", uiUntil: "to",
  quiet: "Quiet hours (triggers and automatic repeats wait; times you set always fire)", save: "Save",
  notifyMe: "Also notify me by email (to your own Gmail account)", saved: "Settings saved.",
  languageHint: "Reminders, results and notices use this language. \"Automatic\" uses the language you asked for the task in.",
  langAuto: "Automatic", toastFallback: "Ran just now. See the result in the conversation.", warning: "Note", newTask: "new task",
  deleteReason: "Delete this scheduled task (and its calendar appointment, if any). This cannot be undone.",
  permSendTo: "Will be allowed to email: {l}", permApps: "Will be allowed to run actions in your connected apps (Vertal Fluxos)",
  stActive: "Active", stPaused: "Paused", stDone: "Done", stFailed: "Failed", rsRunning: "running", rsSkipped: "skipped",
  trScheduled: "scheduled", trRetry: "retry", trManual: "manual", trEmail: "email",
  errNotEnabled: "Scheduled tasks are not enabled for your account yet.", errTaskNotFound: "I couldn't find that task.",
  errSession: "Your session expired. Please sign in again.", errSaveFailed: "Couldn't save right now. Try again in a moment.",
  errRate: "Too many requests in a short time. Wait a minute.", errGeneric: "Couldn't reach scheduled tasks right now.", errNotOk: "That didn't work.",
  dlgTitle: "Allow this action?", dlgDesc: "The chat needs your permission to act outside of it and finish your request.",
  dlgService: "Service", dlgCall: "Call", dlgSummary: "Summary (what, when, trigger and permissions)", dlgDeny: "Don't allow", dlgAllow: "Allow",
  tplDaily: "Daily digest", tplWeekly: "Weekly report", tplApproval: "Approval email", tplPayment: "Payment",
  exReminder: "Remind me tomorrow at 9am to pay the bill",
  exDaily: "Every day at 8am send me the top 5 tech news stories",
  exWeekly: "Every Monday at 9am check the dollar exchange rate and give me a weekly summary",
  exAppt: "Schedule a dentist appointment on Friday at 3pm and remind me 1 hour before",
  exApproval: "When I get an email from HR with subject offer: if approved, tell me and create a reminder to sign; if rejected, tell me",
  exPayment: "When the bank emails about a payment: if confirmed, tell me; if it failed, alert me urgently",
};

const ES: SchedStrings = {
  name: "Tareas programadas", button: "Tareas",
  description: "Pídelo en el chat: \"recuérdame mañana a las 9\", \"todos los días a las 8…\", \"agenda una cita…\" o \"cuando reciba un correo de…\".",
  taskWord: "Tarea", kindTask: "Tarea programada", kindReminder: "Recordatorio", kindAppt: "Cita", kindEmail: "Disparador de correo",
  dow: "dom.,lun.,mar.,mié.,jue.,vie.,sáb.", at: "a las",
  once: "una vez, {dt}", daily: "todos los días a las {t}", weekdays: "días laborables a las {t}", weekly: "cada {days} a las {t}", monthly: "cada mes, día {d}, a las {t}",
  everyH: "cada {n} h", everyMin: "cada {n} min", cron: "regla {expr}", email: "al llegar el correo (revisa cada {n} min)",
  when: "Cuándo", until: "hasta", place: "Lugar", agenda: "Agenda", agendaGoogle: "Google Calendar conectado",
  agendaVertal: "Agenda de Vertal (con enlace para añadir a Google Calendar)", reminderBefore: "Recordatorio: {n} min antes",
  next: "próxima", from: "de", subject: "asunto", search: "búsqueda",
  trigger: "Disparador: correo {p} (solo correos que lleguen desde ahora; cada correo dispara una vez)",
  criteria: "Criterio", ifPos: "Si es positivo", ifNeg: "Si es negativo", ifNeu: "Si es neutro", todo: "Hacer",
  sendTo: "Puede enviar correo a", noSend: "No envía correos a terceros",
  appActions: "Puede ejecutar acciones en tus apps conectadas (Vertal Fluxos; costo normal de cada acción)",
  notifyEmail: "También te avisa por correo", tz: "Zona horaria", language: "Idioma",
  errFromSubject: "Di de quién es o qué asunto tiene el correo que dispara la tarea.",
  errBranches: "Di qué hacer cuando llegue el correo (si es positivo / si es negativo).",
  errApptTime: "Falta el día y la hora de la cita.", errPast: "Esa hora ya pasó.",
  errCron: "Expresión cron no válida (usa 5 campos: minuto hora día mes día-de-la-semana).",
  errWhen: "No entendí cuándo. Di, por ejemplo, \"mañana a las 9\" o \"cada lunes a las 8\".",
  errNoNext: "No hay próxima hora para esa regla.",
  noTime: "Sin hora: usé {t}.", remindSoon: "El recordatorio quedó para dentro de 1 minuto (la cita está cerca).",
  apptReminder: "Recordatorio de cita", inGoogle: "Está en tu Google Calendar.", addGoogle: "Añadir a Google Calendar",
  failed: "⚠️ **La tarea \"{title}\" falló** después de {n} reintentos.\nMotivo: {err}\nPuedes ejecutarla de nuevo en Tareas programadas.",
  noResult: "La IA no devolvió resultado.",
  needsGmail: "⚠️ El disparador \"{title}\" necesita Gmail conectado. Conéctalo en Conectores → Gmail y reanuda la tarea en Tareas programadas.",
  gmailMissing: "Gmail no está conectado: conéctalo en Conectores → Gmail para que el disparador funcione.",
  trig: "Disparador", mailArrived: "Llegó un correo de {from} — \"{subj}\".", classified: "Clasificado como", noAction: "No hay acción definida para este caso.",
  actionFailed: "⚠️ La acción \"{i}\" falló: {e}", noNewMail: "Ningún correo nuevo coincide con el disparador.",
  sentPos: "positivo", sentNeg: "negativo", sentNeu: "neutro", emailFooter: "— Tareas programadas de Vertal Chat",
  nothing: "Faltó decir qué programar.", tooMany: "Ya tienes {n} tareas; borra alguna antes.", pastEdit: "Esa hora ya pasó. Edita la fecha para reactivarla.",
  tabSettings: "Ajustes", refresh: "Actualizar", loading: "Cargando…", empty: "Aún no hay tareas. Ideas para pedir en el chat:", copied: "Copiado. Pégalo en el chat.",
  last: "Última", runs: "{n} ejecución(es)", error: "Error", pause: "Pausar", activate: "Activar", runNow: "Ejecutar ahora", history: "Historial", del: "Borrar",
  confirmDelete: "¿Borrar \"{t}\"?", ranNow: "Se ejecutó ahora. El resultado está en la conversación de la tarea.", neverRan: "Aún no se ha ejecutado.",
  agendaEmpty: "No hay citas. Pídelo en el chat: \"agenda una cita…\".", uiInGoogle: "En tu Google Calendar",
  quiet: "Horario de silencio (disparadores y repeticiones automáticas esperan; la hora que fijes siempre suena)", save: "Guardar",
  notifyMe: "Avisarme también por correo (a tu propia cuenta de Gmail)", saved: "Ajustes guardados.",
  languageHint: "Recordatorios, resultados y avisos salen en este idioma. \"Automático\" usa el idioma en que pediste la tarea.",
  langAuto: "Automático", toastFallback: "Se ejecutó ahora. Mira el resultado en la conversación.", warning: "Aviso", newTask: "nueva tarea",
  deleteReason: "Borrar esta tarea programada (y la cita de la agenda, si la hay). No se puede deshacer.",
  permSendTo: "Podrá enviar correo a: {l}", permApps: "Podrá ejecutar acciones en tus apps conectadas (Vertal Fluxos)",
  stActive: "Activa", stPaused: "Pausada", stDone: "Completada", stFailed: "Falló", rsRunning: "en curso", rsSkipped: "omitida",
  trScheduled: "programada", trRetry: "reintento", trManual: "manual", trEmail: "correo",
  errNotEnabled: "Las tareas programadas aún no están habilitadas para tu cuenta.", errTaskNotFound: "No encontré esa tarea.",
  errSession: "Tu sesión expiró. Vuelve a iniciar sesión.", errSaveFailed: "No pude guardar ahora. Inténtalo de nuevo en un momento.",
  errRate: "Demasiadas solicitudes en poco tiempo. Espera un minuto.", errGeneric: "No pude conectar con las tareas programadas ahora.", errNotOk: "No funcionó.",
  dlgTitle: "¿Permitir esta acción?", dlgDesc: "El chat necesita tu permiso para actuar fuera de él y completar tu pedido.",
  dlgService: "Servicio", dlgCall: "Llamada", dlgSummary: "Resumen (qué, cuándo, disparador y permisos)", dlgDeny: "No permitir", dlgAllow: "Permitir",
  tplDaily: "Resumen diario", tplWeekly: "Informe semanal", tplApproval: "Correo de aprobación", tplPayment: "Pago",
  exReminder: "Recuérdame mañana a las 9 pagar la factura",
  exDaily: "Todos los días a las 8 envíame las 5 noticias de tecnología más importantes",
  exWeekly: "Cada lunes a las 9 busca el precio del dólar y dame un resumen de la semana",
  exAppt: "Agenda una cita con el dentista el viernes a las 15 y recuérdame 1 hora antes",
  exApproval: "Cuando reciba un correo de RR. HH. con asunto propuesta: si es aprobada, avísame y crea un recordatorio para firmar; si es rechazada, avísame",
  exPayment: "Cuando llegue un correo del banco sobre un pago: si se confirmó, avísame; si falló, avísame con urgencia",
};

const DATA: Record<string, SchedStrings> = { "pt-BR": PT, en: EN, es: ES };

/** Registra idiomas extras (o servidor faz no import; o navegador, sob demanda). */
export function registerSchedulerLangs(extra: Record<string, SchedStrings>): void {
  for (const [code, strings] of Object.entries(extra)) {
    if (META.has(code) && !(code in { "pt-BR": 1, en: 1, es: 1 })) DATA[code] = strings;
  }
  textCache.clear();
  uiCache.clear();
}

export function schedLangRegistered(code: string): boolean {
  return code in DATA;
}

/** Dados crus de um idioma (para o teste de cobertura). */
export function rawSchedStrings(code: string): SchedStrings | undefined {
  return DATA[code];
}

function own(code: string, key: SchedKey): string | undefined {
  const meta = META.get(code);
  let v = DATA[code]?.[key];
  if (v === undefined && meta?.parent) v = own(meta.parent, key);
  if (v !== undefined && meta?.transform) v = meta.transform(v);
  return v;
}

/** Texto de uma chave: idioma → idioma-base → apelido (no mesmo idioma) → pt-BR. */
export function sget(lang: string | null | undefined, key: SchedKey): string {
  const code = schedLang(lang);
  const v = own(code, key);
  if (v !== undefined) return v;
  const alias = (ALIAS as Record<string, ((g: Get, loc: string) => string) | undefined>)[key];
  if (alias) return alias((k) => sget(code, k), META.get(code)!.intl);
  if (code !== "pt-BR") return sget("pt-BR", key);
  return "";
}

/** Troca {chave} pelos valores. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// ─── Textos prontos (servidor) ───────────────────────────────────────────

type Sentiment = "positive" | "negative" | "neutral";
type Kind = "task" | "reminder" | "appointment" | "email_trigger";

function buildText(lang: string) {
  const g = (k: SchedKey) => sget(lang, k);
  const f = (k: SchedKey) => (vars: Record<string, string | number>) => fill(g(k), vars);
  const dowRaw = own(lang, "dow");
  return {
    code: lang,
    intl: META.get(lang)!.intl,
    rtl: META.get(lang)?.rtl === true,
    /** Dias da semana e "às" fixos (pt/en/es); vazio = usar o Intl. */
    dow: dowRaw ? dowRaw.split(",") : [] as string[],
    at: own(lang, "at") ?? "",
    onceT: (dt: string) => f("once")({ dt }),
    dailyT: (t: string) => f("daily")({ t }),
    weekdaysT: (t: string) => f("weekdays")({ t }),
    weeklyT: (days: string, t: string) => f("weekly")({ days, t }),
    monthly: (d: number, t: string) => f("monthly")({ d, t }),
    everyH: (n: number) => f("everyH")({ n }),
    everyMin: (n: number) => f("everyMin")({ n }),
    cronT: (expr: string) => f("cron")({ expr }),
    email: (n: number) => f("email")({ n }),
    kind: { task: g("kindTask"), reminder: g("kindReminder"), appointment: g("kindAppt"), email_trigger: g("kindEmail") } as Record<Kind, string>,
    when: g("when"), until: g("until"), place: g("place"), agenda: g("agenda"), agendaGoogle: g("agendaGoogle"), agendaVertal: g("agendaVertal"),
    reminderBefore: (n: number) => f("reminderBefore")({ n }),
    next: g("next"), from: g("from"), subject: g("subject"), search: g("search"),
    trigger: (p: string) => f("trigger")({ p }),
    criteria: g("criteria"), ifPos: g("ifPos"), ifNeg: g("ifNeg"), ifNeu: g("ifNeu"), todo: g("todo"),
    sendTo: g("sendTo"), noSend: g("noSend"), appActions: g("appActions"), notifyEmail: g("notifyEmail"), tz: g("tz"), language: g("language"),
    errFromSubject: g("errFromSubject"), errBranches: g("errBranches"), errApptTime: g("errApptTime"), errPast: g("errPast"),
    errCron: g("errCron"), errWhen: g("errWhen"), errNoNext: g("errNoNext"),
    noTime: (t: string) => f("noTime")({ t }), remindSoon: g("remindSoon"),
    defaultTask: g("defaultTask"), defaultAppt: g("defaultAppt"),
    reminder: g("reminder"), apptReminder: g("apptReminder"), inGoogle: g("inGoogle"), addGoogle: g("addGoogle"),
    taskHeader: g("taskHeader"),
    failed: (title: string, n: number, err: string) => f("failed")({ title, n, err }),
    failSubject: g("failSubject"), noResult: g("noResult"),
    needsGmail: (title: string) => f("needsGmail")({ title }),
    gmailMissing: g("gmailMissing"),
    trig: g("trig"), mailArrived: (from: string, subj: string) => f("mailArrived")({ from, subj }),
    classified: g("classified"), noAction: g("noAction"),
    actionFailed: (i: string, e: string) => f("actionFailed")({ i, e }), noNewMail: g("noNewMail"),
    sentiment: { positive: g("sentPos"), negative: g("sentNeg"), neutral: g("sentNeu") } as Record<Sentiment, string>,
    emailFooter: g("emailFooter"),
    nothing: g("nothing"), tooMany: (n: number) => f("tooMany")({ n }),
    pastEdit: g("pastEdit"),
  };
}

export type SchedText = ReturnType<typeof buildText>;
const textCache = new Map<string, SchedText>();

/** Textos fixos do Agendador no idioma (o que não passa pela IA). */
export function schedText(lang: string | null | undefined): SchedText {
  const code = schedLang(lang);
  let t = textCache.get(code);
  if (!t) textCache.set(code, (t = buildText(code)));
  return t;
}

// ─── Textos da tela ──────────────────────────────────────────────────────

function buildUi(lang: string) {
  const g = (k: SchedKey) => sget(lang, k);
  const f = (k: SchedKey) => (vars: Record<string, string | number>) => fill(g(k), vars);
  return {
    code: lang,
    dir: (META.get(lang)?.rtl ? "rtl" : "ltr") as "rtl" | "ltr",
    name: g("name"), button: g("button"), description: g("description"),
    tabTasks: g("tabTasks"), tabAgenda: g("tabAgenda"), tabSettings: g("tabSettings"),
    refresh: g("refresh"), loading: g("loading"), empty: g("empty"), copied: g("copied"),
    next: g("uiNext"), last: g("last"), runs: (n: number) => f("runs")({ n }), error: g("error"), sendTo: g("sendTo"),
    pause: g("pause"), activate: g("activate"), runNow: g("runNow"), history: g("history"), del: g("del"),
    confirmDelete: (t: string) => f("confirmDelete")({ t }),
    ranNow: g("ranNow"), neverRan: g("neverRan"),
    agendaEmpty: g("agendaEmpty"), inGoogle: g("uiInGoogle"), addGoogle: g("addGoogle"),
    timezone: g("uiTz"), quiet: g("quiet"), until: g("uiUntil"), save: g("save"),
    notifyEmail: g("notifyMe"), saved: g("saved"),
    language: g("language"), languageHint: g("languageHint"),
    langAuto: g("langAuto"), toastFallback: g("toastFallback"), taskFallback: g("taskFallback"),
    cardHost: g("cardHost"), warning: g("warning"), newTask: g("newTask"), task: g("task"),
    deleteReason: g("deleteReason"),
    permSendTo: (l: string) => f("permSendTo")({ l }),
    permApps: g("permApps"), permNotify: g("permNotify"),
    kind: { task: g("taskWord"), reminder: g("kindReminder"), appointment: g("uiKindAppt"), email_trigger: g("kindEmail") },
    status: { active: g("stActive"), paused: g("stPaused"), done: g("stDone"), failed: g("stFailed") },
    runStatus: { running: g("rsRunning"), ok: "ok", error: g("rsError"), skipped: g("rsSkipped") } as Record<string, string>,
    runTrigger: { schedule: g("trScheduled"), retry: g("trRetry"), manual: g("trManual"), email: g("trEmail") } as Record<string, string>,
    errors: {
      not_found: g("errNotEnabled"), task_not_found: g("errTaskNotFound"), Unauthorized: g("errSession"),
      save_failed: g("errSaveFailed"), rate: g("errRate"), generic: g("errGeneric"), notOk: g("errNotOk"),
    } as Record<string, string>,
  };
}

export type SchedUiText = ReturnType<typeof buildUi>;
const uiCache = new Map<string, SchedUiText>();

export function schedUiText(lang: string | null | undefined): SchedUiText {
  const code = schedLang(lang);
  let t = uiCache.get(code);
  if (!t) uiCache.set(code, (t = buildUi(code)));
  return t;
}

/** Rótulos do cartão "Permitir esta ação?" quando o pedido vem do Agendador. */
export interface ApprovalLabels {
  lang: string;
  dir: "ltr" | "rtl";
  title: string;
  description: string;
  service: string;
  call: string;
  summary: string;
  deny: string;
  allow: string;
  method: string;
}

export function approvalLabels(lang: string | null | undefined): ApprovalLabels {
  const code = schedLang(lang);
  const g = (k: SchedKey) => sget(code, k);
  return {
    lang: code, dir: META.get(code)?.rtl ? "rtl" : "ltr", title: g("dlgTitle"), description: g("dlgDesc"), service: g("dlgService"),
    call: g("dlgCall"), summary: g("dlgSummary"), deny: g("dlgDeny"), allow: g("dlgAllow"), method: g("dlgMethod"),
  };
}

export function schedTemplates(lang: string | null | undefined): Array<{ id: string; label: string; example: string }> {
  const code = schedLang(lang);
  const g = (k: SchedKey) => sget(code, k);
  return [
    { id: "reminder", label: g("tplReminder"), example: g("exReminder") },
    { id: "daily_news", label: g("tplDaily"), example: g("exDaily") },
    { id: "weekly_report", label: g("tplWeekly"), example: g("exWeekly") },
    { id: "appointment", label: g("tplAppt"), example: g("exAppt") },
    { id: "email_approval", label: g("tplApproval"), example: g("exApproval") },
    { id: "payment", label: g("tplPayment"), example: g("exPayment") },
  ];
}

// ─── Detecção do idioma de um texto ──────────────────────────────────────

const SCRIPT_RES: Array<[string, RegExp]> = [
  ["hangul", /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g],
  ["kana", /[\u3040-\u30FF]/g],
  ["han", /[\u4E00-\u9FFF\u3400-\u4DBF]/g],
  ["arabic", /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g],
  ["hebrew", /[\u0590-\u05FF]/g],
  ["cyrillic", /[\u0400-\u04FF]/g],
  ["greek", /[\u0370-\u03FF\u1F00-\u1FFF]/g],
  ["thai", /[\u0E00-\u0E7F]/g],
  ["devanagari", /[\u0900-\u097F]/g],
  ["bengali", /[\u0980-\u09FF]/g],
  ["tamil", /[\u0B80-\u0BFF]/g],
  ["armenian", /[\u0530-\u058F]/g],
  ["georgian", /[\u10A0-\u10FF]/g],
];

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const TRAD = /[們這個說時會後來點鐘週請對還過嗎為從開發東車書]/g;
const SIMP = /[们这个说时会后来点钟周请对还过吗为从开发东车书]/g;

/** Idioma pela escrita (alfabeto) quando ela domina o texto. */
export function detectScript(text: string): string | null {
  const letters = count(text, /\p{L}/gu);
  if (!letters) return null;
  const scores = SCRIPT_RES.map(([name, re]) => [name, count(text, re)] as const).filter(([, n]) => n > 0);
  if (!scores.length) return null;
  const kana = scores.find(([n]) => n === "kana")?.[1] ?? 0;
  const han = scores.find(([n]) => n === "han")?.[1] ?? 0;
  const [top, n] = [...scores].sort((a, b) => b[1] - a[1])[0];
  if ((kana + han) / letters >= 0.3 && (top === "kana" || top === "han")) {
    if (kana > 0) return "ja";
    return count(text, TRAD) > count(text, SIMP) ? "zh-Hant" : "zh-Hans";
  }
  if (n / letters < 0.4) return null;
  switch (top) {
    case "hangul": return "ko";
    case "arabic":
      if (/[ٹڈڑںےۓ]/.test(text)) return "ur";
      if (/[پچژگکی]/.test(text)) return "fa";
      return "ar";
    case "hebrew": return "he";
    case "greek": return "el";
    case "thai": return "th";
    case "devanagari": return "hi";
    case "bengali": return "bn";
    case "tamil": return "ta";
    case "armenian": return "hy";
    case "georgian": return "ka";
    case "cyrillic": {
      const t = text.toLowerCase();
      if (/[әғқңөұүһ]/.test(t)) return "kk";
      if (/[ѓќѕ]/.test(t)) return "mk";
      if (/[ђћџљњј]/.test(t)) return "sr";
      if (/[іїєґ]/.test(t)) return "uk";
      if (/[ыэё]/.test(t)) return "ru";
      if (/ъ|\bще\b|\bсъм\b|\bутре\b/.test(t)) return "bg";
      return "ru";
    }
  }
  return null;
}

/** Palavras típicas de pedidos de agendamento em outros idiomas de alfabeto latino (bem distintivas). */
const LATIN_WORDS: Record<string, string> = {
  fr: "rappelle rappelez rappeler moi demain chaque jour heures quand reçois aujourd hui lundi mardi mercredi jeudi vendredi samedi dimanche envoie envoyez rendez vous mon ma mes avec",
  de: "erinnere erinnern mich morgen jeden täglich uhr um minuten stunden termin wenn ich bekomme heute montag dienstag freitag nachrichten schicke bitte einen eine und",
  it: "ricordami ricorda domani ogni giorno alle tra minuti ore appuntamento quando ricevo oggi lunedì venerdì mandami inviami notizie",
  nl: "herinner herinnering mij elke dag uur over afspraak wanneer ontvang vandaag maandag vrijdag stuur nieuws het een morgen om",
  rm: "regorda regordar damaun mintga uras minutas cura oz glindesdi venderdi tramet",
  pl: "przypomnij jutro codziennie każdy dzień godzinie minut minuty spotkanie kiedy dostanę dzisiaj poniedziałek piątek wyślij mi za",
  cs: "připomeň zítra každý den hodin minut schůzku když dostanu dnes pondělí pátek pošli mi za",
  sk: "pripomeň zajtra každý deň hodín minút stretnutie keď dostanem dnes pondelok piatok pošli",
  tr: "hatırlat bana yarın her gün saat dakika sonra randevu bugün pazartesi cuma gönder geldiğinde",
  ro: "amintește aminteste mâine maine fiecare zi ora peste programare când astăzi luni vineri trimite",
  hu: "emlékeztess holnap minden nap órakor perc múlva időpont amikor ma hétfő péntek küldj",
  sv: "påminn mig imorgon varje dag klockan minuter möte när idag måndag fredag skicka",
  da: "påmind mig hver dag klokken minutter aftale når mandag fredag send i morgen",
  nb: "påminn meg hver dag klokka klokken minutter avtale når mandag fredag send",
  fi: "muistuta minua huomenna joka päivä kello minuutin päästä tunnin tapaaminen kun tänään maanantai perjantai lähetä",
  et: "tuleta meelde homme iga päev kell minuti pärast kohtumine kui täna esmaspäev reede saada",
  lt: "priminti primink man rytoj kiekvieną dieną valandą minučių po susitikimas kai šiandien pirmadienį penktadienį",
  lv: "atgādini man rīt katru dienu pulksten minūtēm pēc tikšanās kad šodien pirmdien piektdien",
  vi: "nhắc tôi ngày mai lúc giờ mỗi phút sau hẹn khi nhận hôm nay gửi",
  id: "ingatkan saya besok setiap hari jam menit lagi janji ketika terima senin jumat kirim",
  ms: "ingatkan saya esok setiap hari pukul minit lagi temu janji apabila terima isnin jumaat hantar",
  fil: "paalalahanan ipaalala mo ako bukas tuwing araw alas pagkatapos kapag ngayon biyernes ipadala ng sa ang mga",
  sw: "nikumbushe kesho kila siku saa dakika baada ya miadi nikipokea leo jumatatu ijumaa tuma",
  ca: "recorda recorda'm demà avui dilluns divendres envia'm quan rebi minuts hores les",
  hr: "podsjeti sutra svaki dan sati minuta sastanak kad kada danas ponedjeljak petak pošalji me",
  sl: "opomni jutri vsak dan ob uri minut čez sestanek ko danes ponedeljek petek pošlji",
  is: "minntu mig á morgun hvern dag klukkan mínútur eftir fundur þegar í mánudag föstudag sendu",
  ga: "cuir gcuimhne dom amárach gach lá chlog nóiméad gceann coinne nuair inniu luan aoine seol",
  cy: "atgoffa fi yfory bob dydd am munud mewn apwyntiad pan heddiw llun gwener anfon",
  eu: "gogorarazi gogoratu bihar egunero egun orduetan minutu barru hitzordua jasotzen gaur astelehen ostiral bidali",
  gl: "lémbrame lembrame mañá ás cando hoxe luns venres envíame",
  sq: "më kujto kujtoje nesër çdo ditë në orën minuta pas takim kur sot dërgo",
  az: "xatırlat mənə sabah hər gün saat dəqiqə sonra görüş zaman bazar ertəsi cümə göndər",
  uz: "eslat eslatib menga ertaga har kuni soat daqiqa keyin uchrashuv qachon bugun dushanba juma yubor",
};
const LATIN_SETS = Object.fromEntries(Object.entries(LATIN_WORDS).map(([k, v]) => [k, new Set(v.split(" "))]));
const LATIN_MARKS: Record<string, RegExp> = {
  pl: /[ąęłńśźż]/, cs: /[ěřů]/, sk: /[ľĺŕô]/, tr: /[ığ]/, ro: /[ășț]/, hu: /[őű]/, de: /ß/, is: /[þð]/, lv: /[āēīļņģķ]/,
  lt: /[ėįų]/, cy: /[ŵŷ]/, az: /ə/, sq: /ë/, vi: /[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/, ca: /l·l/, fr: /[œ]|\bj'|\bm'|\bd'/,
  uz: /[oʻgʻ]ʻ|o'|g'/, da: /[æø]/,
};

/** Idioma latino (fora pt/en/es) mais provável e a pontuação. */
export function detectLatinOther(text: string): { lang: string; score: number } | null {
  const t = text.toLowerCase();
  const words = t.split(/[^\p{L}'ʻ·]+/u).filter(Boolean);
  let best: { lang: string; score: number } | null = null;
  for (const [lang, set] of Object.entries(LATIN_SETS)) {
    let score = LATIN_MARKS[lang]?.test(t) ? 2 : 0;
    for (const w of words) {
      if (!set.has(w)) continue;
      const shared = Object.values(LATIN_SETS).filter((s) => s.has(w)).length;
      score += shared === 1 ? 2 : 1;
    }
    if (score > (best?.score ?? 0)) best = { lang, score };
  }
  if (best && (best.lang === "da" || best.lang === "nb")) {
    // dinamarquês × norueguês: "meg"/"klokka" = norueguês; "mig"/"klokken" ambos → dinamarquês.
    best.lang = /\b(meg|klokka|påminn)\b/.test(t) ? "nb" : /\b(mig|påmind)\b/.test(t) ? "da" : best.lang;
  }
  return best;
}
