/** Formata créditos com 3 casas, no padrão pt-BR (ex.: 0,020). */
export function formatCredits(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/** Converte milissegundos restantes em HH:MM:SS. Valores negativos viram 00:00:00. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Chave PIX: entre 3 e 140 caracteres após aparar espaços. */
export function isValidPixKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length >= 3 && trimmed.length <= 140;
}
