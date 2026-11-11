/**
 * Vite plugin para emitir o relógio Vertal como um IIFE bundle incorporável.
 * Cria `/embed/clock.js` que pode ser usado em qualquer site:
 * <script src="https://vertal.dev/embed/clock.js"></script>
 * <vertal-clock></vertal-clock>
 */

import type { Plugin, ViteDevServer } from 'vite';
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';

export default function clockEmbedPlugin(): Plugin {
  let root: string;

  return {
    name: 'vertal-clock-embed',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === 'vertal-clock-embed-entry') {
        return id;
      }
    },
    load(id) {
      if (id === 'vertal-clock-embed-entry') {
        return `
          import { defineVertalClock } from '@/embed/clock/element';
          defineVertalClock();
          import { VertalClockAPI } from '@/embed/clock/index';
          globalThis.VertalClock = VertalClockAPI;
        `;
      }
    },
    configureServer(server: ViteDevServer) {
      return () => {
        server.middlewares.use('/embed/clock.js', async (req, res) => {
          try {
            const result = await build({
              entryPoints: [path.join(root, 'src/embed/clock/index.ts')],
              bundle: true,
              format: 'iife',
              globalName: 'VertalClock',
              outfile: path.join(root, 'dist-embed/clock.js'),
              external: [],
              splitting: false,
              write: false,
              loader: {
                '.ts': 'ts',
              },
            });

            const code = result.outputFiles[0]?.text || '';
            res.setHeader('Content-Type', 'application/javascript');
            res.end(code);
          } catch (err) {
            console.error('Clock embed build error:', err);
            res.statusCode = 500;
            res.end('Error building clock embed');
          }
        });
      };
    },
    async generateBundle() {
      try {
        const result = await build({
          entryPoints: [path.join(root, 'src/embed/clock/index.ts')],
          bundle: true,
          format: 'iife',
          globalName: 'VertalClock',
          outfile: path.join(root, 'dist/embed/clock.js'),
          external: [],
          splitting: false,
          minify: true,
        });

        const code = result.outputFiles[0]?.text || '';
        this.emitFile({
          type: 'asset',
          fileName: 'embed/clock.js',
          source: code,
        });
      } catch (err) {
        console.error('Clock embed production build error:', err);
        throw err;
      }
    },
  };
}
