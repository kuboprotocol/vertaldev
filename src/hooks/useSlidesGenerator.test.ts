/**
 * Slides Generator Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlidesGenerator } from './useSlidesGenerator';
import { slideGeneratorService, type Presentation, type Slide } from '@/services/slideGeneratorService';

vi.mock('@/services/slideGeneratorService', () => ({
  slideGeneratorService: {
    generatePresentation: vi.fn(),
    calculateCost: vi.fn((n: number) => Math.max(1, n)),
    exportAsHTML: vi.fn(() => '<html>Test</html>'),
    exportPresentation: vi.fn(() => '{}'),
  },
}));

const service = vi.mocked(slideGeneratorService);

const slide = (id: string, overrides: Partial<Slide> = {}): Slide => ({
  id,
  type: 'content',
  title: id,
  content: 'Content',
  order: 0,
  ...overrides,
});

const presentation = (slides: Slide[], overrides: Partial<Presentation> = {}): Presentation => ({
  id: 'pres-1',
  title: 'Test Presentation',
  description: 'Test',
  slides: slides.map((s, i) => ({ ...s, order: i })),
  theme: 'modern',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  creditsUsed: 1,
  ...overrides,
});

/** Puts `pres` into hook state through the public API (a mocked generation). */
async function renderWith(pres: Presentation, credits = 100) {
  service.generatePresentation.mockResolvedValueOnce(pres);
  const hook = renderHook(() => useSlidesGenerator(credits));
  await act(async () => {
    await hook.result.current.generatePresentation({ topic: 'Test', numSlides: Math.max(1, pres.slides.length) });
  });
  return hook;
}

describe('useSlidesGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSlidesGenerator(100));

    expect(result.current.presentations).toEqual([]);
    expect(result.current.currentPresentation).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should generate presentation with valid request', async () => {
    const { result } = await renderWith(presentation([slide('slide-1', { type: 'title', title: 'Welcome' })]));

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.currentPresentation?.id).toBe('pres-1');
    expect(result.current.presentations).toHaveLength(1);
    expect(result.current.slidesCost).toBe(1);
  });

  it('should throw error when insufficient credits', async () => {
    const { result } = renderHook(() => useSlidesGenerator(0));

    await act(async () => {
      await expect(result.current.generatePresentation({ topic: 'Test', numSlides: 5 })).rejects.toThrow(/Insufficient credits/);
    });

    expect(result.current.error).toMatch(/Insufficient credits/);
    expect(service.generatePresentation).not.toHaveBeenCalled();
  });

  it('should update slide content', async () => {
    const { result } = await renderWith(presentation([slide('slide-1', { title: 'Original Title', content: 'Original content' })]));

    act(() => {
      result.current.updateSlide('slide-1', { title: 'Updated Title', content: 'Updated content' });
    });

    expect(result.current.currentPresentation?.slides[0].title).toBe('Updated Title');
    expect(result.current.currentPresentation?.slides[0].content).toBe('Updated content');
  });

  it('should add new slide', async () => {
    const { result } = await renderWith(presentation([slide('slide-1', { type: 'title' })]));

    act(() => {
      result.current.addSlide('content');
    });

    expect(result.current.currentPresentation?.slides).toHaveLength(2);
    expect(result.current.currentPresentation?.slides[1].type).toBe('content');
  });

  it('should delete slide', async () => {
    const { result } = await renderWith(presentation([slide('slide-1'), slide('slide-2')]));

    act(() => {
      result.current.deleteSlide('slide-1');
    });

    expect(result.current.currentPresentation?.slides).toHaveLength(1);
    expect(result.current.currentPresentation?.slides[0]).toMatchObject({ id: 'slide-2', order: 0 });
  });

  it('should reorder slides', async () => {
    const { result } = await renderWith(presentation([slide('slide-1'), slide('slide-2'), slide('slide-3')]));

    act(() => {
      result.current.reorderSlides(0, 2);
    });

    const slides = result.current.currentPresentation?.slides ?? [];
    expect(slides.map((s) => s.id)).toEqual(['slide-2', 'slide-3', 'slide-1']);
    expect(slides.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('should update theme', async () => {
    const { result } = await renderWith(presentation([]));

    act(() => {
      result.current.updateTheme('dark');
    });

    expect(result.current.currentPresentation?.theme).toBe('dark');
  });

  it('should export presentation as HTML', async () => {
    const { result } = await renderWith(presentation([slide('slide-1', { type: 'title' })]));

    const html = result.current.exportPresentation('html');

    expect(html).toBe('<html>Test</html>');
    expect(service.exportAsHTML).toHaveBeenCalledWith(result.current.currentPresentation, 'modern');
  });

  it('should refuse to export without a presentation', () => {
    const { result } = renderHook(() => useSlidesGenerator(100));
    expect(() => result.current.exportPresentation('html')).toThrow('No presentation to export');
  });

  it('should calculate slides cost', () => {
    const { result } = renderHook(() => useSlidesGenerator(100));

    expect(result.current.getSlidesCost(5)).toBe(5);
  });

  it('should clear error', async () => {
    const { result } = renderHook(() => useSlidesGenerator(0));
    await act(async () => {
      await result.current.generatePresentation({ topic: 'Test', numSlides: 5 }).catch(() => {});
    });
    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should delete presentation', async () => {
    const { result } = await renderWith(presentation([]));

    act(() => {
      result.current.deletePresentation('pres-1');
    });

    expect(result.current.presentations).toHaveLength(0);
    expect(result.current.currentPresentation).toBeNull();
  });
});
