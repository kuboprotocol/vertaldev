import { useEffect } from 'react'
import Navbar from '@/components/landing/Navbar'
import EcosystemShowcase from '@/components/ecosystem/EcosystemShowcase'
import { APP_NAME } from '@/config/brand'

/** Página pública do Ecossistema Vertal: Vertal Dev + Vertal Run + Vertal.app. */
export default function EcosystemPage() {
  useEffect(() => {
    document.title = `Ecossistema Vertal: crie, execute e publique com IA | ${APP_NAME}`
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <EcosystemShowcase />
      </main>
    </div>
  )
}
