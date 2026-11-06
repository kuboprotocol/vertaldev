import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { AiPanel } from './AiPanel';

vi.mock('@/services/officeAiService', () => ({ OFFICE_AI_CREDIT_COST: 1, runOfficeAi: vi.fn() }));

type Ev = { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> };

/** Navegador de teste: guarda a instância para o teste disparar eventos como o Chrome faria. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: Ev) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  started = 0;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
}

beforeEach(() => {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
});
afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

const mic = () => screen.getByRole('button', { name: /microfone|ditar/i });

describe('ditado por voz (navegador simulado)', () => {
  it('entrega o texto final ao onDictate depois do duplo clique', () => {
    const onDictate = vi.fn();
    render(<AiPanel placeholder="p" creditsAvailable={3} busy={false} onRun={() => {}} actionLabel="x" onDictate={onDictate} />);
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    expect(rec.started).toBe(1);
    act(() => {
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'olá' } }] });
    });
    expect(onDictate).not.toHaveBeenCalled();
    act(() => {
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'olá mundo' } }] });
    });
    expect(onDictate).toHaveBeenCalledWith('olá mundo');
  });

  it('sem onDictate, o texto final vai para o campo do pedido', () => {
    render(<AiPanel placeholder="p" creditsAvailable={3} busy={false} onRun={() => {}} actionLabel="x" />);
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    act(() => {
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'proposta curta' } }] });
    });
    expect((screen.getByLabelText('Pedido para a IA') as HTMLTextAreaElement).value).toBe('proposta curta');
  });

  it('segundo trecho final, com resultIndex avançado, não repete o primeiro', () => {
    const onDictate = vi.fn();
    render(<AiPanel placeholder="p" creditsAvailable={3} busy={false} onRun={() => {}} actionLabel="x" onDictate={onDictate} />);
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    act(() => {
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'primeiro' } }] });
    });
    act(() => {
      rec.onresult?.({
        resultIndex: 1,
        results: [{ isFinal: true, 0: { transcript: 'primeiro' } }, { isFinal: true, 0: { transcript: 'segundo' } }],
      });
    });
    expect(onDictate.mock.calls.map((c) => c[0])).toEqual(['primeiro', 'segundo']);
  });
});

describe('ditado: feedback visível', () => {
  it('mostra o último trecho ouvido e para onde foi', () => {
    render(<AiPanel placeholder="p" creditsAvailable={3} busy={false} onRun={() => {}} actionLabel="x" onDictate={() => {}} />);
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    act(() => {
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'bom dia' } }] });
    });
    expect(screen.getByText(/Ouvi: “bom dia”/).textContent).toContain('foi para o documento');
  });
});
