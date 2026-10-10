/**
 * Slides Generator Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSlidesGenerator } from './useSlidesGenerator';
import * as slideGeneratorService from '@/services/slideGeneratorService';

vi.mock('@/services/slideGeneratorService');

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
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test Presentation',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'title',
          title: 'Welcome',
          content: 'Test content',
          order: 0,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    vi.spyOn(slideGeneratorService, 'slideGeneratorService').mockReturnValue({
      generatePresentation: vi.fn().mockResolvedValue(mockPresentation),
      calculateCost: vi.fn().mockReturnValue(1),
    } as any);

    const { result } = renderHook(() => useSlidesGenerator(100));

    await act(async () => {
      await result.current.generatePresentation({
        topic: 'Test',
        numSlides: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
    });

    expect(result.current.currentPresentation).toBeTruthy();
    expect(result.current.presentations).toHaveLength(1);
  });

  it('should throw error when insufficient credits', async () => {
    const { result } = renderHook(() => useSlidesGenerator(0));

    await act(async () => {
      try {
        await result.current.generatePresentation({
          topic: 'Test',
          numSlides: 5,
        });
      } catch (e) {
        // Expected
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it('should update slide content', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'content',
          title: 'Original Title',
          content: 'Original content',
          order: 0,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    // Set current presentation
    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    act(() => {
      result.current.updateSlide('slide-1', {
        title: 'Updated Title',
        content: 'Updated content',
      });
    });

    expect(result.current.currentPresentation?.slides[0].title).toBe(
      'Updated Title'
    );
    expect(result.current.currentPresentation?.slides[0].content).toBe(
      'Updated content'
    );
  });

  it('should add new slide', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'title',
          title: 'Title',
          content: 'Content',
          order: 0,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    act(() => {
      result.current.addSlide('content');
    });

    expect(result.current.currentPresentation?.slides).toHaveLength(2);
    expect(result.current.currentPresentation?.slides[1].type).toBe('content');
  });

  it('should delete slide', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'title',
          title: 'Title',
          content: 'Content',
          order: 0,
        },
        {
          id: 'slide-2',
          type: 'content',
          title: 'Slide 2',
          content: 'Content 2',
          order: 1,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    act(() => {
      result.current.deleteSlide('slide-1');
    });

    expect(result.current.currentPresentation?.slides).toHaveLength(1);
    expect(result.current.currentPresentation?.slides[0].id).toBe('slide-2');
  });

  it('should reorder slides', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'title',
          title: 'First',
          content: 'Content',
          order: 0,
        },
        {
          id: 'slide-2',
          type: 'content',
          title: 'Second',
          content: 'Content',
          order: 1,
        },
        {
          id: 'slide-3',
          type: 'content',
          title: 'Third',
          content: 'Content',
          order: 2,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    // Move first slide to position 2
    act(() => {
      result.current.reorderSlides(0, 2);
    });

    const slides = result.current.currentPresentation?.slides || [];
    expect(slides[0].id).toBe('slide-2');
    expect(slides[1].id).toBe('slide-3');
    expect(slides[2].id).toBe('slide-1');
  });

  it('should update theme', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    act(() => {
      result.current.updateTheme('dark');
    });

    expect(result.current.currentPresentation?.theme).toBe('dark');
  });

  it('should export presentation as HTML', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [
        {
          id: 'slide-1',
          type: 'title',
          title: 'Test Slide',
          content: 'Content',
          order: 0,
        },
      ],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    vi.spyOn(slideGeneratorService, 'slideGeneratorService').mockReturnValue({
      exportAsHTML: vi.fn().mockReturnValue('<html>Test</html>'),
    } as any);

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.currentPresentation = mockPresentation;
    });

    const html = result.current.exportPresentation('html');
    expect(html).toBeTruthy();
  });

  it('should calculate slides cost', () => {
    const { result } = renderHook(() => useSlidesGenerator(100));

    const cost = result.current.getSlidesCost(5);
    expect(cost).toBe(5);
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.error = 'Test error';
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should delete presentation', () => {
    const mockPresentation: slideGeneratorService.Presentation = {
      id: 'pres-1',
      title: 'Test',
      description: 'Test',
      slides: [],
      theme: 'modern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      creditsUsed: 1,
    };

    const { result } = renderHook(() => useSlidesGenerator(100));

    act(() => {
      result.current.presentations = [mockPresentation];
      result.current.currentPresentation = mockPresentation;
    });

    act(() => {
      result.current.deletePresentation('pres-1');
    });

    expect(result.current.presentations).toHaveLength(0);
    expect(result.current.currentPresentation).toBeNull();
  });
});
