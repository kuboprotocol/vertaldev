// Music Pricing Configuration
// Model: Llama 2 70B + Music generation APIs (FREE via OpenRouter)
// Cost per song: ~$0.005
// Credit cost: 3 credits per song
// Economics: User pays R$1.20 (3 credits × R$0.40), Vertal profit ~99% (mais caro que spreadsheet pois requer mais processamento)

export const MUSIC_GENRES = {
  pop: {
    label: 'Pop',
    icon: '🎤',
    description: 'Música pop moderna e cativante',
  },
  rock: {
    label: 'Rock',
    icon: '🎸',
    description: 'Rock clássico e energético',
  },
  jazz: {
    label: 'Jazz',
    icon: '🎷',
    description: 'Jazz sofisticado e improvisado',
  },
  classical: {
    label: 'Clássica',
    icon: '🎻',
    description: 'Música clássica e sinfônica',
  },
  electronic: {
    label: 'Eletrônica',
    icon: '🎛️',
    description: 'Música eletrônica e sintetizada',
  },
  hiphop: {
    label: 'Hip-Hop',
    icon: '🎤',
    description: 'Hip-hop moderno e rítmico',
  },
  ambient: {
    label: 'Ambient',
    icon: '🌌',
    description: 'Música ambiente e relaxante',
  },
};

export const MUSIC_STYLES = {
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Clássica',
  electronic: 'Eletrônica',
  hiphop: 'Hip-Hop',
  ambient: 'Ambient',
  custom: 'Customizado',
};

export const MUSIC_MOODS = {
  happy: { label: 'Feliz', emoji: '😊' },
  sad: { label: 'Triste', emoji: '😢' },
  energetic: { label: 'Energético', emoji: '⚡' },
  calm: { label: 'Calmo', emoji: '😌' },
  melancholic: { label: 'Melancólico', emoji: '🌧️' },
};

export const MUSIC_PRICING = {
  costPerSong: 3, // 3 créditos por música
  costInReais: 1.20, // R$ 1.20 (3 × R$0.40)
  actualCostUSD: 0.005, // ~$0.005 (FREE tier Llama 2 + music APIs)
  profitMargin: 0.996, // 99.6% profit margin
};

export const CREDIT_PACKAGES = [
  {
    name: 'Iniciante',
    credits: 10,
    price: 5,
    songsIncluded: 3,
    popular: false,
    badge: 'Comece aqui',
  },
  {
    name: 'Profissional',
    credits: 50,
    price: 20,
    songsIncluded: 16,
    popular: true,
    badge: 'Mais vendido',
  },
  {
    name: 'Empresarial',
    credits: 500,
    price: 150,
    songsIncluded: 166,
    popular: false,
    badge: 'Para empresas',
  },
];

export const FREE_TIER = {
  songsPerMonth: 1,
  maxGenres: 7,
};

export function getMusicCost(count: number): number {
  return Math.max(3, count * MUSIC_PRICING.costPerSong);
}

export function getCostMessage(count: number, creditsAvailable: number): string {
  const cost = getMusicCost(count);
  const costInReais = cost * 0.40;

  if (cost > creditsAvailable) {
    const needed = cost - creditsAvailable;
    return `❌ Créditos insuficientes: faltam ${needed} créditos (Custo: ${cost} = R$ ${costInReais.toFixed(2)})`;
  }

  return `✅ ${cost} crédito(s) = R$ ${costInReais.toFixed(2)}`;
}
