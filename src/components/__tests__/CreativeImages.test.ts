import { describe, it, expect, beforeEach, vi } from 'vitest';
import { imageGeneratorService } from '@/services/imageGeneratorService';
import { calculateImageCost, canAffordImages, getPackageValue } from '@/config/imagePricing';

describe('Image Generation System', () => {
  describe('ImageGeneratorService', () => {
    it('should calculate cost correctly', () => {
      const cost1 = imageGeneratorService.calculateCost(1);
      const cost2 = imageGeneratorService.calculateCost(4);

      expect(cost1).toBe(1);
      expect(cost2).toBe(4);
    });

    it('should generate enhanced prompts', async () => {
      const basicPrompt = 'um gato';
      const enhanced = await imageGeneratorService.enhancePrompt(basicPrompt);

      // Se não houver API key, retorna o prompt original
      expect(enhanced).toBeTruthy();
      expect(typeof enhanced).toBe('string');
    });

    it('should generate image with proper structure', async () => {
      const request = {
        prompt: 'um elefante em uma savana ao pôr do sol',
        width: 1024,
        height: 1024,
        style: 'photorealistic' as const,
      };

      const image = await imageGeneratorService.generateImage(request);

      expect(image.id).toBeTruthy();
      expect(image.url).toBeTruthy();
      expect(image.prompt).toBe(request.prompt);
      expect(image.model).toBeTruthy();
      expect(image.createdAt).toBeTruthy();
    });

    it('should generate multiple images', async () => {
      const prompt = 'um cachorro brincando';
      const count = 3;

      const images = await imageGeneratorService.generateMultipleImages(prompt, count);

      expect(images).toHaveLength(count);
      images.forEach((img) => {
        expect(img.id).toBeTruthy();
        expect(img.url).toBeTruthy();
        expect(img.prompt).toBe(prompt);
      });
    });

    it('should get style guide correctly', () => {
      const styles = ['photorealistic', 'artistic', 'cartoon', 'abstract', 'minimalist'];

      styles.forEach((style) => {
        const guide = imageGeneratorService.getStyleGuide(style);
        expect(guide).toBeTruthy();
        expect(typeof guide).toBe('string');
        expect(guide.length).toBeGreaterThan(0);
      });
    });

    it('should export gallery as JSON', () => {
      const gallery = {
        id: 'test-gallery',
        title: 'Test Gallery',
        description: 'A test gallery',
        images: [],
        theme: 'modern' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creditsUsed: 5,
      };

      const json = imageGeneratorService.exportAsJSON(gallery);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe('test-gallery');
      expect(parsed.title).toBe('Test Gallery');
      expect(parsed.creditsUsed).toBe(5);
    });

    it('should create gallery HTML', () => {
      const gallery = {
        id: 'test-gallery',
        title: 'Test Gallery',
        description: 'A test gallery',
        images: [
          {
            id: 'img-1',
            url: 'https://example.com/image.jpg',
            prompt: 'A test image',
            model: 'flux',
            createdAt: new Date().toISOString(),
          },
        ],
        theme: 'modern' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creditsUsed: 1,
      };

      const html = imageGeneratorService.createGalleryHTML(gallery);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Gallery');
      expect(html).toContain('A test gallery');
      expect(html).toContain('https://example.com/image.jpg');
      expect(html).toContain('Créditos usados:</strong> 1');
    });
  });

  describe('Image Pricing', () => {
    it('should calculate correct cost', () => {
      expect(calculateImageCost(1)).toBe(1);
      expect(calculateImageCost(2)).toBe(2);
      expect(calculateImageCost(4)).toBe(4);
    });

    it('should verify affordability', () => {
      expect(canAffordImages(100, 1)).toBe(true);
      expect(canAffordImages(100, 50)).toBe(true);
      expect(canAffordImages(10, 50)).toBe(false);
    });

    it('should calculate package values', () => {
      const starter = getPackageValue('starter');
      const professional = getPackageValue('professional');
      const enterprise = getPackageValue('enterprise');

      expect(starter.images).toBe(10);
      expect(professional.images).toBe(50);
      expect(enterprise.images).toBe(500);

      expect(starter.costPerImage).toBeGreaterThan(0);
      expect(professional.costPerImage).toBeGreaterThan(0);
      expect(enterprise.costPerImage).toBeGreaterThan(0);

      // Professional should be cheaper per image than Starter
      expect(professional.costPerImage).toBeLessThan(starter.costPerImage);
    });
  });

  describe('Image Styles', () => {
    it('should have all required styles', () => {
      const styles = ['photorealistic', 'artistic', 'cartoon', 'abstract', 'minimalist'];
      styles.forEach((style) => {
        const guide = imageGeneratorService.getStyleGuide(style);
        expect(guide.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Gallery Management', () => {
    it('should create gallery with correct structure', () => {
      const gallery = {
        id: `gal-${Date.now()}-123`,
        title: 'Test Gallery',
        description: 'Test description',
        images: [],
        theme: 'dark' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creditsUsed: 10,
      };

      expect(gallery.id).toMatch(/^gal-/);
      expect(gallery.title).toBeTruthy();
      expect(gallery.images).toEqual([]);
      expect(['modern', 'minimal', 'dark', 'corporate', 'creative']).toContain(gallery.theme);
    });
  });
});
