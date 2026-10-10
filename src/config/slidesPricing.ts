/**
 * Slides Generator Pricing Configuration
 * Economics: Cost-effective for users, profitable for platform
 */

export const slidesPricingConfig = {
  // Credit costs per slide (user perspective)
  userCosts: {
    perSlide: 1, // 1 credit per slide (very cheap for users)
    minimum: 1, // Minimum 1 credit per presentation
    maximum: 20, // Max 20 slides per presentation
  },

  // Credit packages for users (what they buy)
  creditPackages: [
    {
      id: 'starter',
      name: 'Iniciante',
      credits: 10,
      price: 'R$ 5,00',
      slides: '10 apresentações',
      popular: false,
    },
    {
      id: 'pro',
      name: 'Profissional',
      credits: 50,
      price: 'R$ 20,00',
      slides: '50 apresentações',
      popular: true,
      discount: '20% OFF',
    },
    {
      id: 'enterprise',
      name: 'Empresarial',
      credits: 500,
      price: 'R$ 150,00',
      slides: '500 apresentações',
      popular: false,
      discount: '40% OFF',
    },
  ],

  // Free tier
  freeTier: {
    slidesPerMonth: 2, // 2 free presentations per month
    maxSlidesPerPresentation: 5,
    features: ['IA básica', 'Templates limitados', 'Sem suporte prioritário'],
  },

  // Platform economics (internal)
  platform: {
    // Cost to platform per slide generated
    costPerSlideGeneration: 0.0001, // ~$0.0001 (using cheap Llama model)
    revenuePerCredit: 0.30, // ~R$0.30 per credit (roughly $0.06)

    // Example economics:
    // User buys 10 credits for R$ 5
    // Platform makes: 10 * R$ 0.30 = R$ 3 revenue
    // Cost: 10 slides * $0.0001 = $0.001 (negligible)
    // Profit margin: 99%+ (very profitable)

    profitMarginPercentage: 99.5,
  },

  // Model selection strategy
  models: {
    default: 'meta-llama/llama-2-70b-chat', // Free model
    fallback: 'openai/gpt-3.5-turbo', // Backup

    // Model costs on OpenRouter
    costs: {
      'meta-llama/llama-2-70b-chat': 0.00001, // Nearly free
      'openai/gpt-3.5-turbo': 0.0005,
      'openai/gpt-4': 0.03,
    },
  },

  // Features by tier
  features: {
    free: {
      slidesPerMonth: 2,
      maxSlidesPerPresentation: 5,
      themes: ['modern', 'minimal'],
      models: ['meta-llama/llama-2-70b-chat'],
      export: ['json'],
      support: false,
    },
    premium: {
      slidesPerMonth: -1, // Unlimited
      maxSlidesPerPresentation: 20,
      themes: ['modern', 'minimal', 'dark', 'corporate', 'creative'],
      models: ['meta-llama/llama-2-70b-chat', 'openai/gpt-3.5-turbo'],
      export: ['html', 'json', 'pdf'],
      support: true,
      batchGeneration: true,
      customBranding: true,
    },
  },

  // Promotional pricing
  promotions: {
    newUser: {
      bonusCredits: 10,
      validFor: 7, // days
      message: 'Welcome! 10 bonus credits for new users',
    },
    referral: {
      creditsBoth: 20, // Both referrer and referee get
      message: 'Share & earn 20 credits',
    },
  },

  // Analytics labels for tracking
  analytics: {
    category: 'slides-generation',
    subcategory: 'creative-slides',
    eventNames: {
      slideGenerated: 'slide_generated',
      presentationCreated: 'presentation_created',
      presentationExported: 'presentation_exported',
      creditPurchased: 'credit_purchased',
      freeTierUsed: 'free_tier_used',
    },
  },
};

/**
 * Calculate cost for generating slides
 */
export function calculateSlideCost(numSlides: number): number {
  const { userCosts } = slidesPricingConfig;
  return Math.max(userCosts.minimum, Math.min(numSlides, userCosts.maximum));
}

/**
 * Get user can afford slides
 */
export function canAffordSlides(creditsAvailable: number, numSlides: number): boolean {
  const cost = calculateSlideCost(numSlides);
  return creditsAvailable >= cost;
}

/**
 * Format credit display
 */
export function formatCredits(credits: number): string {
  if (credits === 1) return '1 crédito';
  return `${credits} créditos`;
}

/**
 * Get cost message for user
 */
export function getCostMessage(numSlides: number, creditsAvailable: number): string {
  const cost = calculateSlideCost(numSlides);
  const canAfford = canAffordSlides(creditsAvailable, numSlides);

  if (!canAfford) {
    return `❌ Créditos insuficientes. Precisa de ${cost}, tem ${creditsAvailable}`;
  }

  return `💳 ${cost} crédito${cost > 1 ? 's' : ''} serão debitados`;
}

/**
 * Get package value message
 */
export function getPackageValue(credits: number): string {
  const cost = slidesPricingConfig.platform.costPerSlideGeneration;
  const slides = Math.floor(credits / slidesPricingConfig.userCosts.perSlide);
  return `Gere até ${slides} apresentações`;
}
