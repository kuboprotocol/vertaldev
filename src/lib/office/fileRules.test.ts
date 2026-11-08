import { describe, expect, it } from 'vitest';
import { BLOCKED_EXTENSIONS, FILE_MAX_BYTES, checkUploadableFile, downloadMimeType, fileExtension } from './fileRules';

const MB = 1024 * 1024;

describe('fileExtension', () => {
  it('pega a última extensão, em minúsculas', () => {
    expect(fileExtension('relatorio.final.PDF')).toBe('pdf');
    expect(fileExtension('foto.JPG')).toBe('jpg');
  });
  it('sem extensão ou com ponto no fim, devolve vazio', () => {
    expect(fileExtension('Makefile')).toBe('');
    expect(fileExtension('nome.')).toBe('');
    expect(fileExtension('.bashrc')).toBe('');
  });
  it('ignora pastas no nome', () => {
    expect(fileExtension('C:\\temp\\setup.EXE')).toBe('exe');
  });
});

describe('checkUploadableFile', () => {
  it('aceita qualquer tipo que não seja executável', () => {
    for (const name of ['foto.png', 'video.mp4', 'planilha.xlsx', 'dados.csv', 'pagina.html', 'icone.svg', 'arquivo.zip', 'ebook.epub', 'sem-extensao']) {
      expect(checkUploadableFile({ name, size: 10 })).toBeNull();
    }
  });

  it('bloqueia cada extensão executável da lista, sem diferenciar maiúsculas', () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      expect(checkUploadableFile({ name: `x.${ext.toUpperCase()}`, size: 10 })).toMatch(/não podem ser guardados/);
    }
  });

  it('o último sufixo decide: "virus.exe.pdf" é PDF e passa', () => {
    expect(checkUploadableFile({ name: 'virus.exe.pdf', size: 10 })).toBeNull();
  });

  it('limite de 100 MB: no limite passa, acima recusa', () => {
    expect(FILE_MAX_BYTES).toBe(100 * MB);
    expect(checkUploadableFile({ name: 'grande.bin', size: FILE_MAX_BYTES })).toBeNull();
    expect(checkUploadableFile({ name: 'grande.bin', size: FILE_MAX_BYTES + 1 })).toMatch(/passa de 100 MB/);
  });

  it('recusa arquivo vazio e arquivo sem nome', () => {
    expect(checkUploadableFile({ name: 'vazio.txt', size: 0 })).toMatch(/está vazio/);
    expect(checkUploadableFile({ name: '   ', size: 10 })).toMatch(/não tem nome/);
  });
});

describe('downloadMimeType', () => {
  it('mantém tipos comuns', () => {
    expect(downloadMimeType('image/png')).toBe('image/png');
    expect(downloadMimeType('application/pdf')).toBe('application/pdf');
  });
  it('tipos que o navegador executaria viram octet-stream (sempre download)', () => {
    expect(downloadMimeType('text/html')).toBe('application/octet-stream');
    expect(downloadMimeType('image/svg+xml')).toBe('application/octet-stream');
    expect(downloadMimeType('application/xhtml+xml')).toBe('application/octet-stream');
  });
  it('vazio ou inválido vira octet-stream', () => {
    expect(downloadMimeType('')).toBe('application/octet-stream');
    expect(downloadMimeType(null)).toBe('application/octet-stream');
    expect(downloadMimeType('lixo; charset=x')).toBe('application/octet-stream');
  });
});
