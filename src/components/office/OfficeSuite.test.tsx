import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfficeSuite } from './OfficeSuite';

// O cliente do Supabase não é usado nestes testes (só a IA chama a função).
vi.mock('@/services/officeAiService', () => ({
  OFFICE_AI_CREDIT_COST: 1,
  runOfficeAi: vi.fn(),
}));

describe('Pacote Office', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('deixa claro que o editor é grátis e a IA custa 1 crédito', () => {
    render(<OfficeSuite creditsAvailable={5} />);
    expect(screen.getByText('Pacote Office')).toBeTruthy();
    expect(screen.getByText(/Documentos e planilhas são grátis/)).toBeTruthy();
    expect(screen.getByText(/Custa 1 crédito por uso · você tem 5/)).toBeTruthy();
  });

  it('desabilita a IA sem pedido e sem créditos', () => {
    const { unmount } = render(<OfficeSuite creditsAvailable={0} />);
    expect(screen.getByText(/Sem créditos/)).toBeTruthy();
    const button = screen.getByRole('button', { name: /Escrever com IA/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    unmount();
  });

  it('mantém o editor de documento funcionando sem créditos', () => {
    render(<OfficeSuite creditsAvailable={0} />);
    const area = screen.getByLabelText('Texto do bloco') as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: 'Olá mundo' } });
    expect(area.value).toBe('Olá mundo');
    expect(screen.getByText(/2 palavras/)).toBeTruthy();
  });

  it('calcula fórmulas na planilha ao sair da célula e salva o rascunho', () => {
    render(<OfficeSuite creditsAvailable={3} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Planilha' }));

    fireEvent.focus(screen.getByLabelText('Célula A1'));
    fireEvent.change(screen.getByLabelText('Conteúdo da célula selecionada'), { target: { value: '2' } });
    fireEvent.focus(screen.getByLabelText('Célula A2'));
    fireEvent.change(screen.getByLabelText('Conteúdo da célula selecionada'), { target: { value: '=A1*5' } });
    fireEvent.focus(screen.getByLabelText('Célula A3'));

    expect((screen.getByLabelText('Célula A2') as HTMLInputElement).value).toBe('10');
    const saved = window.localStorage.getItem('kubo-office-sheet-v1');
    expect(saved).toContain('=A1*5');
  });

  it('mostra o erro de divisão por zero em vez de quebrar', () => {
    render(<OfficeSuite creditsAvailable={3} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Planilha' }));
    fireEvent.focus(screen.getByLabelText('Célula B1'));
    fireEvent.change(screen.getByLabelText('Conteúdo da célula selecionada'), { target: { value: '=1/0' } });
    fireEvent.focus(screen.getByLabelText('Célula B2'));
    expect((screen.getByLabelText('Célula B1') as HTMLInputElement).value).toBe('#DIV/0!');
  });
});
