// Arquivos de apoio do pdf.js (decodificadores WebAssembly, mapas de caracteres e fontes padrão).
// Sem eles, PDFs escaneados (JBIG2, JPEG 2000) e textos com fontes não embutidas ficam em branco,
// sem erro. Copiamos esses arquivos para o build e servimos os mesmos em `npm run dev`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const PDFJS_DIR = fileURLToPath(new URL('../node_modules/pdfjs-dist', import.meta.url));
export const PDFJS_SUBDIRS = ['wasm', 'cmaps', 'standard_fonts'] as const;
const OUT_PREFIX = 'pdfjs';

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

function contentType(file: string): string {
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript';
  return 'application/octet-stream';
}

export function pdfjsAssetsPlugin(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use(`/${OUT_PREFIX}`, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.join(PDFJS_DIR, rel);
        const allowed = PDFJS_SUBDIRS.some((d) => rel.startsWith(`${d}/`));
        if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', contentType(file));
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const sub of PDFJS_SUBDIRS) {
        for (const file of walk(path.join(PDFJS_DIR, sub))) {
          this.emitFile({
            type: 'asset',
            fileName: `${OUT_PREFIX}/${path.relative(PDFJS_DIR, file).split(path.sep).join('/')}`,
            source: fs.readFileSync(file),
          });
        }
      }
    },
  };
}
