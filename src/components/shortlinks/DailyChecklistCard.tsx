import { CheckCircle2, Circle, Gift, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DAILY_CHECKLIST_NOTICE, type DailyChecklist } from "@/lib/dailyRewards";

/** Checklist do dia no topo de /recompensas: aviso, as 3 atividades obrigatórias e os créditos. */
export default function DailyChecklistCard({ checklist }: { checklist: DailyChecklist | null }) {
  const total = checklist?.music_tracks_total ?? 5;
  // Terceiro passo: vídeo premiado extra (o servidor ainda o chama de "terra"; fecha com
  // terra_fallback_videos_required vídeos no dia, padrão 2 = o do checklist + 1 extra).
  const extraVideos = checklist?.terra_fallback_videos_required ?? 2;
  const items = [
    {
      key: "video",
      label: "Watch the reward video",
      detail: checklist ? `${checklist.videos_today} today` : "",
      done: checklist?.video_done ?? false,
    },
    {
      key: "music",
      label: "Listen to the 5 Kubo songs",
      detail: checklist ? `${checklist.music_tracks_counted}/${total}` : `0/${total}`,
      done: checklist?.music_done ?? false,
    },
    {
      key: "extra-video",
      label: "Watch 1 more reward video",
      detail: checklist ? `${Math.min(checklist.videos_today, extraVideos)}/${extraVideos} videos` : "",
      done: checklist?.terra_done ?? false,
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const completed = checklist?.completed ?? false;

  return (
    <Card className="rounded-2xl border-white/[0.06] bg-card/50" data-testid="daily-checklist">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-5 w-5 text-primary" />
            Today's activities
          </CardTitle>
          <span className="text-xs text-muted-foreground" data-testid="daily-checklist-progress">
            {doneCount}/3 done
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
          data-testid="daily-checklist-notice"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>{DAILY_CHECKLIST_NOTICE}</p>
        </div>

        <Progress value={(doneCount / 3) * 100} className="h-2" />

        <ul className="grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                item.done ? "border-green-500/40 bg-green-500/5" : "border-border/60"
              }`}
              data-testid={`daily-checklist-${item.key}`}
              data-done={item.done}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground" data-testid="daily-checklist-credits">
          {completed
            ? `Today's rewards are released: ${checklist?.released_credits ?? 0} credit(s) added to your balance.`
            : `Pending credits today: ${checklist?.pending_credits ?? 0}. They go to your balance when you finish the 3 activities. If the day ends first (midnight, Brasília time), they expire.`}
        </p>
      </CardContent>
    </Card>
  );
}
