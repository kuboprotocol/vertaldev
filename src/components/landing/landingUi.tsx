/**
 * Shared building blocks for the public landing page ("/") only.
 *
 * Copy rules for the landing (see PR "landing: English copy + Apple-style layout"):
 * - English only, short plain sentences, no idioms or slang, so browser
 *   translation works well for every visitor.
 * - Same word for the same thing everywhere: "app", "credits", "plan",
 *   "connector", "publish".
 * - No numbers, logos or quotes that the product cannot back up.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** System font stack (San Francisco on Apple devices, Inter / Segoe UI / Roboto elsewhere). */
export const LANDING_FONT: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

/** Visible keyboard focus for every interactive element on the landing. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** Primary pill button (one per screen). */
export const primaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60',
  focusRing,
)

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

/** Section wrapper with the landing's spacing scale. */
export function Section({
  id,
  children,
  className,
  labelledBy,
}: {
  id?: string
  children: ReactNode
  className?: string
  labelledBy?: string
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('px-6 py-24 md:py-32', className)}>
      <div className="mx-auto max-w-5xl">{children}</div>
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
      {eyebrow && <p className="mb-3 text-sm font-medium text-primary">{eyebrow}</p>}
      <h2 id={id} className="text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-5xl">
        {title}
      </h2>
      {children && <p className="mt-5 text-lg leading-relaxed text-muted-foreground md:text-xl">{children}</p>}
    </Reveal>
  )
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
