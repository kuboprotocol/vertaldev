import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const navigatorAudioUrl = vi.fn();
const pauseNavigatorMedia = vi.fn();
vi.mock('@/lib/navigator/client', () => ({
  callNavigator: vi.fn(async () => ({ ok: false, status: 'error', message: 'off' })),
  navigatorAudioUrl: (...args: unknown[]) => navigatorAudioUrl(...args),
  pauseNavigatorMedia: (...args: unknown[]) => pauseNavigatorMedia(...args),
  navigatorUserId: async () => 'user-1',
}));

import { NavigatorSoundControl } from './NavigatorSound';

const SID = '11111111-2222-4333-8444-555555555555';
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('NavigatorSoundControl (Som da nuvem / Tocar no meu aparelho / Sem som)', () => {
  beforeEach(() => {
    localStorage.clear();
    navigatorAudioUrl.mockReset().mockResolvedValue({ ok: true, url: 'https://vertal.dev/api/navigator/audio?ticket=t', expiresAt: Date.now() + 9 * 60_000 });
    pauseNavigatorMedia.mockReset().mockResolvedValue({ ok: true, paused: 1, currentTime: 42 });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  });
  afterEach(() => cleanup());

  it('começa em "Sem som" e não abre stream nem player', async () => {
    render(<NavigatorSoundControl nav={{ sessionId: SID, url: YT }} />);
    await act(async () => {});
    expect(screen.getByRole('radio', { name: /Sem som/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: /Ouvir som da nuvem/ })).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('"Som da nuvem" mostra o botão do stream e lembra a escolha por usuário', async () => {
    render(<NavigatorSoundControl nav={{ sessionId: SID, url: YT }} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('radio', { name: /Som da nuvem/ }));
    await act(async () => {});
    expect(screen.getByRole('button', { name: /Ouvir som da nuvem/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('vertal.navigator.sound.user-1') ?? '{}').mode).toBe('cloud');
  });

  it('"Tocar no meu aparelho" no YouTube: pausa a nuvem e abre o player oficial do mesmo ponto', async () => {
    render(<NavigatorSoundControl nav={{ sessionId: SID, url: YT }} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('radio', { name: /Tocar no meu aparelho/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tocar aqui \(YouTube\)/ }));
    await act(async () => {});
    expect(pauseNavigatorMedia).toHaveBeenCalledWith(SID);
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=42/);
    expect(frame.getAttribute('allow')).toContain('autoplay');
    expect(screen.getByRole('link', { name: /Abrir no app do YouTube/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('página sem player oficial: explica e não chama a nuvem', async () => {
    localStorage.setItem('vertal.navigator.sound.user-1', JSON.stringify({ mode: 'device', volume: 1 }));
    render(<NavigatorSoundControl nav={{ sessionId: SID, url: 'https://www.netflix.com/watch/1' }} />);
    await act(async () => {});
    expect(screen.getByText(/não tem um player oficial/)).toBeInTheDocument();
    expect(pauseNavigatorMedia).not.toHaveBeenCalled();
  });

  it('se a nuvem não pausar (template antigo), ainda toca no aparelho e avisa', async () => {
    pauseNavigatorMedia.mockResolvedValue({ ok: false, message: 'Não consegui pausar a aba na nuvem' });
    render(<NavigatorSoundControl nav={{ sessionId: SID, url: YT }} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('radio', { name: /Tocar no meu aparelho/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tocar aqui/ }));
    await act(async () => {});
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Não consegui pausar/);
  });
});
