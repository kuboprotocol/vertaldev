/**
 * OpenRouter API Service
 * Manages connections to multiple LLM models via OpenRouter
 * Supports quota tracking and credit system
 */

export interface OpenRouterMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: OpenRouterMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatRequest {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export class OpenRouterService {
  private apiKey: string;
  private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private defaultModel = 'openai/gpt-3.5-turbo'; // Free tier model

  constructor(apiKey: string = '') {
    this.apiKey = apiKey || this.getApiKeyFromEnv();
  }

  private getApiKeyFromEnv(): string {
    if (typeof window === 'undefined') {
      // Server-side
      return process.env.OPENROUTER_API_KEY || '';
    }
    // Client-side - use from env
    return (import.meta as any).env.VITE_OPENROUTER_API_KEY || '';
  }

  /**
   * Send chat message to OpenRouter
   */
  async chat(request: ChatRequest): Promise<OpenRouterResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
        'X-Title': 'KUBO Vibe Creative Panel',
      },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter Error: ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return [
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'OpenAI',
        pricing: 'free',
      },
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        pricing: 'paid',
      },
      {
        id: 'anthropic/claude-2',
        name: 'Claude 2',
        provider: 'Anthropic',
        pricing: 'paid',
      },
      {
        id: 'meta-llama/llama-2-70b-chat',
        name: 'Llama 2 70B',
        provider: 'Meta',
        pricing: 'free',
      },
    ];
  }

  /**
   * Calculate tokens (estimation)
   */
  estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get model pricing
   */
  getModelPricing(modelId: string) {
    const models = this.getAvailableModels();
    const model = models.find(m => m.id === modelId);
    return model?.pricing === 'free' ? 0 : 1; // 1 credit for paid models
  }
}

export const openRouterService = new OpenRouterService();
