import { useEffect } from 'react'
import SitePage from '@/components/site/SitePage'
import EcosystemShowcase from '@/components/ecosystem/EcosystemShowcase'
import { APP_NAME } from '@/config/brand'

/** Public page of the Vertal ecosystem: Vertal Dev + Vertal Run + Vertal.app. */
export default function EcosystemPage() {
  useEffect(() => {
    document.title = `Vertal ecosystem: build, run and publish with AI | ${APP_NAME}`
  }, [])

  return (
    <SitePage>
      <EcosystemShowcase asPage />
    </SitePage>
  )
}
