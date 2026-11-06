// Mini janela do Vertal Office: um player flutuante para YouTube e outros sites.
// Fica por cima do Office. Minimizada, vira uma pílula e o vídeo continua tocando.
import React, { useState } from 'react';
import { Minus, X, ExternalLink, Youtube } from 'lucide-react';

/** Converte um link do YouTube para o formato de incorporação. Outros links são devolvidos como estão. */
export function toEmbedUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'youtube.com') {
    const v = url.searchParams.get('v');
    if (url.pathname === '/watch' && v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
    if (url.pathname.startsWith('/embed/')) return url.toString();
  }
  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }
  return url.toString();
}

const YOUTUBE_HOME = 'https://www.youtube.com';

export function MiniWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [address, setAddress] = useState(YOUTUBE_HOME);
  const [src, setSrc] = useState<string | null>(YOUTUBE_HOME);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const go = (value: string) => {
    const embed = toEmbedUrl(value);
    if (!embed) {
      setError('Endereço inválido. Use um link que comece com https://');
      return;
    }
    setError(null);
    setSrc(embed);
    setAddress(value.trim());
    setMinimized(false);
  };

  const openLink = toEmbedUrl(address) ?? YOUTUBE_HOME;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Expandir mini janela"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/10 transition hover:bg-slate-800"
      >
        <Youtube className="h-4 w-4 text-red-500" aria-hidden />
        Mini janela
      </button>
    );
  }

  return (
    <section
      aria-label="Mini janela"
      className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Youtube className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <span className="truncate">Mini janela</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Minimizar mini janela"
            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar mini janela"
            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <form
        className="flex gap-2 px-3 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          go(address);
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-label="Endereço da mini janela"
          placeholder="Cole um link do YouTube ou de outro site"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold hover:bg-blue-500">
          Ir
        </button>
      </form>
      {error && <p className="px-3 pt-2 text-xs text-amber-300">{error}</p>}

      <div className="px-3 pt-3">
        {src ? (
          <iframe
            key={src}
            src={src}
            title="Conteúdo da mini janela"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full rounded-lg bg-black"
          />
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-2 px-3 py-2.5 text-[11px] text-slate-400">
        <span>Alguns sites não aparecem aqui. Nesse caso, abra em outra aba.</span>
        <a
          href={openLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-blue-300 hover:bg-white/10"
        >
          Abrir em nova aba <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </footer>
    </section>
  );
}
