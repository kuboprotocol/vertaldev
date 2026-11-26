/**
 * HTML estático das páginas de integração (/integracoes e /integracoes/<slug>).
 *
 * O build grava `integracoes.html` e `integracoes/<slug>.html` com título,
 * descrição, canonical, Open Graph/Twitter com o logo do app, JSON-LD (WebPage,
 * BreadcrumbList, FAQPage/ItemList) e o conteúdo inteiro no corpo, para buscadores
 * que não rodam JavaScript. O React (`src/pages/IntegrationsPage.tsx`) troca esse
 * conteúdo pelo mesmo texto ao carregar. A Cloudflare serve `/integracoes/notion`
 * a partir de `integracoes/notion.html` (como em /alternativas).
 */
import { APP_NAME, SITE_ORIGIN } from "../src/config/brand";
import type { RouteSeo } from "../src/config/seo";
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
} from "../src/config/integrations";
import { integrationHreflang } from "./integrationsI18n";

type ApplyHead = (html: string, page: RouteSeo, url: string, extraHead?: string) => string;

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

const PAGE_STYLE =
  "max-width:56rem;margin:0 auto;padding:48px 20px;font:16px/1.6 Inter,system-ui,sans-serif;color:#f2f2f2";
const MUTED = "color:#a1a1aa";
const LINK = "color:#d5a329";

export function integrationUrls(origin: string = SITE_ORIGIN): string[] {
  return [`${origin}${INTEGRATIONS_PATH}`, ...INTEGRATIONS.map((i) => `${origin}${integrationPath(i)}`)];
}

function breadcrumb(origin: string, items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name,
      item: `${origin}${path}`,
    })),
  };
}

/** Logo do app no Open Graph/Twitter (cartão "summary"); sem logo, fica a imagem padrão. */
function socialImage(html: string, imageUrl: string | null, alt: string, keywords: string): string {
  let out = html.replace(/(<meta name="keywords" content=")[^"]*(")/, `$1${esc(keywords)}$2`);
  out = out.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(alt)}$2`);
  if (!imageUrl) return out;
  out = out
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(imageUrl)}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(imageUrl)}$2`)
    .replace(/(<meta name="twitter:card" content=")[^"]*(")/, `$1summary$2`)
    .replace(/\s*<meta property="og:image:(width|height)" content="[^"]*" \/>/g, "");
  return out;
}

/** Troca o "Loading…" de dentro de #root pelo conteúdo estático da página. */
function withBody(html: string, body: string): string {
  return html.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, `<div id="root">${body}</div>`);
}

function list(items: { name: string; description: string }[]): string {
  return `<ul>${items.map((a) => `<li><strong>${esc(a.name)}</strong> — <span style="${MUTED}">${esc(a.description)}</span></li>`).join("")}</ul>`;
}

export function renderIntegrationBody(i: Integration): string {
  const seo = integrationSeo(i);
  const related = i.related
    .map((s) => findIntegration(s))
    .filter((r): r is Integration => Boolean(r))
    .map((r) => `<li><a style="${LINK}" href="${integrationPath(r)}">Integração ${esc(r.name)}</a></li>`)
    .join("");
  return `<main style="${PAGE_STYLE}">
<nav aria-label="breadcrumb"><a style="${LINK}" href="/">${esc(APP_NAME)}</a> › <a style="${LINK}" href="${INTEGRATIONS_PATH}">Integrações</a> › ${esc(i.name)}</nav>
<header>
${i.logoUrl ? `<img src="${esc(i.logoUrl)}" alt="Logo ${esc(i.name)}" width="64" height="64" style="border-radius:12px;margin-top:24px" />` : ""}
<h1>${esc(seo.heading)}</h1>
<p style="${MUTED}">${esc(i.summary)} ${esc(i.lead)}</p>
${i.aliases.length ? `<p style="${MUTED};font-size:14px">Também pesquisado como: ${esc(i.aliases.join(", "))}</p>` : ""}
<p><a style="${LINK}" href="${esc(i.signupPath)}"><strong>Conectar o ${esc(i.name)} grátis</strong></a></p>
</header>
<h2>O que é o ${esc(i.name)}</h2>
<p style="${MUTED}">${esc(i.about)}</p>
<h2>O que o ${esc(APP_NAME)} faz com o ${esc(i.name)}</h2>
<p style="${MUTED}">${esc(i.details)}</p>
<ul>${i.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
${i.actions.length ? `<h3>Ações do ${esc(i.name)}</h3>${list(i.actions)}` : ""}
${i.triggers.length ? `<h3>Gatilhos e buscas do ${esc(i.name)}</h3>${list(i.triggers)}` : ""}
<h2>Como conectar o ${esc(i.name)}</h2>
<p style="${MUTED}">${esc(i.connectSummary)}</p>
<ol>${i.steps.map((s) => `<li><strong>${esc(s.title)}</strong> — <span style="${MUTED}">${esc(s.description)}</span></li>`).join("")}</ol>
<h2>Exemplos de uso do ${esc(i.name)} com IA</h2>
<ul>${i.uses.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
<p><a style="${LINK}" href="${esc(i.signupPath)}">Criar conta grátis e conectar o ${esc(i.name)}</a></p>
<h2>Perguntas frequentes sobre a integração ${esc(i.name)}</h2>
<dl>${i.faq.map((f) => `<dt><strong>${esc(f.q)}</strong></dt><dd style="${MUTED};margin:4px 0 16px">${esc(f.a)}</dd>`).join("")}</dl>
<h2>Integrações relacionadas</h2>
<ul>${related}</ul>
<p><a style="${LINK}" href="${INTEGRATIONS_PATH}">Ver todas as ${INTEGRATIONS.length} integrações</a> · <a style="${LINK}" href="/docs#connectors">Documentação de conectores</a></p>
${i.officialUrl ? `<p style="${MUTED};font-size:14px">Site oficial: <a style="${LINK}" href="${esc(i.officialUrl)}" rel="nofollow noopener noreferrer">${esc(i.name)}</a></p>` : ""}
<p style="${MUTED};font-size:12px">${esc(TRADEMARK_NOTICE)}</p>
</main>`;
}

export function renderIntegrationsIndexBody(): string {
  const groups = integrationGroups()
    .map(
      (g) =>
        `<h2>${esc(g.label)}</h2><ul>${g.items
          .map((i) => `<li><a style="${LINK}" href="${integrationPath(i)}">Integração ${esc(i.name)}</a> — <span style="${MUTED}">${esc(i.about)}</span></li>`)
          .join("")}</ul>`,
    )
    .join("\n");
  return `<main style="${PAGE_STYLE}">
<nav aria-label="breadcrumb"><a style="${LINK}" href="/">${esc(APP_NAME)}</a> › Integrações</nav>
<h1>${esc(INTEGRATIONS_INDEX_SEO.heading)}</h1>
<p style="${MUTED}">${esc(INTEGRATIONS_INDEX_SEO.description)} Cada integração tem uma página com o que dá para fazer, como conectar e exemplos.</p>
${groups}
<p><a style="${LINK}" href="/auth">Começar grátis no ${esc(APP_NAME)}</a></p>
<p style="${MUTED};font-size:12px">${esc(TRADEMARK_NOTICE)}</p>
</main>`;
}

/** HTML de /integracoes e de cada /integracoes/<slug>, indexado pelo arquivo de saída. */
export function renderIntegrationPages(
  indexHtml: string,
  applyHead: ApplyHead,
  origin: string = SITE_ORIGIN,
): Map<string, string> {
  const pages = new Map<string, string>();
  const home: [string, string] = [APP_NAME, "/"];
  const hub: [string, string] = ["Integrações", INTEGRATIONS_PATH];
  const website = { "@type": "WebSite", name: APP_NAME, url: `${origin}/` };

  const indexHead = [
    integrationHreflang(origin),
    jsonLd(breadcrumb(origin, [home, hub])),
    jsonLd({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: INTEGRATIONS_INDEX_SEO.heading,
      description: INTEGRATIONS_INDEX_SEO.description,
      url: `${origin}${INTEGRATIONS_PATH}`,
      inLanguage: "pt-BR",
      isPartOf: website,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: INTEGRATIONS.length,
        itemListElement: INTEGRATIONS.map((i, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: `Integração ${i.name}`,
          url: `${origin}${integrationPath(i)}`,
        })),
      },
    }),
  ].join("\n    ");
  let indexPage = applyHead(indexHtml, INTEGRATIONS_INDEX_SEO, `${origin}${INTEGRATIONS_PATH}`, indexHead);
  indexPage = socialImage(indexPage, null, `Integrações do ${APP_NAME}`, `integrações ${APP_NAME}, conectores, automação com IA, integração API`);
  pages.set("integracoes.html", withBody(indexPage, renderIntegrationsIndexBody()));

  for (const i of INTEGRATIONS) {
    const path = integrationPath(i);
    const url = `${origin}${path}`;
    const seo = integrationSeo(i);
    const logo = i.logoUrl ? `${origin}${i.logoUrl}` : null;
    const head = [
      integrationHreflang(origin, i.slug),
      jsonLd(breadcrumb(origin, [home, hub, [i.name, path]])),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: seo.title,
        headline: seo.heading,
        description: seo.description,
        url,
        inLanguage: "pt-BR",
        isPartOf: website,
        ...(logo ? { primaryImageOfPage: { "@type": "ImageObject", url: logo } } : {}),
        about: { "@type": "Thing", name: i.name, ...(i.aliases.length ? { alternateName: i.aliases } : {}) },
        mainEntity: {
          "@type": "SoftwareApplication",
          name: APP_NAME,
          url: `${origin}/`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
          featureList: [...i.actions, ...i.triggers].map((a) => `${i.name}: ${a.name}`).slice(0, 30),
        },
      }),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: i.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }),
    ].join("\n    ");
    let html = applyHead(indexHtml, seo, url, head);
    html = socialImage(html, logo, `Logo ${i.name}`, seo.keywords);
    pages.set(`integracoes/${i.slug}.html`, withBody(html, renderIntegrationBody(i)));
  }
  return pages;
}
