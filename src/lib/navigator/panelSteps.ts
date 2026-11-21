// "Passos do agente" do painel do Navigator (Vertal Chat): só os passos da tarefa ATUAL.
// Correção: ao iniciar uma tarefa nova, apareciam por alguns instantes passos/resposta da
// tarefa anterior misturados. Agora a lista começa vazia ao iniciar e, assim que a tarefa
// tem id (runId), mostra só os eventos dela (mesmo filtro do cartão do Vibe Code na F4).
import { eventsForTask, type NavigatorEvent } from './navigatorCore';
import type { CurrentTask } from './store';

export function panelStepEvents(events: NavigatorEvent[], currentTask: Pick<CurrentTask, 'runId' | 'baseSeq'> | null, starting: boolean): NavigatorEvent[] {
  if (starting) return [];
  if (currentTask) return eventsForTask(events, currentTask);
  return events;
}
