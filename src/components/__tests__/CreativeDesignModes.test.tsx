// Painel Design Premium: troca entre IA, editor manual, PhotoCraft e ferramentas gratuitas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { CreativeDesign } from '../CreativeDesign';

const modeButton = (label: string) => screen.getByRole('button', { name: label });

describe('CreativeDesign modes', () => {
  let getContextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invoke.mockReset();
    // jsdom não implementa canvas 2D; o editor só precisa de um contexto que aceite as chamadas.
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      measureText: () => ({ width: 100 }),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it('opens on the AI studio and offers the three modes', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    expect(modeButton('Com IA')).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton('Editor manual')).toHaveAttribute('aria-pressed', 'false');
    expect(modeButton('Ferramentas grátis')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Criar design/ })).toBeInTheDocument();
  });

  it('keeps the AI prompt when switching modes and coming back', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.change(screen.getByLabelText('Descreva o design'), { target: { value: 'Cartaz de jazz' } });

    fireEvent.click(modeButton('Editor manual'));
    expect(screen.queryByRole('button', { name: /Criar design/ })).toBeNull();

    fireEvent.click(modeButton('Com IA'));
    expect(screen.getByLabelText('Descreva o design')).toHaveValue('Cartaz de jazz');
  });

  it('shows the manual editor and adds a text layer', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('Editor manual'));

    expect(screen.getByRole('heading', { name: 'Monte sua arte à mão' })).toBeVisible();
    expect(screen.getByText('Nenhuma camada selecionada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Texto' }));
    expect(screen.getByText('Camada selecionada: Texto')).toBeInTheDocument();
    expect(screen.getByLabelText('Texto da camada')).toHaveValue('Seu título');
  });

  it('embeds the PhotoCraft editor in its own mode', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('PhotoCraft'));

    const frame = screen.getByTitle('PhotoCraft editor de imagens');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/photocraft/');
  });

  it('lists the free tools and opens the in-app editors from the hub', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('Ferramentas grátis'));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir PhotoCraft' }));
    expect(modeButton('PhotoCraft')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('PhotoCraft editor de imagens')).toBeInTheDocument();
  });

  it('links the open-source tools to GitHub in a new tab', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('Ferramentas grátis'));

    for (const name of ['VectorCraft', 'FilmCraft', 'WordCraft', 'GridCraft', 'DeckCraft']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    const links = screen.getAllByRole('link', { name: 'Ver no GitHub' });
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/github\.com\/storytold\//));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
