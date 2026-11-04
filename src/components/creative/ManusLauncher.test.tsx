import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ManusLauncher } from './ManusLauncher';

describe('ManusLauncher · banner Vertal Office', () => {
  it('mostra o banner logo abaixo do Design Premium', () => {
    render(<MemoryRouter><ManusLauncher setActive={() => {}} /></MemoryRouter>);
    const design = screen.getByText('Design Premium');
    const banner = screen.getByRole('button', { name: 'Abrir Vertal Office' });
    // o banner vem depois do item Design Premium na mesma lista
    expect(design.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/totalmente grátis/)).toBeTruthy();
  });

  it('abre direto o painel do Vertal Office ao clicar', () => {
    const setActive = vi.fn();
    render(<MemoryRouter><ManusLauncher setActive={setActive} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Vertal Office' }));
    expect(setActive).toHaveBeenCalledWith('office');
  });
});
