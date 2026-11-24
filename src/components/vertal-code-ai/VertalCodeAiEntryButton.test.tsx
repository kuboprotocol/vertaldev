import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import { VertalCodeAiEntryButton } from './VertalCodeAiEntryButton';
import { VertalCodeAiGate } from './VertalCodeAiGate';

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
  it('ligado e liberado: mostra a entrada', () => {
    render(
      <MemoryRouter>
        <VertalCodeAiEntryButton from="chat" enabledOverride />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('vertal-code-ai-entry')).toBeInTheDocument();
  });
  it('não liberado pelo servidor: não renderiza nada', () => {
    const { container } = render(
      <MemoryRouter>
        <VertalCodeAiEntryButton from="chat" enabledOverride={false} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('VertalCodeAiGate', () => {
  it('liberado: mostra a tela', () => {
    render(
      <MemoryRouter>
        <VertalCodeAiGate enabledOverride>
          <div data-testid="vca-page" />
        </VertalCodeAiGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('vca-page')).toBeInTheDocument();
  });
  it('não liberado: não mostra a tela', () => {
    render(
      <MemoryRouter>
        <VertalCodeAiGate enabledOverride={false}>
          <div data-testid="vca-page" />
        </VertalCodeAiGate>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('vca-page')).toBeNull();
  });
});
