/**
 * Slide Generator Service
 * Generates professional slides using IA (cheap/free models)
 * Supports multiple slide templates and content generation
 */

import { openRouterService } from './openrouterService';

export interface Slide {
  id: string;
  type: 'title' | 'content' | 'two-column' | 'image' | 'quote';
  title: string;
  content: string;
  subtitle?: string;
  image?: string;
  notes?: string;
  order: number;
}

export interface Presentation {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  theme: 'modern' | 'minimal' | 'dark' | 'corporate' | 'creative';
  createdAt: string;
  updatedAt: string;
  creditsUsed: number;
}

export interface GenerateSlideRequest {
  topic: string;
  numSlides?: number;
  tone?: 'professional' | 'creative' | 'casual' | 'academic';
  language?: 'pt-BR' | 'en-US' | 'es-ES';
  theme?: string;
}

const SLIDE_TEMPLATES = {
  title: (title: string, subtitle: string) => ({
    type: 'title',
    title,
    content: subtitle,
    html: `
      <div class="slide-title-page">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
    `,
  }),
  content: (title: string, points: string[]) => ({
    type: 'content',
    title,
    content: points.join('\n'),
    html: `
      <div class="slide-content">
        <h2>${title}</h2>
        <ul>
          ${points.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    `,
  }),
  quote: (quote: string, author: string) => ({
    type: 'quote',
    title: 'Quote',
    content: quote,
    subtitle: author,
    html: `
      <div class="slide-quote">
        <blockquote>"${quote}"</blockquote>
        <p class="author">— ${author}</p>
      </div>
    `,
  }),
};

export class SlideGeneratorService {
  private chunkSize = 2000;

  /**
   * Generate presentation from topic using IA
   * Uses cheap/free models for cost efficiency
   */
  async generatePresentation(request: GenerateSlideRequest): Promise<Presentation> {
    const numSlides = request.numSlides || 5;
    const tone = request.tone || 'professional';
    const language = request.language || 'pt-BR';

    // Create prompt for slide generation
    const prompt = this.createGenerationPrompt(request.topic, numSlides, tone, language);

    try {
      // Use cheap Llama model for slide generation
      const response = await openRouterService.chat({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'meta-llama/llama-2-70b-chat', // Free model
        temperature: 0.7,
        max_tokens: 3000,
      });

      const content = response.choices[0].message.content;
      const slides = this.parseSlideContent(content, numSlides);

      return {
        id: this.generateId(),
        title: request.topic,
        description: `Presentation about ${request.topic}`,
        slides,
        theme: (request.theme as any) || 'modern',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creditsUsed: numSlides, // 1 credit per slide
      };
    } catch (error) {
      console.error('Failed to generate presentation:', error);
      throw new Error(`Slide generation failed: ${(error as any).message}`);
    }
  }

  /**
   * Enhance slide content with IA
   */
  async enhanceSlideContent(slideContent: string, tone: string = 'professional'): Promise<string> {
    const prompt = `
Improve the following slide content to be more engaging and professional.
Keep it concise and impactful. Use ${tone} tone.
Return only the improved content, no explanations.

Original: ${slideContent}
`;

    try {
      const response = await openRouterService.chat({
        messages: [{ role: 'user', content: prompt }],
        model: 'meta-llama/llama-2-70b-chat',
        temperature: 0.6,
        max_tokens: 500,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.warn('Failed to enhance slide:', error);
      return slideContent;
    }
  }

  /**
   * Generate slide titles based on topic
   */
  async generateSlideOutline(topic: string, numSlides: number): Promise<string[]> {
    const prompt = `
Generate ${numSlides} slide titles for a presentation about "${topic}".
Each title should be on a new line.
Make them compelling and organized logically.
Return only the titles, numbered 1-${numSlides}.
`;

    try {
      const response = await openRouterService.chat({
        messages: [{ role: 'user', content: prompt }],
        model: 'meta-llama/llama-2-70b-chat',
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\d+\.\s*/, '').trim());
    } catch (error) {
      console.error('Failed to generate outline:', error);
      return this.getDefaultOutline(topic, numSlides);
    }
  }

  /**
   * Calculate slide generation cost in credits
   */
  calculateCost(numSlides: number): number {
    // 1 credit per slide (very cheap for users, profitable for platform)
    return Math.max(1, numSlides);
  }

  /**
   * Get slide theme colors
   */
  getThemeColors(theme: string) {
    const themes: Record<string, any> = {
      modern: {
        primary: '#6366f1',
        secondary: '#ec4899',
        background: '#f8fafc',
        text: '#1e293b',
      },
      minimal: {
        primary: '#000000',
        secondary: '#666666',
        background: '#ffffff',
        text: '#333333',
      },
      dark: {
        primary: '#10b981',
        secondary: '#3b82f6',
        background: '#1f2937',
        text: '#f3f4f6',
      },
      corporate: {
        primary: '#003366',
        secondary: '#ff9900',
        background: '#f5f5f5',
        text: '#333333',
      },
      creative: {
        primary: '#ff6b6b',
        secondary: '#4ecdc4',
        background: '#ffe66d',
        text: '#2d3436',
      },
    };

    return themes[theme] || themes.modern;
  }

  /**
   * Export presentation as JSON
   */
  exportPresentation(presentation: Presentation): string {
    return JSON.stringify(presentation, null, 2);
  }

  /**
   * Export presentation as HTML
   */
  exportAsHTML(presentation: Presentation, theme: string = 'modern'): string {
    const colors = this.getThemeColors(theme);

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${presentation.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: ${colors.background}; }
    .slide {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      background: linear-gradient(135deg, ${colors.background} 0%, ${colors.secondary}15 100%);
      color: ${colors.text};
      font-size: 24px;
      padding: 60px;
      text-align: center;
    }
    h1 { font-size: 56px; color: ${colors.primary}; margin-bottom: 20px; }
    h2 { font-size: 44px; color: ${colors.primary}; margin-bottom: 30px; }
    ul { text-align: left; display: inline-block; }
    li { font-size: 28px; margin: 15px 0; }
    blockquote { font-size: 32px; font-style: italic; color: ${colors.primary}; }
  </style>
</head>
<body>
  ${presentation.slides
    .map(
      slide => `
    <div class="slide">
      <div>
        ${slide.type === 'title' ? `<h1>${slide.title}</h1><p>${slide.content}</p>` : ''}
        ${slide.type === 'content' ? `<h2>${slide.title}</h2><ul>${slide.content.split('\n').map(item => `<li>${item}</li>`).join('')}</ul>` : ''}
        ${slide.type === 'quote' ? `<blockquote>${slide.content}</blockquote><p style="margin-top: 30px;">— ${slide.subtitle}</p>` : ''}
      </div>
    </div>
    `
    )
    .join('')}
</body>
</html>
`;

    return html;
  }

  /**
   * Create generation prompt for IA
   */
  private createGenerationPrompt(topic: string, numSlides: number, tone: string, language: string): string {
    const langText = language === 'pt-BR' ? 'português' : 'inglês';

    return `
Create a professional presentation outline about: "${topic}"

Generate exactly ${numSlides} slides with the following structure for each slide:
SLIDE [number]:
TITLE: [slide title]
CONTENT: [main points, bullet points, or key information]

Requirements:
- Use ${langText}
- ${tone} tone
- Make it engaging and informative
- Each slide should be concise and focused
- Order slides logically

Format your response as shown above, with clear SLIDE markers.
`;
  }

  /**
   * Parse IA response into slide objects
   */
  private parseSlideContent(content: string, numSlides: number): Slide[] {
    const slides: Slide[] = [];
    const slideMatches = content.match(/SLIDE\s*\d+:[\s\S]*?(?=SLIDE\s*\d+:|$)/g) || [];

    slideMatches.slice(0, numSlides).forEach((slideText, index) => {
      const titleMatch = slideText.match(/TITLE:\s*(.+?)(?:\n|$)/);
      const contentMatch = slideText.match(/CONTENT:\s*([\s\S]+?)(?=SLIDE|$)/);

      const title = titleMatch ? titleMatch[1].trim() : `Slide ${index + 1}`;
      const content = contentMatch ? contentMatch[1].trim() : '';

      slides.push({
        id: this.generateId(),
        type: index === 0 ? 'title' : 'content',
        title,
        content,
        order: index,
      });
    });

    // Ensure minimum slides
    while (slides.length < numSlides) {
      slides.push({
        id: this.generateId(),
        type: 'content',
        title: `Slide ${slides.length + 1}`,
        content: 'Add your content here',
        order: slides.length,
      });
    }

    return slides;
  }

  /**
   * Get default outline when IA fails
   */
  private getDefaultOutline(topic: string, numSlides: number): string[] {
    const outlines: Record<string, string[]> = {
      default: [
        `${topic} - Introduction`,
        'Key Concepts',
        'Main Points',
        'Case Studies',
        'Conclusion & Next Steps',
      ],
    };

    const outline = outlines.default;
    return outline.slice(0, numSlides);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `slide_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const slideGeneratorService = new SlideGeneratorService();
