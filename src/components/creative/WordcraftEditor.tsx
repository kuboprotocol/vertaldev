import { ExternalLink } from 'lucide-react';

// WordCraft: processador de texto open-source (MIT ou Apache-2.0), escrito em Rust e compilado para
// WebAssembly. Origem: https://github.com/storytold/wordcraft. O build estático fica em /wordcraft/
// (public/wordcraft, gerado por packaging/web/package.sh), servido pelo mesmo domínio, então o
// iframe é same-origin e o CSP frame-ancestors 'self' já libera. VITE_WORDCRAFT_URL permite
// apontar para outro host.

const WORDCRAFT_SRC: string = import.meta.env.VITE_WORDCRAFT_URL || '/wordcraft/';
const WORDCRAFT_SOURCE_URL = 'https://github.com/storytold/wordcraft';

export function WordcraftEditor() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Documentos</p>
          <h2 className="mt-2 text-3xl font-bold text-white">WordCraft</h2>
          <p className="mt-2 text-slate-400">
            Textos e design de documentos, direto no navegador. Os arquivos ficam no seu dispositivo.
          </p>
        </div>
        <a
          href={WORDCRAFT_SRC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200"
        >
          Abrir em tela cheia
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#262626]">
        <iframe
          src={WORDCRAFT_SRC}
          title="WordCraft editor de documentos"
          allow="clipboard-read; clipboard-write; fullscreen"
          className="block h-[78vh] min-h-[560px] w-full border-0"
        />
      </div>

      <p className="text-xs text-slate-500">
        WordCraft é um projeto open-source (MIT ou Apache-2.0) do ArtCraft.{' '}
        <a href={WORDCRAFT_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
          Código e créditos
        </a>
        . Requer um navegador com WebGPU ou WebGL2.
      </p>
    </div>
  );
}
