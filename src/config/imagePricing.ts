// Image Generation Pricing Configuration
// Using FLUX 1.0 Schnell model - fastest, cheapest, best quality

export const IMAGE_PRICING = {
  // Model costs in USD
  models: {
    flux: {
      name: 'Black Forest Labs FLUX 1.0 Schnell',
      costPerImage: 0.0025, // $0.0025 per image
      quality: 'EXCELLENT',
      speed: 'FAST',
    },
    stable: {
      name: 'Stability AI Stable Diffusion 3',
      costPerImage: 0.006, // $0.006 per image
      quality: 'GOOD',
      speed: 'MEDIUM',
    },
  },

  // User credit packages
  packages: {
    starter: {
      name: 'Iniciante',
      credits: 10,
      price: 5, // R$ 5
      images: 10, // 10 images
      popular: false,
    },
    professional: {
      name: 'Profissional',
      credits: 50,
      price: 20, // R$ 20
      images: 50, // 50 images
      popular: true,
    },
    enterprise: {
      name: 'Empresarial',
      credits: 500,
      price: 150, // R$ 150
      images: 500, // 500 images
      popular: false,
    },
  },

  // Free tier limits
  freeTier: {
    imagesPerMonth: 2,
    maxImagesPerGeneration: 1,
    themes: ['modern', 'minimal'],
    models: ['flux'],
  },

  // Premium tier benefits
  premiumTier: {
    imagesPerMonth: 'unlimited',
    maxImagesPerGeneration: 4,
    themes: ['modern', 'minimal', 'dark', 'corporate', 'creative'],
    models: ['flux', 'stable'],
  },
};

export function calculateImageCost(imageCount: number): number {
  // 1 credit = 1 image
  return Math.max(1, imageCount);
}

export function canAffordImages(creditsAvailable: number, imageCount: number): boolean {
  const cost = calculateImageCost(imageCount);
  return creditsAvailable >= cost;
}

export function getPackageValue(packageType: 'starter' | 'professional' | 'enterprise'): {
  images: number;
  costPerImage: number;
  totalValue: string;
} {
  const pkg = IMAGE_PRICING.packages[packageType];
  const costPerImage = pkg.price / pkg.images;
  const totalValue = `R$ ${(pkg.price / pkg.images).toFixed(2)} por imagem`;

  return {
    images: pkg.images,
    costPerImage,
    totalValue,
  };
}

export function formatCredits(credits: number): string {
  if (credits >= 1000) {
    return `${(credits / 1000).toFixed(1)}k créditos`;
  }
  return `${credits} créditos`;
}

export function getCostMessage(imageCount: number, creditsAvailable: number): string {
  const cost = calculateImageCost(imageCount);

  if (cost > creditsAvailable) {
    return `❌ Créditos insuficientes (você tem ${creditsAvailable}, precisa de ${cost})`;
  }

  const afterGeneration = creditsAvailable - cost;
  return `💳 ${cost} crédito${cost !== 1 ? 's' : ''} (sobra: ${afterGeneration})`;
}

// Economics calculation
export const ECONOMICS = {
  // Per image economics
  userCreditValue: 0.40, // R$ 0.40 per credit (50 credits = R$ 20)
  aiCostFlux: 0.0025, // $0.0025 per image
  aiCostStable: 0.006, // $0.006 per image

  // Profit calculation
  marginFlux: ((0.40 - 0.0025) / 0.40) * 100, // ~99.375%
  marginStable: ((0.40 - 0.006) / 0.40) * 100, // ~98.5%
};

// Default styles for image generation
export const IMAGE_STYLES = {
  photorealistic: {
    name: 'Fotorrealista',
    description: 'Imagens realistas e profissionais',
    prompt: 'realistic, detailed, professional photography, high quality, sharp focus',
  },
  artistic: {
    name: 'Artístico',
    description: 'Estilo pintura e arte expressiva',
    prompt: 'artistic, painterly, expressive, vibrant colors, artistic style',
  },
  cartoon: {
    name: 'Cartoon',
    description: 'Ilustrações coloridas e divertidas',
    prompt: 'cartoon style, colorful, playful, fun, illustration',
  },
  abstract: {
    name: 'Abstrato',
    description: 'Arte moderna e geométrica',
    prompt: 'abstract, modern art, geometric, minimalist, contemporary',
  },
  minimalist: {
    name: 'Minimalista',
    description: 'Design limpo e elegante',
    prompt: 'minimalist, clean, simple, elegant, minimal design',
  },
};

// Recommended dimensions
export const IMAGE_DIMENSIONS = {
  square: { width: 1024, height: 1024, label: '1:1 Quadrado' },
  landscape: { width: 1344, height: 768, label: '16:9 Paisagem' },
  portrait: { width: 768, height: 1344, label: '9:16 Retrato' },
  widescreen: { width: 1536, height: 864, label: '16:9 Ultra' },
};
