import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cliente do Supabase simulado: cada consulta devolve o resultado configurado no teste.
const state = vi.hoisted(() => ({
  results: [] as Array<{ data: unknown; error: { message: string } | null }>,
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  storage: { upload: vi.fn(), download: vi.fn(), remove: vi.fn() },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (op: string) =>
    vi.fn((...args: unknown[]) => {
      state.calls.push({ table, op, args });
      return b;
    });
  for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']) b[op] = chain(op);
  const next = () => state.results.shift() ?? { data: null, error: null };
  b.single = vi.fn(() => Promise.resolve(next()));
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(next()).then(resolve, reject);
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    storage: { from: (bucket: string) => ({ bucket, ...state.storage }) },
  },
}));

import {
  MAX_CONTENT_BYTES,
  contentSize,
  deleteOfficeItem,
  listOfficeItems,
  renameOfficeItem,
  saveStructuredItem,
  saveUploadedFile,
  savePdfItem,
  type OfficeRecord,
} from './officeDocsService';

const row = {
  id: 'doc-1',
  kind: 'doc',
  title: 'Carta',
  excerpt: 'Prezado',
  size_bytes: 120,
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T11:00:00Z',
};

// jsdom não implementa File.arrayBuffer: o helper devolve um File com o método, como no navegador.
function fakeFile(bytes: number[], name: string, type: string): File {
  const file = new File([new Uint8Array(bytes)], name, { type });
  return Object.assign(file, { arrayBuffer: async () => new Uint8Array(bytes).buffer });
}

describe('galeria do Vertal Office (Supabase)', () => {
  beforeEach(() => {
    state.results = [];
    state.calls = [];
    state.storage.upload.mockReset().mockResolvedValue({ error: null });
    state.storage.remove.mockReset().mockResolvedValue({ error: null });
    state.storage.download.mockReset();
  });

  it('lista os itens do usuário em ordem de atualização, sem carregar o conteúdo', async () => {
    state.results = [{ data: [row], error: null }];
    const items = await listOfficeItems();
    expect(items).toEqual([
      { id: 'doc-1', kind: 'doc', title: 'Carta', excerpt: 'Prezado', sizeBytes: 120, createdAt: row.created_at, updatedAt: row.updated_at },
    ]);
    const select = state.calls.find((c) => c.op === 'select');
    expect(select?.args[0]).not.toContain('content');
    expect(state.calls.find((c) => c.op === 'order')?.args).toEqual(['updated_at', { ascending: false }]);
  });

  it('mostra a mensagem do banco quando a listagem falha', async () => {
    state.results = [{ data: null, error: { message: 'permissão negada' } }];
    await expect(listOfficeItems()).rejects.toThrow('Não foi possível carregar a galeria: permissão negada');
  });

  it('cria documento com o id do dono e tamanho do conteúdo', async () => {
    state.results = [{ data: row, error: null }];
    const content = { title: 'Carta', blocks: [] };
    const saved = await saveStructuredItem({ userId: 'user-1', kind: 'doc', title: 'Carta', excerpt: 'Prezado', content });
    expect(saved.id).toBe('doc-1');
    const insert = state.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toMatchObject({ user_id: 'user-1', kind: 'doc', title: 'Carta', file_path: null, size_bytes: contentSize(content) });
  });

  it('recusa conteúdo acima de 1 MB antes de enviar', async () => {
    const big = { text: 'x'.repeat(MAX_CONTENT_BYTES + 10) };
    await expect(
      saveStructuredItem({ userId: 'user-1', kind: 'doc', title: 'Grande', excerpt: '', content: big }),
    ).rejects.toThrow('passou de 1 MB');
    expect(state.calls).toHaveLength(0);
  });

  it('atualiza quando há id, sem criar linha nova', async () => {
    state.results = [{ data: row, error: null }];
    await saveStructuredItem({ id: 'doc-1', userId: 'user-1', kind: 'doc', title: 'Carta', excerpt: '', content: {} });
    expect(state.calls.map((c) => c.op)).toContain('update');
    expect(state.calls.map((c) => c.op)).not.toContain('insert');
  });

  it('PDF: envia ao bucket na pasta do dono e grava a linha', async () => {
    state.results = [{ data: { ...row, kind: 'pdf', file_path: 'x' }, error: null }];
    await savePdfItem({ userId: 'user-9', title: 'Contrato', excerpt: '', bytes: new Uint8Array([1, 2, 3]) });
    const uploadPath = state.storage.upload.mock.calls[0][0] as string;
    expect(uploadPath.startsWith('user-9/')).toBe(true);
    expect(uploadPath.endsWith('.pdf')).toBe(true);
    expect(state.calls.find((c) => c.op === 'insert')?.args[0]).toMatchObject({ kind: 'pdf', file_path: uploadPath, content: null });
  });

  it('PDF: se a linha falha, remove o arquivo enviado para não sobrar lixo', async () => {
    state.results = [{ data: null, error: { message: 'violação de RLS' } }];
    await expect(savePdfItem({ userId: 'u', title: 'X', excerpt: '', bytes: new Uint8Array([1]) })).rejects.toThrow('violação de RLS');
    expect(state.storage.remove).toHaveBeenCalledTimes(1);
  });

  it('PDF: ao substituir, apaga o arquivo antigo depois de gravar o novo', async () => {
    state.results = [
      { data: { file_path: 'user-9/antigo.pdf' }, error: null },
      { data: { ...row, kind: 'pdf', file_path: 'novo' }, error: null },
    ];
    await savePdfItem({ id: 'doc-1', userId: 'user-9', title: 'X', excerpt: '', bytes: new Uint8Array([1]) });
    expect(state.storage.remove).toHaveBeenCalledWith(['user-9/antigo.pdf']);
  });

  it('renomear documento também muda o título dentro do conteúdo', async () => {
    state.results = [{ data: row, error: null }];
    const record: OfficeRecord = {
      id: 'doc-1',
      kind: 'doc',
      title: 'Carta',
      excerpt: '',
      sizeBytes: 0,
      createdAt: '',
      updatedAt: '',
      content: { title: 'Carta', blocks: [{ id: 'b', type: 'paragraph', text: 'oi' }] },
      filePath: null,
      fileName: null,
      mimeType: null,
    };
    await renameOfficeItem(record, '  Nova carta  ');
    const update = state.calls.find((c) => c.op === 'update')?.args[0] as { title: string; content: { title: string } };
    expect(update.title).toBe('Nova carta');
    expect(update.content.title).toBe('Nova carta');
  });

  it('renomear recusa nome vazio', async () => {
    const record = { id: 'd', kind: 'doc', content: {}, filePath: null } as unknown as OfficeRecord;
    await expect(renameOfficeItem(record, '   ')).rejects.toThrow('não pode ficar vazio');
  });

  it('excluir PDF remove também o arquivo do bucket', async () => {
    state.results = [{ data: null, error: null }];
    await deleteOfficeItem({ id: 'p', kind: 'pdf', filePath: 'user-1/a.pdf' } as unknown as OfficeRecord);
    expect(state.storage.remove).toHaveBeenCalledWith(['user-1/a.pdf']);
  });

  it('arquivo enviado: executável é recusado antes de qualquer envio', async () => {
    const file = fakeFile([1, 2], 'instalador.exe', 'application/x-msdownload');
    await expect(saveUploadedFile({ userId: 'u', file })).rejects.toThrow(/não podem ser guardados/);
    expect(state.storage.upload).not.toHaveBeenCalled();
    expect(state.calls.length).toBe(0);
  });

  it('arquivo enviado: qualquer tipo permitido vai ao bucket com o nome original e vira kind "file"', async () => {
    state.results = [{ data: { ...row, kind: 'file', file_path: 'x' }, error: null }];
    const file = fakeFile([1, 2, 3], 'Foto de férias.JPG', 'image/jpeg');
    await saveUploadedFile({ userId: 'user-7', file });
    const uploadPath = state.storage.upload.mock.calls[0][0] as string;
    expect(uploadPath.startsWith('user-7/')).toBe(true);
    expect(uploadPath.endsWith('.jpg')).toBe(true);
    expect(state.calls.find((c) => c.op === 'insert')?.args[0]).toMatchObject({
      kind: 'file',
      title: 'Foto de férias',
      file_name: 'Foto de férias.JPG',
      mime_type: 'image/jpeg',
      file_path: uploadPath,
      content: null,
      size_bytes: 3,
    });
  });

  it('arquivo enviado: HTML é aceito, mas o tipo guardado é o seguro para download', async () => {
    state.results = [{ data: { ...row, kind: 'file' }, error: null }];
    const file = fakeFile([60, 115], 'pagina.html', 'text/html');
    await saveUploadedFile({ userId: 'u', file });
    expect(state.storage.upload.mock.calls[0][2]).toMatchObject({ contentType: 'application/octet-stream' });
  });
});
