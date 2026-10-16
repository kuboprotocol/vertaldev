/**
 * Páginas de SEO traduzidas, geradas no build a partir de
 * `src/config/seoLocales.ts`:
 *
 *   /<código>                      → <código>.html (home do idioma)
 *   /<código>/alternativas         → <código>/alternativas.html
 *   /<código>/alternativas/<slug>  → <código>/alternativas/<slug>.html
 *
 * São páginas estáticas e leves (sem o bundle do React): o conteúdo inteiro
 * está no HTML, com `hreflang` ligando todas as versões, e os botões levam
 * ao app em `/auth`. O português do Brasil continua na raiz.
 */
import { APP_NAME, BRAND, SITE_ORIGIN } from "../src/config/brand";
import { ALTERNATIVES, type Alternative } from "../src/config/alternatives";
import { ROOT_LOCALE } from "../src/config/locales";
import { SEO_LOCALES, type LocaleSeo } from "../src/config/seoLocales";
import { DESCRIPTION_MAX, TITLE_MAX, clampText } from "../src/config/seo";

/** Ferramentas citadas nos títulos dos índices ({names}). */
const TOP_NAMES = "Lovable, Replit, Cursor, Vercel";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

function fill(text: string, name = ""): string {
  return text.split("{app}").join(APP_NAME).split("{name}").join(name).split("{names}").join(TOP_NAMES);
}

/** Chaves das páginas traduzidas: "/", "/alternativas" e "/alternativas/<slug>". */
export function localizedKeys(): string[] {
  return ["/", "/alternativas", ...ALTERNATIVES.map((a) => `/alternativas/${a.slug}`)];
}

export function localizedPath(code: string, key: string): string {
  return key === "/" ? `/${code}` : `/${code}${key}`;
}

/** Arquivo de saída: a Cloudflare serve `/es/alternativas` a partir de `es/alternativas.html`. */
export function localizedFile(code: string, key: string): string {
  return `${localizedPath(code, key).slice(1)}.html`;
}

/** `<link rel="alternate" hreflang>` de uma página em todos os idiomas. */
export function hreflangLinks(origin: string, key: string): string {
  const root = `${origin}${key}`;
  const links = [
    `<link rel="alternate" hreflang="${ROOT_LOCALE}" href="${root}" />`,
    ...SEO_LOCALES.map(
      (l) => `<link rel="alternate" hreflang="${l.lang}" href="${origin}${localizedPath(l.code, key)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${root}" />`,
  ];
  return links.join("\n    ");
}

function altSummary(l: LocaleSeo, alt: Alternative): string {
  if (alt.category === "concept") return l.vibeSummary;
  return fill(l[alt.category], alt.name);
}

function altHeading(l: LocaleSeo, alt: Alternative): string {
  if (alt.category === "concept") return fill(l.vibeTitle);
  return `${fill(l.altTitle, alt.name)}: ${APP_NAME} vs ${alt.name}`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#18191d;color:#f2f2f2;font:16px/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}
a{color:#d5a329;text-decoration:none}a:hover{text-decoration:underline}
header,main,footer{max-width:60rem;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:20px;padding-bottom:20px}
.brand{display:flex;align-items:center;gap:10px;color:#f2f2f2;font-weight:600}
.brand img{width:32px;height:32px;border-radius:8px}
main{padding-bottom:48px}
h1{font-size:clamp(28px,5vw,48px);line-height:1.15;margin:32px 0 16px;letter-spacing:-.02em}
h2{font-size:22px;margin:40px 0 12px}
.lead{font-size:18px;color:#a1a1aa;max-width:44rem}
.muted{color:#a1a1aa}
.btn{display:inline-block;margin-top:24px;padding:12px 22px;border-radius:12px;background:#d5a329;color:#18191d;font-weight:600}
.btn:hover{text-decoration:none;filter:brightness(1.08)}
ul.check{list-style:none;padding:0}
ul.check li{padding-inline-start:28px;position:relative;margin:8px 0}
ul.check li::before{content:"✓";position:absolute;inset-inline-start:0;color:#d5a329;font-weight:700}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{display:block;border:1px solid #2e2f35;border-radius:16px;padding:16px;background:#202126}
.card:hover{border-color:#d5a329;text-decoration:none}
.card strong{color:#f2f2f2;display:block}
dt{font-weight:600;margin-top:18px}dd{margin:4px 0 0;color:#a1a1aa}
footer{border-top:1px solid #2e2f35;padding-top:24px;padding-bottom:40px;font-size:14px}
.langs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 20px}
.small{font-size:12px;color:#71717a}
`.trim();

interface PageParts {
  l: LocaleSeo;
  key: string;
  title: string;
  description: string;
  body: string;
  ld: unknown[];
}

function langSwitcher(origin: string, key: string, current: string): string {
  const items = [
    { href: `${origin}${key}`, label: "Português (Brasil)", lang: ROOT_LOCALE },
    ...SEO_LOCALES.map((l) => ({ href: `${origin}${localizedPath(l.code, key)}`, label: l.label, lang: l.lang })),
  ];
  return items
    .map((i) =>
      i.lang === current
        ? `<strong lang="${i.lang}">${esc(i.label)}</strong>`
        : `<a lang="${i.lang}" hreflang="${i.lang}" href="${i.href}">${esc(i.label)}</a>`,
    )
    .join("");
}

function renderPage({ l, key, title, description, body, ld }: PageParts, origin: string): string {
  title = clampText(title, TITLE_MAX);
  description = clampText(description, DESCRIPTION_MAX);
  const url = `${origin}${localizedPath(l.code, key)}`;
  const home = `${origin}${localizedPath(l.code, "/")}`;
  return `<!doctype html>
<html lang="${l.lang}"${l.dir ? ` dir="${l.dir}"` : ""}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#18191d" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    ${hreflangLinks(origin, key)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(APP_NAME)}" />
    <meta property="og:locale" content="${l.ogLocale}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${origin}/pwa-512x512.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    ${ld.map(jsonLd).join("\n    ")}
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <a class="brand" href="${home}"><img src="/pwa-192x192.png" alt="" width="32" height="32" />${esc(APP_NAME)}</a>
      <a href="${origin}${localizedPath(l.code, "/alternativas")}">${esc(l.alternatives)}</a>
    </header>
    <main>
${body}
    </main>
    <footer>
      <div>${esc(l.languages)}</div>
      <nav class="langs" aria-label="${esc(l.languages)}">${langSwitcher(origin, key, l.lang)}</nav>
      <p class="small">${esc(fill(l.notice))}</p>
      <p class="small">© ${BRAND.company} · <a href="${origin}/">${BRAND.domain}</a></p>
    </footer>
  </body>
</html>
`;
}

function breadcrumb(items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  };
}

function webPage(l: LocaleSeo, url: string, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url,
    name,
    description,
    inLanguage: l.lang,
    isPartOf: { "@type": "WebSite", name: APP_NAME, url: `${SITE_ORIGIN}/` },
  };
}

const checkList = (items: string[]) =>
  `<ul class="check">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

function cards(l: LocaleSeo, origin: string, exclude?: string): string {
  return `<div class="grid">${ALTERNATIVES.filter((a) => a.slug !== exclude)
    .map(
      (a) =>
        `<a class="card" href="${origin}${localizedPath(l.code, `/alternativas/${a.slug}`)}"><strong>${esc(
          a.category === "concept" ? fill(l.vibeTitle) : `${APP_NAME} vs ${a.name}`,
        )}</strong><span class="muted">${esc(altSummary(l, a))}</span></a>`,
    )
    .join("")}</div>`;
}

function homePage(l: LocaleSeo, origin: string): PageParts {
  const title = fill(l.homeTitle);
  const description = fill(l.homeDesc);
  const url = `${origin}${localizedPath(l.code, "/")}`;
  const body = `<h1>${esc(fill(l.homeH1))}</h1>
<p class="lead">${esc(fill(l.homeSub))}</p>
<a class="btn" href="${origin}/auth">${esc(l.cta)}</a>
<h2>${esc(fill(l.whyTitle))}</h2>
${checkList(l.why)}
<h2>${esc(fill(l.vibeTitle))}</h2>
<p class="muted">${esc(l.vibeSummary)}</p>
<h2>${esc(fill(l.altIndexH1))}</h2>
${cards(l, origin)}`;
  return {
    l, key: "/", title, description, body,
    ld: [
      webPage(l, url, title, description),
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: APP_NAME,
        url: `${SITE_ORIGIN}/`,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web, Windows, macOS, Linux, Android, iOS",
        description,
        inLanguage: l.lang,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

function indexPage(l: LocaleSeo, origin: string): PageParts {
  const title = fill(l.altIndexTitle);
  const description = fill(l.altIndexDesc);
  const url = `${origin}${localizedPath(l.code, "/alternativas")}`;
  const body = `<h1>${esc(fill(l.altIndexH1))}</h1>
<p class="lead">${esc(description)}</p>
${cards(l, origin)}
<a class="btn" href="${origin}/auth">${esc(l.cta)}</a>`;
  return {
    l, key: "/alternativas", title, description, body,
    ld: [
      webPage(l, url, title, description),
      breadcrumb([[APP_NAME, `${origin}${localizedPath(l.code, "/")}`], [l.alternatives, url]]),
    ],
  };
}

function alternativePage(l: LocaleSeo, alt: Alternative, origin: string): PageParts {
  const key = `/alternativas/${alt.slug}`;
  const url = `${origin}${localizedPath(l.code, key)}`;
  const heading = altHeading(l, alt);
  const isConcept = alt.category === "concept";
  const title = isConcept ? `${fill(l.vibeTitle)} — ${APP_NAME}` : `${fill(l.altTitle, alt.name)} — ${APP_NAME} vs ${alt.name}`;
  const description = isConcept ? `${l.vibeSummary} ${fill(l.homeDesc)}` : fill(l.altDesc, alt.name);
  const faq: [string, string][] = [
    [isConcept ? fill(l.whatIs, alt.name) : fill(l.faq[0], alt.name), isConcept ? l.vibeSummary : fill(l.faq[1], alt.name)],
    [fill(l.faq[2]), fill(l.faq[3])],
    [fill(l.faq[4]), fill(l.faq[5])],
  ];
  const body = `<h1>${esc(heading)}</h1>
${alt.aliases?.length ? `<p class="muted">${esc(alt.aliases.join(" · "))}</p>` : ""}
<h2>${esc(fill(l.whatIs, alt.name))}</h2>
<p class="muted">${esc(altSummary(l, alt))}</p>
<h2>${esc(fill(l.whyTitle))}</h2>
${checkList(l.why)}
<a class="btn" href="${origin}/auth">${esc(l.cta)}</a>
<h2>FAQ</h2>
<dl>${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl>
<h2>${esc(l.others)}</h2>
${cards(l, origin, alt.slug)}`;
  return {
    l, key, title, description, body,
    ld: [
      webPage(l, url, title, description),
      breadcrumb([
        [APP_NAME, `${origin}${localizedPath(l.code, "/")}`],
        [l.alternatives, `${origin}${localizedPath(l.code, "/alternativas")}`],
        [heading, url],
      ]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        inLanguage: l.lang,
        mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
}

/** Todas as páginas traduzidas, indexadas pelo arquivo de saída. */
export function renderLocalizedPages(origin: string = SITE_ORIGIN): Map<string, string> {
  const pages = new Map<string, string>();
  for (const l of SEO_LOCALES) {
    const parts = [homePage(l, origin), indexPage(l, origin), ...ALTERNATIVES.map((a) => alternativePage(l, a, origin))];
    for (const p of parts) pages.set(localizedFile(l.code, p.key), renderPage(p, origin));
  }
  return pages;
}

/** URLs traduzidas para o sitemap. */
export function localizedUrls(origin: string = SITE_ORIGIN): string[] {
  return SEO_LOCALES.flatMap((l) => localizedKeys().map((k) => `${origin}${localizedPath(l.code, k)}`));
}
