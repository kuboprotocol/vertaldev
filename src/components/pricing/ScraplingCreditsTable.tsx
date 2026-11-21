// Tabela de créditos da coleta web com Scrapling e do monitoramento (F5): cada serviço
// custa 45% a mais que o serviço vigente equivalente da Vertal Dev (atual × 1,45, para cima).
import { SCRAPE_BASE_SERVICES, SCRAPE_PRICE_TABLE } from '../../../supabase/functions/_shared/scrapeCore';

export function ScraplingCreditsTable({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
      <table className="w-full text-left text-sm" aria-label="Créditos da coleta web e do monitoramento">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 font-medium">Serviço</th>
            {!compact && <th className="px-4 py-2 font-medium">Serviço base (vigente)</th>}
            {!compact && <th className="px-4 py-2 font-medium">Valor atual</th>}
            <th className="px-4 py-2 font-medium">Créditos</th>
          </tr>
        </thead>
        <tbody>
          {SCRAPE_PRICE_TABLE.map((r) => (
            <tr key={r.key} className="border-b border-border/30 last:border-0">
              <td className="px-4 py-2">{r.service} <span className="text-xs text-muted-foreground">({r.unit})</span></td>
              {!compact && <td className="px-4 py-2 text-muted-foreground">{r.base ? SCRAPE_BASE_SERVICES[r.base].label : '—'}</td>}
              {!compact && <td className="px-4 py-2 text-muted-foreground">{r.base ? r.baseCredits : 0}</td>}
              <td className="px-4 py-2 font-semibold">{r.credits === 0 ? 'grátis' : r.credits}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Preço = serviço vigente equivalente × 1,45, arredondado para cima. Só páginas obtidas são cobradas (bloqueio por robots.txt, captcha, login ou paywall não cobra). Saldo conferido antes de cada coleta.
      </p>
    </div>
  );
}

export default ScraplingCreditsTable;
