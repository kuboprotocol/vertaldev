/**
 * Páginas de integração traduzidas (21 idiomas) + sitemaps por idioma.
 *
 *   /<código>/<segmento>          → <código>/<segmento>.html          (índice)
 *   /<código>/<segmento>/<slug>   → <código>/<segmento>/<slug>.html   (um por conector)
 *
 * Páginas estáticas e leves (sem o bundle do React), como as de `seoLocales.ts`:
 * o conteúdo inteiro está no HTML, com `lang`, `dir="rtl"` (ar, ur, fa), hreflang de
 * todas as versões (pt-BR = x-default) e botões que levam ao app.
 * Textos: `src/config/integrations/i18n/<código>.json`, lidos do disco no build;
 * chave faltando cai no inglês e depois no pt-BR (`makeT`).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, SITE_ORIGIN } from "../src/config/brand";
import { DESCRIPTION_MAX, TITLE_MAX } from "../src/config/seo";
import { LOCALE_CODES } from "../src/config/locales";
import { INTEGRATIONS, findIntegration, integrationGroups } from "../src/config/integrations";
import {
  integrationSourceStrings,
  localizeIntegration,
  makeT,
  type Dict,
  type LocalizedIntegration,
} from "../src/config/integrations/i18n";
import {
  ALL_INTEGRATION_LOCALES,
  INTEGRATION_LOCALES,
  ROOT_INTEGRATION_LOCALE,
  integrationsHubPath,
  type IntegrationLocale,
} from "../src/config/integrations/locales";

const I18N_DIR = join(process.cwd(), "src", "config", "integrations", "i18n");

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlEsc = (v: string) => esc(v).replace(/'/g, "&apos;");
const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/** Dicionário de um idioma (vazio se o arquivo ainda não existe). */
export function loadDict(code: string, dir: string = I18N_DIR): Dict {
  const file = join(dir, `${code}.json`);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Dict;
}

export function integrationPagePath(l: IntegrationLocale, slug?: string): string {
  const hub = integrationsHubPath(l);
  return slug ? `${hub}/${slug}` : hub;
}

/** hreflang de uma página (índice quando slug vazio) em todos os idiomas, com x-default = pt-BR. */
export function integrationHreflang(origin: string, slug?: string): string {
  return [
    ...ALL_INTEGRATION_LOCALES.map(
      (l) => `<link rel="alternate" hreflang="${l.lang}" href="${origin}${integrationPagePath(l, slug)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${origin}${integrationPagePath(ROOT_INTEGRATION_LOCALE, slug)}" />`,
  ].join("\n    ");
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#18191d;color:#f2f2f2;font:16px/1.7 Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Arabic","Noto Nastaliq Urdu","Noto Sans Devanagari","Noto Sans Bengali","Noto Sans Gurmukhi","Noto Sans Tamil","Noto Sans Telugu","Noto Sans CJK SC","Noto Sans JP","Noto Sans KR",sans-serif}
[dir=rtl] body{line-height:1.9}
a{color:#d5a329;text-decoration:none}a:hover{text-decoration:underline}
header,main,footer{max-width:60rem;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:20px;padding-bottom:20px}
.brand{display:flex;align-items:center;gap:10px;color:#f2f2f2;font-weight:600}
.brand img{width:32px;height:32px;border-radius:8px}
main{padding-bottom:48px}
.crumbs{font-size:14px;color:#a1a1aa}
.logo{width:64px;height:64px;border-radius:14px;object-fit:contain;background:#ffffff0d;margin-top:24px}
h1{font-size:clamp(28px,5vw,46px);line-height:1.2;margin:20px 0 16px;letter-spacing:-.01em}
h2{font-size:22px;margin:40px 0 12px}
h3{font-size:17px;margin:24px 0 8px}
.lead{font-size:18px;color:#a1a1aa;max-width:46rem}
.muted{color:#a1a1aa}
.btn{display:inline-block;margin-top:20px;padding:12px 22px;border-radius:12px;background:#d5a329;color:#18191d;font-weight:600}
.btn:hover{text-decoration:none;filter:brightness(1.08)}
ul.check{list-style:none;padding:0}
ul.check li{padding-inline-start:28px;position:relative;margin:8px 0}
ul.check li::before{content:"✓";position:absolute;inset-inline-start:0;color:#d5a329;font-weight:700}
ol{padding-inline-start:22px}ol li{margin:10px 0}
.box{border:1px solid #2e2f35;border-radius:16px;padding:8px 20px 16px;background:#202126;margin-top:32px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{display:flex;gap:12px;align-items:flex-start;border:1px solid #2e2f35;border-radius:16px;padding:14px;background:#202126}
.card:hover{border-color:#d5a329;text-decoration:none}
.card img,.card .ph{width:36px;height:36px;border-radius:9px;flex:none;object-fit:contain;background:#ffffff0d}
.card .ph{display:flex;align-items:center;justify-content:center;color:#d5a329;font-weight:700}
.card strong{color:#f2f2f2;display:block}
.card span{color:#a1a1aa;font-size:14px}
dt{font-weight:600;margin-top:18px}dd{margin:4px 0 0;color:#a1a1aa}
footer{border-top:1px solid #2e2f35;padding-top:24px;padding-bottom:40px;font-size:14px}
.langs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 20px}
.small{font-size:12px;color:#71717a}
`.trim();

function langSwitcher(origin: string, current: IntegrationLocale, slug?: string): string {
  return ALL_INTEGRATION_LOCALES.map((l) =>
    l.code === current.code
      ? `<strong lang="${l.lang}">${esc(l.label)}</strong>`
      : `<a lang="${l.lang}" hreflang="${l.lang}" href="${origin}${integrationPagePath(l, slug)}">${esc(l.label)}</a>`,
  ).join("");
}

function homeFor(l: IntegrationLocale): string {
  return (LOCALE_CODES as readonly string[]).includes(l.code) ? `/${l.code}` : "/";
}

interface Shell {
  l: IntegrationLocale;
  slug?: string;
  title: string;
  description: string;
  keywords: string;
  image: string | null;
  imageAlt: string;
  body: string;
  ld: unknown[];
  T: (k: string, v?: Record<string, string | number>) => string;
}

function renderShell(s: Shell, origin: string): string {
  const url = `${origin}${integrationPagePath(s.l, s.slug)}`;
  const image = s.image ?? `${origin}/og-image.png`;
  return `<!doctype html>
<html lang="${s.l.lang}"${s.l.dir ? ` dir="${s.l.dir}"` : ""}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#18191d" />
    <title>${esc(s.title)}</title>
    <meta name="description" content="${esc(s.description)}" />
    <meta name="keywords" content="${esc(s.keywords)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    ${integrationHreflang(origin, s.slug)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(APP_NAME)}" />
    <meta property="og:locale" content="${s.l.ogLocale}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(s.title)}" />
    <meta property="og:description" content="${esc(s.description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:alt" content="${esc(s.imageAlt)}" />
    <meta name="twitter:card" content="${s.image ? "summary" : "summary_large_image"}" />
    <meta name="twitter:title" content="${esc(s.title)}" />
    <meta name="twitter:description" content="${esc(s.description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    ${s.ld.map(jsonLd).join("\n    ")}
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <a class="brand" href="${homeFor(s.l)}"><img src="/apple-touch-icon.png" alt="" width="32" height="32" />${esc(APP_NAME)}</a>
      <a href="${integrationPagePath(s.l)}">${esc(s.T("hub"))}</a>
    </header>
    <main>
${s.body}
    </main>
    <footer>
      <p class="muted">${esc(s.T("languages"))}</p>
      <nav class="langs" aria-label="${esc(s.T("languages"))}">${langSwitcher(origin, s.l, s.slug)}</nav>
      <p class="small">${esc(s.T("trademark"))}</p>
    </footer>
  </body>
</html>
`;
}

function breadcrumbLd(origin: string, items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], idx) => ({ "@type": "ListItem", position: idx + 1, name, item: `${origin}${path}` })),
  };
}

function logoTag(name: string, logo: string | undefined, alt: string, cls: string): string {
  return logo ? `<img class="${cls}" src="${esc(logo)}" alt="${esc(alt)}" width="64" height="64" loading="lazy" />` : `<span class="ph">${esc(name.slice(0, 1))}</span>`;
}

function itemsList(items: { name: string; description: string }[]): string {
  return `<ul class="check">${items.map((a) => `<li><strong>${esc(a.name)}</strong> — <span class="muted">${esc(a.description)}</span></li>`).join("")}</ul>`;
}

function detailBody(l: IntegrationLocale, x: LocalizedIntegration, T: Shell["T"], names: Map<string, LocalizedIntegration>): string {
  const n = { name: x.name };
  const related = x.related
    .map((s) => names.get(s))
    .filter((r): r is LocalizedIntegration => Boolean(r))
    .map((r) => `<a class="card" href="${integrationPagePath(l, r.slug)}">${logoTag(r.name, r.logoUrl, T("logoAlt", { name: r.name }), "")}<strong>${esc(T("relatedItem", { name: r.name }))}</strong></a>`)
    .join("");
  return `<nav class="crumbs" aria-label="breadcrumb"><a href="${homeFor(l)}">${esc(APP_NAME)}</a> › <a href="${integrationPagePath(l)}">${esc(T("hub"))}</a> › ${esc(x.name)}</nav>
${x.logoUrl ? `<img class="logo" src="${esc(x.logoUrl)}" alt="${esc(T("logoAlt", n))}" width="64" height="64" />` : ""}
<h1>${esc(x.heading)}</h1>
<p class="lead">${esc(x.summary)} ${esc(x.lead)}</p>
${x.aliases.length ? `<p class="muted">${esc(T("alsoSearched"))} ${esc(x.aliases.join(", "))}</p>` : ""}
<a class="btn" href="${esc(x.signupPath)}">${esc(T("ctaConnect", n))}</a>
<h2>${esc(T("hWhat", n))}</h2>
<p class="muted">${esc(x.about)}</p>
<h2>${esc(T("hDoes", n))}</h2>
<p class="muted">${esc(x.details)}</p>
<ul class="check">${x.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
${x.actions.length ? `<h3>${esc(T("hActions", n))}</h3>${itemsList(x.actions)}` : ""}
${x.triggers.length ? `<h3>${esc(T("hTriggers", n))}</h3>${itemsList(x.triggers)}` : ""}
<section class="box">
<h2>${esc(T("hConnect", n))}</h2>
<p class="muted">${esc(x.connectSummary)}</p>
<ol>${x.steps.map((s) => `<li><strong>${esc(s.title)}</strong> — <span class="muted">${esc(s.description)}</span></li>`).join("")}</ol>
</section>
<h2>${esc(T("hUses", n))}</h2>
<ul class="check">${x.uses.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
<a class="btn" href="${esc(x.signupPath)}">${esc(T("ctaSignup", n))}</a>
<h2>${esc(T("hFaq", n))}</h2>
<dl>${x.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>${esc(T("hRelated"))}</h2>
<div class="grid">${related}</div>
<p><a href="${integrationPagePath(l)}">${esc(T("seeAll", { n: INTEGRATIONS.length }))}</a></p>
${x.officialUrl ? `<p class="muted">${esc(T("official"))} <a href="${esc(x.officialUrl)}" rel="nofollow noopener noreferrer">${esc(x.name)}</a></p>` : ""}`;
}

/** Monta os textos localizados de todos os conectores num idioma. */
export function localizeAll(l: IntegrationLocale, dict: Dict, en: Dict, src: Dict = integrationSourceStrings()) {
  const tr = makeT(dict, en, src);
  const T = (k: string, v: Record<string, string | number> = {}) =>
    tr(`t.${k}`).replace(/\{(\w+)\}/g, (m, key: string) => (key in v ? String(v[key]) : key === "app" ? APP_NAME : m));
  const items = INTEGRATIONS.map((i) => localizeIntegration(i, l, tr, { title: TITLE_MAX, description: DESCRIPTION_MAX }));
  return { tr, T, items };
}

/** HTML de todas as páginas traduzidas, indexado pelo arquivo de saída. */
export function renderIntegrationI18nPages(origin: string = SITE_ORIGIN, dir: string = I18N_DIR): Map<string, string> {
  const pages = new Map<string, string>();
  const src = integrationSourceStrings();
  const en = loadDict("en", dir);
  for (const l of INTEGRATION_LOCALES) {
    const { tr, T, items } = localizeAll(l, loadDict(l.code, dir), en, src);
    const byName = new Map(items.map((x) => [x.slug, x]));
    const hubPath = integrationPagePath(l);
    const home: [string, string] = [APP_NAME, homeFor(l)];

    for (const x of items) {
      const path = integrationPagePath(l, x.slug);
      const logo = x.logoUrl ? `${origin}${x.logoUrl}` : null;
      const ld = [
        breadcrumbLd(origin, [home, [T("hub"), hubPath], [x.name, path]]),
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: x.title,
          headline: x.heading,
          description: x.description,
          url: `${origin}${path}`,
          inLanguage: l.lang,
          isPartOf: { "@type": "WebSite", name: APP_NAME, url: `${origin}/` },
          ...(logo ? { primaryImageOfPage: { "@type": "ImageObject", url: logo } } : {}),
          about: { "@type": "Thing", name: x.name, ...(x.aliases.length ? { alternateName: x.aliases } : {}) },
          mainEntity: {
            "@type": "SoftwareApplication",
            name: APP_NAME,
            url: `${origin}/`,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList: [...x.actions, ...x.triggers].map((a) => `${x.name}: ${a.name}`).slice(0, 30),
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: x.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
      ];
      pages.set(
        `${path.slice(1)}.html`,
        renderShell({ l, slug: x.slug, title: x.title, description: x.description, keywords: x.keywords, image: logo, imageAlt: T("logoAlt", { name: x.name }), body: detailBody(l, x, T, byName), ld, T }, origin),
      );
    }

    const others = Math.max(INTEGRATIONS.length - 6, 0);
    const hubTitle = [T("hubTitle", { n: INTEGRATIONS.length })].find((t) => t.length <= TITLE_MAX) ?? `${T("hub")} | ${APP_NAME}`;
    const hubDesc = T("hubDesc", { n: others });
    const groups = integrationGroups()
      .map((g) => {
        const cards = g.items
          .map((i) => byName.get(i.slug)!)
          .map((x) => `<a class="card" href="${integrationPagePath(l, x.slug)}">${logoTag(x.name, x.logoUrl, T("logoAlt", { name: x.name }), "")}<div><strong>${esc(T("relatedItem", { name: x.name }))}</strong><span>${esc(x.about)}</span></div></a>`)
          .join("");
        return `<h2>${esc(tr(`cat.${g.id}`))}</h2><div class="grid">${cards}</div>`;
      })
      .join("\n");
    const hubBody = `<nav class="crumbs" aria-label="breadcrumb"><a href="${homeFor(l)}">${esc(APP_NAME)}</a> › ${esc(T("hub"))}</nav>
<h1>${esc(T("hubHeading"))}</h1>
<p class="lead">${esc(hubDesc)} ${esc(T("hubIntro"))}</p>
${groups}
<a class="btn" href="/auth">${esc(T("ctaStart"))}</a>`;
    const hubLd = [
      breadcrumbLd(origin, [home, [T("hub"), hubPath]]),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: T("hubHeading"),
        description: hubDesc,
        url: `${origin}${hubPath}`,
        inLanguage: l.lang,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((x, idx) => ({ "@type": "ListItem", position: idx + 1, name: x.heading, url: `${origin}${integrationPagePath(l, x.slug)}` })),
        },
      },
    ];
    pages.set(
      `${hubPath.slice(1)}.html`,
      renderShell({ l, title: hubTitle, description: hubDesc, keywords: `${T("hub")}, ${APP_NAME}, API`, image: null, imageAlt: T("hubHeading"), body: hubBody, ld: hubLd, T }, origin),
    );
  }
  void findIntegration;
  return pages;
}

// ---------- sitemaps por idioma ----------

/** Sitemaps de integração por idioma: nome do arquivo → XML (com alternates hreflang). */
export function renderIntegrationSitemaps(origin: string = SITE_ORIGIN, lastmod: string = new Date().toISOString().slice(0, 10)): Map<string, string> {
  const out = new Map<string, string>();
  const slugs: (string | undefined)[] = [undefined, ...INTEGRATIONS.map((i) => i.slug)];
  for (const l of ALL_INTEGRATION_LOCALES) {
    const urls = slugs
      .map((slug) => {
        const alts = [
          ...ALL_INTEGRATION_LOCALES.map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${xmlEsc(`${origin}${integrationPagePath(a, slug)}`)}"/>`),
          `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(`${origin}${integrationPagePath(ROOT_INTEGRATION_LOCALE, slug)}`)}"/>`,
        ].join("");
        return `  <url><loc>${xmlEsc(`${origin}${integrationPagePath(l, slug)}`)}</loc><lastmod>${lastmod}</lastmod>${alts}</url>`;
      })
      .join("\n");
    out.set(
      integrationSitemapFile(l),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
    );
  }
  return out;
}

export function integrationSitemapFile(l: IntegrationLocale): string {
  return `sitemap-integrations-${l.code}.xml`;
}

/** Índice de sitemaps: o sitemap principal + um por idioma das integrações. */
export function renderSitemapIndex(origin: string = SITE_ORIGIN, lastmod: string = new Date().toISOString().slice(0, 10)): string {
  const files = ["sitemap.xml", ...ALL_INTEGRATION_LOCALES.map(integrationSitemapFile)];
  const items = files.map((f) => `  <sitemap><loc>${origin}/${f}</loc><lastmod>${lastmod}</lastmod></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}
