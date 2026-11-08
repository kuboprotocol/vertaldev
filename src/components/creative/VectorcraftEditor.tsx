import { ExternalLink } from 'lucide-react';

// VectorCraft: editor vetorial open-source (MIT ou Apache-2.0), escrito em Rust e compilado para
// WebAssembly. Origem: https://github.com/storytold/vectorcraft. O build estático fica em /vectorcraft/
// (public/vectorcraft, gerado por packaging/web/package.sh), servido pelo mesmo domínio, então o
// iframe é same-origin e o CSP frame-ancestors 'self' já libera. VITE_VECTORCRAFT_URL permite
// apontar para outro host.

const VECTORCRAFT_SRC: string = import.meta.env.VITE_VECTORCRAFT_URL || '/vectorcraft/';
const VECTORCRAFT_SOURCE_URL = 'https://github.com/storytold/vectorcraft';

export function VectorcraftEditor() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Ilustração vetorial</p>
          <h2 className="mt-2 text-3xl font-bold text-white">VectorCraft</h2>
          <p className="mt-2 text-slate-400">
            Ilustrações vetoriais e logotipos, direto no navegador. Os arquivos ficam no seu dispositivo.
          </p>
        </div>
        <a
          href={VECTORCRAFT_SRC}
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
          src={VECTORCRAFT_SRC}
          title="VectorCraft editor vetorial"
          allow="clipboard-read; clipboard-write; fullscreen"
          className="block h-[78vh] min-h-[560px] w-full border-0"
        />
      </div>

      <p className="text-xs text-slate-500">
        VectorCraft é um projeto open-source (MIT ou Apache-2.0) do ArtCraft.{' '}
        <a href={VECTORCRAFT_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
          Código e créditos
        </a>
        . Requer um navegador com WebGPU ou WebGL2.
      </p>
    </div>
  );
}
