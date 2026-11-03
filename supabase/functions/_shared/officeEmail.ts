// Montagem de e-mail com anexo do Vertal Office (MIME), sem APIs do Deno.
//
// Usado pela edge function `office-email-send` e testado no Vitest.
// Regras: o tipo do anexo vem da extensão (nunca do cliente), o nome do
// arquivo é limpo, e cabeçalhos não aceitam quebra de linha (anti-injeção).

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Extensões permitidas e o MIME fixo de cada uma. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  html: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
};

export interface EmailAttachment {
  filename: string;
  /** Conteúdo em base64 (sem quebras). */
  contentBase64: string;
}

export interface EmailInput {
  to: string;
  subject: string;
  body: string;
  attachment?: EmailAttachment;
}

export class OfficeEmailError extends Error {}

/** Nome seguro: sem caminho, sem quebra de linha, com extensão permitida, até 100 caracteres. */
export function sanitizeAttachmentName(name: string): { filename: string; mimeType: string } {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\r\n"\\]/g, '')
    .replace(/[^\p{L}\p{N} ._-]+/gu, '_')
    .trim()
    .slice(0, 100);
  const ext = cleaned.includes('.') ? cleaned.split('.').pop()!.toLowerCase() : '';
  const mimeType = ATTACHMENT_TYPES[ext];
  if (!cleaned || !mimeType) throw new OfficeEmailError('attachment_type_not_allowed');
  return { filename: cleaned, mimeType };
}

/** Tamanho decodificado de um base64 (aproximação exata pelo padding). */
export function base64DecodedSize(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Valor de cabeçalho: remove quebras e codifica em RFC 2047 se tiver não-ASCII. */
export function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${utf8ToBase64(clean)}?=`;
}

/** Quebra base64 em linhas de 76 caracteres, como exige o MIME. */
export function wrapBase64(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
}

function randomBoundary(): string {
  const r = () => Math.random().toString(36).slice(2, 12);
  return `vertal-${r()}${r()}`;
}

/** Monta a mensagem MIME completa (CRLF). Sem anexo vira text/plain; com anexo, multipart/mixed. */
export function buildRawEmail(input: EmailInput): string {
  if (!/^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/.test(input.to)) {
    throw new OfficeEmailError('invalid_recipient');
  }
  const headers = [
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    'MIME-Version: 1.0',
  ];
  const bodyB64 = wrapBase64(utf8ToBase64(input.body));

  if (!input.attachment) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
    ].join('\r\n');
  }

  const { filename, mimeType } = sanitizeAttachmentName(input.attachment.filename);
  if (base64DecodedSize(input.attachment.contentBase64) > ATTACHMENT_MAX_BYTES) {
    throw new OfficeEmailError('attachment_too_large');
  }
  const boundary = randomBoundary();
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(filename);

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${asciiName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    '',
    wrapBase64(input.attachment.contentBase64),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Gmail espera base64url do texto bruto da mensagem. */
export function toGmailRaw(raw: string): string {
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
