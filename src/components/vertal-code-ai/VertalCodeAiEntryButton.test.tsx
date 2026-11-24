import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VertalCodeAiEntryButton } from './VertalCodeAiEntryButton';

describe('VertalCodeAiEntryButton', () => {
  it('desligado (padrão): não renderiza NADA — Vertal Chat e Vibe Code ficam idênticos', () => {
    const { container } = render(
      <MemoryRouter>
        <VertalCodeAiEntryButton from="chat" />
        <VertalCodeAiEntryButton from="vibe" />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
  it('ligado: mostra a entrada', () => {
    render(
      <MemoryRouter>
        <VertalCodeAiEntryButton from="chat" enabledOverride />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('vertal-code-ai-entry')).toBeInTheDocument();
  });
});
