import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignPremiumShell } from './DesignPremiumShell';

const WORLD_LABELS = ['Início', 'Criar', 'Mídia', 'Conteúdo', 'Painéis'];

describe('DesignPremiumShell', () => {
  it('mostra os cinco mundos na barra do celular e no trilho do computador', () => {
    render(
      <DesignPremiumShell worldKey="home" onWorldChange={() => {}}>
        <p>conteúdo</p>
      </DesignPremiumShell>,
    );

    const navs = screen.getAllByRole('navigation', { name: 'Mundos do Design Premium' });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const labels = within(nav).getAllByRole('button').map((button) => button.textContent);
      expect(labels).toEqual(WORLD_LABELS);
    }
  });

  it('marca o mundo ativo com aria-current nas duas barras', () => {
    render(
      <DesignPremiumShell worldKey="media" onWorldChange={() => {}}>
        <p>conteúdo</p>
      </DesignPremiumShell>,
    );

    const current = screen.getAllByRole('button', { current: 'page' });
    expect(current).toHaveLength(2);
    for (const button of current) {
      expect(button).toHaveTextContent('Mídia');
    }
  });

  it('avisa o mundo escolhido e mostra o conteúdo passado', async () => {
    const onWorldChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DesignPremiumShell worldKey="home" onWorldChange={onWorldChange}>
        <p>conteúdo do mundo</p>
      </DesignPremiumShell>,
    );

    expect(screen.getByText('conteúdo do mundo')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Painéis' })[0]);
    expect(onWorldChange).toHaveBeenCalledWith('panels');
  });
});
