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

export { describeNavigatorEvent, navigatorPlanOf, navigatorStepLines } from '@/lib/navigator/describe';
