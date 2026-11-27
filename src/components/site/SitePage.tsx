/**
 * Page frame for public pages: translucent nav, main content, footer, system
 * font. Use it instead of importing the nav and footer one by one.
 */
import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import SiteNav, { PUBLIC_NAV_LINKS, type SiteNavLink } from './SiteNav'
import SiteFooter from './SiteFooter'
import { SITE_FONT } from './siteUi'

export default function SitePage({
  children,
  links = PUBLIC_NAV_LINKS,
  footer = true,
}: {
  children: ReactNode
  links?: SiteNavLink[]
  footer?: boolean
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground antialiased" style={SITE_FONT}>
        <SiteNav links={links} />
        <main id="main">{children}</main>
        {footer && <SiteFooter />}
      </div>
    </MotionConfig>
  )
}
