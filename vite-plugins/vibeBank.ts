/**
 * Landing pública do Vertal Vibe Bank, gerada no build em HTML estático (sem
 * o bundle do React) a partir de `src/config/vibeBank.ts`:
 *
 *   /vibe-bank          → vibe-bank.html          (pt-BR, raiz)
 *   /<código>/vibe-bank → <código>/vibe-bank.html (en, es, fr, de, it, ja, zh-CN, hi, ar, ko, ru, tr, id)
 *
 * Cada página traz title/description próprios, canonical, hreflang de todos
 * os idiomas + x-default (inglês), Open Graph/Twitter com a imagem da marca e
 * JSON-LD (Organization, WebSite, WebPage, BreadcrumbList, FAQPage e
 * SoftwareApplication/FinanceApplication). Nunca BankOrCreditUnion: a Vertal
 * não é banco (docs/VERTAL_BANK.md §10).
 */
import { APP_NAME, BRAND, SITE_ORIGIN } from "../src/config/brand";
import { DESCRIPTION_MAX, TITLE_MAX, clampText } from "../src/config/seo";
import { VIBE_BANK, VIBE_BANK_COPY, vibeBankPath, type VibeBankCopy } from "../src/config/vibeBank";

/** Idioma do x-default: a página é global, então o inglês. */
export const VIBE_BANK_X_DEFAULT = "en";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

export function vibeBankUrls(origin: string = SITE_ORIGIN): string[] {
  return VIBE_BANK_COPY.map((c) => `${origin}${vibeBankPath(c.code)}`);
}

export function vibeBankHreflang(origin: string = SITE_ORIGIN): string {
  return [
    ...VIBE_BANK_COPY.map((c) => `<link rel="alternate" hreflang="${c.lang}" href="${origin}${vibeBankPath(c.code)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${origin}${vibeBankPath(VIBE_BANK_X_DEFAULT)}" />`,
  ].join("\n    ");
}

/** Arquivo de saída: a Cloudflare serve `/es/vibe-bank` a partir de `es/vibe-bank.html`. */
export function vibeBankFile(c: VibeBankCopy): string {
  return `${vibeBankPath(c.code).slice(1)}.html`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#050507;color:#f2f2f2;font:16px/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}
a{color:#b18cff;text-decoration:none}a:hover{text-decoration:underline}
header,main,footer{max-width:64rem;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:18px;padding-bottom:18px}
.brand{display:flex;align-items:center;gap:10px;color:#f2f2f2;font-weight:700;letter-spacing:.02em}
.brand img{width:36px;height:36px;border-radius:10px}
.hero{display:grid;gap:24px;align-items:center;grid-template-columns:1fr;padding:24px 0 8px}
@media(min-width:860px){.hero{grid-template-columns:1.1fr .9fr}}
.hero img{width:100%;height:auto;max-width:440px;justify-self:center}
.eyebrow{display:inline-block;padding:4px 12px;border:1px solid #3b2a66;border-radius:999px;color:#c9b3ff;font-size:13px}
h1{font-size:clamp(30px,5vw,50px);line-height:1.12;margin:14px 0 14px;letter-spacing:-.02em}
h2{font-size:24px;margin:48px 0 14px}
.lead{font-size:18px;color:#b4b4bd;max-width:40rem}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.btn{display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(90deg,#3b5bff,#8b3dff);color:#fff;font-weight:600}
.btn.ghost{background:transparent;border:1px solid #33333d;color:#e5e5ea}
.btn:hover{text-decoration:none;filter:brightness(1.1)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.card{border:1px solid #23232b;border-radius:16px;padding:18px;background:#0e0e13}
.card h3{margin:0 0 6px;font-size:17px}
.card p{margin:0;color:#a1a1aa}
ol.steps{padding-inline-start:22px}ol.steps li{margin:8px 0;color:#d4d4d8}
dt{font-weight:600;margin-top:18px}dd{margin:4px 0 0;color:#a1a1aa}
.notice{margin-top:40px;padding:14px 16px;border:1px solid #23232b;border-radius:12px;background:#0b0b10;color:#a1a1aa;font-size:14px}
footer{border-top:1px solid #1e1e25;margin-top:40px;padding-top:24px;padding-bottom:40px;font-size:14px}
.langs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 20px}
.small{font-size:12px;color:#71717a}
`.trim();

function langSwitcher(origin: string, current: string): string {
  return VIBE_BANK_COPY.map((c) =>
    c.lang === current
      ? `<strong lang="${c.lang}">${esc(c.label)}</strong>`
      : `<a lang="${c.lang}" hreflang="${c.lang}" href="${origin}${vibeBankPath(c.code)}">${esc(c.label)}</a>`,
  ).join("");
}

export function vibeBankJsonLd(c: VibeBankCopy, origin: string = SITE_ORIGIN): unknown[] {
  const url = `${origin}${vibeBankPath(c.code)}`;
  const title = clampText(c.title, TITLE_MAX);
  const description = clampText(c.description, DESCRIPTION_MAX);
  const orgId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;
  const appId = `${origin}${VIBE_BANK.landingPath}#app`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": orgId,
      name: BRAND.company,
      url: `${origin}/`,
      logo: `${origin}/pwa-any-512x512.png`,
      sameAs: ["https://x.com/KUBOPROTOCOL", "https://github.com/kuboprotocol"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId,
      name: APP_NAME,
      url: `${origin}/`,
      publisher: { "@id": orgId },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: title,
      description,
      inLanguage: c.lang,
      isPartOf: { "@id": websiteId },
      about: { "@id": appId },
      primaryImageOfPage: `${origin}${VIBE_BANK.ogImage}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: APP_NAME, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: VIBE_BANK.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": appId,
      name: VIBE_BANK.name,
      alternateName: ["Vibe Bank", "Vertal Bank", "VERTAL VIBE BANK"],
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "Digital account",
      operatingSystem: "Web, Android, iOS",
      url,
      image: `${origin}${VIBE_BANK.logoPng}`,
      description,
      inLanguage: c.lang,
      isPartOf: { "@type": "SoftwareApplication", name: APP_NAME, url: `${origin}/` },
      publisher: { "@id": orgId },
      featureList: c.features.map(([t]) => t),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: c.faq[3][1] },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: c.lang,
      mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}

export function renderVibeBankPage(c: VibeBankCopy, origin: string = SITE_ORIGIN): string {
  const title = clampText(c.title, TITLE_MAX);
  const description = clampText(c.description, DESCRIPTION_MAX);
  const url = `${origin}${vibeBankPath(c.code)}`;
  const signup = `${origin}/auth?redirect=${encodeURIComponent(VIBE_BANK.appPath)}`;
  const og = `${origin}${VIBE_BANK.ogImage}`;
  const { width, height } = VIBE_BANK.logoSize;
  return `<!doctype html>
<html lang="${c.lang}"${c.dir ? ` dir="${c.dir}"` : ""}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050507" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="keywords" content="${esc(c.keywords)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    ${vibeBankHreflang(origin)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(APP_NAME)}" />
    <meta property="og:locale" content="${c.ogLocale}" />
${VIBE_BANK_COPY.filter((o) => o.code !== c.code).map((o) => `    <meta property="og:locale:alternate" content="${o.ogLocale}" />`).join("\n")}
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${og}" />
    <meta property="og:image:width" content="${VIBE_BANK.ogImageSize.width}" />
    <meta property="og:image:height" content="${VIBE_BANK.ogImageSize.height}" />
    <meta property="og:image:alt" content="${esc(VIBE_BANK.name)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@KUBOPROTOCOL" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${og}" />
    <link rel="icon" type="image/png" href="${VIBE_BANK.icon}" />
    <link rel="apple-touch-icon" href="${VIBE_BANK.appleTouchIcon}" />
    <link rel="preload" as="image" href="${VIBE_BANK.logo}" type="image/webp" />
    ${vibeBankJsonLd(c, origin).map(jsonLd).join("\n    ")}
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <a class="brand" href="${url}"><img src="${VIBE_BANK.iconSmall}" alt="" width="36" height="36" />${esc(VIBE_BANK.wordmark)}</a>
      <a href="${origin}/auth">${esc(c.login)}</a>
    </header>
    <main>
      <section class="hero">
        <div>
          <span class="eyebrow">${esc(c.eyebrow)}</span>
          <h1>${esc(c.h1)}</h1>
          <p class="lead">${esc(c.lead)}</p>
          <div class="actions">
            <a class="btn" href="${signup}">${esc(c.cta)}</a>
            <a class="btn ghost" href="${origin}/auth">${esc(c.login)}</a>
          </div>
        </div>
        <picture>
          <source srcset="${VIBE_BANK.logo}" type="image/webp" />
          <img src="${VIBE_BANK.logoPng}" alt="${esc(VIBE_BANK.name)}" width="${width}" height="${height}" fetchpriority="high" />
        </picture>
      </section>
      <h2>${esc(c.featuresTitle)}</h2>
      <div class="grid">${c.features.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
      <h2>${esc(c.howTitle)}</h2>
      <ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="actions"><a class="btn" href="${signup}">${esc(c.cta)}</a></div>
      <h2>${esc(c.faqTitle)}</h2>
      <dl>${c.faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl>
      <p class="notice" role="note">${esc(c.disclaimer)}</p>
    </main>
    <footer>
      <div>${esc(c.languages)}</div>
      <nav class="langs" aria-label="${esc(c.languages)}">${langSwitcher(origin, c.lang)}</nav>
      <p class="small">© ${BRAND.company} · <a href="${origin}/">${esc(APP_NAME)}</a> · <a href="${origin}/terms">Terms</a> · <a href="${origin}/privacy">Privacy</a></p>
    </footer>
  </body>
</html>
`;
}

/** Todas as landings, indexadas pelo arquivo de saída. */
export function renderVibeBankPages(origin: string = SITE_ORIGIN): Map<string, string> {
  return new Map(VIBE_BANK_COPY.map((c) => [vibeBankFile(c), renderVibeBankPage(c, origin)]));
}
