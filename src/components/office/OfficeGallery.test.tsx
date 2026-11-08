import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OfficeGallery, type OfficeGalleryProps } from './OfficeGallery';
import type { OfficeItem } from '@/lib/office/galleryModel';

const items: OfficeItem[] = [
  { id: '1', kind: 'doc', title: 'Carta ao cliente', excerpt: 'Prezado senhor', sizeBytes: 0, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z' },
  { id: '2', kind: 'sheet', title: 'Orçamento', excerpt: 'Café · Pão', sizeBytes: 0, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-06T10:00:00Z' },
  { id: '3', kind: 'pdf', title: 'Contrato assinado', excerpt: '', sizeBytes: 2048, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-07T10:00:00Z' },
];

function setup(over: Partial<OfficeGalleryProps> = {}) {
  const props: OfficeGalleryProps = {
    items,
    loading: false,
    error: null,
    busyId: null,
    onRetry: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(<OfficeGallery {...props} />);
  return props;
}

describe('Galeria do Vertal Office', () => {
  it('mostra os itens, do mais recente para o mais antigo', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Documentos salvos' });
    const titles = within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Contrato assinado', 'Orçamento', 'Carta ao cliente']);
  });

  it('filtra por tipo e marca o filtro ativo', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Planilhas/ }));
    expect(screen.getByRole('button', { name: /Planilhas/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'Carta ao cliente' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Orçamento' })).toBeTruthy();
  });

  it('busca pelo título e pelo trecho', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Buscar na galeria'), { target: { value: 'café' } });
    expect(screen.getByText('Orçamento')).toBeTruthy();
    expect(screen.queryByText('Contrato assinado')).toBeNull();
  });

  it('mostra mensagem e limpa filtros quando nada bate', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Buscar na galeria'), { target: { value: 'xyz' } });
    expect(screen.getByText(/Nada encontrado/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByRole('heading', { name: 'Carta ao cliente' })).toBeTruthy();
  });

  it('estado vazio oferece criar cada tipo', () => {
    const props = setup({ items: [] });
    expect(screen.getByText('Nenhum documento salvo ainda')).toBeTruthy();
    const slideButtons = screen.getAllByRole('button', { name: /Apresentação/ });
    fireEvent.click(slideButtons[slideButtons.length - 1]);
    expect(props.onNew).toHaveBeenCalledWith('slides');
  });

  it('carregando mostra esqueleto, sem lista', () => {
    setup({ loading: true, items: [] });
    expect(screen.getByLabelText('Carregando galeria')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('erro mostra aviso com nova tentativa', () => {
    const props = setup({ error: 'Sem conexão' });
    expect(screen.getByRole('alert').textContent).toContain('Sem conexão');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('abrir chama onOpen com o item certo', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Orçamento' }));
    expect(props.onOpen).toHaveBeenCalledWith(items[1]);
  });

  it('excluir pede confirmação e só então apaga', async () => {
    const props = setup();
    const card = screen.getByRole('button', { name: 'Abrir Carta ao cliente' }).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Carta ao cliente');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(props.onDelete).toHaveBeenCalledWith(items[0]);
  });

  it('cancelar a exclusão não apaga nada', async () => {
    const props = setup();
    const card = screen.getByRole('button', { name: 'Abrir Orçamento' }).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('renomear envia o novo nome sem espaços nas pontas', async () => {
    const props = setup();
    const card = screen.getByRole('button', { name: 'Abrir Orçamento' }).closest('article') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Renomear' }));
    const input = await screen.findByLabelText('Novo nome');
    fireEvent.change(input, { target: { value: '  Orçamento 2027  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await vi.waitFor(() => expect(props.onRename).toHaveBeenCalledWith(items[1], 'Orçamento 2027'));
  });
});
