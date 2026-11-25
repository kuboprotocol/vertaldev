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
import { rewardedAdUnit, showRewardedAd } from "@/lib/gamRewarded";

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
 * "Assistir vídeo e ganhar créditos": a cada clique pede um anúncio premiado do Google Ad Manager.
 * O crédito é decidido no servidor (nonce de uso único, cooldown e limite diário em São Paulo).
 */
export default function RewardedVideoPanel({
  onCredited,
  adUnit = rewardedAdUnit(),
}: {
  onCredited?: () => void;
  adUnit?: string | null;
}) {
  const [status, setStatus] = useState<RewardedVideoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!adUnit) return;
    try {
      setStatus(await callRewardedVideo("status"));
    } catch {
      /* status é só informativo; o botão continua tentando no clique */
    }
  }, [adUnit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    if (!adUnit || busy) return;
    setBusy(true);
    try {
      const started = await callRewardedVideo("start");
      setStatus(started);
      setNow(Date.now());
      if (!started.nonce) {
        toast.info(
          started.reason === "daily_cap_reached"
            ? "Você já assistiu todos os vídeos de hoje. Volte amanhã!"
            : "Aguarde um pouco antes do próximo vídeo.",
        );
        return;
      }
      const nonce = started.nonce;

      const outcome = await showRewardedAd({
        adUnit,
        onGranted: async () => {
          try {
            const claimed = await callRewardedVideo("claim", { nonce });
            setStatus(claimed);
            setNow(Date.now());
            if (claimed.success) {
              toast.success(
                `+${claimed.credits_earned} crédito${claimed.credits_earned === 1 ? "" : "s"} pelo vídeo!`,
              );
              onCredited?.();
            } else {
              toast.info("Esse vídeo não pôde ser creditado.");
            }
          } catch {
            toast.error("Não foi possível creditar o vídeo agora.");
          }
        },
      });

      if (outcome.kind === "no_fill") {
        toast.info("Nenhum vídeo disponível agora. Tente de novo em alguns minutos.");
      } else if (outcome.kind === "unsupported") {
        toast.info("Seu navegador não suporta vídeos premiados. Tente pelo celular ou outro navegador.");
      } else if (outcome.kind === "closed_without_reward") {
        toast.info("Assista o vídeo até o fim para ganhar o crédito.");
      } else if (outcome.kind === "error") {
        toast.error("Não foi possível carregar o vídeo (bloqueador de anúncios?).");
      }
    } catch {
      toast.error("Não foi possível iniciar o vídeo agora.");
    } finally {
      setBusy(false);
    }
  };

  const capReached = status?.remaining_today === 0;
  const coolingDown = waitMs > 0;
  const disabled = !adUnit || busy || capReached || coolingDown;

  let label = "Assistir vídeo e ganhar créditos";
  if (!adUnit) label = "Assistir vídeo e ganhar créditos (em breve)";
  else if (status?.remaining_today === 0) label = "Limite de hoje atingido";
  else if (waitMs > 0) label = `Próximo vídeo em ${countdown(waitMs)}`;

  return (
    <Card className="glass glass-border" data-testid="rewarded-video-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlayCircle className="h-5 w-5 text-primary" />
          Vídeo premiado
        </CardTitle>
        <CardDescription>
          {adUnit
            ? `Assista um vídeo curto até o fim e ganhe ${status?.amount ?? 1} crédito${(status?.amount ?? 1) === 1 ? "" : "s"}. Até ${status?.daily_cap ?? 10} por dia.`
            : "Em breve: assista vídeos curtos e ganhe créditos."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
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
        {adUnit && status && (
          <p className="text-xs text-muted-foreground" data-testid="rewarded-video-progress">
            Hoje: {status.claimed_today}/{status.daily_cap} vídeos
          </p>
        )}
      </CardContent>
    </Card>
  );
}
