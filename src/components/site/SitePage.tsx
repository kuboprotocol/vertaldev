/**
 * Page frame for public pages: translucent nav, main content, footer, system
 * font. Use it instead of importing the nav and footer one by one.
 */
import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import SiteNav, { PUBLIC_NAV_LINKS, type SiteNavLink } from './SiteNav'
import SiteFooter from './SiteFooter'
import { SITE_FONT, siteRoot } from './siteUi'

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
      <div className={`min-h-screen ${siteRoot}`} style={SITE_FONT}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <SiteNav links={links} />
        <main id="main">{children}</main>
        {footer && <SiteFooter />}
      </div>
    </MotionConfig>
  )
}
