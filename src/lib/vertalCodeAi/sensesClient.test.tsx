import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { downsample, encodeWav, pickFrameTimes, sensesErrorText, stopStream } from './senses';

vi.mock('./client', async (orig) => {
  const real = await orig<typeof import('./client')>();
  return { ...real, postAction: vi.fn(async () => ({ features: { decide: true, vision: true, hear: true, novela: true } })) };
});

import { VertalSensesPanel } from '@/components/vertal-code-ai/VertalSensesPanel';

afterEach(() => cleanup());

describe('Sentidos no navegador · utilitários', () => {
  it('quadros espaçados, sem pegar o início/fim', () => {
    expect(pickFrameTimes(13, 12)).toHaveLength(12);
    expect(pickFrameTimes(13, 12)[0]).toBe(1);
    expect(pickFrameTimes(0.5, 12)).toHaveLength(2);
    expect(pickFrameTimes(NaN)).toEqual([]);
  });

  it('reamostra 48 kHz → 16 kHz e gera WAV válido', () => {
    const pcm = new Float32Array(48_000).fill(0.5);
    const d = downsample(pcm, 48_000, 16_000);
    expect(d.length).toBe(16_000);
    const wav = new DataView(encodeWav(d, 16_000));
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe('RIFF');
    expect(wav.getUint32(24, true)).toBe(16_000);
    expect(wav.byteLength).toBe(44 + 16_000 * 2);
  });

  it('desliga todas as trilhas (e tolera null)', () => {
    const t1 = { stop: vi.fn() };
    const t2 = { stop: vi.fn() };
    stopStream({ getTracks: () => [t1, t2] } as unknown as MediaStream);
    expect(t1.stop).toHaveBeenCalled();
    expect(t2.stop).toHaveBeenCalled();
    expect(() => stopStream(null)).not.toThrow();
  });

  it('mensagens de erro em português', () => {
    expect(sensesErrorText('vertal_senses_disabled')).toMatch(/liberado/);
  });
});

describe('VertalSensesPanel · privacidade da câmera/microfone', () => {
  it('não abre câmera nem microfone sem toque; abre no toque e desliga ao fechar', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const onClose = vi.fn();
    const { unmount } = render(<VertalSensesPanel token={async () => 't'} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Vertal Visão')).toBeTruthy());
    expect(screen.getByText('Vertal Ouvir')).toBeTruthy();
    expect(screen.getByText('Vertal Novela')).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText('Use camera'));
    });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' }, audio: false });
    expect(screen.getByText('Camera on')).toBeTruthy();
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('nenhum nome de fornecedor/modelo na tela', async () => {
    const { container } = render(<VertalSensesPanel token={async () => 't'} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Vertal Visão')).toBeTruthy());
    expect(container.textContent ?? '').not.toMatch(/qwen|omni|intern|kokoro|jev|typesafe|openrouter|gemini|flux|modal/i);
  });
});
