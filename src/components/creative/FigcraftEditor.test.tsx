// O editor do figCraft no Painel Criativo: lista, modelos e a ponte de salvamento (sem browser real).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { FigcraftEditor } from './FigcraftEditor';

const createDesign = vi.fn();
const saveDesignBytes = vi.fn();
const listDesigns = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'ana@vertal.dev' } }) }));
vi.mock('@/lib/figcraft/designStore', () => ({
  listDesigns: (...a: unknown[]) => listDesigns(...a),
  getDesign: vi.fn(async () => null),
  createDesign: (...a: unknown[]) => createDesign(...a),
  saveDesignBytes: (...a: unknown[]) => saveDesignBytes(...a),
  downloadDesignBytes: vi.fn(async () => new Uint8Array([1])),
  renameDesign: vi.fn(),
  deleteDesign: vi.fn(),
}));

const SAVED_DESIGN = {
  id: 'd1',
  title: 'Cartão',
  engine: 'figcraft',
  filePath: 'u1/d1.figcraft',
  sizeBytes: 10,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
};

function frameWindow(): Window {
  return (screen.getByTitle(/figCraft, editor/) as HTMLIFrameElement).contentWindow as Window;
}

function sendFromFrame(data: unknown, origin = window.location.origin, source: unknown = frameWindow()) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
  });
}

describe('FigcraftEditor', () => {
  beforeEach(() => {
    createDesign.mockReset();
    saveDesignBytes.mockReset();
    listDesigns.mockReset().mockResolvedValue([SAVED_DESIGN]);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    // jsdom não navega: o clique do download vira no-op.
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('mostra os modelos, os designs salvos e o iframe do figCraft em modo host', async () => {
    render(<FigcraftEditor />);
    expect(screen.getByRole('heading', { name: 'figCraft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /App mobile/ })).toBeInTheDocument();
    expect(await screen.findByText('Cartão')).toBeInTheDocument();
    const src = (screen.getByTitle(/figCraft, editor/) as HTMLIFrameElement).getAttribute('src') ?? '';
    expect(src).toContain('host=parent');
    expect(src).toContain('control=');
  });

  it('um documento salvo como novo vira um design do usuário', async () => {
    createDesign.mockResolvedValue({ ...SAVED_DESIGN, id: 'd2', title: 'Poster' });
    render(<FigcraftEditor />);
    await screen.findByText('Cartão');
    sendFromFrame({ type: 'figcraft:save', name: 'Poster.figcraft', bytes: new Uint8Array([7, 7]).buffer, saveAs: true });
    await waitFor(() => expect(createDesign).toHaveBeenCalledTimes(1));
    expect(createDesign).toHaveBeenCalledWith('u1', 'Poster', expect.any(Uint8Array));
    expect(await screen.findByText('Design salvo.')).toBeInTheDocument();
  });

  it('exportação (PNG) baixa no navegador e não cria design', async () => {
    render(<FigcraftEditor />);
    await screen.findByText('Cartão');
    sendFromFrame({ type: 'figcraft:save', name: 'Poster.png', bytes: new Uint8Array([1]).buffer, saveAs: false });
    expect(await screen.findByText('Exportado: Poster.png')).toBeInTheDocument();
    expect(createDesign).not.toHaveBeenCalled();
    expect(saveDesignBytes).not.toHaveBeenCalled();
  });

  it('ignora mensagens de outra origem ou de outra janela', async () => {
    render(<FigcraftEditor />);
    await screen.findByText('Cartão');
    sendFromFrame({ type: 'figcraft:save', name: 'Evil.figcraft', bytes: new Uint8Array([1]).buffer, saveAs: true }, 'https://evil.example');
    sendFromFrame({ type: 'figcraft:save', name: 'Evil.figcraft', bytes: new Uint8Array([1]).buffer, saveAs: true }, window.location.origin, {});
    await new Promise((r) => setTimeout(r, 20));
    expect(createDesign).not.toHaveBeenCalled();
  });
});
