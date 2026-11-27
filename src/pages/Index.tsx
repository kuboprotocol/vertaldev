import { lazy, Suspense, useEffect } from "react";
import { Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LandingSkeleton from "@/components/landing/LandingSkeleton";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { LANDING_FONT, Reveal, Section, SectionHeading, primaryButton } from "@/components/landing/landingUi";

const HeroSection = lazy(() => import("@/components/landing/HeroSection"));
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection"));
const CreditsPromoSection = lazy(() => import("@/components/landing/CreditsPromoSection"));
const ConnectorSection = lazy(() => import("@/components/landing/ConnectorSection"));
const DomainSection = lazy(() => import("@/components/landing/DomainSection"));
const EcosystemSection = lazy(() => import("@/components/landing/EcosystemSection"));
const VibePaySection = lazy(() => import("@/components/landing/VibePaySection"));
const FAQSection = lazy(() => import("@/components/landing/FAQSection"));

const SectionFallback = () => <div className="py-12 px-6"><div className="max-w-3xl mx-auto h-24 rounded-xl bg-muted/30 animate-pulse" /></div>;

const SafeSection = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <ErrorBoundary resourceName={name} fallback={<SectionFallback />}>
    <Suspense fallback={<SectionFallback />}>{children}</Suspense>
  </ErrorBoundary>
);

/**
 * The landing page is written in English so browsers can offer automatic
 * translation. index.html sets lang="en" only for "/" (inline script); this
 * effect covers client-side navigation to and from "/".
 */
function useDocumentLang(lang: string) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = lang;
    return () => {
      root.lang = previous && previous !== lang ? previous : "pt-BR";
    };
  }, [lang]);
}

const Index = () => {
  useDocumentLang("en");

  return (
    <MotionConfig reducedMotion="user">
      {/* Headings inherit the system font (the app default for h1-h6 is Orbitron). */}
      <div
        className="min-h-screen bg-background text-foreground antialiased [&_:is(h1,h2,h3,h4,h5,h6)]:[font-family:inherit]"
        style={LANDING_FONT}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <LandingNav />

        <Suspense fallback={<LandingSkeleton />}>
          <main id="main">
            <SafeSection name="HeroSection"><HeroSection /></SafeSection>
            <SafeSection name="HowItWorksSection"><HowItWorksSection /></SafeSection>
            <SafeSection name="ConnectorSection"><ConnectorSection /></SafeSection>
            <SafeSection name="DomainSection"><DomainSection /></SafeSection>
            <SafeSection name="EcosystemSection"><EcosystemSection /></SafeSection>
            <SafeSection name="VibePaySection"><VibePaySection /></SafeSection>
            <SafeSection name="CreditsPromoSection"><CreditsPromoSection /></SafeSection>
            <SafeSection name="FAQSection"><FAQSection /></SafeSection>

            <ErrorBoundary resourceName="CTA" fallback={<SectionFallback />}>
              <Section labelledBy="cta-title" className="border-t border-white/[0.06]">
                <SectionHeading id="cta-title" title="Start with your idea.">
                  Create a free account and build your first app today.
                </SectionHeading>
                <Reveal className="mt-10 flex justify-center">
                  <Link to="/builder" className={primaryButton}>
                    Start building for free
                  </Link>
                </Reveal>
              </Section>
            </ErrorBoundary>
          </main>
        </Suspense>

        <LandingFooter />
      </div>
    </MotionConfig>
  );
};

export default Index;
