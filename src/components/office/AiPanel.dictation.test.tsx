import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AiPanel } from './AiPanel';

vi.mock('@/services/officeAiService', () => ({ OFFICE_AI_CREDIT_COST: 1, runOfficeAi: vi.fn() }));

type Ev = { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> };

/** Navegador simulado: cada start() cria uma sessão nova; o teste dispara os eventos como o Chrome faria. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static get last() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1] ?? null;
  }
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: Ev) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
});
afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.useRealTimers();
});

const mic = () => screen.getByRole('button', { name: /microfone|ditar/i });
const field = () => screen.getByLabelText('Pedido para a IA') as HTMLTextAreaElement;
const renderPanel = (props: Partial<Parameters<typeof AiPanel>[0]> = {}) =>
  render(<AiPanel placeholder="p" creditsAvailable={3} busy={false} onRun={() => {}} actionLabel="x" {...props} />);

describe('ditado no campo do pedido: texto ao vivo', () => {
  it('mostra o que está sendo falado no campo enquanto fala, e confirma no fim de cada trecho', () => {
    renderPanel();
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    act(() => rec.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'bom' } }] }));
    expect(field().value).toBe('bom');
    act(() => rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'bom dia' } }] }));
    expect(field().value).toBe('bom dia');
    act(() => rec.onresult?.({
      resultIndex: 1,
      results: [{ isFinal: true, 0: { transcript: 'bom dia' } }, { isFinal: false, 0: { transcript: 'tudo' } }],
    }));
    expect(field().value).toBe('bom dia tudo');
  });
});

describe('ditado no documento', () => {
  it('encaminha texto ao vivo e o trecho final separadamente', () => {
    const onDictate = vi.fn();
    const onInterim = vi.fn();
    renderPanel({ onDictate, onInterim });
    fireEvent.doubleClick(mic());
    const rec = FakeRecognition.last!;
    act(() => rec.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'olá' } }] }));
    expect(onInterim).toHaveBeenLastCalledWith('olá');
    expect(onDictate).not.toHaveBeenCalled();
    act(() => rec.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'olá mundo' } }] }));
    expect(onDictate).toHaveBeenCalledWith('olá mundo');
  });
});

describe('desligar e loop', () => {
  it('o segundo duplo clique desliga na hora e nenhuma sessão nova começa', () => {
    vi.useFakeTimers();
    renderPanel();
    fireEvent.doubleClick(mic());
    expect(FakeRecognition.instances.length).toBe(1);
    fireEvent.doubleClick(mic());
    act(() => vi.advanceTimersByTime(2000));
    expect(FakeRecognition.instances.length).toBe(1);
    expect(mic().getAttribute('aria-label')).toBe('Ligar microfone (clique duas vezes)');
  });

  it('sessões que terminam sem fala param de reiniciar depois de poucas tentativas', () => {
    vi.useFakeTimers();
    renderPanel();
    fireEvent.doubleClick(mic());
    for (let i = 0; i < 10; i += 1) {
      const current = FakeRecognition.last!;
      act(() => current.onend?.());
      act(() => vi.advanceTimersByTime(400));
    }
    expect(FakeRecognition.instances.length).toBeLessThanOrEqual(5);
    expect(screen.getByText(/parou de ouvir/)).toBeTruthy();
    expect(mic().getAttribute('aria-label')).toBe('Ligar microfone (clique duas vezes)');
  });
});
