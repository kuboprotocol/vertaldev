/**
 * IndexNow: avisa Bing (Microsoft), Yandex, Naver e Seznam quando páginas
 * mudam, sem esperar o próximo rastreamento. A chave é pública por design
 * (o buscador confere em https://vertal.dev/<chave>.txt); o Worker serve esse
 * arquivo e `scripts/indexnow.mjs` envia as URLs do sitemap depois de cada
 * deploy na main (.github/workflows/indexnow.yml).
 */
export const INDEXNOW_KEY = '900c21c4c4e92b1f68c7aa6d631bfd22'
