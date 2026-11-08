// Download de arquivos gerados no navegador (HTML, DOCX, PDF, planilhas etc.).

/** Dispara o download de um blob/bytes com o nome dado. O objeto temporário é liberado logo depois. */
export function download(data: BlobPart | Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome de arquivo seguro: letras, números, hífen e sublinhado, até 60 caracteres. */
export function safeName(title: string): string {
  return (title || 'arquivo').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
}
