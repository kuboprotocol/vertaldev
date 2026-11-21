import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrapeCardBody } from '../ScrapeResultCard';
import { ScraplingCreditsTable } from '@/components/pricing/ScraplingCreditsTable';
import { scrapeArtifactData, scrapeCsv } from '@/lib/scrape/artifact';

describe('cartão da coleta no chat', () => {
  it('mostra resumo, tabela dos dados, fonte e créditos gastos', () => {
    const data = scrapeArtifactData('scrape_page', {
      credits: 4, unitCredits: 2, mode: 'fetch',
      pages: [
        { url: 'https://loja.com/a', title: 'Produto A', items: { preco: ['R$ 10'] } },
        { url: 'https://loja.com/b', items: {}, blocked: 'robots' },
      ],
    }, 'https://loja.com/a');
    render(<ScrapeCardBody data={data} />);
    expect(screen.getByText('1 de 2 páginas coletada · 1 campo · 1 bloqueada')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Dados extraídos' });
    expect(within(table).getByText('R$ 10')).toBeInTheDocument();
    expect(within(table).getByText('robots.txt não permite')).toBeInTheDocument();
    expect(screen.getByTestId('scrape-credits')).toHaveTextContent('Créditos gastos: 4 (2/página)');
    expect(screen.getByText(/Fonte:/).querySelector('a')).toHaveAttribute('href', 'https://loja.com/a');
    expect(scrapeCsv(data).split('\n')[0]).toBe('url,titulo,preco,bloqueio');
  });

  it('página de preços: tabela completa (serviço base, valor atual, valor Scrapling)', () => {
    render(<ScraplingCreditsTable />);
    const table = screen.getByRole('table', { name: /Créditos da coleta web/ });
    const row = within(table).getByText(/scrape_page — stealth/).closest('tr')!;
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText('6')).toBeInTheDocument();
    expect(within(table).getAllByText('grátis').length).toBeGreaterThan(0);
  });
});
