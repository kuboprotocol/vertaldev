// Agendador — variantes regionais. Herdam do idioma-base (SCHED_LANGS[].parent) e só trocam o que muda.
// de-CH não tem texto próprio: herda o alemão e troca ß por ss (transform em chatSchedulerI18n.ts).
import type { SchedStrings } from "../chatSchedulerI18n.ts";

/** Português europeu: só as palavras que mudam em relação ao pt-BR. */
const ptPT: SchedStrings = {
  description: "Peça no chat: \"lembra-me amanhã às 9h\", \"todos os dias às 8h…\", \"marca uma consulta…\" ou \"quando receber um e-mail de…\".",
  daily: "todos os dias às {t}", weekly: "todas as {days} às {t}", monthly: "todos os meses, dia {d}, às {t}",
  agendaVertal: "Agenda do Vertal (com ligação para adicionar ao Google Calendar)", agendaGoogle: "Google Calendar ligado",
  inGoogle: "Está no seu Google Calendar.", addGoogle: "Adicionar ao Google Calendar", uiInGoogle: "No seu Google Calendar",
  sendTo: "Pode enviar e-mail para", appActions: "Pode executar ações nas suas apps ligadas (Vertal Fluxos; custo normal de cada ação)",
  notifyEmail: "Também o avisa por e-mail",
  errFromSubject: "Diga de quem é ou que assunto tem o e-mail que inicia a tarefa.",
  errWhen: "Não percebi quando. Diga, por exemplo, \"amanhã às 9h\" ou \"todas as segundas às 8h\".",
  failed: "⚠️ **A tarefa \"{title}\" falhou** após {n} novas tentativas.\nMotivo: {err}\nPode executá-la novamente em Tarefas agendadas.",
  needsGmail: "⚠️ O gatilho \"{title}\" precisa do Gmail ligado. Ligue-o em Conectores → Gmail e retome a tarefa em Tarefas agendadas.",
  gmailMissing: "O Gmail não está ligado: ligue-o em Conectores → Gmail para o gatilho funcionar.",
  tooMany: "Já tem {n} tarefas; apague alguma antes.", nothing: "Não disse o que agendar.",
  tabSettings: "Definições", copied: "Copiado. Cole-o no chat.", runNow: "Executar agora", save: "Guardar",
  ranNow: "Executada agora. O resultado está na conversa da tarefa.", neverRan: "Ainda não foi executada.",
  toastFallback: "Executada agora. Veja o resultado na conversa.", rsRunning: "em execução", rsSkipped: "ignorada",
  agendaEmpty: "Nenhum compromisso. Peça no chat: \"marca uma consulta…\".",
  notifyMe: "Também me avisar por e-mail (para a sua própria conta do Gmail)", saved: "Definições guardadas.",
  languageHint: "Lembretes, resultados e avisos saem neste idioma. \"Automático\" usa o idioma em que pediu a tarefa.",
  permSendTo: "Passa a poder enviar e-mail para: {l}", permApps: "Passa a poder executar ações nas suas apps ligadas (Vertal Fluxos)",
  errNotEnabled: "As tarefas agendadas ainda não estão disponíveis para a sua conta.", errSession: "A sua sessão expirou. Inicie sessão novamente.",
  errSaveFailed: "Não foi possível guardar agora. Tente novamente dentro de instantes.", errGeneric: "Não foi possível contactar as tarefas agendadas agora.",
  dlgDesc: "O chat precisa da sua autorização para agir fora dele e concluir o seu pedido.",
  exReminder: "Lembra-me amanhã às 9h de pagar a fatura",
  exDaily: "Todos os dias às 8h envia-me as 5 principais notícias de tecnologia",
  exWeekly: "Todas as segundas às 9h pesquisa a cotação do dólar e faz-me um resumo da semana",
  exAppt: "Marca uma consulta no dentista sexta às 15h e lembra-me 1 hora antes",
  exApproval: "Quando receber um e-mail dos RH com assunto proposta: se for aprovada, avisa-me e cria um lembrete para assinar; se for recusada, avisa-me",
  exPayment: "Quando chegar um e-mail do banco sobre um pagamento: se for confirmado, avisa-me; se falhar, avisa-me com urgência",
};

/** Francês da Bélgica e da Suíça: mesmo texto do francês (sem diferenças nestas frases). */
const frBE: SchedStrings = {};
const frCH: SchedStrings = {};
/** Italiano da Suíça: igual ao italiano. */
const itCH: SchedStrings = {};
/** Flamengo: só as palavras mais típicas da Bélgica. */
const nlBE: SchedStrings = {
  agenda: "Agenda", tabSettings: "Instellingen", refresh: "Vernieuwen",
  exDaily: "Stuur me elke dag om 8 uur de 5 belangrijkste technologienieuwtjes",
};
const deCH: SchedStrings = {};

export const VARIANTS: Record<string, SchedStrings> = {
  "pt-PT": ptPT, "fr-BE": frBE, "fr-CH": frCH, "it-CH": itCH, "nl-BE": nlBE, "de-CH": deCH,
};
