/**
 * Slides Generator Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlideGeneratorService, Presentation } from './slideGeneratorService';
import { openRouterService } from './openrouterService';

vi.mock('./openrouterService');

describe('SlideGeneratorService', () => {
  let service: SlideGeneratorService;

  beforeEach(() => {
    service = new SlideGeneratorService();
    vi.clearAllMocks();
  });

  describe('calculateCost', () => {
    it('should calculate cost for 5 slides as 5 credits', () => {
      const cost = service.calculateCost(5);
      expect(cost).toBe(5);
    });

    it('should calculate cost for 1 slide as 1 credit', () => {
      const cost = service.calculateCost(1);
      expect(cost).toBe(1);
    });

    it('should calculate cost for 20 slides as 20 credits', () => {
      const cost = service.calculateCost(20);
      expect(cost).toBe(20);
    });

    it('should return minimum 1 credit', () => {
      const cost = service.calculateCost(0);
      expect(cost).toBe(1);
    });
  });

  describe('getThemeColors', () => {
    it('should return colors for modern theme', () => {
      const colors = service.getThemeColors('modern');
      expect(colors).toHaveProperty('primary');
      expect(colors).toHaveProperty('secondary');
      expect(colors).toHaveProperty('background');
      expect(colors).toHaveProperty('text');
      expect(colors.primary).toBe('#6366f1');
    });

    it('should return colors for minimal theme', () => {
      const colors = service.getThemeColors('minimal');
      expect(colors.primary).toBe('#000000');
    });

    it('should return colors for dark theme', () => {
      const colors = service.getThemeColors('dark');
      expect(colors.primary).toBe('#10b981');
    });

    it('should return default colors for unknown theme', () => {
      const colors = service.getThemeColors('unknown');
      expect(colors.primary).toBe('#6366f1'); // modern defaults
    });
  });

  describe('exportPresentation', () => {
    it('should export presentation as JSON string', () => {
      const mockPresentation: Presentation = {
        id: 'test-1',
        title: 'Test Presentation',
        description: 'A test presentation',
        slides: [
          {
            id: 'slide-1',
            type: 'title',
            title: 'Title Slide',
            content: 'Test content',
            order: 0,
          },
        ],
        theme: 'modern',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creditsUsed: 1,
      };

      const exported = service.exportPresentation(mockPresentation);
      const parsed = JSON.parse(exported);

      expect(parsed.id).toBe('test-1');
      expect(parsed.title).toBe('Test Presentation');
      expect(parsed.slides).toHaveLength(1);
    });
  });

  describe('exportAsHTML', () => {
    it('should export presentation as HTML', () => {
      const mockPresentation: Presentation = {
        id: 'test-1',
        title: 'Test Presentation',
        description: 'A test presentation',
        slides: [
          {
            id: 'slide-1',
            type: 'title',
            title: 'Welcome',
            content: 'This is a test',
            order: 0,
          },
        ],
        theme: 'modern',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creditsUsed: 1,
      };

      const html = service.exportAsHTML(mockPresentation, 'modern');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Presentation');
      expect(html).toContain('Welcome');
      expect(html).toContain('This is a test');
      expect(html).toContain('<style>');
    });

    it('should include theme colors in HTML export', () => {
      const mockPresentation: Presentation = {
        id: 'test-1',
        title: 'Test',
        description: 'Test',
        slides: [
          {
            id: 'slide-1',
            type: 'title',
            title: 'Test',
            content: 'Test',
            order: 0,
          },
        ],
        theme: 'dark',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creditsUsed: 1,
      };

      const html = service.exportAsHTML(mockPresentation, 'dark');
      expect(html).toContain('#1f2937'); // dark background color
    });
  });

  describe('generatePresentation', () => {
    it('should attempt to generate presentation with valid request', async () => {
      const mockResponse = {
        id: 'response-1',
        model: 'meta-llama/llama-2-70b-chat',
        choices: [
          {
            message: {
              role: 'assistant' as const,
              content: `SLIDE 1:
TITLE: Introduction
CONTENT: Welcome to the presentation

SLIDE 2:
TITLE: Main Content
CONTENT: Key point 1
Key point 2`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      };

      vi.mocked(openRouterService.chat).mockResolvedValue(mockResponse);

      const result = await service.generatePresentation({
        topic: 'Test Topic',
        numSlides: 2,
        tone: 'professional',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title', 'Test Topic');
      expect(result).toHaveProperty('slides');
      expect(result.slides.length).toBeGreaterThan(0);
      expect(result.creditsUsed).toBe(2);
    });

    it('should throw error when API key not configured', async () => {
      vi.mocked(openRouterService.chat).mockRejectedValue(
        new Error('OpenRouter API key not configured')
      );

      await expect(
        service.generatePresentation({
          topic: 'Test',
          numSlides: 3,
        })
      ).rejects.toThrow();
    });
  });

  describe('generateSlideOutline', () => {
    it('should generate outline for topic', async () => {
      const mockResponse = {
        id: 'response-1',
        model: 'meta-llama/llama-2-70b-chat',
        choices: [
          {
            message: {
              role: 'assistant' as const,
              content: `1. Introduction to AI
2. History of Machine Learning
3. Current Applications
4. Future Trends`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 100,
          total_tokens: 150,
        },
      };

      vi.mocked(openRouterService.chat).mockResolvedValue(mockResponse);

      const outline = await service.generateSlideOutline('AI', 3);

      expect(outline).toBeInstanceOf(Array);
      expect(outline.length).toBeGreaterThan(0);
    });
  });

  describe('enhanceSlideContent', () => {
    it('should enhance slide content', async () => {
      const mockResponse = {
        id: 'response-1',
        model: 'meta-llama/llama-2-70b-chat',
        choices: [
          {
            message: {
              role: 'assistant' as const,
              content:
                'Enhanced content about the topic with professional tone',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 50,
          total_tokens: 100,
        },
      };

      vi.mocked(openRouterService.chat).mockResolvedValue(mockResponse);

      const enhanced = await service.enhanceSlideContent('Basic content');

      expect(enhanced).toBeTruthy();
      expect(enhanced.length).toBeGreaterThan(0);
    });
  });
});
