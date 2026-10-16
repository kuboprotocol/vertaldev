#!/usr/bin/env node
// Envia as URLs do sitemap ao IndexNow (Bing/Microsoft, Yandex, Naver, Seznam).
// Uso: node scripts/indexnow.mjs [--dry-run]
// Lê a chave de src/config/indexnow.ts e o sitemap publicado em SITE_ORIGIN.
// Antes de enviar, confere que https://<site>/<chave>.txt já devolve a chave:
// sem isso o IndexNow recusa (403) e o deploy ainda não chegou.
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SITE_ORIGIN || 'https://vertal.dev';
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 10000; // limite por requisição do protocolo

function readKey() {
  const src = readFileSync(new URL('../src/config/indexnow.ts', import.meta.url), 'utf8');
  const key = /INDEXNOW_KEY\s*=\s*'([0-9a-f]{8,128})'/.exec(src)?.[1];
  if (!key) throw new Error('INDEXNOW_KEY não encontrada em src/config/indexnow.ts');
  return key;
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const key = readKey();
  const keyLocation = `${ORIGIN}/${key}.txt`;
  const keyRes = await fetch(keyLocation);
  const keyBody = (await keyRes.text()).trim();
  if (!keyRes.ok || keyBody !== key) {
    throw new Error(`Chave ainda não publicada em ${keyLocation} (HTTP ${keyRes.status})`);
  }

  const sitemap = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!sitemap.ok) throw new Error(`sitemap.xml respondeu HTTP ${sitemap.status}`);
  const host = new URL(ORIGIN).host;
  const urls = parseSitemap(await sitemap.text()).filter((u) => new URL(u).host === host);
  console.log(`${urls.length} URLs no sitemap`);
  if (DRY_RUN) return;

  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList }),
    });
    // 200 = aceito, 202 = aceito e chave ainda em validação.
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`IndexNow respondeu HTTP ${res.status}: ${await res.text()}`);
    }
    console.log(`Lote ${i / BATCH + 1}: ${urlList.length} URLs enviadas (HTTP ${res.status})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
