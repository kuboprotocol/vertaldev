/**
 * Replicate API Service
 * Integração com Replicate para geração de imagens usando FLUX
 * FLUX 1.0 Schnell: $0.003 por imagem (~R$ 0.015)
 */

export interface ReplicateImageRequest {
  prompt: string;
  width?: number;
  height?: number;
  num_outputs?: number;
}

export interface ReplicateImageResponse {
  id: string;
  urls: string[];
  error?: string;
}

export class ReplicateService {
  private apiUrl = 'https://api.replicate.com/v1/predictions';
  private modelId = 'black-forest-labs/flux-schnell';
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey || this.getApiKeyFromEnv();
  }

  private getApiKeyFromEnv(): string {
    if (typeof window === 'undefined') {
      return process.env.REPLICATE_API_KEY || '';
    }
    return (import.meta as any).env.VITE_REPLICATE_API_KEY || '';
  }

  async generateImage(request: ReplicateImageRequest): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error('Replicate API key não configurada');
    }

    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Prompt é obrigatório');
    }

    try {
      // Criar prediction
      const prediction = await this.createPrediction(request);

      if (prediction.error) {
        throw new Error(prediction.error);
      }

      // Aguardar conclusão
      const completed = await this.waitForCompletion(prediction.id);

      if (!completed.output || completed.output.length === 0) {
        throw new Error('Nenhuma imagem foi gerada');
      }

      return completed.output;
    } catch (error) {
      throw new Error(`Erro ao gerar imagem: ${(error as Error).message}`);
    }
  }

  private async createPrediction(request: ReplicateImageRequest) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiKey}`,
      },
      body: JSON.stringify({
        version: '1a1b33ac97f34dd19f08ba35a6f9f1d7',
        input: {
          prompt: request.prompt,
          width: request.width || 1024,
          height: request.height || 1024,
          num_outputs: request.num_outputs || 1,
          guidance_scale: 3.5,
          num_inference_steps: 4,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate Error: ${error.detail || 'Unknown error'}`);
    }

    return response.json();
  }

  private async waitForCompletion(
    predictionId: string,
    maxAttempts: number = 120,
    delayMs: number = 1000
  ) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${this.apiUrl}/${predictionId}`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar status da predição');
      }

      const prediction = await response.json();

      if (prediction.status === 'succeeded') {
        return prediction;
      }

      if (prediction.status === 'failed') {
        throw new Error(`Predição falhou: ${prediction.error}`);
      }

      // Aguardar antes da próxima tentativa
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Timeout ao gerar imagem');
  }

  /**
   * Estimativa de custo
   * FLUX Schnell: $0.003 por imagem
   * Conversão: ~R$ 0.015 por imagem (com taxa de câmbio ~5x)
   */
  calculateCost(imageCount: number): number {
    const costPerImage = 0.003; // USD
    const totalCost = costPerImage * imageCount;
    const exchangeRate = 5; // Estimativa
    const costInReais = totalCost * exchangeRate;

    // Retornar em créditos (1 crédito = R$ 0.40)
    return Math.ceil(costInReais / 0.40);
  }
}

export const replicateService = new ReplicateService();
