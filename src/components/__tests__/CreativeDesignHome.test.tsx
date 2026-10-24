// Aba "Início" do Design Premium: atalhos, busca e seções em desenvolvimento.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CreativeDesign } from '../CreativeDesign';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const openHome = () => {
  render(<CreativeDesign creditsAvailable={100} />);
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
};

describe('Design Premium home', () => {
  it('is a tab that is not selected by default, and the AI studio stays the default', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Com IA' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the search and the start cards', () => {
    openHome();
    expect(screen.getByRole('heading', { name: 'O que você gostaria de criar?' })).toBeVisible();
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    expect(within(start).getByRole('button', { name: /Com IA/ })).toBeInTheDocument();
    expect(within(start).getByRole('button', { name: /Ferramentas grátis/ })).toBeInTheDocument();
  });

  it('filters the start cards by the search text', () => {
    openHome();
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta'), { target: { value: 'foto' } });
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    expect(within(start).getByRole('button', { name: /PhotoCraft/ })).toBeInTheDocument();
    expect(within(start).queryByRole('button', { name: /Canvas/ })).not.toBeInTheDocument();
  });

  it('shows an empty message when the search matches nothing', () => {
    openHome();
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta'), { target: { value: 'xyzzy' } });
    expect(screen.getByText('Nenhuma ferramenta encontrada para essa busca.')).toBeInTheDocument();
  });

  it('opens the matching mode from a start card', () => {
    openHome();
    const start = screen.getByRole('region', { name: 'Começar uma nova criação' });
    fireEvent.click(within(start).getByRole('button', { name: /Editor manual/ }));
    expect(screen.getByRole('button', { name: 'Editor manual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Monte sua arte à mão' })).toBeVisible();
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
