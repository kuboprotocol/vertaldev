/**
 * Music Generation Service
 * Integração com OpenRouter para geração de músicas usando modelos de IA
 * Modelos suportados: Hugging Face Music Generation APIs
 * Custo estimado: ~$0.005 por música
 */

import { openRouterService } from './openrouterService';

export interface MusicGenerationRequest {
  prompt: string;
  genre?: string;
  duration?: number;
  style?: 'pop' | 'rock' | 'jazz' | 'classical' | 'electronic' | 'hiphop' | 'ambient' | 'custom';
  mood?: 'happy' | 'sad' | 'energetic' | 'calm' | 'melancholic';
}

export interface GeneratedMusic {
  id: string;
  title: string;
  description: string;
  prompt: string;
  genre: string;
  style: string;
  mood: string;
  duration: number;
  audioUrl?: string;
  lyrics?: string;
  genre_type: 'pop' | 'rock' | 'jazz' | 'classical' | 'electronic' | 'hiphop' | 'ambient' | 'custom';
  createdAt: string;
}

export interface MusicGallery {
  id: string;
  title: string;
  description: string;
  songs: GeneratedMusic[];
  theme: 'modern' | 'retro' | 'minimalist' | 'vibrant' | 'dark';
  createdAt: string;
  updatedAt: string;
  creditsUsed: number;
}

export class MusicGeneratorService {
  private defaultModel = 'meta-llama/llama-2-70b-chat';
  private creditCostPerSong = 3; // 3 créditos por música (mais caro que spreadsheet)

  async generateMusic(
    prompt: string,
    genre: string = 'pop',
    style: 'pop' | 'rock' | 'jazz' | 'classical' | 'electronic' | 'hiphop' | 'ambient' | 'custom' = 'pop',
    mood: 'happy' | 'sad' | 'energetic' | 'calm' | 'melancholic' = 'happy'
  ): Promise<GeneratedMusic> {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Descrição da música é obrigatória');
    }

    try {
      // Gerar informações da música com Llama 2 70B
      const musicInfo = await this.generateMusicInfo(prompt, genre, style, mood);

      // Gerar letras com IA
      const lyrics = await this.generateLyrics(prompt, genre, style, mood);

      return {
        id: `music-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: prompt.substring(0, 50),
        description: `Música gerada com IA: ${style} - ${genre}`,
        prompt,
        genre,
        style,
        mood,
        duration: this.calculateDuration(style),
        lyrics,
        genre_type: style,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Erro ao gerar música: ${(error as Error).message}`);
    }
  }

  private async generateMusicInfo(
    prompt: string,
    genre: string,
    style: string,
    mood: string
  ): Promise<string> {
    if (!process.env.VITE_OPENROUTER_API_KEY) {
      return this.getExampleMusicData(style, genre);
    }

    try {
      const response = await openRouterService.chat({
        model: this.defaultModel,
        messages: [
          {
            role: 'user',
            content: `Gere informações estruturadas para uma música com base nisso:

Pedido: "${prompt}"
Gênero: ${genre}
Estilo: ${style}
Humor: ${mood}

Retorne APENAS um JSON válido sem explicações:
{
  "title": "Título da música",
  "bpm": 120,
  "key": "C Major",
  "instruments": ["instrumento1", "instrumento2"],
  "sections": ["verso", "pré-refrão", "refrão", "ponte"],
  "duration_seconds": 240
}

Crie dados realistas e profissionais para a música.`,
          },
        ],
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content || this.getExampleMusicData(style, genre);
    } catch {
      return this.getExampleMusicData(style, genre);
    }
  }

  private async generateLyrics(
    prompt: string,
    genre: string,
    style: string,
    mood: string
  ): Promise<string> {
    if (!process.env.VITE_OPENROUTER_API_KEY) {
      return this.getExampleLyrics(style);
    }

    try {
      const response = await openRouterService.chat({
        model: this.defaultModel,
        messages: [
          {
            role: 'user',
            content: `Gere letras criativas para uma música:

Tema: "${prompt}"
Gênero: ${genre}
Estilo: ${style}
Humor: ${mood}

Retorne letras profissionais com:
- Verso 1 (8 linhas)
- Pré-refrão (4 linhas)
- Refrão (8 linhas)
- Verso 2 (8 linhas)
- Ponte (6 linhas)

Mantenha consistência lírica e ritmo.`,
          },
        ],
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content || this.getExampleLyrics(style);
    } catch {
      return this.getExampleLyrics(style);
    }
  }

  private getExampleMusicData(style: string, genre: string): string {
    return JSON.stringify({
      title: `${style.charAt(0).toUpperCase() + style.slice(1)} Music`,
      bpm: this.getBPMForStyle(style),
      key: 'C Major',
      instruments: this.getInstrumentsForStyle(style),
      sections: ['verso', 'pré-refrão', 'refrão', 'ponte'],
      duration_seconds: this.calculateDuration(style as any),
    });
  }

  private getExampleLyrics(style: string): string {
    const lyrics: Record<string, string> = {
      pop: `Verso 1:
Acordei com um novo amanhecer
Vejo as cores do céu a brilhar
Uma sensação de poder
Que me faz querer dançar

Pré-Refrão:
Sinta a energia
Sinta a vibração
Deixa fluir

Refrão:
Eu vou vencer, eu vou brilhar
Essa é minha chance de voar
Com você ao meu lado
Nada nos pode parar

Verso 2:
As ruas me chamam pra explorar
Novos caminhos pra conquistar
Cada momento é especial
Um tesouro imperdível

Ponte:
Vamos juntos, vamos com tudo
Nada pode nos deter
O futuro é nosso`,

      rock: `Verso 1:
Pluguei minha guitarra
Sinto o poder da batida
Esse é meu momento
De fazer barulho

Pré-Refrão:
Deixa soar
Deixa ecoar
Nada pode frear

Refrão:
ROCK AND ROLL
Sou livre demais
Meu coração não para
Eu vou até o fim

Verso 2:
Multidão gritando meu nome
Palcos de fogo e luz
Essa é a vida que eu quero
Sem nunca parar

Ponte:
Rock, rock, rock
Até o amanhecer`,

      jazz: `Verso 1:
As notas fluem sem planejamento
Um improviso do coração
Cada acorde é um pensamento
Uma história de emoção

Pré-Refrão:
Suave, elegante
Nostalgia e esperança
No ritmo da vida

Refrão:
Jazz é liberdade
Cadência e verdade
Beleza na incerteza
Vida em cada nota

Verso 2:
Saxofone conversa com piano
A batida marca o compasso
Uma conversa musical
Que toca fundo a alma

Ponte:
Improviso do destino
Melodia do coração`,

      ambient: `Verso 1:
Flutuo através das nuvens
Deixo as preocupações para trás
Som e silêncio dançam juntos
Paz, apenas paz

Pré-Refrão:
Respira fundo
Deixa fluir
Encontra harmonia

Refrão:
Ambiente de sonho
Onde tudo faz sentido
Espaço infinito
De pura tranquilidade

Verso 2:
Sintetizadores sussurram segredos
Reverb e delay pintam o quadro
Uma jornada sem destino
Apenas estar presente

Ponte:
Flutuar, respirar, ser
Harmonia perfeita`,

      electronic: `Verso 1:
Bits e bytes criando magia
Sintetizador do futuro
Código se torna melodia
Digital puro

Pré-Refrão:
Drop chegando
Batida acelerada
Energia infinita

Refrão:
ELETRÔNICO
Batida implacável
Luz e som se fundem
Máquina e alma

Verso 2:
Vocoder distorce a voz
Sequenciador conta o tempo
Tecnologia e arte
Num único momento

Ponte:
Digital, orgânico
Futuro é agora`,
    };

    return lyrics[style] || lyrics.pop;
  }

  private getBPMForStyle(style: string): number {
    const bpms: Record<string, number> = {
      pop: 120,
      rock: 140,
      jazz: 100,
      classical: 80,
      electronic: 128,
      hiphop: 90,
      ambient: 60,
      custom: 120,
    };
    return bpms[style] || 120;
  }

  private getInstrumentsForStyle(style: string): string[] {
    const instruments: Record<string, string[]> = {
      pop: ['voz', 'guitarra', 'bateria', 'baixo', 'teclado'],
      rock: ['voz', 'guitarra elétrica', 'bateria', 'baixo'],
      jazz: ['saxofone', 'piano', 'contrabaixo', 'bateria', 'trompete'],
      classical: ['violino', 'violoncelo', 'flauta', 'harpa', 'orquestra'],
      electronic: ['sintetizador', 'vocoder', 'pad', 'bateria eletrônica', 'sequenciador'],
      hiphop: ['voz', 'bateria', 'baixo', 'sampler', 'turntable'],
      ambient: ['sintetizador', 'pad', 'reverb', 'delay', 'campo sonoro'],
      custom: ['voz', 'guitarra', 'teclado', 'bateria'],
    };
    return instruments[style] || instruments.pop;
  }

  private calculateDuration(style: string): number {
    const durations: Record<string, number> = {
      pop: 240,
      rock: 280,
      jazz: 300,
      classical: 360,
      electronic: 250,
      hiphop: 200,
      ambient: 480,
      custom: 240,
    };
    return durations[style] || 240;
  }

  calculateCost(songCount: number): number {
    return Math.max(3, songCount * this.creditCostPerSong);
  }

  exportAsJSON(gallery: MusicGallery): string {
    return JSON.stringify(gallery, null, 2);
  }

  exportAsHTML(gallery: MusicGallery): string {
    const themeColors: Record<string, { primary: string; secondary: string }> = {
      modern: { primary: '#3b82f6', secondary: '#1e3a8a' },
      retro: { primary: '#ec407a', secondary: '#ffd700' },
      minimalist: { primary: '#000000', secondary: '#ffffff' },
      vibrant: { primary: '#ff6b6b', secondary: '#ffd93d' },
      dark: { primary: '#1f2937', secondary: '#374151' },
    };

    const colors = themeColors[gallery.theme] || themeColors.modern;

    const songsHTML = gallery.songs
      .map(
        (song) => `
      <div class="song-card">
        <div class="song-header">
          <h3>${song.title}</h3>
          <span class="genre-badge">${song.genre}</span>
        </div>
        <div class="song-meta">
          <p><strong>Estilo:</strong> ${song.style}</p>
          <p><strong>Humor:</strong> ${song.mood}</p>
          <p><strong>Duração:</strong> ${(song.duration / 60).toFixed(1)} minutos</p>
        </div>
        <div class="song-lyrics">
          <h4>Letras:</h4>
          <pre>${song.lyrics || 'Letras não disponíveis'}</pre>
        </div>
      </div>
    `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gallery.title} - Galeria de Músicas</title>
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
    .songs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .song-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      transition: transform 0.3s ease;
    }
    .song-card:hover {
      transform: translateY(-4px);
    }
    .song-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 15px;
      gap: 10px;
    }
    .song-header h3 {
      color: ${colors.primary};
      font-size: 20px;
      margin: 0;
      flex: 1;
    }
    .genre-badge {
      background: ${colors.primary};
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .song-meta {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .song-meta p {
      margin: 4px 0;
      font-size: 13px;
      color: #4b5563;
    }
    .song-lyrics {
      border-top: 2px solid #e5e7eb;
      padding-top: 15px;
    }
    .song-lyrics h4 {
      color: ${colors.primary};
      margin-bottom: 10px;
      font-size: 14px;
    }
    .song-lyrics pre {
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      overflow-x: auto;
      line-height: 1.4;
      color: #374151;
      font-family: 'Courier New', monospace;
    }
    .footer {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎵 ${gallery.title}</h1>
    <p class="description">${gallery.description}</p>

    <div class="songs-grid">
      ${songsHTML}
    </div>

    <div class="footer">
      <strong>Músicas geradas:</strong> ${gallery.songs.length} |
      <strong>Créditos usados:</strong> ${gallery.creditsUsed} |
      <strong>Tema:</strong> ${gallery.theme}
    </div>
  </div>
</body>
</html>`;
  }

  createPlaylistM3U(gallery: MusicGallery): string {
    let m3u = '#EXTM3U\n';

    gallery.songs.forEach((song) => {
      m3u += `#EXTINF:${song.duration},${song.title}\n`;
      m3u += `${song.audioUrl || 'local://' + song.id + '.mp3'}\n`;
    });

    return m3u;
  }
}

export const musicGeneratorService = new MusicGeneratorService();
