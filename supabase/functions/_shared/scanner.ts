// Scanner de documentos: preço da exportação de PDF. TypeScript puro, sem APIs de Deno nem do navegador.
// A edge function scanner-export cobra este valor e o painel (src/lib/scanner/pricing.ts) mostra o mesmo número.
export const SCANNER_PDF_CREDITS = 4;
export const SCANNER_MAX_PAGES = 100;
