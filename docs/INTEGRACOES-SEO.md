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
- `src/config/integrations/content.ts`: o que é o app (1 linha), exemplos de uso e
  nomes alternativos. Conector sem entrada recebe texto padrão da categoria — escreva
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
