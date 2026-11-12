// Serviço inteligente de notícias com geolocalização
// Busca notícias por: hora, local (bairro, cidade, estado, país), categoria
// Integra com Vertal Chat como agente nativo

export interface GeoLocation {
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  state: string;
  city: string;
  neighborhood?: string;
}

export interface NewsFilters {
  category?: 'economia' | 'tecnologia' | 'esportes' | 'entretenimento' | 'clima' | 'saude' | 'politica' | 'local' | 'internacional';
  timeRange?: 'ultima_hora' | 'hoje' | 'ultima_semana';
  location?: GeoLocation;
  language?: string;
  limit?: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source: string;
  url: string;
  imageUrl?: string;
  publishedAt: Date;
  category: string;
  relevance: 'local' | 'regional' | 'nacional' | 'internacional';
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
}

export interface NewsFeed {
  category: string;
  timeRange: string;
  location?: GeoLocation;
  articles: NewsArticle[];
  totalCount: number;
  lastUpdated: Date;
}

// Categorias de notícias suportadas
export const NEWS_CATEGORIES = [
  'economia',
  'tecnologia',
  'esportes',
  'entretenimento',
  'clima',
  'saude',
  'politica',
  'local',
  'internacional',
] as const;

// Buscar notícias por geolocalização
export async function fetchNewsByLocation(
  location: GeoLocation,
  category?: string,
  timeRange: 'ultima_hora' | 'hoje' | 'ultima_semana' = 'hoje'
): Promise<NewsArticle[]> {
  // Integra com web_search + APIs de notícias
  // Filtra por localização usando os dados de geo
  
  const queries = [];
  
  // Notícias local (bairro/cidade)
  if (location.neighborhood) queries.push(`notícias ${location.neighborhood} ${location.city}`);
  if (location.city) queries.push(`notícias ${location.city}`);
  if (location.region) queries.push(`notícias ${location.region}`);
  if (location.country) queries.push(`notícias ${location.country}`);
  
  if (category) {
    queries.forEach((q, i) => {
      queries[i] = `${q} ${category}`;
    });
  }
  
  // TODO: Implementar chamadas reais a APIs de notícias
  // Suportar: NewsAPI, GoogleNews, Medium, RSS feeds locais
  
  return [];
}

// Detectar localização do usuário
export async function detectUserLocation(
  lat?: number,
  lng?: number
): Promise<GeoLocation> {
  // Se coordenadas não fornecidas, usar IP geolocation
  // Reverter geocode para obter país, estado, cidade, bairro
  
  return {
    latitude: lat || 0,
    longitude: lng || 0,
    country: 'Brasil',
    region: 'São Paulo',
    state: 'SP',
    city: 'São Paulo',
    neighborhood: 'Centro',
  };
}

// Categorizar notícias automaticamente
export function categorizeNews(title: string, content: string): string {
  const keywords: Record<string, string[]> = {
    economia: ['mercado', 'bolsa', 'dólar', 'economia', 'empresa', 'negócios', 'investimento'],
    tecnologia: ['tech', 'software', 'app', 'IA', 'inteligência artificial', 'startup', 'computador'],
    esportes: ['futebol', 'esporte', 'jogador', 'time', 'copa', 'campeonato', 'atleta'],
    entretenimento: ['filme', 'série', 'música', 'artista', 'show', 'cinema', 'diversão'],
    clima: ['clima', 'temperatura', 'chuva', 'previsão', 'tempo', 'tempo', 'meteorologia'],
    saude: ['saúde', 'médico', 'hospital', 'doença', 'vacina', 'covid', 'remédio'],
    politica: ['política', 'governo', 'presidente', 'lei', 'senado', 'câmara', 'voto'],
  };
  
  const text = (title + ' ' + content).toLowerCase();
  
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(word => text.includes(word))) {
      return category;
    }
  }
  
  return 'geral';
}
