// Auto Cadê: o editor monta, desenha, pede planta à IA e recebe planta do Vertal Chat.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('@/lib/voice/useDictation', () => ({
  useDictation: () => ({ supported: false, listening: false, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
}));

import { CadStudio } from '../CadStudio';
import { sendCadToStudio, getCadDraft, resetCadBridgeForTests } from '@/lib/cad/cadBridge';
import { emptyCadDocument } from '@/lib/cad/model';

beforeAll(() => {
  // jsdom não tem ResizeObserver; a folha só precisa do tamanho inicial.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
});

beforeEach(() => {
  invoke.mockReset();
  resetCadBridgeForTests();
  window.localStorage.clear();
});


function openAiTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'IA' }));
}

describe('CadStudio (Auto Cadê)', () => {
  it('abre com a barra de ferramentas, o nome do projeto e as exportações', () => {
    render(<CadStudio creditsAvailable={5} />);
    expect(screen.getByLabelText('Nome do projeto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parede/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /DXF \(AutoCAD\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SVG/ })).toBeInTheDocument();
  });

  it('troca de ferramenta ao clicar e por atalho de teclado', () => {
    render(<CadStudio creditsAvailable={5} />);
    fireEvent.click(screen.getByRole('button', { name: /Porta/ }));
    expect(screen.getByRole('button', { name: /Porta/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByRole('button', { name: /Texto/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gera uma planta com a IA, mostra o resultado e publica o desenho para o chat', async () => {
    invoke.mockResolvedValue({ data: { ok: true, document: validDoc(), credits_spent: 1 }, error: null });
    render(<CadStudio creditsAvailable={5} />);
    openAiTab();
    fireEvent.change(screen.getByLabelText('Pedido para a IA'), { target: { value: 'casa de 2 cômodos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar planta nova' }));

    await waitFor(() => expect(screen.getByText(/Planta pronta/)).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('cad-generate', expect.objectContaining({
      body: expect.objectContaining({ prompt: 'casa de 2 cômodos', mode: 'new' }),
    }));
    expect(getCadDraft()?.walls).toHaveLength(2);
  });

  it('mostra a mensagem de créditos insuficientes e não desenha nada', async () => {
    invoke.mockResolvedValue({ data: { error: 'insufficient_credits' }, error: null });
    render(<CadStudio creditsAvailable={5} />);
    openAiTab();
    fireEvent.change(screen.getByLabelText('Pedido para a IA'), { target: { value: 'casa de 2 cômodos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar planta nova' }));
    await waitFor(() => expect(screen.getByText('Créditos insuficientes para gerar este desenho.')).toBeInTheDocument());
    expect(getCadDraft()?.walls ?? []).toHaveLength(0);
  });

  it('recebe a planta que o Vertal Chat manda e a mostra na folha', async () => {
    render(<CadStudio creditsAvailable={5} />);
    act(() => {
      sendCadToStudio(validDoc());
    });
    await waitFor(() => expect(getCadDraft()?.walls).toHaveLength(2));
    // A aba Item mostra as contagens do desenho.
    expect(screen.getByText('Ambientes').closest('div')).toHaveTextContent('1');
  });

  it('pega a planta pendente quando o editor abre depois do chat', () => {
    sendCadToStudio(validDoc());
    render(<CadStudio creditsAvailable={5} />);
    expect(getCadDraft()?.walls).toHaveLength(2);
  });

  it('não gera ajuste quando a folha está vazia', () => {
    render(<CadStudio creditsAvailable={5} />);
    openAiTab();
    fireEvent.change(screen.getByLabelText('Pedido para a IA'), { target: { value: 'tirar a parede do meio' } });
    expect(screen.getByRole('button', { name: 'Ajustar o desenho atual' })).toBeDisabled();
  });

  it('desativa a geração quando o saldo não cobre o custo', () => {
    render(<CadStudio creditsAvailable={0} />);
    openAiTab();
    fireEvent.change(screen.getByLabelText('Pedido para a IA'), { target: { value: 'casa de 2 quartos' } });
    expect(screen.getByRole('button', { name: 'Gerar planta nova' })).toBeDisabled();
    expect(screen.getByText(/créditos insuficientes/)).toBeInTheDocument();
  });
});

function validDoc() {
  // Monta com o mesmo validador da edge function, para o teste falar a mesma língua do servidor.
  const base = emptyCadDocument({
    titleBlock: { project: 'Casa teste', drawing: 'Planta baixa', architect: 'Arq. Teste', registration: '', date: '2026-01-01', sheet: '01/01' },
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness: 0.15 },
      { id: 'w2', a: { x: 5, y: 0 }, b: { x: 5, y: 4 }, thickness: 0.15 },
    ],
    rooms: [{ id: 'r1', name: 'Sala', points: [{ x: 0.1, y: 0.1 }, { x: 4.9, y: 0.1 }, { x: 4.9, y: 3.9 }, { x: 0.1, y: 3.9 }] }],
  });
  return base;
}

