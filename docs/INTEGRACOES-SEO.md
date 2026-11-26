# Páginas de integração (SEO) — /integracoes

Uma página pública e indexável por conector do catálogo de `/connectors`, para trazer
tráfego orgânico de quem pesquisa "<App> integração", "<App> API automação",
"conectar <App> com IA" etc.

- Índice: `https://vertal.dev/integracoes`
- Cada conector: `https://vertal.dev/integracoes/<slug>` (ex.: `/integracoes/notion`,
  `/integracoes/google-sheets`, `/integracoes/whatsapp`).
- As páginas do app (`/connectors/<id>`, com login) continuam iguais; a página pública
  aponta para elas pelo botão "Conectar … grátis" (`/auth?redirect=/connectors/<id>/setup`).

## De onde vem
- `src/config/integrations/index.ts` monta a lista a partir de `connectors`
  (`src/lib/connectorsConfig.ts`). Conector novo no catálogo ganha página sozinho;
  conector escondido (`HIDDEN_FLUXOS_APPS`) ou `coming_soon` não ganha.
  Instagram Business e WhatsApp Business (cartões `fluxos-*`) usam a mesma página de
  Instagram e WhatsApp, para não ter duas páginas quase iguais competindo na busca.
- `src/config/integrations/content.ts`: o que é o app (1 linha), exemplos de uso,
  nomes alternativos e, para apps de nicho, perguntas próprias (`faq`, ex.: "O FreeScout tem OAuth?"),
  que entram no FAQ da página, no JSON-LD e nas traduções (`c.<slug>.faq.<n>.q/a`). Conector sem entrada recebe texto padrão da categoria — escreva
  uma entrada ao adicionar conector (o teste avisa).
- `src/config/integrations/engineApps.ts`: ações e gatilhos de cada app do motor do
  Vertal Fluxos (traduzidos) e o tipo de conexão (`vertal-oauth` = botão "Entrar com …";
  `own-oauth` = app OAuth do próprio usuário; `fields` = chave/token/URL). Atualize quando
  o motor ganhar ações ou quando um cliente OAuth novo (`FLUXOS_OAUTH_<APP>_*`) for salvo.
- `vite-plugins/integrations.ts`: HTML estático (`integracoes.html` e
  `integracoes/<slug>.html`) com título, descrição, canonical, Open Graph/Twitter com o
  logo, JSON-LD (WebPage, BreadcrumbList, FAQPage; ItemList no índice) e o texto inteiro
  no corpo. `vite-plugins/seo.ts` grava junto com as outras páginas e põe as URLs no
  `sitemap.xml`; `robots.txt` tem `Allow: /integracoes`.
- `src/pages/IntegrationsPage.tsx`: a mesma página em React (rotas `/integracoes` e
  `/integracoes/:slug` em `src/App.tsx`).
- Documentação: seção Connectors de `/docs` lista todos os conectores com link.
- Pay Per Crawl: `/integracoes` é grátis (`worker/payPerCrawl.ts`).

## Regras
- White-label: nenhuma página cita o motor por trás do Vertal Fluxos/Agentes nem
  fornecedores de IA (`BANNED_PUBLIC_TERMS`, testado em `src/test/integrations-seo.test.ts`).
- Marcas de terceiros só como o app conectado; aviso de marcas no rodapé de cada página
  e FAQ "é parceiro oficial?" respondendo que não.

## Search Console
`vertal.dev` é propriedade de domínio verificada no Search Console da conta
kuboprotocol@gmail.com. O sitemap é `https://vertal.dev/sitemap.xml`
(Search Console → Sitemaps → enviar). Bing/IndexNow recebem as URLs pelo workflow
`indexnow.yml` depois do deploy.

## Idiomas (22)
pt-BR na raiz (`/integracoes/<slug>`, x-default) + 21 idiomas em `/<código>/<segmento>/<slug>`:
zh-CN, es (`/es/integraciones`), en (`/en/integrations`), hi, bn, ru (`/ru/integratsii`), ja, pa,
vi (`/vi/tich-hop`), tr (`/tr/entegrasyonlar`), mr, te, ko, fr, ta, ar, de (`/de/integrationen`),
ur, jv (`/jv/integrasi`), it (`/it/integrazioni`), fa. Lista e segmentos:
`src/config/integrations/locales.ts`.

- Páginas traduzidas: estáticas e leves (sem React), `vite-plugins/integrationsI18n.ts`, com
  `lang`, `dir="rtl"` para ar/ur/fa (CSS com propriedades lógicas), hreflang das 22 versões +
  x-default em todas as páginas (inclusive as pt-BR) e JSON-LD no idioma.
- Textos: `src/config/integrations/i18n/<código>.json` (chave → texto). Fonte pt-BR em
  `i18n/source.pt-BR.json`. Chave sem tradução cai no inglês e depois no pt-BR, então
  conector novo sai em todos os idiomas no próximo build. Para traduzir o que falta:
  `TRANSLATE_API_URL=… TRANSLATE_API_KEY=… TRANSLATE_MODEL=… npx vite-node scripts/integrations-i18n.ts`
  (`--check` mostra a cobertura). Revisões de falantes nativos entram direto nos JSON.
- Sitemaps: `sitemap_index.xml` → `sitemap.xml` (páginas gerais) + `sitemap-integrations-<código>.xml`
  (22, com `xhtml:link` hreflang). `robots.txt` aponta para os dois. IndexNow lê os por idioma.
