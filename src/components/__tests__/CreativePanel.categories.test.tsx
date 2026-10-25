// Painel Criativo: categorias são mundos, e as ferramentas são páginas dentro de cada um.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CreativePanel from '../CreativePanel';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@vertal.dev' } }) }));
vi.mock('../ChatWidget', () => ({ default: () => null }));
vi.mock('../CreativeChat', () => ({ CreativeChat: () => <div>Chat do Escritor</div> }));

const categoryButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) });
const pageButton = (label: string) => screen.getByRole('button', { name: label });

describe('Creative Panel categories', () => {
  it('shows the Design Premium highlight and the four categories on the home', () => {
    render(<CreativePanel />);
    expect(screen.getByRole('button', { name: /Design Premium/ })).toBeInTheDocument();
    expect(categoryButton('Design e comunicação')).toHaveTextContent('Gerador de Slides');
    expect(categoryButton('Conteúdo e documentos')).toHaveTextContent('Escritor IA');
    expect(categoryButton('Mídia e audiovisual')).toHaveTextContent('Criador de Vídeos');
    expect(categoryButton('Criação digital e negócios')).toHaveTextContent('Gerador de Código');
  });

  it('opens a category as a world whose pages are its tools', () => {
    render(<CreativePanel />);
    fireEvent.click(categoryButton('Conteúdo e documentos'));
    const nav = screen.getByRole('navigation', { name: 'Páginas de Conteúdo e documentos' });
    expect(within(nav).getByRole('button', { name: 'Escritor IA' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Gerador de Planilhas' })).toBeInTheDocument();
  });

  it('shows tools without a flow as in development and does not open them', () => {
    render(<CreativePanel />);
    fireEvent.click(categoryButton('Mídia e audiovisual'));
    fireEvent.click(pageButton('Criador de Vídeos'));
    expect(screen.getAllByText('Em desenvolvimento').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Criador de Vídeos' })).toBeVisible();
  });

  it('opens the writer as a page and goes back to the panel', () => {
    render(<CreativePanel />);
    fireEvent.click(categoryButton('Conteúdo e documentos'));
    fireEvent.click(pageButton('Escritor IA'));
    expect(screen.getByText('Chat do Escritor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Painel Criativo/ }));
    expect(categoryButton('Conteúdo e documentos')).toBeInTheDocument();
  });
});
