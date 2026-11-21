// Cartão do resultado da coleta (Scrapling) no chat: resumo, tabela dos dados extraídos,
// fonte/URL e créditos gastos. A visualização completa (ScrapeResultView) tem a tabela
// inteira, o texto da página e exportação CSV.
import { Download, ExternalLink, Globe } from 'lucide-react';
import type { ScrapeArtifactData } from '@/lib/chatAgent/artifacts';
import { BLOCK_LABEL, scrapeCsv } from '@/lib/scrape/artifact';

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

export function ScrapeTable({ data, max }: { data: ScrapeArtifactData; max?: number }) {
  const rows = max ? data.rows.slice(0, max) : data.rows;
  if (!data.columns.length) {
    return (
      <ul className="space-y-1 text-xs">
        {rows.map((r) => (
          <li key={r.url} className="truncate">
            <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{r.title || hostOf(r.url)}</a>
            {r.blocked ? <span className="ml-2 text-amber-500">{BLOCK_LABEL[r.blocked] ?? r.blocked}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" aria-label="Dados extraídos">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Página</th>
            {data.columns.map((c) => <th key={c} className="py-1 pr-2 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.url} className="border-b border-border/30 align-top">
              <td className="max-w-[180px] truncate py-1 pr-2">
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline" title={r.url}>{r.title || hostOf(r.url)}</a>
              </td>
              {r.blocked
                ? <td colSpan={data.columns.length} className="py-1 pr-2 text-amber-500">{BLOCK_LABEL[r.blocked] ?? r.blocked}</td>
                : data.columns.map((c) => <td key={c} className="max-w-[240px] py-1 pr-2 break-words">{r.values[c] || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {max && data.rows.length > max ? <p className="mt-1 text-[11px] text-muted-foreground">+{data.rows.length - max} linha(s) na visualização completa</p> : null}
    </div>
  );
}

export function ScrapeCardBody({ data }: { data: ScrapeArtifactData }) {
  return (
    <div className="space-y-2 border-t border-border/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{data.summary}</p>
      <ScrapeTable data={data} max={5} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" aria-hidden /> Fonte: <a href={data.source} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{hostOf(data.source)}</a></span>
        <span>Scrapling · {data.mode}</span>
        <span data-testid="scrape-credits">Créditos gastos: <strong className="text-foreground">{data.credits}</strong>{data.unitCredits ? ` (${data.unitCredits}/página)` : ''}</span>
      </div>
      {data.captchaUrls?.length ? <p className="text-[11px] text-amber-500">Apareceu um captcha: não resolvo automaticamente. Resolva na tela ao vivo do Navigator.</p> : null}
    </div>
  );
}

export function ScrapeResultView({ data }: { data: ScrapeArtifactData }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([scrapeCsv(data)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coleta-vertal.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium hover:border-primary/50">
          <Download className="h-3.5 w-3.5" aria-hidden /> Exportar CSV
        </button>
        <a href={data.source} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium hover:border-primary/50">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir a fonte
        </a>
      </div>
      <ScrapeCardBody data={{ ...data, rows: data.rows }} />
      <ScrapeTable data={data} />
      {data.text ? <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs">{data.text}</pre> : null}
      {data.blocked?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-500">
          {data.blocked.map((b) => <li key={b.url}>{hostOf(b.url)}: {BLOCK_LABEL[b.reason] ?? b.reason}</li>)}
        </ul>
      ) : null}
      <p className="text-[11px] text-muted-foreground">Coleta com Scrapling (BSD-3-Clause). robots.txt respeitado; e-mails, telefones e CPFs mascarados.</p>
    </div>
  );
}
