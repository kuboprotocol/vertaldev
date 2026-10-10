/**
 * Slides Generator Hook
 * Manages slide generation state, editing, and presentation lifecycle
 */

import { useState, useCallback } from 'react';
import { slideGeneratorService, Slide, Presentation, GenerateSlideRequest } from '@/services/slideGeneratorService';
import { quotaService } from '@/services/quotaService';

export interface SlideGeneratorState {
  presentations: Presentation[];
  currentPresentation: Presentation | null;
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;
  editingSlide: Slide | null;
  slidesCost: number;
}

export function useSlidesGenerator(creditsAvailable: number) {
  const [state, setState] = useState<SlideGeneratorState>({
    presentations: [],
    currentPresentation: null,
    isGenerating: false,
    isLoading: false,
    error: null,
    editingSlide: null,
    slidesCost: 0,
  });

  /**
   * Generate new presentation
   */
  const generatePresentation = useCallback(
    async (request: GenerateSlideRequest) => {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));

      try {
        const cost = slideGeneratorService.calculateCost(request.numSlides || 5);

        // Check if user has enough credits
        if (cost > creditsAvailable) {
          throw new Error(
            `Insufficient credits. Need ${cost}, have ${creditsAvailable}. Purchase more credits to continue.`
          );
        }

        const presentation = await slideGeneratorService.generatePresentation(request);

        setState(prev => ({
          ...prev,
          currentPresentation: presentation,
          presentations: [presentation, ...prev.presentations],
          isGenerating: false,
          slidesCost: cost,
        }));

        return presentation;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to generate slides';
        setState(prev => ({ ...prev, error: errorMsg, isGenerating: false }));
        throw err;
      }
    },
    [creditsAvailable]
  );

  /**
   * Load existing presentation
   */
  const loadPresentation = useCallback((presentationId: string) => {
    const presentation = state.presentations.find(p => p.id === presentationId);
    if (presentation) {
      setState(prev => ({ ...prev, currentPresentation: presentation }));
    }
  }, [state.presentations]);

  /**
   * Update slide content
   */
  const updateSlide = useCallback((slideId: string, updates: Partial<Slide>) => {
    setState(prev => {
      if (!prev.currentPresentation) return prev;

      const updatedSlides = prev.currentPresentation.slides.map(slide =>
        slide.id === slideId ? { ...slide, ...updates } : slide
      );

      return {
        ...prev,
        currentPresentation: {
          ...prev.currentPresentation,
          slides: updatedSlides,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  /**
   * Add new slide
   */
  const addSlide = useCallback(
    (type: Slide['type'] = 'content', afterSlideId?: string) => {
      setState(prev => {
        if (!prev.currentPresentation) return prev;

        const newSlide: Slide = {
          id: `slide_${Date.now()}`,
          type,
          title: 'New Slide',
          content: '',
          order: prev.currentPresentation.slides.length,
        };

        let slides = [...prev.currentPresentation.slides];

        if (afterSlideId) {
          const index = slides.findIndex(s => s.id === afterSlideId);
          if (index !== -1) {
            slides.splice(index + 1, 0, newSlide);
            slides = slides.map((s, i) => ({ ...s, order: i }));
          }
        } else {
          slides.push(newSlide);
        }

        return {
          ...prev,
          currentPresentation: {
            ...prev.currentPresentation,
            slides,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    []
  );

  /**
   * Delete slide
   */
  const deleteSlide = useCallback((slideId: string) => {
    setState(prev => {
      if (!prev.currentPresentation) return prev;

      const slides = prev.currentPresentation.slides
        .filter(s => s.id !== slideId)
        .map((s, i) => ({ ...s, order: i }));

      return {
        ...prev,
        currentPresentation: {
          ...prev.currentPresentation,
          slides,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  /**
   * Reorder slides
   */
  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    setState(prev => {
      if (!prev.currentPresentation) return prev;

      const slides = [...prev.currentPresentation.slides];
      const [removed] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, removed);

      slides.forEach((slide, i) => {
        slide.order = i;
      });

      return {
        ...prev,
        currentPresentation: {
          ...prev.currentPresentation,
          slides,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  /**
   * Set editing slide
   */
  const setEditingSlide = useCallback((slideId: string | null) => {
    setState(prev => {
      const editingSlide = slideId
        ? prev.currentPresentation?.slides.find(s => s.id === slideId) || null
        : null;

      return { ...prev, editingSlide };
    });
  }, []);

  /**
   * Export presentation
   */
  const exportPresentation = useCallback(
    (format: 'json' | 'html' = 'html') => {
      if (!state.currentPresentation) {
        throw new Error('No presentation to export');
      }

      if (format === 'json') {
        return slideGeneratorService.exportPresentation(state.currentPresentation);
      } else {
        return slideGeneratorService.exportAsHTML(state.currentPresentation, state.currentPresentation.theme);
      }
    },
    [state.currentPresentation]
  );

  /**
   * Update presentation theme
   */
  const updateTheme = useCallback((theme: 'modern' | 'minimal' | 'dark' | 'corporate' | 'creative') => {
    setState(prev => {
      if (!prev.currentPresentation) return prev;

      return {
        ...prev,
        currentPresentation: {
          ...prev.currentPresentation,
          theme,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Delete presentation
   */
  const deletePresentation = useCallback((presentationId: string) => {
    setState(prev => ({
      ...prev,
      presentations: prev.presentations.filter(p => p.id !== presentationId),
      currentPresentation:
        prev.currentPresentation?.id === presentationId ? null : prev.currentPresentation,
    }));
  }, []);

  /**
   * Get slide generation cost
   */
  const getSlidesCost = useCallback((numSlides: number) => {
    return slideGeneratorService.calculateCost(numSlides);
  }, []);

  return {
    // State
    presentations: state.presentations,
    currentPresentation: state.currentPresentation,
    isGenerating: state.isGenerating,
    isLoading: state.isLoading,
    error: state.error,
    editingSlide: state.editingSlide,
    slidesCost: state.slidesCost,

    // Actions
    generatePresentation,
    loadPresentation,
    updateSlide,
    addSlide,
    deleteSlide,
    reorderSlides,
    setEditingSlide,
    exportPresentation,
    updateTheme,
    clearError,
    deletePresentation,
    getSlidesCost,
  };
}
