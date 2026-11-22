// Peças de texto/estilo compartilhadas pelo painel do Vertal Navigator (Vertal Chat)
// e pelo cartão do navegador dentro do chat do Vibe Code (fase 4).

export const navBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';
export const navPrimary = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
export const navInput = 'w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Versões compactas (cartão no chat). */
export const navBtnSm = 'inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50';
export const navPrimarySm = 'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';

export const NAV_STATUS_LABEL: Record<string, string> = {
  none: 'Fechado', idle: 'Pronto', running: 'Trabalhando…', paused: 'Pausado (você no controle)', waiting: 'Esperando você',
  done: 'Concluído', failed: 'Falhou', stopped: 'Parado',
};

export function hostOf(url?: string | null): string {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
}

/** Textos do cartão de aprovação: pagamento (padrão) ou ação de escrita (enviar, responder, convite, publicar, excluir). */
export function approvalCopy(approval: { category?: string; url?: string }): { isWrite: boolean; title: string; description: string; approveLabel: string } {
  if (approval.category === 'write') {
    return {
      isWrite: true,
      title: 'Aprovar envio/confirmação?',
      description: 'O navegador parou antes de enviar ou confirmar algo em seu nome (e-mail, resposta a convite, publicação, exclusão ou formulário). Confira abaixo o conteúdo exato. Nada foi enviado ainda.',
      approveLabel: 'Aprovar e enviar',
    };
  }
  return {
    isWrite: false,
    title: 'Aprovar ação de pagamento?',
    description: 'O navegador parou antes de clicar num botão que pode pagar, comprar ou confirmar um pedido. Nada foi clicado ainda.',
    approveLabel: 'Aprovar e clicar',
  };
}

export { describeNavigatorEvent, navigatorPlanOf, navigatorStepLines } from '@/lib/navigator/describe';
