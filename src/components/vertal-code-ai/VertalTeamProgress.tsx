// VERTAL Code AI · Vertal Team progress by group (Think / Build / Deliver) and by role.
import { Check, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEAM_CORES, TEAM_STATE_LABEL, TIER_LABEL, type TeamRoleState, type TeamState } from '@/lib/vertalCodeAi/team';

function StateIcon({ state, live }: { state: TeamRoleState; live: boolean }) {
  if (state === 'done') return <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
  if (state === 'failed' || state === 'rejected') return <XCircle className="h-3.5 w-3.5 text-rose-400" aria-hidden />;
  if (state === 'skipped') return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  if (state === 'working' && live) return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />;
  return <span className="inline-block h-3.5 w-3.5 rounded-full border border-border" aria-hidden />;
}

export function VertalTeamProgress({ team, live }: { team: TeamState; live: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-2 text-xs" aria-label="Vertal Team progress">
      <div className="grid grid-cols-3 gap-1">
        {TEAM_CORES.map((c) => (
          <div
            key={c.id}
            className={cn(
              'rounded-lg px-2 py-1 text-center font-medium',
              team.cores[c.id] === 'done' && 'bg-emerald-500/15 text-emerald-300',
              team.cores[c.id] === 'working' && 'bg-primary/15 text-primary',
              team.cores[c.id] === 'waiting' && 'bg-secondary/50 text-muted-foreground',
            )}
          >
            {c.label}
          </div>
        ))}
      </div>
      <ul className="space-y-1">
        {team.roles.map((r) => (
          <li key={r.key} className="flex items-start gap-2">
            <span className="mt-0.5">
              <StateIcon state={r.state} live={live} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.label}</span>
              <span className="text-muted-foreground"> · {TEAM_STATE_LABEL[r.state]}</span>
              {r.detail && <span className="block truncate text-[11px] text-muted-foreground">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {team.decisions.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Vertal Decide · {team.decisions.length} quick {team.decisions.length === 1 ? 'decision' : 'decisions'}</summary>
          <ul className="mt-1 space-y-0.5">
            {team.decisions.map((d, i) => (
              <li key={i}>
                {d.label}: <b>{d.value}</b> ({Math.round(d.confidence * 100)}% · {TIER_LABEL[d.tier]})
              </li>
            ))}
          </ul>
        </details>
      )}
      {(team.memory || team.budget) && (
        <p className="text-[11px] text-muted-foreground">
          {team.memory?.available ? `Memory: used ${team.memory.used}${team.memory.saved ? ` · saved ${team.memory.saved}` : ''}` : team.memory ? 'Memory not available' : ''}
          {team.memory && team.budget ? ' · ' : ''}
          {team.budget ? `Budget: ${team.budget.calls}/${team.budget.maxCalls} calls${team.budget.stopped ? ' (limit reached)' : ''}` : ''}
        </p>
      )}
      {team.pkg && (
        <div className="space-y-1 rounded-lg bg-secondary/40 p-2">
          <p className={cn('font-medium', team.pkg.verified ? 'text-emerald-300' : 'text-amber-300')}>
            Package: {team.pkg.files.length} {team.pkg.files.length === 1 ? 'file' : 'files'} · {team.pkg.verified ? 'verified' : 'not fully verified'}
            {team.pkg.readyToShip === true && ' · ready to deliver'}
          </p>
          {team.pkg.humanReview && <p className="text-amber-300">A person should review this before you publish.</p>}
          {team.pkg.questions.length > 0 && (
            <ul className="list-disc pl-4">
              {team.pkg.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
