/**
 * Configuração do painel de recompensas (Shortlinks / "Earn Credits").
 *
 * Os valores de crédito, a janela de 1 hora e o saque mínimo também são aplicados no servidor
 * (supabase/functions/video-rewards e a migração 20261105120000_video_ad_rewards.sql).
 * Mude aqui e lá ao mesmo tempo.
 */

/** Créditos por vídeo assistido. */
export const REWARD_PER_VIDEO = 0.02;

/** Intervalo mínimo entre dois vídeos recompensados, em ms (1 hora). */
export const REWARD_COOLDOWN_MS = 60 * 60 * 1000;

/** Saldo mínimo para pedir saque, em créditos. */
export const MIN_WITHDRAW_CREDITS = 5;

/**
 * Vídeo de propaganda exibido antes de creditar. Deixe vazio enquanto não houver um
 * fornecedor de vídeo: o modal mostra um anúncio cronometrado no lugar.
 */
export const VIDEO_AD_SRC = '';

/** Duração do anúncio cronometrado quando VIDEO_AD_SRC está vazio, em segundos. */
export const VIDEO_AD_FALLBACK_SECONDS = 15;

export type RewardSlot = 'top' | 'bottom' | 'left' | 'right';

export interface RewardBannerConfig {
  /** Imagem do banner. Vazio = placeholder "Espaço publicitário". */
  imageUrl?: string;
  /** Link de destino. Vazio = banner sem clique. */
  href?: string;
  alt: string;
}

export const REWARD_BANNERS: Record<RewardSlot, RewardBannerConfig> = {
  top: { alt: 'Banner superior' },
  bottom: { alt: 'Banner inferior' },
  left: { alt: 'Banner lateral esquerdo' },
  right: { alt: 'Banner lateral direito' },
};
