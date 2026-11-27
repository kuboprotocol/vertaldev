import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { connectors as catalogConnectors, categories, type ConnectorConfig } from '@/lib/connectorsConfig'
import { CATEGORY_LABELS_EN, localizeConnector } from '@/lib/connectorsCopyEn'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import { surface } from '@/components/site/siteUi'
import { ConnectorIcon } from '@/components/connectors/ConnectorIcon'
import { Check, Search, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalActivityPanel } from '@/components/connectors/GlobalActivityPanel'
import { EcosystemActions, ProductLogo, useEcosystemDialogs } from '@/components/ecosystem/EcosystemShowcase'
import { getEcosystemProduct, siblingsOf } from '@/lib/ecosystem'
// Vertal CRM: entra na lista (fixado no topo) só com VITE_VERTAL_CRM ligado e o usuário liberado no servidor.
import { useVertalCrmAccess } from '@/lib/vertalCrm/client'
import { VERTAL_CRM_CONNECTOR } from '@/lib/vertalCrm/connector'
import { useVertalWalletAccess } from '@/lib/vertalWallet/client'
import { filterMetaMaskByAccess } from '@/lib/vertalWallet/config'
import { useVertalPageTitle, vertalConnectorsTitle } from '@/lib/vertalCrm/pageTitle'

type Availability = 'all' | 'available' | 'coming_soon'

// English copy for the cards (the catalog itself stays pt-BR for /integracoes).
const connectors = catalogConnectors.map(localizeConnector)
const CRM_CONNECTOR = localizeConnector(VERTAL_CRM_CONNECTOR)

const AVAILABILITY_OPTIONS: { id: Availability; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'coming_soon', label: 'Coming soon' },
]

const STATUS_RANK: Record<ConnectorConfig['status'], number> = {
  available: 0,
  coming_soon: 1,
}

export default function ConnectorsHubPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openEmbed, openMcp, dialogs } = useEcosystemDialogs()
  const vertalCrmAccess = useVertalCrmAccess()
  // MetaMask: cartão só para quem o servidor libera (VERTAL_METAMASK_USER_IDS); carregando/erro = escondido.
  const metamaskAccess = useVertalWalletAccess()
  const allConnectors = useMemo(
    () => filterMetaMaskByAccess(vertalCrmAccess === 'allowed' ? [CRM_CONNECTOR, ...connectors] : connectors, metamaskAccess),
    [vertalCrmAccess, metamaskAccess],
  )
  // Vertal CRM: título da aba "Conectores" (só para quem tem o CRM liberado; os demais ficam como estão).
  useVertalPageTitle(vertalCrmAccess === 'allowed' ? vertalConnectorsTitle() : null)

  const search = searchParams.get('q') ?? ''
  const activeCategory = searchParams.get('cat') ?? 'all'
  const availability = (searchParams.get('avail') as Availability | null) ?? 'all'
  // Produto que acabou de conectar (volta de vertal.app ou vertalrun.com com ?connected=).
  const connectedProduct = getEcosystemProduct(searchParams.get('connected') ?? '')

  const dismissConnected = () => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      sp.delete('connected')
      return sp
    }, { replace: true })
  }

  const updateParam = (key: string, value: string, defaultValue: string) => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      if (!value || value === defaultValue) sp.delete(key); else sp.set(key, value)
      return sp
    }, { replace: true })
  }

  const hasActiveFilters = Boolean(search) || activeCategory !== 'all' || availability !== 'all'

  const clearFilters = () => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      sp.delete('q'); sp.delete('cat'); sp.delete('avail')
      return sp
    }, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allConnectors
      .filter(c => {
        const matchesSearch = !q ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
        const matchesCategory = activeCategory === 'all' || c.category === activeCategory
        const matchesAvailability = availability === 'all' || c.status === availability
        return matchesSearch && matchesCategory && matchesAvailability
      })
      .sort((a, b) => {
        const byPinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        if (byPinned !== 0) return byPinned
        const byFeatured = Number(Boolean(b.featured)) - Number(Boolean(a.featured))
        if (byFeatured !== 0) return byFeatured
        const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (byStatus !== 0) return byStatus
        return a.name.localeCompare(b.name)
      })
  }, [search, activeCategory, availability, allConnectors])

  const handleConnectorClick = (connector: ConnectorConfig) => {
    if (connector.internalRoute) {
      navigate(connector.internalRoute)
    } else {
      navigate(`/connectors/${connector.slug}/about`)
    }
  }

  return (
    <AppShell topBar={<AppTopBar back={{ to: '/dashboard', label: 'Dashboard' }} />}>
      {connectedProduct && (
        <div role="status" className="mt-6 rounded-xl border border-primary/20 bg-primary/10">
          <div className="px-4 py-3 flex items-center gap-3 text-sm">
            <Check className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1">
              <strong>{connectedProduct.name} is now connected to Vertal Dev.</strong>
            </span>
            <Button size="sm" variant="ghost" onClick={dismissConnected} aria-label="Close notice">
              Close
            </Button>
          </div>
        </div>
      )}
      <PanelHeader
        title="Connectors"
        description="Connect outside services to your Vertal Dev account."
      />

      <div className="space-y-6">
        {/* Vertal ecosystem: built-in products, opened in an iframe or through MCP */}
        <section
          data-testid="ecosystem-connectors-banner"
          className={cn("relative overflow-hidden p-6 md:p-8", surface.card)}
        >
                    <div className="relative flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[13px] font-medium text-primary">Vertal ecosystem</span>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Build here. Run code in Vertal Run. Deploy with Vertal.app.</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Products from KUBO Protocol that work with Vertal Dev. Open them inside Vertal Dev, or connect them to your agent with MCP.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => navigate('/ecossistema')}>
              Why Vertal? <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative mt-6 grid gap-4 md:grid-cols-2">
            {siblingsOf('vertal-dev').map(product => {
              return (
                <div key={product.id} className="rounded-xl border border-white/[0.06] bg-background/60 p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${product.color}1f` }}>
                      <ProductLogo product={product} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <button
                        className="font-semibold hover:text-primary transition-colors"
                        onClick={() => navigate(`/connectors/ecosystem/${product.id}`)}
                      >
                        {product.name}
                      </button>
                      <p className="text-xs text-muted-foreground">{product.role} · {product.domain}</p>
                    </div>
                  </div>
                  <p className="mb-4 text-sm text-muted-foreground">{product.tagline}</p>
                  <EcosystemActions product={product} onEmbed={openEmbed} onMcp={openMcp} />
                </div>
              )
            })}
          </div>
        </section>

        <GlobalActivityPanel />

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search connectors"
                value={search}
                onChange={e => updateParam('q', e.target.value, '')}
                className="pl-10 pr-9"
              />
              {search && (
                <button
                  onClick={() => updateParam('q', '', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {AVAILABILITY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => updateParam('avail', opt.id, 'all')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    availability === opt.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => updateParam('cat', cat.id, 'all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                )}
              >
                {CATEGORY_LABELS_EN[cat.id] ?? cat.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length} of {allConnectors.length} connectors
            {hasActiveFilters && ' · you can share these filters with the page link'}
          </p>
        </div>

        {/* Connectors Grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {filtered.map(connector => (
            <motion.button
              key={connector.slug}
              onClick={() => handleConnectorClick(connector)}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className={cn(
                'group relative text-left p-5',
                surface.cardInteractive,
                connector.status === 'coming_soon' && 'opacity-70'
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex items-center justify-center h-12 w-12 rounded-xl transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${connector.color}15` }}
                >
                  <ConnectorIcon connector={connector} className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{connector.name}</h3>
                    {connector.featured && (
                      <Badge className="text-[10px] px-1.5 py-0">Ecosystem</Badge>
                    )}
                    {connector.badge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{connector.badge}</Badge>
                    )}
                    {connector.status === 'coming_soon' && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {connector.description}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground/70">
                  {CATEGORY_LABELS_EN[connector.category] ?? connector.category}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </motion.button>
          ))}
        </motion.div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <p className="text-lg">No connectors found</p>
            <p className="text-sm">Try other filters or another search.</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
      {dialogs}
    </AppShell>
  )
}
