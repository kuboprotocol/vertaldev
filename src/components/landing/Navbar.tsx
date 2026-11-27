/**
 * Shared navbar of the public pages (/pricing, /download, /alternativas, ...).
 * Now the Apple-style site nav from the design system, with the same links
 * as before: Home (logo), Ecosystem, Vibe Pay, Download, Pricing,
 * Alternatives, Docs, Rewards, Support, Log in and Get started.
 */
import SiteNav, { PUBLIC_NAV_LINKS } from '@/components/site/SiteNav'

export default function Navbar() {
  return <SiteNav links={PUBLIC_NAV_LINKS} />
}
