import { openRouterService } from './openrouterService';
import { replicateService } from './replicateService';

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  width?: number;
  height?: number;
  style?: 'photorealistic' | 'artistic' | 'cartoon' | 'abstract' | 'minimalist';
  model?: string;
}

export interface ImageGallery {
  id: string;
  title: string;
  description: string;
  images: GeneratedImage[];
  theme: 'modern' | 'minimal' | 'dark' | 'corporate' | 'creative';
  createdAt: string;
  updatedAt: string;
  creditsUsed: number;
}

export class ImageGeneratorService {
  private models = {
    flux: 'black-forest-labs/flux-1-schnell',
    stable: 'stability-ai/stable-diffusion-3',
  };

  private defaultWidth = 1024;
  private defaultHeight = 1024;
  private creditCostPerImage = 1; // 1 credit per image

  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Prompt é obrigatório');
    }

    const width = request.width || this.defaultWidth;
    const height = request.height || this.defaultHeight;
    const model = request.model || this.models.flux;

    try {
      // Para imagens, usamos um endpoint de imagem mockado
      // Em produção, isso chamaria um serviço de imagem real
      const imageData = await this.callImageAPI(request.prompt, width, height, model);

      return {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: imageData.url,
        prompt: request.prompt,
        model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Erro ao gerar imagem: ${(error as Error).message}`);
    }
  }

  async generateMultipleImages(prompt: string, count: number = 1): Promise<GeneratedImage[]> {
    const images: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const image = await this.generateImage({ prompt });
      images.push(image);
    }
    return images;
  }

  async enhancePrompt(basicPrompt: string): Promise<string> {
    if (!process.env.VITE_OPENROUTER_API_KEY) {
      return basicPrompt;
    }

    try {
      const response = await openRouterService.chat({
        model: 'meta-llama/llama-2-70b-chat',
        messages: [
          {
            role: 'user',
            content: `Melhore este prompt de imagem para ser mais descritivo e detalhado:
"${basicPrompt}"

Responda apenas com o prompt melhorado, sem explicações.`,
          },
        ],
        max_tokens: 200,
      });

      return response.choices[0]?.message?.content || basicPrompt;
    } catch {
      return basicPrompt;
    }
  }

  calculateCost(imageCount: number): number {
    return Math.max(1, imageCount * this.creditCostPerImage);
  }

  getStyleGuide(style: string): string {
    const guides: Record<string, string> = {
      photorealistic: 'realistic, detailed, professional photography, high quality, sharp focus',
      artistic: 'artistic, painterly, expressive, vibrant colors, artistic style',
      cartoon: 'cartoon style, colorful, playful, fun, illustration',
      abstract: 'abstract, modern art, geometric, minimalist, contemporary',
      minimalist: 'minimalist, clean, simple, elegant, minimal design',
    };
    return guides[style] || guides.photorealistic;
  }

  exportAsJSON(gallery: ImageGallery): string {
    return JSON.stringify(gallery, null, 2);
  }

  createGalleryHTML(gallery: ImageGallery): string {
    const themeColors = {
      modern: { primary: '#6366f1', secondary: '#ec4899' },
      minimal: { primary: '#000000', secondary: '#ffffff' },
      dark: { primary: '#10b981', secondary: '#1f2937' },
      corporate: { primary: '#003366', secondary: '#ff6b35' },
      creative: { primary: '#d63031', secondary: '#ffe66d' },
    };

    const colors = themeColors[gallery.theme] || themeColors.modern;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gallery.title} - Galeria de Imagens</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: white; font-size: 32px; margin-bottom: 10px; }
    .description { color: rgba(255,255,255,0.9); font-size: 16px; margin-bottom: 30px; }
    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .image-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      transition: transform 0.3s;
    }
    .image-card:hover { transform: translateY(-5px); }
    .image-card img {
      width: 100%;
      height: 300px;
      object-fit: cover;
      display: block;
    }
    .image-info {
      padding: 15px;
    }
    .prompt {
      font-size: 14px;
      color: #555;
      line-height: 1.4;
    }
    .meta {
      font-size: 12px;
      color: #999;
      margin-top: 10px;
    }
    .credits {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      margin-top: 30px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${gallery.title}</h1>
    <p class="description">${gallery.description}</p>

    <div class="gallery">
      ${gallery.images
        .map(
          (img) => `
        <div class="image-card">
          <img src="${img.url}" alt="${img.prompt}" loading="lazy">
          <div class="image-info">
            <p class="prompt">${img.prompt}</p>
            <p class="meta">Modelo: ${img.model}</p>
          </div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="credits">
      <strong>Créditos usados:</strong> ${gallery.creditsUsed} |
      <strong>Imagens:</strong> ${gallery.images.length}
    </div>
  </div>
</body>
</html>`;

    return html;
  }

  private async callImageAPI(
    prompt: string,
    width: number,
    height: number,
    model: string
  ): Promise<{ url: string }> {
    try {
      // Usar Replicate para geração real
      const urls = await replicateService.generateImage({
        prompt,
        width,
        height,
        num_outputs: 1,
      });

      if (!urls || urls.length === 0) {
        throw new Error('Nenhuma URL retornada do serviço');
      }

      return {
        url: urls[0],
      };
    } catch (error) {
      // Fallback para placeholder se Replicate não estiver configurado
      console.warn('Replicate não disponível, usando placeholder:', (error as Error).message);
      const encodedPrompt = encodeURIComponent(prompt.substring(0, 50));
      const mockUrl = `https://via.placeholder.com/${width}x${height}?text=${encodedPrompt}`;

      return {
        url: mockUrl,
      };
    }
  }
}

export const imageGeneratorService = new ImageGeneratorService();
