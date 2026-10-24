// Organização do Painel Criativo em categorias e estados de disponibilidade.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CreativePanel from '../CreativePanel';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@vertal.dev' } }) }));
vi.mock('../ChatWidget', () => ({ default: () => null }));
vi.mock('../CreativeChat', () => ({ CreativeChat: () => <div>Chat do Escritor</div> }));

describe('Creative Panel categories', () => {
  it('groups the tools under the four categories', () => {
    render(<CreativePanel />);
    const design = screen.getByRole('region', { name: 'Design e comunicação' });
    expect(design).toHaveTextContent('Design Premium');
    expect(design).toHaveTextContent('Gerador de Slides');
    expect(screen.getByRole('region', { name: 'Conteúdo e documentos' })).toHaveTextContent('Escritor IA');
    expect(screen.getByRole('region', { name: 'Mídia e audiovisual' })).toHaveTextContent('Criador de Vídeos');
    expect(screen.getByRole('region', { name: 'Criação digital e negócios' })).toHaveTextContent('Gerador de Código');
  });

  it('marks tools without a flow as in development and does not open them', () => {
    render(<CreativePanel />);
    const video = screen.getByRole('button', { name: /Criador de Vídeos/ });
    const code = screen.getByRole('button', { name: /Gerador de Código/ });
    expect(video).toBeDisabled();
    expect(code).toBeDisabled();
    expect(video).toHaveTextContent('Em desenvolvimento');
    fireEvent.click(video);
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
  });

  it('opens the writer when Escritor IA is clicked', () => {
    render(<CreativePanel />);
    fireEvent.click(screen.getByRole('button', { name: /Escritor IA/ }));
    expect(screen.getByText('Chat do Escritor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(screen.getByRole('region', { name: 'Conteúdo e documentos' })).toBeInTheDocument();
  });

  it('moves a category carousel with its up and down arrows', () => {
    render(<CreativePanel />);
    const design = screen.getByRole('region', { name: 'Design e comunicação' });
    expect(design).toHaveTextContent('1/3');
    fireEvent.click(within(design).getByRole('button', { name: 'Próximo em Design e comunicação' }));
    expect(design).toHaveTextContent('2/3');
    fireEvent.click(within(design).getByRole('button', { name: 'Anterior em Design e comunicação' }));
    expect(design).toHaveTextContent('1/3');
  });
});
