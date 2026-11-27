/** Navigation bar of the landing page ("/"): the shared site nav with the landing links. */
import SiteNav, { LANDING_NAV_LINKS } from '@/components/site/SiteNav'

export default function LandingNav() {
  return <SiteNav links={LANDING_NAV_LINKS} />
}
