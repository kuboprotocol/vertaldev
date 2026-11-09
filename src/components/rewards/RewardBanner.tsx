import { REWARD_BANNERS, type RewardSlot } from '@/config/rewardsConfig'
import { cn } from '@/lib/utils'

interface RewardBannerProps {
  slot: RewardSlot
  className?: string
}

/** Banner de publicidade do painel de recompensas. Placeholder enquanto não houver imagem. */
export default function RewardBanner({ slot, className }: RewardBannerProps) {
  const config = REWARD_BANNERS[slot]
  const isVertical = slot === 'left' || slot === 'right'

  const content = config.imageUrl ? (
    <img
      src={config.imageUrl}
      alt={config.alt}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Publicidade</span>
      <span className="text-xs font-medium text-foreground/80">Espaço para anúncio</span>
    </div>
  )

  const frame = cn(
    'glass glass-border overflow-hidden rounded-2xl',
    isVertical ? 'aspect-[1/3] w-full' : 'h-24 w-full md:h-28',
    className,
  )

  if (config.href) {
    return (
      <a
        href={config.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={config.alt}
        className={cn(frame, 'block transition-transform hover:scale-[1.01]')}
      >
        {content}
      </a>
    )
  }

  return (
    <div role="img" aria-label={config.alt} className={frame}>
      {content}
    </div>
  )
}
