/**
 * Tokens visuais compartilhados do vibe code (estilo "premium" em tema escuro).
 * Código próprio: classes Tailwind reutilizadas em vários painéis para manter
 * a mesma linguagem visual sem duplicar strings.
 */
export const surfaceCard =
  "group relative overflow-hidden rounded-lg border border-border/50 bg-background/40 transition-all duration-300 hover:-translate-y-px hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-[0_0_24px_-12px_rgba(201,148,26,0.55)]";

export const surfaceCardConnected =
  "border-primary/30 bg-primary/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

/** Bloco de conteúdo (ex.: diff) com brilho interno suave e realce no hover. */
export const surfaceInset =
  "overflow-x-auto rounded-lg border border-border/40 bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-shadow duration-300 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-12px_rgba(201,148,26,0.45)]";
