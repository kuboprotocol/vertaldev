// Estúdio de Design: níveis, custo, envio ao servidor e resultado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { CreativeDesign } from '../CreativeDesign';

const generateBtn = () => screen.getByRole('button', { name: /Criar design/ });
const promptInput = () => screen.getByLabelText('Descreva o design') as HTMLTextAreaElement;
const tierButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('CreativeDesign', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('offers the three tiers with their credit cost', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    expect(tierButton('Simples')).toHaveTextContent('1 crédito');
    expect(tierButton('Profissional')).toHaveTextContent('5 créditos');
    expect(tierButton('Premium')).toHaveTextContent('10 créditos');
  });

  it('starts on the simple tier and shows its cost', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    expect(tierButton('Simples')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/💳 1 crédito · 1 variação/)).toBeInTheDocument();
  });

  it('updates the cost when a higher tier is chosen', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(tierButton('Premium'));
    expect(tierButton('Premium')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/💳 10 créditos · 4 variações/)).toBeInTheDocument();
  });

  it('keeps generate disabled until the prompt has enough characters', () => {
    render(<CreativeDesign creditsAvailable={100} />);
    expect(generateBtn()).toBeDisabled();
    fireEvent.change(promptInput(), { target: { value: 'ab' } });
    expect(generateBtn()).toBeDisabled();
    fireEvent.change(promptInput(), { target: { value: 'abc' } });
    expect(generateBtn()).toBeEnabled();
  });

  it('blocks premium when the user has fewer than 10 credits', () => {
    render(<CreativeDesign creditsAvailable={9} />);
    fireEvent.click(tierButton('Premium'));
    fireEvent.change(promptInput(), { target: { value: 'Cartaz de lançamento' } });
    expect(screen.getByText(/Créditos insuficientes: este nível custa 10, você tem 9/)).toBeInTheDocument();
    expect(generateBtn()).toBeDisabled();
  });

  it('sends prompt, tier and format to the server and shows the results', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        images: [
          { url: 'https://cdn.example/a.png', asset_id: 'a1' },
          { url: 'https://cdn.example/b.png', asset_id: 'b1' },
        ],
        failed_variants: 0,
      },
      error: null,
    });
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(tierButton('Profissional'));
    fireEvent.click(screen.getByRole('button', { name: 'Story 9:16' }));
    fireEvent.change(promptInput(), { target: { value: '  Festival de jazz  ' } });
    fireEvent.click(generateBtn());

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    expect(invoke).toHaveBeenCalledTimes(1);
    const [fn, options] = invoke.mock.calls[0];
    expect(fn).toBe('creative-design');
    expect(options.body).toEqual({ prompt: 'Festival de jazz', format: 'story', tier: 'professional' });
    expect(options.headers['X-Idempotency-Key']).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Variação 1 do design' })).toBeInTheDocument();
  });

  it('shows a short message when the server reports insufficient credits', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 402 } },
    });
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.change(promptInput(), { target: { value: 'Banner do evento' } });
    fireEvent.click(generateBtn());
    expect(await screen.findByRole('alert')).toHaveTextContent('Créditos insuficientes para este nível.');
  });

  it('explains that credits are refunded when generation fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.change(promptInput(), { target: { value: 'Banner do evento' } });
    fireEvent.click(generateBtn());
    expect(await screen.findByRole('alert')).toHaveTextContent('devolvido automaticamente');
  });

  it('says how many variations were delivered when some fail', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, images: [{ url: 'https://cdn.example/a.png', asset_id: null }], failed_variants: 1 },
      error: null,
    });
    render(<CreativeDesign creditsAvailable={100} />);
    fireEvent.click(tierButton('Profissional'));
    fireEvent.change(promptInput(), { target: { value: 'Capa de livro' } });
    fireEvent.click(generateBtn());
    expect(await screen.findByText(/1 de 2 variações ficaram prontas/)).toBeInTheDocument();
  });
});
