// Painel Design Premium: troca entre IA, editor manual e ecossistema Adobe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { CreativeDesign } from '../CreativeDesign';

const ADOBE_APP_NAMES = ['Adobe Express', 'Photoshop', 'Illustrator', 'Firefly', 'Premiere Pro', 'Acrobat'];

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
    expect(modeButton('Ecossistema Adobe')).toHaveAttribute('aria-pressed', 'false');
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

  it('lists the Adobe apps with links that open in a new tab', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('Ecossistema Adobe'));

    for (const name of ADOBE_APP_NAMES) {
      const link = screen.getByRole('link', { name: `Abrir ${name}` });
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('filters the Adobe apps by category', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(modeButton('Ecossistema Adobe'));
    fireEvent.click(screen.getByRole('button', { name: 'Vídeo e motion' }));

    expect(screen.getByRole('link', { name: 'Abrir Premiere Pro' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir Photoshop' })).not.toBeInTheDocument();
  });
});
