import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import Navbar from '@/components/landing/Navbar'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/config/brand'
import {
  INTEGRATIONS,
  INTEGRATIONS_INDEX_SEO,
  INTEGRATIONS_PATH,
  TRADEMARK_NOTICE,
  findIntegration,
  integrationGroups,
  integrationPath,
  integrationSeo,
  type Integration,
} from '@/config/integrations'
import { usePageSeo } from '@/hooks/usePageSeo'

// Páginas públicas de integração (SEO). O mesmo texto sai pré-renderizado no build
// (vite-plugins/integrations.ts) para buscadores que não rodam JavaScript.

function Logo({ i, size = 'h-12 w-12' }: { i: Integration; size?: string }) {
  if (!i.logoUrl) {
    return (
      <span className={`${size} shrink-0 rounded-xl bg-primary/15 text-primary font-bold flex items-center justify-center`}>
        {i.name.slice(0, 1)}
      </span>
    )
  }
  return <img src={i.logoUrl} alt={`Logo ${i.name}`} className={`${size} shrink-0 rounded-xl object-contain bg-white/5`} loading="lazy" />
}

function TrademarkNotice() {
  return <p className="mt-12 text-xs text-muted-foreground/70 leading-relaxed">{TRADEMARK_NOTICE}</p>
}

function IntegrationsIndex() {
  usePageSeo({ title: INTEGRATIONS_INDEX_SEO.title, description: INTEGRATIONS_INDEX_SEO.description, path: INTEGRATIONS_PATH })
  return (
    <>
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">{APP_NAME}</Link> › Integrações
      </nav>
      <header className="mt-4 mb-10">
        <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight">{INTEGRATIONS_INDEX_SEO.heading}</h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          {INTEGRATIONS_INDEX_SEO.description} Cada integração tem uma página com o que dá para fazer, como conectar e exemplos.
        </p>
      </header>
      {integrationGroups().map((g) => (
        <section key={g.id} className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">{g.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((i) => (
              <Link
                key={i.slug}
                to={integrationPath(i)}
                className="group flex gap-3 rounded-2xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/60"
              >
                <Logo i={i} size="h-10 w-10" />
                <span>
                  <span className="block font-semibold group-hover:text-primary">Integração {i.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground line-clamp-2">{i.about}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <Button asChild size="lg" className="rounded-xl">
        <Link to="/auth">Começar grátis no {APP_NAME} <ArrowRight className="ml-2 h-4 w-4" /></Link>
      </Button>
      <TrademarkNotice />
    </>
  )
}

function ItemList({ items }: { items: { name: string; description: string }[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((a) => (
        <li key={a.name} className="flex gap-2 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><strong>{a.name}</strong> — <span className="text-muted-foreground">{a.description}</span></span>
        </li>
      ))}
    </ul>
  )
}

function IntegrationDetail({ i }: { i: Integration }) {
  const seo = integrationSeo(i)
  usePageSeo({ title: seo.title, description: seo.description, path: integrationPath(i) })
  const related = i.related.map((s) => findIntegration(s)).filter((r): r is Integration => Boolean(r))
  const cta = (
    <Button asChild size="lg" className="rounded-xl h-auto whitespace-normal py-3 text-center">
      <Link to={i.signupPath}>Conectar o {i.name} grátis <ArrowRight className="ml-2 h-4 w-4" /></Link>
    </Button>
  )
  return (
    <>
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">{APP_NAME}</Link> ›{' '}
        <Link to={INTEGRATIONS_PATH} className="hover:text-foreground">Integrações</Link> › {i.name}
      </nav>
      <header className="mt-6 flex flex-col gap-4">
        <Logo i={i} size="h-16 w-16" />
        <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight">{seo.heading}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          {i.summary} {i.lead}
        </p>
        {i.aliases.length ? <p className="text-sm text-muted-foreground">Também pesquisado como: {i.aliases.join(', ')}</p> : null}
        <div>{cta}</div>
      </header>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">O que é o {i.name}</h2>
        <p className="mt-2 text-muted-foreground">{i.about}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">O que o {APP_NAME} faz com o {i.name}</h2>
        <p className="mt-2 text-muted-foreground">{i.details}</p>
        <ul className="mt-3 space-y-2">
          {i.features.map((f) => (
            <li key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{f}</span></li>
          ))}
        </ul>
        {i.actions.length ? (
          <div className="mt-6">
            <h3 className="font-semibold">Ações do {i.name}</h3>
            <ItemList items={i.actions} />
          </div>
        ) : null}
        {i.triggers.length ? (
          <div className="mt-6">
            <h3 className="font-semibold">Gatilhos e buscas do {i.name}</h3>
            <ItemList items={i.triggers} />
          </div>
        ) : null}
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card/50 p-6">
        <h2 className="text-xl font-semibold">Como conectar o {i.name}</h2>
        <p className="mt-2 text-muted-foreground">{i.connectSummary}</p>
        <ol className="mt-4 space-y-3 list-decimal pl-5">
          {i.steps.map((s) => (
            <li key={s.title} className="text-sm"><strong>{s.title}</strong> — <span className="text-muted-foreground">{s.description}</span></li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Exemplos de uso do {i.name} com IA</h2>
        <ul className="mt-3 space-y-2">
          {i.uses.map((u) => (
            <li key={u} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{u}</span></li>
          ))}
        </ul>
        <div className="mt-6">{cta}</div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Perguntas frequentes sobre a integração {i.name}</h2>
        <dl className="mt-4 space-y-5">
          {i.faq.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Integrações relacionadas</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {related.map((r) => (
            <Link key={r.slug} to={integrationPath(r)} className="group flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3 hover:border-primary/60">
              <Logo i={r} size="h-8 w-8" />
              <span className="font-medium group-hover:text-primary">Integração {r.name}</span>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <Link to={INTEGRATIONS_PATH} className="text-primary hover:underline">Ver todas as {INTEGRATIONS.length} integrações</Link>
          {' · '}
          <Link to="/docs#connectors" className="text-primary hover:underline">Documentação de conectores</Link>
        </p>
        {i.officialUrl ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Site oficial: <a href={i.officialUrl} rel="nofollow noopener noreferrer" target="_blank" className="text-primary hover:underline">{i.name}</a>
          </p>
        ) : null}
      </section>

      <TrademarkNotice />
    </>
  )
}

export default function IntegrationsPage() {
  const { slug } = useParams<{ slug?: string }>()
  const item = findIntegration(slug)
  if (slug && !item) return <Navigate to={INTEGRATIONS_PATH} replace />
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        {item ? <IntegrationDetail i={item} /> : <IntegrationsIndex />}
      </main>
    </div>
  )
}
