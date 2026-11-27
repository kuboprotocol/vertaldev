import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { rewardedAdUnit, showRewardedAd, type RewardedOutcome } from "@/lib/gamRewarded";
import {
  APPLIXIR_CONTAINER_ID,
  applixirApiKey,
  loadApplixirSdk,
  showApplixirAd,
} from "@/lib/applixirRewarded";

export type RewardedProvider = "applixir" | "gam";

/** Resposta da função `rewarded-video-claim` (status/start/claim). */
export interface RewardedVideoStatus {
  amount: number;
  daily_cap: number;
  cooldown_seconds: number;
  claimed_today: number;
  remaining_today: number;
  next_available_at: string | null;
  can_watch: boolean;
  reason: "daily_cap_reached" | "cooldown" | null;
  nonce?: string;
  success?: boolean;
  credits_earned?: number;
  /** true quando o crédito ficou pendente até o checklist do dia fechar. */
  pending?: boolean;
  error?: string;
}

async function callRewardedVideo(
  action: "status" | "start" | "claim",
  body: Record<string, unknown> = {},
): Promise<RewardedVideoStatus> {
  const { data, error } = await supabase.functions.invoke(
    `rewarded-video-claim?action=${action}`,
    { method: "POST", body: { ...body, action } },
  );
  if (error) {
    // Recusas de regra (cooldown, limite, nonce usado) vêm com o estado atual no corpo.
    const payload = await (error as { context?: Response }).context
      ?.json?.()
      .catch(() => null);
    if (payload && typeof payload.daily_cap === "number") {
      return payload as RewardedVideoStatus;
    }
    throw error;
  }
  return data as RewardedVideoStatus;
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * "Assistir vídeo e ganhar créditos": a cada clique abre um vídeo premiado.
 * Provedor: AppLixir (VITE_APPLIXIR_API_KEY) e, se não houver, Google Ad Manager
 * (VITE_GAM_REWARDED_AD_UNIT). O crédito é decidido no servidor (nonce de uso único,
 * tempo mínimo, cooldown e limite diário em São Paulo); o navegador só avisa que o vídeo terminou.
 */
export default function RewardedVideoPanel({
  onCredited,
  adUnit = rewardedAdUnit(),
  applixirKey = applixirApiKey(),
}: {
  onCredited?: () => void;
  adUnit?: string | null;
  applixirKey?: string | null;
}) {
  const provider: RewardedProvider | null = applixirKey ? "applixir" : adUnit ? "gam" : null;
  const [status, setStatus] = useState<RewardedVideoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!provider) return;
    try {
      setStatus(await callRewardedVideo("status"));
    } catch {
      /* status é só informativo; o botão continua tentando no clique */
    }
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Carrega o SDK da AppLixir já na abertura do painel (só o script, nenhum anúncio é pedido),
  // para o clique abrir o vídeo sem esperar o download.
  useEffect(() => {
    if (provider === "applixir") void loadApplixirSdk().catch(() => undefined);
  }, [provider]);

  const nextMs = status?.next_available_at
    ? Date.parse(status.next_available_at)
    : null;
  const waitMs = nextMs === null ? 0 : nextMs - now;

  useEffect(() => {
    if (nextMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [nextMs]);

  const handleWatch = async () => {
    if (busy) return;
    if (!provider) {
      toast.info("Reward videos are not available yet. Please check back soon.");
      return;
    }
    setBusy(true);
    try {
      let started: RewardedVideoStatus;
      try {
        started = await callRewardedVideo("start", { provider });
      } catch {
        toast.error("We could not start the video. Please try again in a moment.");
        return;
      }
      setStatus(started);
      setNow(Date.now());
      if (!started.nonce) {
        toast.info(
          started.reason === "daily_cap_reached"
            ? "You watched all of today's videos. Come back tomorrow."
            : "Please wait a little before the next video.",
        );
        return;
      }
      const nonce = started.nonce;

      const onGranted = async () => {
        try {
          const claimed = await callRewardedVideo("claim", { nonce });
          setStatus(claimed);
          setNow(Date.now());
          if (claimed.success) {
            const n = claimed.credits_earned ?? 1;
            toast.success(
              claimed.pending
                ? `Video done. +${n} pending credit${n === 1 ? "" : "s"}: finish today's activities to release ${n === 1 ? "it" : "them"}.`
                : `+${n} credit${n === 1 ? "" : "s"} for the video.`,
            );
            onCredited?.();
          } else {
            toast.info("We could not give credit for this video.");
          }
        } catch {
          toast.error("We could not add the credit for this video right now.");
        }
      };

      const outcome: RewardedOutcome =
        provider === "applixir" && applixirKey
          ? await showApplixirAd({ apiKey: applixirKey, onGranted, customData: { nonce } })
          : await showRewardedAd({ adUnit: adUnit as string, onGranted });

      if (outcome.kind === "no_fill") {
        toast.info("No video is available right now. Please try again in a few minutes.");
      } else if (outcome.kind === "unsupported") {
        toast.info("Your browser does not support reward videos. Try your phone or another browser.");
      } else if (outcome.kind === "closed_without_reward") {
        toast.info("Watch the video to the end to earn the credit.");
      } else if (outcome.kind === "error") {
        toast.error("We could not load the video. If you use an ad blocker, allow vertal.dev and try again.");
      }
    } catch {
      toast.error("We could not start the video right now.");
    } finally {
      setBusy(false);
    }
  };

  const capReached = status?.remaining_today === 0;
  const coolingDown = waitMs > 0;
  const disabled = busy || capReached || coolingDown;

  let label = "Watch a video and earn credits";
  if (busy) label = "Loading video…";
  else if (status?.remaining_today === 0) label = "Daily limit reached";
  else if (waitMs > 0) label = `Next video in ${countdown(waitMs)}`;

  return (
    <Card className="rounded-2xl border-white/[0.06] bg-card/50" data-testid="rewarded-video-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlayCircle className="h-5 w-5 text-primary" />
          Reward video
        </CardTitle>
        <CardDescription>
          {provider
            ? `Watch a short video to the end and earn ${status?.amount ?? 1} credit${(status?.amount ?? 1) === 1 ? "" : "s"}. Up to ${status?.daily_cap ?? 10} per day.`
            : "Coming soon: watch short videos and earn credits."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* O player da AppLixir se injeta aqui; precisa ficar montado. */}
        {provider === "applixir" && <div id={APPLIXIR_CONTAINER_ID} data-testid="applixir-ad-container" />}
        <Button
          className="w-full rounded-full"
          onClick={handleWatch}
          disabled={disabled}
          data-testid="rewarded-video-button"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="mr-2 h-4 w-4" />
          )}
          {label}
        </Button>
        {provider && status && (
          <p className="text-xs text-muted-foreground" data-testid="rewarded-video-progress">
            Today: {status.claimed_today}/{status.daily_cap} videos
          </p>
        )}
      </CardContent>
    </Card>
  );
}
