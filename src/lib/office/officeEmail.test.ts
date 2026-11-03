import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_MAX_BYTES,
  OfficeEmailError,
  base64DecodedSize,
  buildRawEmail,
  encodeHeaderValue,
  sanitizeAttachmentName,
  toGmailRaw,
} from '../../../supabase/functions/_shared/officeEmail';

const b64 = (s: string) => btoa(s);

describe('nome do anexo', () => {
  it('aceita extensões permitidas e define o MIME pela extensão', () => {
    expect(sanitizeAttachmentName('Vendas 2026.xlsx').mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(sanitizeAttachmentName('relatório.HTML').mimeType).toBe('text/html');
  });

  it('remove caminho e rejeita extensão fora da lista', () => {
    expect(sanitizeAttachmentName('../../etc/notas.txt').filename).toBe('notas.txt');
    expect(() => sanitizeAttachmentName('virus.exe')).toThrow(OfficeEmailError);
    expect(() => sanitizeAttachmentName('sem-extensao')).toThrow(OfficeEmailError);
  });

  it('remove aspas e quebras de linha do nome', () => {
    const { filename } = sanitizeAttachmentName('a"b\r\nc.txt');
    expect(filename).not.toMatch(/["\r\n]/);
  });
});

describe('cabeçalhos', () => {
  it('mantém ASCII como está e codifica acentos em RFC 2047', () => {
    expect(encodeHeaderValue('Oi')).toBe('Oi');
    expect(encodeHeaderValue('Relatório')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it('não deixa quebra de linha virar cabeçalho novo (injeção)', () => {
    const raw = buildRawEmail({ to: 'a@b.com', subject: 'Oi\r\nBcc: x@y.com', body: 'corpo' });
    const headerBlock = raw.split('\r\n\r\n')[0];
    expect(headerBlock).not.toMatch(/^Bcc:/m);
  });
});

describe('montagem da mensagem', () => {
  it('sem anexo gera text/plain em base64 com o corpo', () => {
    const raw = buildRawEmail({ to: 'ana@ex.com', subject: 'Oi', body: 'Olá mundo' });
    expect(raw).toContain('To: ana@ex.com');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain(b64('Olá mundo').length ? btoa(unescape(encodeURIComponent('Olá mundo'))) : '');
    expect(raw).not.toContain('multipart/mixed');
  });

  it('com anexo gera multipart/mixed com nome, tipo e conteúdo do arquivo', () => {
    const fileB64 = b64('a,b\n1,2\n');
    const raw = buildRawEmail({
      to: 'ana@ex.com',
      subject: 'Planilha',
      body: 'Segue em anexo',
      attachment: { filename: 'vendas.csv', contentBase64: fileB64 },
    });
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="vertal-');
    expect(raw).toContain('Content-Type: text/csv; name="vendas.csv"');
    expect(raw).toContain("filename*=UTF-8''vendas.csv");
    expect(raw).toContain(fileB64);
    const boundary = /boundary="([^"]+)"/.exec(raw)![1];
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('anexo com acento usa nome ASCII de fallback e nome codificado', () => {
    const raw = buildRawEmail({
      to: 'ana@ex.com',
      subject: 's',
      body: 'b',
      attachment: { filename: 'Relatório.txt', contentBase64: b64('x') },
    });
    expect(raw).toContain('filename="Relat_rio.txt"');
    expect(raw).toContain("filename*=UTF-8''Relat%C3%B3rio.txt");
  });

  it('recusa destinatário inválido', () => {
    expect(() => buildRawEmail({ to: 'nao-e-email', subject: 's', body: 'b' })).toThrow('invalid_recipient');
  });

  it('recusa anexo maior que o limite', () => {
    const big = 'A'.repeat(Math.ceil((ATTACHMENT_MAX_BYTES + 10) / 3 * 4));
    expect(() =>
      buildRawEmail({ to: 'a@b.com', subject: 's', body: 'b', attachment: { filename: 'x.txt', contentBase64: big } }),
    ).toThrow('attachment_too_large');
  });
});

describe('utilitários', () => {
  it('calcula o tamanho decodificado de base64 com padding', () => {
    expect(base64DecodedSize(b64('hello'))).toBe(5);
    expect(base64DecodedSize(b64('hi'))).toBe(2);
  });

  it('toGmailRaw gera base64url sem padding', () => {
    const out = toGmailRaw('ab>?');
    expect(out).not.toMatch(/[+/=]/);
  });
});
