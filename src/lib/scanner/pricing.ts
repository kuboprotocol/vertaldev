// Preço do scanner: a mesma constante que a edge function scanner-export cobra.
export { SCANNER_PDF_CREDITS, SCANNER_MAX_PAGES } from '../../../supabase/functions/_shared/scanner';

export function scannerChargeMessage(error: string | undefined): string {
  if (error === 'Unauthorized' || error === 'unauthorized') return 'Entre na sua conta para salvar o PDF.';
  if (error === 'insufficient_credits' || error === 'deduction_failed') return 'Créditos insuficientes para salvar o PDF.';
  return 'Não consegui cobrar os créditos. Tente de novo.';
}
