// Aba "Início" do Design Premium: atalhos para os mundos, busca e seções em desenvolvimento.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreativeDesign } from '../CreativeDesign';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('tldraw', () => ({ getSnapshot: vi.fn(() => ({})) }));
vi.mock('@/components/canvas/TLDrawEditor', () => ({ default: () => null }));

const openHome = () => {
  render(
    <MemoryRouter>
      <CreativeDesign creditsAvailable={100} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
};

describe('Design Premium home', () => {
  it('is a tab that is not selected by default, and the AI studio stays the default', () => {
    openHome();
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Com IA' }));
    expect(screen.getByRole('button', { name: 'Com IA' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the search and the world cards', () => {
    openHome();
    expect(screen.getByRole('heading', { name: 'O que você gostaria de criar?' })).toBeVisible();
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    for (const title of ['Com IA', 'Canvas', 'Estúdio Pro', 'Avatares', 'Galeria']) {
      expect(within(start).getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('filters the world cards by the search text', () => {
    openHome();
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta'), { target: { value: 'avatar' } });
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    expect(within(start).getByRole('button', { name: /Avatares/ })).toBeInTheDocument();
    expect(within(start).queryByRole('button', { name: /Canvas/ })).not.toBeInTheDocument();
  });

  it('shows an empty message when the search matches nothing', () => {
    openHome();
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta'), { target: { value: 'xyzzy' } });
    expect(screen.getByText('Nenhuma ferramenta encontrada para essa busca.')).toBeInTheDocument();
  });

  it('opens the Estúdio Pro world from its card, on its home page', () => {
    openHome();
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    fireEvent.click(within(start).getByRole('button', { name: /Estúdio Pro/ }));
    expect(screen.getByRole('button', { name: 'Estúdio Pro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('navigation', { name: 'Páginas de Estúdio Pro' })).toBeInTheDocument();
  });

  it('marks recent, favourites and templates as in development without fake items', () => {
    openHome();
    const pending = screen.getByRole('region', { name: 'Em desenvolvimento' });
    for (const title of ['Continuar criando', 'Seus projetos recentes', 'Favoritos', 'Modelos']) {
      expect(within(pending).getByText(title)).toBeInTheDocument();
    }
    expect(within(pending).getAllByText('Em desenvolvimento')).toHaveLength(4);
  });
});
