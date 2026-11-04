// Criar imagem, editar imagem e criar slides saíram do painel criativo e vivem só no Design Premium.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } },
}));
vi.mock('tldraw', () => ({ getSnapshot: vi.fn(() => ({})) }));
vi.mock('@/components/canvas/TLDrawEditor', () => ({ default: () => null }));
// As ferramentas em si têm testes próprios; aqui só importa onde elas aparecem.
vi.mock('../creative/CreativeToolInterface', () => ({
  CreativeToolInterface: ({ toolKey }: { toolKey: string }) => <p>ferramenta:{toolKey}</p>,
}));
vi.mock('../CreativeSlides', () => ({ CreativeSlides: () => <p>gerador de slides</p> }));

import { CreativeDesign } from '../CreativeDesign';
import { ManusLauncher } from '../creative/ManusLauncher';

const renderDesign = (open?: Parameters<typeof CreativeDesign>[0]['open']) =>
  render(
    <MemoryRouter>
      <CreativeDesign creditsAvailable={100} open={open} />
    </MemoryRouter>,
  );

describe('ferramentas que foram para o Design Premium', () => {
  it('o painel criativo não oferece mais criar imagem, editar imagem nem criar slides', () => {
    render(<MemoryRouter><ManusLauncher setActive={() => {}} /></MemoryRouter>);
    expect(screen.queryByText('Criar imagem')).toBeNull();
    expect(screen.queryByText('Editar imagem')).toBeNull();
    expect(screen.queryByText('Criar slides')).toBeNull();
    expect(screen.getByText('Design Premium')).toBeTruthy();
  });

  it('Design Premium tem Slides como modo próprio', () => {
    renderDesign();
    fireEvent.click(screen.getByRole('button', { name: 'Slides' }));
    expect(screen.getByText('gerador de slides')).toBeTruthy();
  });

  it('Estúdio Pro oferece Editar com IA e Editor de imagens', async () => {
    renderDesign();
    fireEvent.click(screen.getByRole('button', { name: 'Estúdio Pro' }));
    // Aparece como chip de página e como cartão da página inicial do Estúdio Pro.
    fireEvent.click(screen.getAllByRole('button', { name: /Editar com IA/ })[0]);
    expect(await screen.findByText('ferramenta:nano_banana')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Editor de imagens/ })[0]);
    expect(await screen.findByText('ferramenta:image_editor')).toBeTruthy();
  });

  it('atalho de fora abre direto o Editor de imagens do Estúdio Pro', async () => {
    renderDesign({ mode: 'studio', studioPage: 'image_editor' });
    expect(await screen.findByText('ferramenta:image_editor')).toBeTruthy();
  });

  it('atalho de fora abre direto os Slides', () => {
    renderDesign({ mode: 'slides' });
    expect(screen.getByText('gerador de slides')).toBeTruthy();
  });
});
