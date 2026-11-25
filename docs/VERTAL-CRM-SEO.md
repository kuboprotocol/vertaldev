# Vertal CRM grátis · landing e documentação multilíngue (SEO)

Objetivo: quem pesquisa “CRM grátis / free CRM” em qualquer país e idioma encontra o Vertal CRM.
Tudo white-hat: conteúdo real e útil em cada idioma, sem lista de palavras-chave, sem texto escondido,
sem páginas-porta e sem avaliações/notas inventadas (o JSON-LD **não** tem `aggregateRating`).

## URLs

| Idioma | Landing | Documentação |
|---|---|---|
| Português (Brasil) — raiz | `/crm-gratis` | `/docs/vertal-crm` |
| English (x-default) | `/en/free-crm` | `/en/docs/vertal-crm` |
| Español | `/es/crm-gratis` | `/es/docs/vertal-crm` |
| Português (Portugal) | `/pt-PT/crm-gratuito` | `/pt-PT/docs/vertal-crm` |
| Français | `/fr/crm-gratuit` | `/fr/docs/vertal-crm` |
| Deutsch | `/de/kostenloses-crm` | `/de/docs/vertal-crm` |
| Italiano | `/it/crm-gratuito` | `/it/docs/vertal-crm` |
| Nederlands | `/nl/gratis-crm` | `/nl/docs/vertal-crm` |
| Polski | `/pl/darmowy-crm` | `/pl/docs/vertal-crm` |
| Türkçe | `/tr/ucretsiz-crm` | `/tr/docs/vertal-crm` |
| Русский | `/ru/besplatnaya-crm` | `/ru/docs/vertal-crm` |
| Українська | `/uk/bezkoshtovna-crm` | `/uk/docs/vertal-crm` |
| العربية (RTL) | `/ar/crm-majani` | `/ar/docs/vertal-crm` |
| हिन्दी | `/hi/muft-crm` | `/hi/docs/vertal-crm` |
| Bahasa Indonesia | `/id/crm-gratis` | `/id/docs/vertal-crm` |
| Tiếng Việt | `/vi/crm-mien-phi` | `/vi/docs/vertal-crm` |
| ไทย | `/th/crm-free` | `/th/docs/vertal-crm` |
| 日本語 | `/ja/muryou-crm` | `/ja/docs/vertal-crm` |
| 한국어 | `/ko/muryo-crm` | `/ko/docs/vertal-crm` |
| 简体中文 (hreflang `zh-Hans`) | `/zh-CN/mianfei-crm` | `/zh-CN/docs/vertal-crm` |
| 繁體中文 (hreflang `zh-Hant`) | `/zh-TW/mianfei-crm` | `/zh-TW/docs/vertal-crm` |

`/crm` continua sendo o app (React); a landing nunca usa esse caminho.

## Como é gerado

- Textos: `src/config/freeCrm/<idioma>.ts` (formato em `types.ts`), lista e regras em `src/config/freeCrm.ts`.
- Créditos: `src/config/freeCrmCosts.ts` — os mesmos números do servidor (`CRM_AI_COST`=1, `CRM_SYNC_ACTIVATE_COST`=4,
  `CRM_SYNC_AI_RUN_COST`=2) + sincronização sem IA = 2 (`VERTAL_CRM_PLAIN_SYNC_COST` em produção). Teste garante que batem.
- Preços dos planos: lidos de `src/lib/planConfig.ts` (Starter, Pro, Premium 1 — os planos à venda em `/pricing`);
  nenhum preço escrito à mão nos textos (`{price}` = menor plano pago, formatado no idioma).
- Render: `vite-plugins/freeCrm.ts`, chamado por `vite-plugins/seo.ts` no `writeBundle` → `dist/<caminho>.html`.
  A Cloudflare serve `/en/free-crm` a partir de `en/free-crm.html` (mesmo esquema de `/alternativas/*`).
- Cada página: `<html lang dir>`, title/description/H1 próprios, canonical, hreflang recíproco dos 21 idiomas + `x-default`
  (inglês), Open Graph/Twitter, JSON-LD (landing: `WebPage`, `SoftwareApplication` com `offers.price = 0`, `FAQPage`,
  `BreadcrumbList`; docs: `TechArticle`, `FAQPage`, `BreadcrumbList`). Sem JavaScript, CSS inline, uma imagem de 32 px.
- Sitemap: entradas com `<xhtml:link rel="alternate" hreflang>` de cada idioma. `robots.txt` já libera tudo (`Allow: /`).
- O workflow `IndexNow` (push na `main`) envia todas as URLs do sitemap ao IndexNow (Bing, Yandex, Naver, Seznam).
- Interruptor do build: `VERTAL_FREE_CRM_SEO=false` tira as páginas e as entradas do sitemap.

## Conteúdo (todos os idiomas)

Landing: o que é, recursos, tabela “grátis × créditos” (0 / 1 / 4 / 2 / 2), “IA exige qualquer plano pago a partir de …”,
seus dados são seus (CSV/API/webhooks, inclusive sem plano), usar outro CRM pago ou mandar pelo Vertal Fluxos, FAQ,
aviso honesto de “liberação gradual / lista de espera”.
Documentação: o que é, recursos, como usar, créditos e planos (com link para `/pricing`), conectar outros CRMs,
Vertal Fluxos, exportar dados, privacidade (LGPD/GDPR e leis locais), FAQ.

## Adicionar um idioma

1. Copie `src/config/freeCrm/en.ts` para `src/config/freeCrm/<código>.ts` e traduza com um falante nativo
   (use o termo que as pessoas daquele país pesquisam, de forma natural; slug ASCII).
2. O código precisa existir em `src/config/locales.ts` (mesmos prefixos do site).
3. Inclua em `FREE_CRM_LOCALES` (`src/config/freeCrm.ts`). Os testes (`src/test/free-crm-seo.test.ts`) conferem
   limites de título/descrição, hreflang, JSON-LD e conflitos com páginas existentes.

## Buscadores

- IndexNow: automático a cada push na `main` (workflow `indexnow.yml`); a chave já está publicada.
- Google: a propriedade de domínio `vertal.dev` está verificada por DNS (TXT `google-site-verification` na Cloudflare).
  O sitemap `https://vertal.dev/sitemap.xml` é enviado no Search Console (Sitemaps).
- Bing Webmaster Tools: aceita o mesmo sitemap; o IndexNow já cobre o envio.
