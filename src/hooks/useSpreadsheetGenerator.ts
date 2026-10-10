import { useState, useCallback } from 'react';
import {
  spreadsheetGeneratorService,
  GeneratedSpreadsheet,
  SpreadsheetGallery,
} from '@/services/spreadsheetGeneratorService';

export function useSpreadsheetGenerator(creditsAvailable: number) {
  const [galleries, setGalleries] = useState<SpreadsheetGallery[]>([]);
  const [currentGallery, setCurrentGallery] = useState<SpreadsheetGallery | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateCost = useCallback((spreadsheetCount: number) => {
    return spreadsheetGeneratorService.calculateCost(spreadsheetCount);
  }, []);

  const generateSpreadsheet = useCallback(
    async (prompt: string, template: 'sales' | 'inventory' | 'finance' | 'hrrecords' | 'productlist' | 'custom' = 'custom') => {
      setError(null);
      setIsGenerating(true);

      try {
        const cost = calculateCost(1);

        if (cost > creditsAvailable) {
          throw new Error(`Créditos insuficientes. Você tem ${creditsAvailable}, precisa de ${cost}`);
        }

        // Gerar planilha
        const spreadsheet = await spreadsheetGeneratorService.generateSpreadsheet(prompt, template);

        // Criar ou atualizar galeria
        let gallery: SpreadsheetGallery;

        if (currentGallery) {
          // Adicionar à galeria existente
          gallery = {
            ...currentGallery,
            spreadsheets: [...currentGallery.spreadsheets, spreadsheet],
            creditsUsed: currentGallery.creditsUsed + cost,
            updatedAt: new Date().toISOString(),
          };
        } else {
          // Criar nova galeria
          gallery = {
            id: `gal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: prompt,
            description: `Galeria de planilhas: ${template}`,
            spreadsheets: [spreadsheet],
            theme: 'professional',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            creditsUsed: cost,
          };
        }

        setCurrentGallery(gallery);
        setGalleries([gallery, ...galleries.filter((g) => g.id !== gallery.id)]);

        return gallery;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Erro ao gerar planilha';
        setError(errorMsg);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [creditsAvailable, calculateCost, currentGallery, galleries]
  );

  const updateGallery = useCallback(
    (galleryId: string, updates: Partial<SpreadsheetGallery>) => {
      setGalleries((prev) =>
        prev.map((g) => (g.id === galleryId ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g))
      );

      if (currentGallery?.id === galleryId) {
        setCurrentGallery((prev) => (prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null));
      }
    },
    [currentGallery?.id]
  );

  const updateTheme = useCallback(
    (theme: SpreadsheetGallery['theme']) => {
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

  const deleteSpreadsheet = useCallback(
    (spreadsheetId: string) => {
      if (!currentGallery) return;

      const updated = {
        ...currentGallery,
        spreadsheets: currentGallery.spreadsheets.filter((s) => s.id !== spreadsheetId),
      };

      if (updated.spreadsheets.length === 0) {
        deleteGallery(currentGallery.id);
      } else {
        updateGallery(currentGallery.id, updated);
      }
    },
    [currentGallery, deleteGallery, updateGallery]
  );

  const exportGallery = useCallback(
    (format: 'json' | 'html' | 'xlsx' | 'csv') => {
      if (!currentGallery) return null;

      if (format === 'json') {
        return spreadsheetGeneratorService.exportAsJSON(currentGallery);
      } else if (format === 'html') {
        return spreadsheetGeneratorService.createGalleryHTML(currentGallery);
      } else if (format === 'csv' && currentGallery.spreadsheets[0]) {
        return spreadsheetGeneratorService.exportAsCSV(currentGallery.spreadsheets[0]);
      } else if (format === 'xlsx' && currentGallery.spreadsheets[0]) {
        return spreadsheetGeneratorService.exportAsExcel(currentGallery.spreadsheets[0]);
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

  return {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateSpreadsheet,
    updateGallery,
    updateTheme,
    deleteGallery,
    deleteSpreadsheet,
    exportGallery,
    clearError,
    loadGallery,
    getSpreadsheetCost: calculateCost,
  };
}
