import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import * as XLSX from 'xlsx';
import { UPLOAD_ACCEPT, isSpreadsheetFile, resolveMimeType, spreadsheetToText, validateFile } from './fileUpload';

describe('upload de planilhas', () => {
  it('o seletor de arquivos mostra planilhas', () => {
    for (const ext of ['.xlsx', '.xls', '.csv', '.ods', '.pdf', '.docx']) expect(UPLOAD_ACCEPT).toContain(ext);
  });

  it('aceita planilha mesmo sem tipo informado pelo navegador (Windows)', () => {
    const f = new File(['a,b\n1,2'], 'clientes.csv', { type: '' });
    expect(validateFile(f)).toBeNull();
    expect(resolveMimeType(f)).toBe('text/csv');
    expect(isSpreadsheetFile(f)).toBe(true);
  });

  it('aceita .xlsx e .xls com o tipo do Excel', () => {
    expect(validateFile(new File(['x'], 'a.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))).toBeNull();
    expect(validateFile(new File(['x'], 'a.xls', { type: 'application/vnd.ms-excel' }))).toBeNull();
  });

  it('continua recusando tipos não suportados', () => {
    expect(validateFile(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toMatch(/não suportado/);
  });

  it('lê o conteúdo da planilha para a IA', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nome', 'Valor'], ['Ana', 10]]), 'Vendas');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const text = await spreadsheetToText(new File([buf], 'v.xlsx'));
    expect(text).toContain('Aba: Vendas');
    expect(text).toContain('Ana,10');
  });
});
