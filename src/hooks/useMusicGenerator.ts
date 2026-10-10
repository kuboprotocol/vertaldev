import { useState, useCallback } from 'react';
import {
  musicGeneratorService,
  GeneratedMusic,
  MusicGallery,
} from '@/services/musicGeneratorService';

export function useMusicGenerator(creditsAvailable: number) {
  const [galleries, setGalleries] = useState<MusicGallery[]>([]);
  const [currentGallery, setCurrentGallery] = useState<MusicGallery | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateCost = useCallback((songCount: number) => {
    return musicGeneratorService.calculateCost(songCount);
  }, []);

  const generateMusic = useCallback(
    async (
      prompt: string,
      genre: string = 'pop',
      style: 'pop' | 'rock' | 'jazz' | 'classical' | 'electronic' | 'hiphop' | 'ambient' | 'custom' = 'pop',
      mood: 'happy' | 'sad' | 'energetic' | 'calm' | 'melancholic' = 'happy'
    ) => {
      setError(null);
      setIsGenerating(true);

      try {
        const cost = calculateCost(1);

        if (cost > creditsAvailable) {
          throw new Error(
            `Créditos insuficientes. Você tem ${creditsAvailable}, precisa de ${cost}`
          );
        }

        // Gerar música
        const music = await musicGeneratorService.generateMusic(prompt, genre, style, mood);

        // Criar ou atualizar galeria
        let gallery: MusicGallery;

        if (currentGallery) {
          // Adicionar à galeria existente
          gallery = {
            ...currentGallery,
            songs: [...currentGallery.songs, music],
            creditsUsed: currentGallery.creditsUsed + cost,
            updatedAt: new Date().toISOString(),
          };
        } else {
          // Criar nova galeria
          gallery = {
            id: `gal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: prompt,
            description: `Galeria de músicas: ${style} - ${genre}`,
            songs: [music],
            theme: 'modern',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            creditsUsed: cost,
          };
        }

        setCurrentGallery(gallery);
        setGalleries([gallery, ...galleries.filter((g) => g.id !== gallery.id)]);

        return gallery;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Erro ao gerar música';
        setError(errorMsg);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [creditsAvailable, calculateCost, currentGallery, galleries]
  );

  const updateGallery = useCallback(
    (galleryId: string, updates: Partial<MusicGallery>) => {
      setGalleries((prev) =>
        prev.map((g) =>
          g.id === galleryId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g
        )
      );

      if (currentGallery?.id === galleryId) {
        setCurrentGallery((prev) =>
          prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null
        );
      }
    },
    [currentGallery?.id]
  );

  const updateTheme = useCallback(
    (theme: MusicGallery['theme']) => {
      if (currentGallery) {
        updateGallery(currentGallery.id, { theme });
      }
    },
    [currentGallery, updateGallery]
  );

  const deleteGallery = useCallback(
    (galleryId: string) => {
      setGalleries((prev) => prev.filter((g) => g.id !== galleryId));
      if (currentGallery?.id === galleryId) {
        setCurrentGallery(null);
      }
    },
    [currentGallery?.id]
  );

  const deleteSong = useCallback(
    (songId: string) => {
      if (!currentGallery) return;

      const updated = {
        ...currentGallery,
        songs: currentGallery.songs.filter((s) => s.id !== songId),
      };

      if (updated.songs.length === 0) {
        deleteGallery(currentGallery.id);
      } else {
        updateGallery(currentGallery.id, updated);
      }
    },
    [currentGallery, deleteGallery, updateGallery]
  );

  const exportGallery = useCallback(
    (format: 'json' | 'html' | 'm3u') => {
      if (!currentGallery) return null;

      if (format === 'json') {
        return musicGeneratorService.exportAsJSON(currentGallery);
      } else if (format === 'html') {
        return musicGeneratorService.exportAsHTML(currentGallery);
      } else if (format === 'm3u') {
        return musicGeneratorService.createPlaylistM3U(currentGallery);
      }

      return null;
    },
    [currentGallery]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadGallery = useCallback(
    (galleryId: string) => {
      const gallery = galleries.find((g) => g.id === galleryId);
      if (gallery) {
        setCurrentGallery(gallery);
      }
    },
    [galleries]
  );

  const clearCurrentGallery = useCallback(() => {
    setCurrentGallery(null);
  }, []);

  return {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateMusic,
    updateGallery,
    updateTheme,
    deleteGallery,
    deleteSong,
    exportGallery,
    clearError,
    loadGallery,
    clearCurrentGallery,
    getMusicCost: calculateCost,
  };
}
