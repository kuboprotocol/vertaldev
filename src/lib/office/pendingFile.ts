/**
 * Arquivo escolhido fora do Vertal Office (ex.: botão "Arquivo" do painel
 * criativo) que o Office deve abrir assim que montar.
 */
let pending: File | null = null;

export function setPendingOfficeFile(file: File): void {
  pending = file;
}

export function takePendingOfficeFile(): File | null {
  const f = pending;
  pending = null;
  return f;
}
