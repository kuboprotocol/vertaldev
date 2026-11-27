/**
 * Frame for logged-in panels (dashboard, projects, settings, credits,
 * connectors). Same visual language as the public site, denser spacing:
 * translucent top bar with a back link, a title block and a content column.
 *
 * It only draws the frame. Data loading, auth and actions stay in each page.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SITE_FONT, focusRing, surface } from './siteUi'

export function AppTopBar({
  back,
  title,
  actions,
}: {
  back?: { to: string; label: string }
  title?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={cn('sticky top-0 z-40 border-b', surface.bar)}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        {back && (
          <Link
            to={back.to}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md py-1 pr-2 text-[15px] text-primary hover:underline underline-offset-4',
              focusRing,
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
        )}
        {title && <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</div>}
        {!title && <div className="flex-1" />}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Title block of a panel: one h1, an optional short description and actions on the right. */
export function PanelHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 pb-8 pt-8 sm:flex-row sm:items-end sm:justify-between md:pt-12">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-1 shrink-0 text-primary">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.02em] md:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Panel page frame. */
export default function AppShell({
  children,
  topBar,
  width = 'default',
  className,
}: {
  children: ReactNode
  topBar?: ReactNode
  width?: 'default' | 'narrow' | 'wide'
  className?: string
}) {
  const w = width === 'narrow' ? 'max-w-3xl' : width === 'wide' ? 'max-w-7xl' : 'max-w-6xl'
  return (
    <div className="min-h-screen bg-background text-foreground antialiased" style={SITE_FONT}>
      {topBar}
      <main id="main" className={cn('mx-auto px-4 pb-24 sm:px-6', w, className)}>
        {children}
      </main>
    </div>
  )
}
