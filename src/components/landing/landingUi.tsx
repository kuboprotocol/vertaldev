/**
 * Building blocks of the public landing page ("/").
 * They now live in the shared design system (src/components/site/siteUi.tsx)
 * so every page uses the same type, spacing, surfaces and buttons.
 * This file keeps the old import path working.
 */
export {
  SITE_FONT as LANDING_FONT,
  focusRing,
  primaryButton,
  secondaryButton,
  Brand,
  Reveal,
  Section,
  SectionHeading,
  MoreLink,
} from '@/components/site/siteUi'
