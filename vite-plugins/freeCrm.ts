/**
 * Vertal CRM grátis · landing e documentação em HTML estático, uma página por
 * idioma, geradas no build a partir de `src/config/freeCrm.ts`:
 *
 *   /crm-gratis                 → crm-gratis.html                 (pt-BR, raiz)
 *   /<código>/<slug>            → <código>/<slug>.html            (ex.: en/free-crm.html)
 *   /docs/vertal-crm            → docs/vertal-crm.html
 *   /<código>/docs/vertal-crm   → <código>/docs/vertal-crm.html
 *
 * Páginas leves, sem o bundle do React (Core Web Vitals): o conteúdo inteiro
 * está no HTML, com canonical, hreflang recíproco + x-default (inglês), Open
 * Graph/Twitter e JSON-LD (SoftwareApplication com preço 0, FAQPage,
 * BreadcrumbList; TechArticle na documentação). Sem aggregateRating: não há
 * avaliações reais publicadas.
 */
import { BRAND, SITE_ORIGIN } from "../src/config/brand";
import { DESCRIPTION_MAX, TITLE_MAX, clampText } from "../src/config/seo";
import {
  FREE_CRM_COSTS,
  FREE_CRM_LOCALES,
  FREE_CRM_SIGNUP_PATH,
  FREE_CRM_SITE,
  FREE_CRM_X_DEFAULT,
  cheapestPlanPrice,
  formatUsd,
  freeCrmDocsPath,
  freeCrmPath,
  paidPlans,
  type FreeCrmCopy,
} from "../src/config/freeCrm";

type Kind = "landing" | "docs";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/** Números com dígitos latinos em todos os idiomas (a tabela de créditos também usa). */
const numLocale = (lang: string) => `${lang}-u-nu-latn`;

/** Troca {ai}, {activate}, {aiSync}, {plainSync} e {price}. */
export function fillCrm(text: string, c: FreeCrmCopy): string {
  return text
    .split("{ai}").join(String(FREE_CRM_COSTS.ai))
    .split("{activate}").join(String(FREE_CRM_COSTS.activate))
    .split("{aiSync}").join(String(FREE_CRM_COSTS.aiSync))
    .split("{plainSync}").join(String(FREE_CRM_COSTS.plainSync))
    .split("{price}").join(cheapestPlanPrice(numLocale(c.lang)));
}

export function pathFor(kind: Kind, c: FreeCrmCopy): string {
  return kind === "landing" ? freeCrmPath(c) : freeCrmDocsPath(c);
}

/** Arquivo de saída: a Cloudflare serve `/en/free-crm` a partir de `en/free-crm.html`. */
export function freeCrmFile(kind: Kind, c: FreeCrmCopy): string {
  return `${pathFor(kind, c).slice(1)}.html`;
}

const xDefault = () => FREE_CRM_LOCALES.find((c) => c.code === FREE_CRM_X_DEFAULT) ?? FREE_CRM_LOCALES[0];

/** Pares [hreflang, URL] de uma página em todos os idiomas + x-default. */
export function freeCrmAlternates(kind: Kind, origin: string = SITE_ORIGIN): [string, string][] {
  return [
    ...FREE_CRM_LOCALES.map((c) => [c.lang, `${origin}${pathFor(kind, c)}`] as [string, string]),
    ["x-default", `${origin}${pathFor(kind, xDefault())}`],
  ];
}

export function freeCrmHreflang(kind: Kind, origin: string = SITE_ORIGIN): string {
  return freeCrmAlternates(kind, origin)
    .map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${href}" />`)
    .join("\n    ");
}

/** Todas as URLs (landing + documentação) para o sitemap. */
export function freeCrmUrls(origin: string = SITE_ORIGIN): string[] {
  return (["landing", "docs"] as Kind[]).flatMap((k) => FREE_CRM_LOCALES.map((c) => `${origin}${pathFor(k, c)}`));
}

/** Entradas <url> do sitemap com <xhtml:link> de cada idioma (precisa do xmlns:xhtml no <urlset>). */
export function freeCrmSitemapEntries(origin: string = SITE_ORIGIN, lastmod: string): string {
  const out: string[] = [];
  for (const kind of ["landing", "docs"] as Kind[]) {
    const alts = freeCrmAlternates(kind, origin)
      .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}" />`)
      .join("\n");
    for (const c of FREE_CRM_LOCALES) {
      out.push(`  <url>\n    <loc>${origin}${pathFor(kind, c)}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alts}\n  </url>`);
    }
  }
  return out.join("\n");
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0b10;color:#f2f2f2;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Arabic","Noto Sans Devanagari","Noto Sans Thai","Noto Sans CJK SC",sans-serif}
a{color:#b18cff;text-decoration:none}a:hover{text-decoration:underline}
header,main,footer{max-width:64rem;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:18px;padding-bottom:18px}
.brand{display:flex;align-items:center;gap:10px;color:#f2f2f2;font-weight:700}
.brand img{width:32px;height:32px;border-radius:8px}
nav.crumbs{font-size:14px;color:#a1a1aa;margin-top:8px}
.badge{display:inline-block;margin-top:24px;padding:4px 12px;border:1px solid #3b2a66;border-radius:999px;color:#c9b3ff;font-size:13px}
h1{font-size:clamp(30px,5vw,50px);line-height:1.12;margin:14px 0;letter-spacing:-.02em}
h2{font-size:24px;margin:48px 0 14px}
h3{font-size:17px;margin:0 0 6px}
.lead{font-size:18px;color:#b4b4bd;max-width:44rem}
.muted{color:#a1a1aa}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.btn{display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(90deg,#3b5bff,#8b3dff);color:#fff;font-weight:600}
.btn.ghost{background:transparent;border:1px solid #33333d;color:#e5e5ea}
.btn:hover{text-decoration:none;filter:brightness(1.1)}
.note{margin-top:18px;padding:12px 14px;border:1px solid #23232b;border-radius:12px;background:#111118;color:#a1a1aa;font-size:14px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.card{border:1px solid #23232b;border-radius:16px;padding:18px;background:#111118}
.card p{margin:0;color:#a1a1aa}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:start;padding:12px 10px;border-bottom:1px solid #23232b;vertical-align:top}
th{color:#c9b3ff;font-weight:600}
td.n{white-space:nowrap;font-weight:700;text-align:end}
ol,ul{padding-inline-start:22px}li{margin:8px 0;color:#d4d4d8}
.toc{columns:2 16rem;font-size:15px}
dt{font-weight:600;margin-top:18px}dd{margin:4px 0 0;color:#a1a1aa}
footer{border-top:1px solid #1e1e25;margin-top:48px;padding-top:24px;padding-bottom:40px;font-size:14px}
.langs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 20px}
.small{font-size:12px;color:#71717a}
`.trim();

function langSwitcher(kind: Kind, origin: string, current: FreeCrmCopy): string {
  return FREE_CRM_LOCALES.map((c) =>
    c.code === current.code
      ? `<strong lang="${c.lang}">${esc(c.label)}</strong>`
      : `<a lang="${c.lang}" hreflang="${c.lang}" href="${origin}${pathFor(kind, c)}">${esc(c.label)}</a>`,
  ).join("");
}

function pricingTable(c: FreeCrmCopy): string {
  const rows: [string, string][] = [
    [c.rowFree, c.free],
    [c.rowAi, String(FREE_CRM_COSTS.ai)],
    [c.rowActivate, String(FREE_CRM_COSTS.activate)],
    [c.rowAiSync, String(FREE_CRM_COSTS.aiSync)],
    [c.rowPlainSync, String(FREE_CRM_COSTS.plainSync)],
  ];
  return `<div class="table-wrap"><table>
<thead><tr><th scope="col">${esc(c.colAction)}</th><th scope="col" style="text-align:end">${esc(c.colCredits)}</th></tr></thead>
<tbody>${rows.map(([a, n]) => `<tr><td>${esc(a)}</td><td class="n">${esc(n)}</td></tr>`).join("")}</tbody>
</table></div>`;
}

function plansTable(c: FreeCrmCopy, origin: string): string {
  const rows = paidPlans()
    .map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${esc(formatUsd(p.priceUsd, numLocale(c.lang)))}</td></tr>`)
    .join("");
  return `<div class="table-wrap"><table><tbody>${rows}</tbody></table></div>
<p><a href="${origin}/pricing">${esc(c.ctaPricing)} →</a></p>`;
}

const features = (c: FreeCrmCopy) =>
  `<div class="grid">${c.features.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>`;

const faqDl = (items: [string, string][], c: FreeCrmCopy) =>
  `<dl>${items.map(([q, a]) => `<dt>${esc(fillCrm(q, c))}</dt><dd>${esc(fillCrm(a, c))}</dd>`).join("")}</dl>`;

const faqLd = (items: [string, string][], c: FreeCrmCopy) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: c.lang,
  mainEntity: items.map(([q, a]) => ({
    "@type": "Question",
    name: fillCrm(q, c),
    acceptedAnswer: { "@type": "Answer", text: fillCrm(a, c) },
  })),
});

const breadcrumbLd = (items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

function softwareLd(c: FreeCrmCopy, origin: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Vertal CRM",
    url: `${origin}${freeCrmPath(c)}`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CRM",
    operatingSystem: "Web",
    inLanguage: c.lang,
    description,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    publisher: { "@type": "Organization", name: FREE_CRM_SITE, url: `${origin}/` },
  };
}

interface Page {
  kind: Kind;
  c: FreeCrmCopy;
  title: string;
  description: string;
  body: string;
  ld: unknown[];
}

function renderPage(p: Page, origin: string): string {
  const { kind, c } = p;
  const title = clampText(p.title, TITLE_MAX);
  const description = clampText(p.description, DESCRIPTION_MAX);
  const url = `${origin}${pathFor(kind, c)}`;
  const other: Kind = kind === "landing" ? "docs" : "landing";
  const otherLabel = kind === "landing" ? c.ctaDocs : c.backToLanding;
  return `<!doctype html>
<html lang="${c.lang}"${c.dir ? ` dir="${c.dir}"` : ""}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b0b10" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    ${freeCrmHreflang(kind, origin)}
    <meta property="og:type" content="${kind === "docs" ? "article" : "website"}" />
    <meta property="og:site_name" content="${esc(FREE_CRM_SITE)}" />
    <meta property="og:locale" content="${c.ogLocale}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${origin}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${origin}/og-image.png" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    ${p.ld.map(jsonLd).join("\n    ")}
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <a class="brand" href="${origin}/"><img src="/pwa-any-192x192.png" alt="" width="32" height="32" />${esc(FREE_CRM_SITE)}</a>
      <a href="${origin}${pathFor(other, c)}">${esc(otherLabel)}</a>
    </header>
    <main>
${p.body}
    </main>
    <footer>
      <div>${esc(c.languages)}</div>
      <nav class="langs" aria-label="${esc(c.languages)}">${langSwitcher(kind, origin, c)}</nav>
      <p class="small">${esc(c.credit)}</p>
      <p class="small">© ${BRAND.company} · <a href="${origin}/">${BRAND.domain}</a> · <a href="${origin}/pricing">${esc(c.ctaPricing)}</a> · <a href="${origin}/privacy">Privacy</a> · <a href="${origin}/terms">Terms</a></p>
    </footer>
  </body>
</html>
`;
}

function landingPage(c: FreeCrmCopy, origin: string): Page {
  const url = `${origin}${freeCrmPath(c)}`;
  const description = c.description;
  const body = `<span class="badge">${esc(c.badge)}</span>
<h1>${esc(c.h1)}</h1>
<p class="lead">${esc(c.lead)}</p>
<div class="actions">
  <a class="btn" href="${origin}${FREE_CRM_SIGNUP_PATH}">${esc(c.cta)}</a>
  <a class="btn ghost" href="${origin}${freeCrmDocsPath(c)}">${esc(c.ctaDocs)}</a>
</div>
<p class="note">${esc(c.rollout)}</p>
<h2>${esc(c.featuresTitle)}</h2>
${features(c)}
<h2>${esc(c.pricingTitle)}</h2>
<p class="muted">${esc(c.pricingIntro)}</p>
${pricingTable(c)}
<p class="note">${esc(fillCrm(c.pricingPlanNote, c))} <a href="${origin}/pricing">${esc(c.ctaPricing)} →</a></p>
<h2>${esc(c.dataTitle)}</h2>
<p class="muted">${esc(c.dataText)}</p>
<h2>${esc(c.connectTitle)}</h2>
<p class="muted">${esc(c.connectText)}</p>
<h2>${esc(c.faqTitle)}</h2>
${faqDl(c.faq, c)}
<div class="actions"><a class="btn" href="${origin}${FREE_CRM_SIGNUP_PATH}">${esc(c.cta)}</a></div>`;
  return {
    kind: "landing", c, title: c.title, description, body,
    ld: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url,
        name: c.title,
        description,
        inLanguage: c.lang,
        isPartOf: { "@type": "WebSite", name: FREE_CRM_SITE, url: `${origin}/` },
      },
      softwareLd(c, origin, description),
      faqLd(c.faq, c),
      breadcrumbLd([[FREE_CRM_SITE, `${origin}/`], [c.h1, url]]),
    ],
  };
}

function docsPage(c: FreeCrmCopy, origin: string): Page {
  const url = `${origin}${freeCrmDocsPath(c)}`;
  const sections: [string, string][] = [
    ["o-que-e", c.whatTitle],
    ["recursos", c.docsFeaturesTitle],
    ["como-usar", c.howTitle],
    ["creditos", c.docsPricingTitle],
    ["outros-crms", c.connectDocsTitle],
    ["vertal-fluxos", c.fluxosTitle],
    ["exportar", c.exportTitle],
    ["privacidade", c.privacyTitle],
    ["faq", c.docsFaqTitle],
  ];
  const h2 = (i: number) => `<h2 id="${sections[i][0]}">${esc(sections[i][1])}</h2>`;
  const li = (items: string[]) => items.map((t) => `<li>${esc(fillCrm(t, c))}</li>`).join("");
  const body = `<nav class="crumbs" aria-label="breadcrumb"><a href="${origin}/">${esc(FREE_CRM_SITE)}</a> › <a href="${origin}/docs">${esc(c.docsBreadcrumb)}</a> › Vertal CRM</nav>
<h1>${esc(c.docsH1)}</h1>
<p class="lead">${esc(c.docsIntro)}</p>
<div class="actions"><a class="btn" href="${origin}${FREE_CRM_SIGNUP_PATH}">${esc(c.cta)}</a><a class="btn ghost" href="${origin}${freeCrmPath(c)}">${esc(c.backToLanding)}</a></div>
<h2>${esc(c.tocTitle)}</h2>
<ol class="toc">${sections.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join("")}</ol>
${h2(0)}
<p class="muted">${esc(c.whatText)}</p>
<p class="note">${esc(c.rollout)}</p>
${h2(1)}
${features(c)}
${h2(2)}
<ol>${li(c.howSteps)}</ol>
${h2(3)}
<p class="muted">${esc(c.pricingIntro)}</p>
${pricingTable(c)}
<ul>${li(c.docsPricingNotes)}</ul>
<p class="muted">${esc(fillCrm(c.pricingPlanNote, c))}</p>
${plansTable(c, origin)}
${h2(4)}
<ol>${li(c.connectDocsSteps)}</ol>
<p class="note">${esc(c.comingSoon)}</p>
${h2(5)}
<p class="muted">${esc(c.fluxosText)}</p>
<ul>${li(c.fluxosSteps)}</ul>
${h2(6)}
<ul>${li(c.exportItems)}</ul>
${h2(7)}
<p class="muted">${esc(c.privacyText)}</p>
<p><a href="${origin}/privacy">Privacy →</a></p>
${h2(8)}
${faqDl(c.docsFaq, c)}
<div class="actions"><a class="btn" href="${origin}${FREE_CRM_SIGNUP_PATH}">${esc(c.cta)}</a></div>`;
  return {
    kind: "docs", c, title: c.docsTitle, description: c.docsDescription, body,
    ld: [
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: c.docsH1,
        description: c.docsDescription,
        url,
        inLanguage: c.lang,
        about: { "@type": "SoftwareApplication", name: "Vertal CRM", url: `${origin}${freeCrmPath(c)}` },
        publisher: { "@type": "Organization", name: FREE_CRM_SITE, url: `${origin}/` },
        isPartOf: { "@type": "WebSite", name: FREE_CRM_SITE, url: `${origin}/` },
      },
      faqLd(c.docsFaq, c),
      breadcrumbLd([[FREE_CRM_SITE, `${origin}/`], [c.docsBreadcrumb, `${origin}/docs`], ["Vertal CRM", url]]),
    ],
  };
}

/** Todas as páginas (landing + documentação, todos os idiomas), indexadas pelo arquivo de saída. */
export function renderFreeCrmPages(origin: string = SITE_ORIGIN): Map<string, string> {
  const pages = new Map<string, string>();
  for (const c of FREE_CRM_LOCALES) {
    pages.set(freeCrmFile("landing", c), renderPage(landingPage(c, origin), origin));
    pages.set(freeCrmFile("docs", c), renderPage(docsPage(c, origin), origin));
  }
  return pages;
}
