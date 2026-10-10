// Slides generator flow inside CreativePanel. These checks used to live in e2e/slides-generator.spec.ts,
// which pointed at a hardcoded localhost:8084 and a route (/creative/panel) that does not render this panel.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CreativePanel from '../CreativePanel';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@vertal.dev' } }) }));
vi.mock('../ChatWidget', () => ({ default: () => null }));

function openSlides() {
  const utils = render(<CreativePanel />);
  fireEvent.click(screen.getByText('Gerador de Slides'));
  return utils;
}
const topicInput = () => screen.getByPlaceholderText(/Ex: Inteligência/) as HTMLInputElement;
const numInput = (c: HTMLElement) => c.querySelector('input[type="number"]') as HTMLInputElement;
const generateBtn = () => screen.getByRole('button', { name: /Gerar Apresentação/ });

describe('Creative Panel: slides generator', () => {
  it('shows the Creative Panel with the Slides option', () => {
    render(<CreativePanel />);
    expect(screen.getByText('Painel Criativo')).toBeInTheDocument();
    expect(screen.getByText('Gerador de Slides')).toBeInTheDocument();
  });

  it('navigates to the slides generator when clicked', () => {
    openSlides();
    expect(screen.getByText('Gerador de Apresentações IA')).toBeInTheDocument();
  });

  it('shows the form fields', () => {
    const { container } = openSlides();
    expect(topicInput()).toBeInTheDocument();
    expect(numInput(container)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Professional' })).toBeInTheDocument();
    expect(container.querySelectorAll('.theme-btn')).toHaveLength(5);
  });

  it('shows the cost for the chosen number of slides', () => {
    const { container } = openSlides();
    fireEvent.change(topicInput(), { target: { value: 'Inteligência Artificial' } });
    fireEvent.change(numInput(container), { target: { value: '5' } });
    expect(screen.getByText(/5 créditos/)).toBeInTheDocument();
  });

  it('enables generation once a topic is filled in', () => {
    const { container } = openSlides();
    fireEvent.change(topicInput(), { target: { value: 'Web3 e Blockchain' } });
    fireEvent.change(numInput(container), { target: { value: '3' } });
    expect(generateBtn()).toBeEnabled();
  });

  it('shows the generate button', () => {
    openSlides();
    expect(generateBtn()).toBeInTheDocument();
  });

  it('shows the form while there are no recent presentations', () => {
    openSlides();
    expect(topicInput()).toBeInTheDocument();
  });

  it('keeps generation disabled until required fields are filled', () => {
    openSlides();
    expect(generateBtn()).toBeDisabled();
  });

  it('switches between themes', () => {
    const { container } = openSlides();
    const second = container.querySelectorAll('.theme-btn')[1];
    fireEvent.click(second);
    expect(second).toHaveClass('active');
    expect(container.querySelectorAll('.theme-btn.active')).toHaveLength(1);
  });

  it('accepts slide counts within the allowed range', () => {
    const { container } = openSlides();
    const input = numInput(container);
    expect(input).toHaveAttribute('min', '3');
    expect(input).toHaveAttribute('max', '20');
    fireEvent.change(input, { target: { value: '3' } });
    expect(input.value).toBe('3');
    fireEvent.change(input, { target: { value: '20' } });
    expect(input.value).toBe('20');
  });

  it('goes back to the Creative Panel', () => {
    openSlides();
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(screen.getByText('Painel Criativo')).toBeInTheDocument();
    expect(screen.queryByText('Gerador de Apresentações IA')).not.toBeInTheDocument();
  });
});
