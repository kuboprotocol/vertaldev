import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const navigatorAudioUrl = vi.fn();
vi.mock('@/lib/navigator/client', () => ({
  callNavigator: vi.fn(async () => ({ ok: false, status: 'error', message: 'off' })),
  navigatorAudioUrl: (...args: unknown[]) => navigatorAudioUrl(...args),
}));

import { NavigatorAudioButton } from './NavigatorParts';

const SID = '11111111-2222-4333-8444-555555555555';
const URL_OK = `https://vertal.dev/api/navigator/audio?ticket=${encodeURIComponent('t.1.s')}`;

describe('NavigatorAudioButton (áudio do navegador no celular)', () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigatorAudioUrl.mockReset();
    play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  });

  afterEach(() => cleanup());

  it('com ticket pronto: o clique define a URL do stream, toca e vira "Parar áudio"', async () => {
    navigatorAudioUrl.mockResolvedValue({ ok: true, url: URL_OK, expiresAt: Date.now() + 9 * 60_000 });
    const { container } = render(<NavigatorAudioButton sessionId={SID} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Ouvir no celular/ }));
    await act(async () => {});
    const el = container.querySelector('audio') as HTMLAudioElement;
    expect(el.getAttribute('src')).toBe(URL_OK);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Parar áudio/ })).toBeInTheDocument();
  });

  it('se o navegador bloquear o play, pede um novo toque em vez de falhar em silêncio', async () => {
    navigatorAudioUrl.mockResolvedValue({ ok: true, url: URL_OK, expiresAt: Date.now() + 9 * 60_000 });
    play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    render(<NavigatorAudioButton sessionId={SID} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Ouvir no celular/ }));
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(/de novo/);
    expect(screen.getByRole('button', { name: /Ouvir no celular/ })).toBeInTheDocument();
  });

  it('sem sessão viva o botão fica desabilitado e nada é pedido', () => {
    render(<NavigatorAudioButton sessionId={null} />);
    expect(screen.getByRole('button', { name: /Ouvir no celular/ })).toBeDisabled();
    expect(navigatorAudioUrl).not.toHaveBeenCalled();
  });
});
