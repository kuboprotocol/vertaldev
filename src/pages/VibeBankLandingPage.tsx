// Landing pública do Vertal Vibe Bank (/vibe-bank) dentro do app.
// Em produção, /vibe-bank e /<idioma>/vibe-bank são servidos como HTML estático
// gerado no build (vite-plugins/vibeBank.ts) — é o que os buscadores leem. Esta
// página cobre a navegação interna do SPA e o `vite dev`, com o mesmo texto.
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageSeo } from '@/hooks/usePageSeo'
import { VIBE_BANK, VIBE_BANK_COPY, vibeBankCopy, vibeBankPath } from '@/config/vibeBank'

export default function VibeBankLandingPage() {
  const c = vibeBankCopy('pt-BR')
  usePageSeo({ title: c.title, description: c.description, path: VIBE_BANK.landingPath })
  const signup = `/auth?redirect=${encodeURIComponent(VIBE_BANK.appPath)}`

  return (
    <div className="min-h-screen bg-[#050507] text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-5">
        <Link to={VIBE_BANK.landingPath} className="flex items-center gap-2.5 font-bold tracking-wide">
          <img src={VIBE_BANK.iconSmall} alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
          {VIBE_BANK.wordmark}
        </Link>
        <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">{c.login}</Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        <section className="grid items-center gap-8 py-6 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <span className="inline-block rounded-full border border-primary/40 px-3 py-1 text-xs text-primary">{c.eyebrow}</span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{c.h1}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">{c.lead}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-xl"><Link to={signup}>{c.cta}</Link></Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl"><Link to={VIBE_BANK.appPath}>{c.login}</Link></Button>
            </div>
          </div>
          <picture className="justify-self-center">
            <source srcSet={VIBE_BANK.logo} type="image/webp" />
            <img src={VIBE_BANK.logoPng} alt={VIBE_BANK.name} width={VIBE_BANK.logoSize.width} height={VIBE_BANK.logoSize.height} className="h-auto w-full max-w-md" />
          </picture>
        </section>

        <h2 className="mt-12 text-2xl font-semibold">{c.featuresTitle}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.features.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-2xl font-semibold">{c.howTitle}</h2>
        <ol className="mt-3 list-decimal space-y-2 ps-6 text-muted-foreground">
          {c.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>

        <h2 className="mt-12 text-2xl font-semibold">{c.faqTitle}</h2>
        <dl className="mt-3 space-y-4">
          {c.faq.map(([q, a]) => (
            <div key={q}><dt className="font-semibold">{q}</dt><dd className="mt-1 text-muted-foreground">{a}</dd></div>
          ))}
        </dl>

        <p role="note" className="mt-10 flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {c.disclaimer}
        </p>

        <nav aria-label={c.languages} className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {VIBE_BANK_COPY.map((l) => (
            <a key={l.code} href={vibeBankPath(l.code)} lang={l.lang} hrefLang={l.lang} className="text-muted-foreground hover:text-foreground">{l.label}</a>
          ))}
        </nav>
      </main>
    </div>
  )
}
