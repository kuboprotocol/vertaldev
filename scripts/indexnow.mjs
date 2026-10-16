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

// Bing URL Submission API (opcional): roda só se BING_WEBMASTER_API_KEY
// existir. A cota diária do Bing é pequena, então as páginas principais
// (pt-BR na raiz, depois inglês e espanhol) vão primeiro.
const BING_API = 'https://ssl.bing.com/webmaster/api.svc/json';

export function prioritizeForBing(urls, origin = ORIGIN) {
  const rank = (u) => {
    const path = u.slice(origin.length) || '/';
    if (!/^\/[a-z]{2,3}(-[A-Z]{2})?(\/|$)/.test(path) || /^\/(docs|terms|support|pricing|download|anywhere|privacy|alternativas)/.test(path)) return 0;
    if (/^\/en(\/|$)/.test(path)) return 1;
    if (/^\/es(\/|$)/.test(path)) return 2;
    return 3;
  };
  return [...urls].sort((a, b) => rank(a) - rank(b));
}

async function submitBing(urls) {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    console.log('Bing API: BING_WEBMASTER_API_KEY ausente, pulando');
    return;
  }
  const siteUrl = ORIGIN;
  const q = new URLSearchParams({ siteUrl, apikey: apiKey });
  const quotaRes = await fetch(`${BING_API}/GetUrlSubmissionQuota?${q}`);
  if (!quotaRes.ok) throw new Error(`Bing quota HTTP ${quotaRes.status}: ${await quotaRes.text()}`);
  const daily = Number((await quotaRes.json())?.d?.DailyQuota ?? 0);
  console.log(`Bing API: cota diária restante ${daily}`);
  if (daily <= 0) return;

  const urlList = prioritizeForBing(urls).slice(0, Math.min(daily, 500));
  const res = await fetch(`${BING_API}/SubmitUrlBatch?${new URLSearchParams({ apikey: apiKey })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ siteUrl, urlList }),
  });
  if (!res.ok) throw new Error(`Bing SubmitUrlBatch HTTP ${res.status}: ${await res.text()}`);
  console.log(`Bing API: ${urlList.length} URLs enviadas`);
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

  // Falha do Bing não refaz o IndexNow (que já foi aceito): só avisa.
  try {
    await submitBing(urls);
  } catch (err) {
    console.warn(`::warning::${err.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
