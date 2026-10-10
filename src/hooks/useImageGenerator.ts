import { useState, useCallback } from 'react';
import { imageGeneratorService, GeneratedImage, ImageGallery } from '@/services/imageGeneratorService';

interface UseImageGeneratorOptions {
  creditsAvailable: number;
}

export function useImageGenerator(creditsAvailable: number) {
  const [galleries, setGalleries] = useState<ImageGallery[]>([]);
  const [currentGallery, setCurrentGallery] = useState<ImageGallery | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateCost = useCallback((imageCount: number) => {
    return imageGeneratorService.calculateCost(imageCount);
  }, []);

  const generateImages = useCallback(
    async (prompt: string, imageCount: number = 1) => {
      setError(null);
      setIsGenerating(true);

      try {
        const cost = calculateCost(imageCount);

        if (cost > creditsAvailable) {
          throw new Error(`Créditos insuficientes. Você tem ${creditsAvailable}, precisa de ${cost}`);
        }

        // Enhance prompt
        const enhancedPrompt = await imageGeneratorService.enhancePrompt(prompt);

        // Generate images
        const images = await imageGeneratorService.generateMultipleImages(enhancedPrompt, imageCount);

        // Create gallery
        const gallery: ImageGallery = {
          id: `gal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: prompt,
          description: enhancedPrompt,
          images,
          theme: 'modern',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          creditsUsed: cost,
        };

        setCurrentGallery(gallery);
        setGalleries([gallery, ...galleries]);

        return gallery;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Erro ao gerar imagens';
        setError(errorMsg);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [creditsAvailable, calculateCost, galleries]
  );

  const updateGallery = useCallback(
    (galleryId: string, updates: Partial<ImageGallery>) => {
      setGalleries((prev) =>
        prev.map((g) => (g.id === galleryId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g))
      );

      if (currentGallery?.id === galleryId) {
        setCurrentGallery((prev) => (prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null));
      }
    },
    [currentGallery?.id]
  );

  const updateTheme = useCallback((theme: ImageGallery['theme']) => {
    if (currentGallery) {
      updateGallery(currentGallery.id, { theme });
    }
  }, [currentGallery, updateGallery]);

  const deleteGallery = useCallback(
    (galleryId: string) => {
      setGalleries((prev) => prev.filter((g) => g.id !== galleryId));
      if (currentGallery?.id === galleryId) {
        setCurrentGallery(null);
      }
    },
    [currentGallery?.id]
  );

  const exportGallery = useCallback(
    (format: 'json' | 'html') => {
      if (!currentGallery) return null;

      if (format === 'json') {
        return imageGeneratorService.exportAsJSON(currentGallery);
      } else {
        return imageGeneratorService.createGalleryHTML(currentGallery);
      }
    },
    [currentGallery]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadGallery = useCallback((galleryId: string) => {
    const gallery = galleries.find((g) => g.id === galleryId);
    if (gallery) {
      setCurrentGallery(gallery);
    }
  }, [galleries]);

  return {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateImages,
    updateGallery,
    updateTheme,
    deleteGallery,
    exportGallery,
    clearError,
    loadGallery,
    getImagesCost: calculateCost,
  };
}
