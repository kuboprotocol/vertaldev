// Anúncio patrocinado do Painel Criativo: aparece para todos (admin e planos pagos inclusive).
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SponsoredSlot } from './SponsoredSlot';

describe('SponsoredSlot', () => {
  it('mostra o rótulo Patrocinado e o cartão do anúncio', () => {
    render(<SponsoredSlot />);
    expect(screen.getByText('Patrocinado')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Anúncio patrocinado' })).toBeInTheDocument();
  });

  it('fica fora do fluxo até o anúncio preencher o espaço', async () => {
    render(<SponsoredSlot />);
    const aside = screen.getByRole('complementary', { name: 'Anúncio patrocinado' });
    expect(aside.className).toContain('h-0');
    expect(aside.className).not.toContain('my-6');

    const container = document.getElementById('container-0806a737bf211f386495f9ac7cdc8180')!;
    await act(async () => {
      container.appendChild(document.createElement('div'));
    });
    expect(aside.className).toContain('my-6');
    expect(aside.className).not.toContain('h-0');
  });
});
