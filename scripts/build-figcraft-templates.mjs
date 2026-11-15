#!/usr/bin/env node
// Gera os modelos do figCraft (public/figcraft/templates/<id>.figcraft) pelo próprio engine.
//
// Abre o build web do figCraft num navegador, pede a lista com `template.list`, cria cada modelo
// com `file.newFromTemplate` e exporta o arquivo com `file.saveAs {data: true}` (base64). Assim o
// arquivo é exatamente o que o engine grava, e o Painel Criativo, o Vertal Chat e o MCP usam os
// mesmos bytes.
//
// Uso:
//   1. Sirva o build (ele já vem em public/figcraft; qualquer servidor estático na mesma origem serve):
//        npx vite preview --port 4173         # ou o servidor do seu ambiente
//   2. node scripts/build-figcraft-templates.mjs
//      FIGCRAFT_URL=http://127.0.0.1:4173/figcraft/index.html?control node scripts/build-figcraft-templates.mjs
//
// Precisa do Playwright com um Chromium instalado (no ambiente do projeto: `npx playwright install chromium`).
// O `?control` liga `window.figcraft` no build; sem ele o script não consegue falar com o engine.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'figcraft', 'templates');
const TS_OUT = join(ROOT, 'supabase', 'functions', '_shared', 'figcraftTemplates.generated.ts');
const URL_ = process.env.FIGCRAFT_URL || 'http://127.0.0.1:4173/figcraft/index.html?control';
const READY_TIMEOUT_MS = 180_000;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Playwright não encontrado: rode `npm i -D playwright` ou use o Playwright do seu ambiente.');
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL_, { waitUntil: 'load' });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await page.evaluate(() => !!(window.figcraft && window.figcraft.commands)))) {
    if (Date.now() > deadline) throw new Error(`window.figcraft não apareceu em ${URL_}`);
    await page.waitForTimeout(1000);
  }

  const templates = await page.evaluate(() => figcraft.execute('template.list', {}));
  if (!Array.isArray(templates) || templates.length === 0) throw new Error('template.list não devolveu modelos');

  await mkdir(OUT, { recursive: true });
  const written = [];
  for (const t of templates) {
    const { data, name } = await page.evaluate(async (id) => {
      await figcraft.execute('file.newFromTemplate', { template: id });
      const saved = await figcraft.execute('file.saveAs', { data: true });
      await figcraft.execute('file.markSaved', {});
      return saved;
    }, t.id);
    if (typeof data !== 'string' || data.length === 0) throw new Error(`modelo ${t.id} sem conteúdo`);
    const bytes = Buffer.from(data, 'base64');
    const file = join(OUT, `${t.id}.figcraft`);
    await writeFile(file, bytes);
    written.push({ id: t.id, bytes: bytes.length, name, base64: data });
    console.log(`${t.id}: ${bytes.length} bytes (${name ?? 'sem nome'})`);
  }
  // Os mesmos bytes, embutidos na Edge Function `mcp` (ela cria designs a partir de modelo sem
  // depender do site estar no ar). Gerado: não edite à mão.
  const bundle = Object.fromEntries(written.map((w) => [w.id, w.base64]));
  const moduleSource = [
    '// Gerado por scripts/build-figcraft-templates.mjs a partir do próprio engine do figCraft. Não edite à mão.',
    'export const FIGCRAFT_TEMPLATE_BYTES_B64: Record<string, string> = ' + JSON.stringify(bundle, null, 2) + ';',
    '',
  ].join('\n');
  await writeFile(TS_OUT, moduleSource);
  console.log(`${written.length} modelos gravados em ${OUT} e em ${TS_OUT}`);
} finally {
  await browser.close();
}
