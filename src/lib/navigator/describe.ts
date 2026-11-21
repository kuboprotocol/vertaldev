// Texto dos eventos do agente do Vertal Navigator (painel do Vertal Chat e cartão do Vibe Code).
import type { NavigatorEvent } from './navigatorCore';

/** Uma linha legível por evento do agente (null = não mostra). */
export function describeNavigatorEvent(ev: NavigatorEvent): string | null {
  switch (ev.type) {
    case 'step': {
      const actions = Array.isArray(ev.actions) ? (ev.actions as Array<{ name?: string }>).map((a) => a.name).filter(Boolean).join(', ') : '';
      return `Passo ${String(ev.n ?? '')}: ${String(ev.goal || ev.evaluation || 'analisando a página')}${actions ? ` (${actions})` : ''}`;
    }
    case 'needs_approval': return `Pediu aprovação para: ${String(ev.target || ev.action || 'ação de pagamento')}`;
    case 'approval_granted': return 'Você aprovou a ação.';
    case 'approval_denied': return 'Ação de pagamento recusada.';
    case 'needs_user_input': return `Pergunta: ${String(ev.question ?? '')}`;
    case 'needs_secret': return `Preenchendo ${String(ev.name ?? 'credencial')} do cofre em ${String(ev.host ?? '')}`;
    case 'secret_filled': return `Credencial ${String(ev.name ?? '')} preenchida (o valor não passa pela IA).`;
    case 'needs_totp': return `Gerando código 2FA do autenticador (${String(ev.name ?? '')}) para ${String(ev.host ?? '')}`;
    case 'totp_filled': return 'Código 2FA do autenticador digitado (gerado no servidor, sem passar pela IA).';
    case 'page_read': return `Lendo o texto da página (${String(ev.chars ?? '')} caracteres).`;
    case 'takeover': return ev.active ? 'Você assumiu o controle.' : 'Controle devolvido ao agente.';
    case 'done': return `Fim: ${String(ev.result ?? '')}`;
    case 'input_timeout': return 'Pedido expirou sem resposta.';
    default: return null;
  }
}

/** Linhas dos passos, mais recentes primeiro. */
export function navigatorStepLines(events: NavigatorEvent[], max = 40): Array<{ seq: number; text: string }> {
  return events
    .map((ev) => ({ seq: ev.seq, text: describeNavigatorEvent(ev) }))
    .filter((l): l is { seq: number; text: string } => !!l.text)
    .slice(-max)
    .reverse();
}

/** Plano que o agente escreveu no 1º passo (fase 4: "planeje antes de agir"). */
export function navigatorPlanOf(events: NavigatorEvent[]): string | null {
  const first = events.find((e) => e.type === 'step');
  const goal = first && typeof first.goal === 'string' ? first.goal.trim() : '';
  return goal || null;
}
