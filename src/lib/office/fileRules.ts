// Regras para arquivos enviados à galeria do Vertal Office (qualquer tipo, exceto executáveis).
// Sem rede e sem React: testável isoladamente.
//
// Decisões do usuário (2026-11-08): limite de 100 MB para todo arquivo e bloqueio de executáveis.
// HTML e SVG são aceitos, mas nunca são servidos inline (ver officeDocsService): sempre download.

export const FILE_MAX_BYTES = 100 * 1024 * 1024;

/** Extensões de executáveis e scripts que não podem ser guardadas na galeria. */
export const BLOCKED_EXTENSIONS: readonly string[] = [
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'bash', 'vbs', 'jar', 'app', 'dmg', 'apk', 'dll', 'so', 'dylib', 'php',
];

/** Extensão em minúsculas, sem o ponto. "relatorio.final.PDF" → "pdf"; "Makefile" → "". */
export function fileExtension(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLocaleLowerCase('en-US');
}

export function formatLimitMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Devolve a mensagem de erro para o usuário, ou null quando o arquivo pode ser guardado.
 * Só checa nome, tamanho e extensão: não lê o conteúdo.
 */
export function checkUploadableFile(file: { name: string; size: number }): string | null {
  const name = file.name.trim();
  if (!name) return 'O arquivo não tem nome. Renomeie e tente de novo.';
  if (file.size <= 0) return `"${name}" está vazio. Escolha outro arquivo.`;
  if (file.size > FILE_MAX_BYTES) {
    return `"${name}" passa de ${formatLimitMb(FILE_MAX_BYTES)}. Comprima o arquivo ou divida em partes.`;
  }
  const ext = fileExtension(name);
  if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
    return `Arquivos .${ext} (programas e scripts) não podem ser guardados na galeria.`;
  }
  return null;
}

/** Tipos que o navegador executaria se fossem abertos como página (risco de XSS). */
const ACTIVE_MIME = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml']);

/** Tipo para o download: o do arquivo quando é seguro; HTML/SVG/XML viram octet-stream (sempre download). */
export function downloadMimeType(mime: string | null | undefined): string {
  const clean = (mime ?? '').trim().toLocaleLowerCase('en-US');
  if (!clean || ACTIVE_MIME.has(clean) || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(clean)) return 'application/octet-stream';
  return clean;
}
