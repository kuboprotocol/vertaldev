// Vertal Chat · Agendador — executor da ação "agendador" no navegador.
// Criar e apagar passam pelo cartão de confirmação (o mesmo cartão de permissão do chat);
// o servidor (vertal-chat-scheduler) valida tudo de novo.
import type { AgentAction, ToolResult } from '@/lib/chatAgent/contract';
import {
  callScheduler, getSchedulerLangSetting, notifySchedulerChanged, openSchedulerPanel, type SchedulerRun, type SchedulerTaskView,
} from './client';
import { schedUi, schedulerUiLang } from './i18n';

type SchedulerAgentAction = Extract<AgentAction, { tool: 'agendador' }>;

export interface SchedulerActionContext {
  approveApi: (request: { method: string; url: string; host: string; reason: string; secrets: string[]; hasBody: boolean }) => Promise<boolean>;
  chatConversationId?: string | null;
}

export interface SchedulerOutcome {
  result: ToolResult;
  needsFollowUp?: boolean;
  error?: string;
}

const TOOL = 'agendador';
const out = (ok: boolean, summary: string, error?: string): SchedulerOutcome => ({
  result: { tool: TOOL, ok, summary }, needsFollowUp: true, ...(error ? { error } : {}),
});

/** Cabeçalho do cartão de confirmação (o painel de permissão mostra método + "url"). */
export const SCHEDULER_CARD_METHOD = 'TAREFA AGENDADA';

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/Sao_Paulo';
  }
};

export function taskLine(t: SchedulerTaskView): string {
  const next = t.status === 'active' && t.next_run_text ? ` · próxima: ${t.next_run_text}` : '';
  return `- [${t.status}] ${t.title} — ${t.when_text}${next} (id ${t.id})`;
}

export async function runScheduler(action: SchedulerAgentAction, ctx: SchedulerActionContext): Promise<SchedulerOutcome> {
  switch (action.op) {
    case 'create': {
      const { tool: _t, op: _o, ...spec } = action;
      const tz = timezone();
      const preview = await callScheduler<{ summary: string[]; warnings: string[]; lang?: string }>('preview', { spec, timezone: tz });
      if (!preview.ok) return out(false, `Não deu para montar a tarefa: ${preview.message}`, preview.message);
      // Cartão no idioma do usuário (o servidor resolve: Ajustes → idioma do pedido → navegador).
      const U = schedUi(schedulerUiLang(preview.data.lang));
      const lines = [...preview.data.summary, ...(preview.data.warnings ?? []).map((w) => `${U.warning}: ${w}`)];
      const approved = await ctx.approveApi({
        method: SCHEDULER_CARD_METHOD,
        url: spec.title ?? U.newTask,
        host: U.cardHost,
        reason: lines.join('\n'),
        secrets: [],
        hasBody: false,
      });
      if (!approved) return out(false, 'O usuário não confirmou a criação da tarefa.', 'Tarefa não criada.');
      const created = await callScheduler<{ task: SchedulerTaskView; summary: string[]; event?: { add_to_google_url?: string; provider?: string } }>('create', {
        spec, timezone: tz, conversation_id: ctx.chatConversationId ?? null,
      });
      if (!created.ok) return out(false, `Não consegui criar a tarefa: ${created.message}`, created.message);
      notifySchedulerChanged();
      const ev = created.data.event;
      const cal = ev ? (ev.provider === 'google' ? '\nEvento criado no Google Agenda.' : `\nEvento salvo na agenda do Vertal. Link para adicionar ao Google Agenda: ${ev.add_to_google_url}`) : '';
      return out(true, `Tarefa criada e confirmada pelo usuário (id ${created.data.task.id}).\n${created.data.summary.join('\n')}${cal}\nO usuário acompanha em "Tarefas agendadas" (botão no topo do chat).`);
    }
    case 'list': {
      const r = await callScheduler<{ tasks: SchedulerTaskView[] }>('list');
      if (!r.ok) return out(false, r.message, r.message);
      openSchedulerPanel();
      return out(true, r.data.tasks.length ? `Tarefas do usuário:\n${r.data.tasks.map(taskLine).join('\n')}` : 'O usuário não tem tarefas agendadas.');
    }
    case 'templates': {
      const r = await callScheduler<{ templates: Array<{ label: string; example: string }> }>('templates');
      if (!r.ok) return out(false, r.message, r.message);
      return out(true, `Modelos prontos:\n${r.data.templates.map((t) => `- ${t.label}: "${t.example}"`).join('\n')}`);
    }
    case 'agenda': {
      const r = await callScheduler<{ events: Array<{ title: string; starts_at: string; provider: string; location?: string }> }>('agenda');
      if (!r.ok) return out(false, r.message, r.message);
      const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      return out(true, r.data.events.length
        ? `Agenda:\n${r.data.events.map((e) => `- ${fmt(e.starts_at)} ${e.title}${e.location ? ` (${e.location})` : ''} [${e.provider === 'google' ? 'Google Agenda' : 'Vertal'}]`).join('\n')}`
        : 'Nenhum compromisso na agenda.');
    }
    case 'history': {
      const r = await callScheduler<{ task: SchedulerTaskView; runs: SchedulerRun[] }>('history', { id: action.id, name: action.name });
      if (!r.ok) return out(false, r.message, r.message);
      const runs = r.data.runs.slice(0, 10).map((x) => `- ${new Date(x.started_at).toLocaleString('pt-BR')} ${x.status}${x.sentiment ? ` (${x.sentiment})` : ''}: ${(x.output ?? x.error ?? '').slice(0, 200)}`);
      return out(true, `Histórico de "${r.data.task.title}":\n${runs.join('\n') || '(ainda não rodou)'}`);
    }
    case 'pause':
    case 'resume': {
      const r = await callScheduler<{ title: string; next_run_text?: string }>('update', { id: action.id, name: action.name, status: action.op === 'pause' ? 'paused' : 'active' });
      if (!r.ok) return out(false, r.message, r.message);
      notifySchedulerChanged();
      return out(true, action.op === 'pause' ? `Tarefa "${r.data.title}" pausada.` : `Tarefa "${r.data.title}" retomada${r.data.next_run_text ? ` (próxima: ${r.data.next_run_text})` : ''}.`);
    }
    case 'run_now': {
      const r = await callScheduler<{ text: string }>('run_now', { id: action.id, name: action.name });
      if (!r.ok) return out(false, r.message, r.message);
      notifySchedulerChanged();
      return out(true, `Rodei agora. Resultado (também postado na conversa da tarefa):\n${r.data.text}`);
    }
    case 'delete': {
      const U = schedUi(schedulerUiLang(getSchedulerLangSetting()));
      const approved = await ctx.approveApi({
        method: SCHEDULER_CARD_METHOD, url: action.name ?? action.id ?? U.task, host: U.cardHost,
        reason: U.deleteReason, secrets: [], hasBody: false,
      });
      if (!approved) return out(false, 'O usuário não confirmou apagar.', 'Nada foi apagado.');
      const r = await callScheduler<{ deleted: string }>('delete', { id: action.id, name: action.name });
      if (!r.ok) return out(false, r.message, r.message);
      notifySchedulerChanged();
      return out(true, `Tarefa "${r.data.deleted}" apagada.`);
    }
    case 'update': {
      const c = action.changes;
      if (c.send_to?.length || c.allow_app_actions || c.notify_email) {
        const U = schedUi(schedulerUiLang(c.lang ?? getSchedulerLangSetting()));
        const approved = await ctx.approveApi({
          method: SCHEDULER_CARD_METHOD, url: action.name ?? action.id ?? U.task, host: U.cardHost,
          reason: [
            c.send_to?.length ? U.permSendTo(c.send_to.join(', ')) : '',
            c.allow_app_actions ? U.permApps : '',
            c.notify_email ? U.permNotify : '',
          ].filter(Boolean).join('\n'),
          secrets: [], hasBody: false,
        });
        if (!approved) return out(false, 'O usuário não confirmou a mudança de permissões.', 'Nada foi alterado.');
      }
      const r = await callScheduler<{ title: string; summary: string[] }>('update', { id: action.id, name: action.name, changes: action.changes });
      if (!r.ok) return out(false, r.message, r.message);
      notifySchedulerChanged();
      return out(true, `Tarefa "${r.data.title}" atualizada:\n${r.data.summary.join('\n')}`);
    }
  }
}
