/**
 * Vertal design system (Apple-style), shared by the landing page ("/"), the
 * public pages and the logged-in panels.
 *
 * Visual rules
 * - Type: system font stack (San Francisco on Apple devices). Large, tight
 *   headlines; body text 17px on public pages, 15px in panels.
 * - Color: the app theme tokens from src/index.css (background, card,
 *   foreground, muted-foreground, primary). No new colors.
 * - Surfaces: flat cards with a hairline border (white/6%), radius 2xl on
 *   public pages and xl in panels. No glow, no heavy gradients.
 * - Motion: one short fade-in per block, turned off for reduced motion.
 *
 * Copy rules
 * - English only, short plain sentences, no idioms or slang, so browser
 *   translation works well for every visitor.
 * - Same word for the same thing everywhere: "app", "credits", "plan",
 *   "connector", "publish".
 * - No numbers, logos or quotes that the product cannot back up.
 * - No hype words (unleash, seamless, supercharge, elevate, empower), no
 *   em-dash chains, no emoji in UI text.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ tokens */

/** System font stack (San Francisco on Apple devices, Inter / Segoe UI / Roboto elsewhere). */
export const SITE_FONT: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

/**
 * Root classes of every page in the design system. Headings inherit the system
 * font (the app default for h1-h6 is Orbitron).
 */
export const siteRoot =
  'bg-background text-foreground antialiased [&_:is(h1,h2,h3,h4,h5,h6)]:[font-family:inherit]'

/** Type scale. Use these class strings instead of ad-hoc sizes. */
export const type = {
  /** Page title on public pages. */
  display: 'text-4xl font-semibold leading-[1.08] tracking-[-0.025em] md:text-6xl',
  /** Section title. */
  title: 'text-3xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl',
  /** Card or panel heading. */
  heading: 'text-xl font-semibold tracking-[-0.01em]',
  /** Lead paragraph under a title. */
  lead: 'text-lg leading-relaxed text-muted-foreground md:text-xl',
  /** Body text on public pages. */
  body: 'text-[17px] leading-relaxed text-foreground/85',
  /** Small print, captions, notes. */
  caption: 'text-[13px] leading-normal text-muted-foreground',
  /** Small label above a title. */
  eyebrow: 'text-sm font-medium text-primary',
} as const

/** Spacing scale for page sections and containers. */
export const space = {
  section: 'px-6 py-20 md:py-28',
  sectionTight: 'px-6 py-12 md:py-16',
  container: 'mx-auto max-w-5xl',
  containerWide: 'mx-auto max-w-6xl',
  containerText: 'mx-auto max-w-3xl',
} as const

/** Radius scale. */
export const radius = {
  card: 'rounded-2xl',
  panel: 'rounded-xl',
  control: 'rounded-full',
} as const

/** Surfaces. */
export const surface = {
  /** Hairline used for borders and dividers. */
  hairline: 'border-white/[0.06]',
  /** Default card. */
  card: 'rounded-2xl border border-white/[0.06] bg-card/50',
  /** Card that reacts to hover (links). */
  cardInteractive:
    'rounded-2xl border border-white/[0.06] bg-card/50 transition-colors hover:border-white/[0.14] hover:bg-card/70',
  /** Panel surface inside the logged-in app. */
  panel: 'rounded-xl border border-white/[0.06] bg-card/50',
  /** Translucent bar (nav, toolbars). */
  bar: 'border-white/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150',
} as const

/** Visible keyboard focus for every interactive element. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** Primary pill button (one per screen). */
export const primaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60',
  focusRing,
)

/** Secondary pill button. */
export const secondaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-white/[0.08] disabled:opacity-60',
  focusRing,
)

/** Small pill button for bars and cards. */
export const smallButton = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60',
  focusRing,
)

/* -------------------------------------------------------------- primitives */

/** Brand names that browser translation must not change. */
export function Brand({ children }: { children: ReactNode }) {
  return <span translate="no">{children}</span>
}

/** Fade in once when the block enters the screen. Turned off by MotionConfig for reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'li'
}) {
  const Tag = as === 'li' ? motion.li : motion.div
  return (
    <Tag
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay }}
      className={className}
    >
      {children}
    </Tag>
  )
}

/** Section wrapper with the site's spacing scale. */
export function Section({
  id,
  children,
  className,
  labelledBy,
  width = 'default',
}: {
  id?: string
  children: ReactNode
  className?: string
  labelledBy?: string
  width?: 'default' | 'wide' | 'text'
}) {
  const inner = width === 'wide' ? space.containerWide : width === 'text' ? space.containerText : space.container
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('px-6 py-24 md:py-32', className)}>
      <div className={inner}>{children}</div>
    </section>
  )
}

/** Centered headline + one short paragraph. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow?: ReactNode
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className={cn('mb-3', type.eyebrow)}>{eyebrow}</p>}
      <h2 id={id} className="text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-5xl">
        {title}
      </h2>
      {children && <p className={cn('mt-5', type.lead)}>{children}</p>}
    </Reveal>
  )
}

/** Title block at the top of an inner public page (one h1 per page). */
export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  align = 'center',
  id = 'page-title',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  align?: 'center' | 'left'
  id?: string
}) {
  return (
    <header
      className={cn(
        'px-6 pb-12 pt-16 md:pb-16 md:pt-24',
        align === 'center' ? 'text-center' : 'text-left',
      )}
    >
      <div className={cn(align === 'center' ? 'mx-auto max-w-3xl' : space.container)}>
        {eyebrow && <p className={cn('mb-3', type.eyebrow)}>{eyebrow}</p>}
        <h1 id={id} className={cn(type.display, 'text-foreground')}>
          {title}
        </h1>
        {children && (
          <p className={cn('mt-5', type.lead, align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl')}>{children}</p>
        )}
        {actions && (
          <div
            className={cn(
              'mt-8 flex flex-wrap items-center gap-x-6 gap-y-3',
              align === 'center' && 'justify-center',
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

/** Flat card with the site's surface. */
export function Card({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'li' | 'article' | 'section'
}) {
  const Tag = as
  return <Tag className={cn(surface.card, 'p-6', className)}>{children}</Tag>
}

/** Text link with a chevron, used as the secondary action. Internal paths use the router. */
export function MoreLink({
  to,
  children,
  className,
  external = false,
}: {
  to: string
  children: ReactNode
  className?: string
  external?: boolean
}) {
  const cls = cn(
    'group inline-flex items-center gap-0.5 rounded-sm text-[17px] text-primary hover:underline underline-offset-4',
    focusRing,
    className,
  )
  const inner = (
    <>
      {children}
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  )
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  )
}

/** Long-form text (legal pages, docs). Styles headings, lists and links inside. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'text-[17px] leading-relaxed text-foreground/85',
        '[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground',
        '[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground',
        '[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6',
        '[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:text-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}
