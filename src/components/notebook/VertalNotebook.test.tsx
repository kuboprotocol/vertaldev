import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { NotebookAiRequest } from '../../../supabase/functions/_shared/notebookAi';

const runNotebookAi = vi.fn();
vi.mock('@/services/notebookAiService', () => ({
  NOTEBOOK_AI_COSTS: { chat: 1, transform: 1, guide: 1, study: 2, podcast: 3 },
  runNotebookAi: (req: NotebookAiRequest) => runNotebookAi(req),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VertalNotebook } from './VertalNotebook';

async function createNotebookWithSource() {
  render(<VertalNotebook />);
  fireEvent.click(await screen.findByRole('button', { name: /Novo caderno/ }));
  fireEvent.change(screen.getByLabelText('Nome do caderno'), { target: { value: 'Vibe Bank' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar caderno' }));
  expect(await screen.findByRole('heading', { name: /Vibe Bank/ })).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: /Adicionar/ })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('tab', { name: /Texto/ }));
  fireEvent.change(within(dialog).getByLabelText('Título do texto'), { target: { value: 'Whitepaper' } });
  fireEvent.change(within(dialog).getByLabelText('Texto da fonte'), {
    target: { value: 'O Vibe Bank é a camada financeira do ecossistema KUBO, com tokens de recompensa.' },
  });
  // Sem insights automáticos neste teste.
  fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar texto/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getAllByText('Whitepaper').length).toBeGreaterThan(0);
}

describe('Vertal Notebook', () => {
  beforeEach(() => {
    localStorage.clear();
    runNotebookAi.mockReset();
  });

  it('cria caderno, adiciona fonte, conversa com citação e abre a fonte citada', async () => {
    runNotebookAi.mockImplementation(async (req: NotebookAiRequest) => {
      expect(req.action).toBe('chat');
      const id = req.context[0].id;
      return { answer: `É a camada financeira [${id}].`, citations: [id] };
    });
    await createNotebookWithSource();

    fireEvent.change(screen.getByLabelText('Pergunta para a IA'), { target: { value: 'O que é o Vibe Bank?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    const cite = await screen.findByRole('button', { name: /Citação 1: Whitepaper/ });
    expect(screen.getByText(/É a camada financeira/)).toBeInTheDocument();
    const req = runNotebookAi.mock.calls[0][0] as NotebookAiRequest;
    expect(req.notebook?.name).toBe('Vibe Bank');
    expect(req.messages?.at(-1)).toEqual({ role: 'user', content: 'O que é o Vibe Bank?' });

    fireEvent.click(cite);
    const viewer = await screen.findByRole('dialog');
    expect(within(viewer).getByText('Whitepaper')).toBeInTheDocument();
  });

  it('gera flashcards no Estúdio e mostra o cartão', async () => {
    runNotebookAi.mockResolvedValue({ kind: 'flashcards', cards: [{ front: 'O que é o Vibe Bank?', back: 'A camada financeira' }] });
    await createNotebookWithSource();

    fireEvent.click(screen.getByRole('button', { name: /Flashcards/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('O que é o Vibe Bank?')).toBeInTheDocument();
    expect(runNotebookAi.mock.calls[0][0]).toMatchObject({ action: 'study', study: 'flashcards' });
  });

  it('sem fontes no contexto, não chama a IA', async () => {
    render(<VertalNotebook />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo caderno/ }));
    fireEvent.change(screen.getByLabelText('Nome do caderno'), { target: { value: 'Vazio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar caderno' }));
    fireEvent.change(await screen.findByLabelText('Pergunta para a IA'), { target: { value: 'Oi?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(runNotebookAi).not.toHaveBeenCalled();
  });
});
