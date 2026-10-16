/**
 * Vite plugin: SEO a partir de `src/config/brand.ts` e `src/config/seo.ts`.
 *
 * - `index.html`: substitui `%SITE_ORIGIN%` (canonical, og:url, JSON-LD) pela
 *   origem canônica do site e aplica o título/descrição da home.
 * - build: gera `sitemap.xml` (páginas públicas + /alternativas/*) e
 *   `robots.txt` apontando para o sitemap.
 * - build: pré-renderiza cada página pública em `<rota>.html` com título,
 *   descrição, canonical e JSON-LD próprios. As páginas de comparação também
 *   levam o conteúdo no corpo, então buscadores e crawlers que não rodam
 *   JavaScript leem a página inteira. O React substitui esse conteúdo ao
 *   carregar. A Cloudflare serve `/alternativas/lovable` a partir de
 *   `alternativas/lovable.html` (html_handling padrão, sem redirect).
 *
 * Assim a troca de domínio (`BRAND.primaryDomainLive`) muda todo o SEO de uma vez.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { APP_NAME, SITE_ORIGIN } from "../src/config/brand";
import {
  ALTERNATIVES,
  CATEGORY_LABEL,
  VERTAL_FEATURES,
  alternativeFaq,
  type Alternative,
} from "../src/config/alternatives";
import { HOME_SEO, ROUTE_SEO, alternativeSeo, type RouteSeo } from "../src/config/seo";

/** Rotas públicas indexáveis (sem login). */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/alternativas",
  "/download",
  "/docs",
  "/support",
  "/anywhere",
  "/terms",
  "/privacy",
];

export function sitemapUrls(origin: string = SITE_ORIGIN): string[] {
  const paths = [
    ...PUBLIC_ROUTES,
    ...ALTERNATIVES.map((a) => `/alternativas/${a.slug}`),
  ];
  return paths.map((p) => `${origin}${p === "/" ? "/" : p}`);
}

export function renderSitemap(
  origin: string = SITE_ORIGIN,
  lastmod: string = new Date().toISOString().slice(0, 10),
): string {
  const urls = sitemapUrls(origin)
    .map((loc) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(origin: string = SITE_ORIGIN): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON dentro de <script>: impede que "</script>" no texto feche a tag. */
const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

function setTag(html: string, re: RegExp, value: string): string {
  return html.replace(re, (_m, before: string, _old: string, after: string) => `${before}${esc(value)}${after}`);
}

/** Troca título, descrição, canonical e Open Graph/Twitter do `index.html`. */
export function applyHead(html: string, seo: RouteSeo, url: string, extraHead = ""): string {
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`);
  const metas: [string, string][] = [
    ['name="description"', seo.description],
    ['property="og:title"', seo.title],
    ['property="og:description"', seo.description],
    ['property="og:url"', url],
    ['name="twitter:title"', seo.title],
    ['name="twitter:description"', seo.description],
  ];
  for (const [key, value] of metas) {
    out = setTag(out, new RegExp(`(<meta ${key} content=")([^"]*)(")`), value);
  }
  out = setTag(out, /(<link rel="canonical" href=")([^"]*)(")/, url);
  return extraHead ? out.replace("</head>", `    ${extraHead}\n</head>`) : out;
}

function breadcrumb(origin: string, items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${origin}${path}`,
    })),
  };
}

const PAGE_STYLE =
  "max-width:56rem;margin:0 auto;padding:48px 20px;font:16px/1.6 Inter,system-ui,sans-serif;color:#f2f2f2";
const MUTED = "color:#a1a1aa";
const LINK = "color:#d5a329";

function renderAlternativeBody(alt: Alternative): string {
  const seo = alternativeSeo(alt);
  const faq = alternativeFaq(alt, APP_NAME);
  const li = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join("");
  const others = ALTERNATIVES.filter((a) => a.slug !== alt.slug)
    .map((a) => `<a style="${LINK}" href="/alternativas/${a.slug}">${esc(APP_NAME)} vs ${esc(a.name)}</a>`)
    .join(" · ");
  return `<main style="${PAGE_STYLE}">
<nav><a style="${LINK}" href="/">${esc(APP_NAME)}</a> › <a style="${LINK}" href="/alternativas">Alternativas</a></nav>
<h1>${esc(seo.heading)}</h1>
${alt.aliases?.length ? `<p style="${MUTED}">Também pesquisado como: ${esc(alt.aliases.join(", "))}</p>` : ""}
<h2>O que é ${alt.category === "concept" ? "" : "o "}${esc(alt.name)}</h2>
<p style="${MUTED}">${esc(alt.summary)}</p>
<h2>Quando escolher o ${esc(APP_NAME)}</h2>
<ul>${li(alt.whyVertal)}</ul>
${alt.together ? `<h2>Usando os dois juntos</h2><p style="${MUTED}">${esc(alt.together)}</p>` : ""}
<h2>O que vem no ${esc(APP_NAME)}</h2>
<ul>${li(VERTAL_FEATURES)}</ul>
<p><a style="${LINK}" href="/auth">Começar grátis no ${esc(APP_NAME)}</a></p>
<h2>Perguntas frequentes</h2>
<dl>${faq.map((f) => `<dt><strong>${esc(f.q)}</strong></dt><dd style="${MUTED};margin:4px 0 16px">${esc(f.a)}</dd>`).join("")}</dl>
<h2>Outras comparações</h2>
<p>${others}</p>
<p style="${MUTED};font-size:12px">Todas as marcas citadas pertencem aos respectivos donos. O ${esc(APP_NAME)} não tem afiliação com essas empresas.</p>
</main>`;
}

function renderAlternativesIndexBody(): string {
  const groups = (Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[])
    .map((cat) => {
      const items = ALTERNATIVES.filter((a) => a.category === cat);
      if (!items.length) return "";
      const links = items
        .map((a) => `<li><a style="${LINK}" href="/alternativas/${a.slug}">${esc(alternativeSeo(a).heading)}</a> — <span style="${MUTED}">${esc(a.summary)}</span></li>`)
        .join("");
      return `<h2>${esc(CATEGORY_LABEL[cat])}</h2><ul>${links}</ul>`;
    })
    .join("\n");
  return `<main style="${PAGE_STYLE}">
<nav><a style="${LINK}" href="/">${esc(APP_NAME)}</a> › Alternativas</nav>
<h1>${esc(APP_NAME)} e as outras ferramentas</h1>
<p style="${MUTED}">${esc(ROUTE_SEO["/alternativas"].description)}</p>
${groups}
<p><a style="${LINK}" href="/auth">Começar grátis no ${esc(APP_NAME)}</a></p>
</main>`;
}

/** Troca o "Loading…" de dentro de #root pelo conteúdo estático da página. */
function withBody(html: string, body: string): string {
  return html.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, `<div id="root">${body}</div>`);
}

/** HTML de cada página pública, indexado pelo arquivo de saída. */
export function prerenderPages(indexHtml: string, origin: string = SITE_ORIGIN): Map<string, string> {
  const pages = new Map<string, string>();
  const home = [APP_NAME, "/"] as [string, string];

  for (const [path, seo] of Object.entries(ROUTE_SEO)) {
    if (path === "/") continue;
    let html = applyHead(indexHtml, seo, `${origin}${path}`, jsonLd(breadcrumb(origin, [home, [seo.title, path]])));
    if (path === "/alternativas") html = withBody(html, renderAlternativesIndexBody());
    pages.set(`${path.slice(1)}.html`, html);
  }

  for (const alt of ALTERNATIVES) {
    const path = `/alternativas/${alt.slug}`;
    const seo = alternativeSeo(alt);
    const faq = alternativeFaq(alt, APP_NAME);
    const head = [
      jsonLd(breadcrumb(origin, [home, ["Alternativas", "/alternativas"], [seo.heading, path]])),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    ].join("\n    ");
    pages.set(`alternativas/${alt.slug}.html`, withBody(applyHead(indexHtml, seo, `${origin}${path}`, head), renderAlternativeBody(alt)));
  }
  return pages;
}

export function seoPlugin(): Plugin {
  return {
    name: "vertal-seo",
    // "pre" roda antes da substituição de %ENV% do próprio Vite, que avisaria
    // sobre %SITE_ORIGIN% por não ser variável de ambiente.
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        applyHead(html.split("%SITE_ORIGIN%").join(SITE_ORIGIN), HOME_SEO, `${SITE_ORIGIN}/`),
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap() });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: renderRobots() });
    },
    // Depois que o Vite gravou o index.html final (com os scripts com hash).
    writeBundle(options) {
      const dir = options.dir;
      if (!dir) return;
      let indexHtml: string;
      try {
        indexHtml = readFileSync(join(dir, "index.html"), "utf8");
      } catch {
        return; // build sem index.html (ex.: bibliotecas, testes)
      }
      for (const [file, html] of prerenderPages(indexHtml)) {
        const out = join(dir, file);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, html);
      }
    },
  };
}
