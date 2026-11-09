// Edge function: recompensa por vídeo-propaganda e saque de créditos.
// POST /functions/v1/video-rewards?action=status | claim | withdraw
//
// - status:   saldo, última recompensa e quando a próxima fica disponível.
// - claim:    credita 0,020 e inicia a janela de 1 hora. Limite: 1 vídeo por hora por usuário.
// - withdraw: body { pix_key, amount? }. Mínimo 5 créditos. Pedido fica 'pending' para pagamento manual.
//
// A trava de 1 hora e os valores ficam no banco (funções claim_video_reward e
// request_credit_withdrawal). Esta função só autentica o usuário e repassa a chamada.

import { createClient } from "npm:@supabase/supabase-js@^2";
import { sanitizeError } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Espelham as constantes do banco e de src/config/rewardsConfig.ts. Mantenha em sincronia.
const REWARD_PER_VIDEO = 0.02;
const COOLDOWN_MS = 60 * 60 * 1000;
const MIN_WITHDRAW = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const action = new URL(req.url).searchParams.get("action") || "status";

    if (action === "status") {
      const { data: wallet, error } = await admin
        .from("video_reward_wallets")
        .select("balance, last_claimed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      const lastClaimedAt = wallet?.last_claimed_at ? new Date(wallet.last_claimed_at) : null;
      const nextAvailableAt = lastClaimedAt
        ? new Date(lastClaimedAt.getTime() + COOLDOWN_MS)
        : null;
      const canClaim = !nextAvailableAt || nextAvailableAt.getTime() <= Date.now();

      return json({
        balance: toNumber(wallet?.balance),
        reward_per_video: REWARD_PER_VIDEO,
        cooldown_seconds: COOLDOWN_MS / 1000,
        min_withdraw: MIN_WITHDRAW,
        can_claim: canClaim,
        next_available_at: canClaim ? null : nextAvailableAt!.toISOString(),
      });
    }

    if (action === "claim") {
      const { data, error } = await admin.rpc("claim_video_reward", {
        _user_id: user.id,
        _amount: REWARD_PER_VIDEO,
      });
      if (error) throw error;

      const result = data as {
        claimed: boolean;
        balance: number | string;
        next_available_at: string;
      };

      if (!result.claimed) {
        return json(
          {
            error: "Video reward already claimed this hour",
            code: "cooldown",
            balance: toNumber(result.balance),
            next_available_at: result.next_available_at,
          },
          429,
        );
      }

      return json({
        success: true,
        credits_earned: REWARD_PER_VIDEO,
        balance: toNumber(result.balance),
        next_available_at: result.next_available_at,
      });
    }

    if (action === "withdraw") {
      const body = (await req.json().catch(() => ({}))) as {
        pix_key?: unknown;
        amount?: unknown;
      };
      const pixKey = typeof body.pix_key === "string" ? body.pix_key.trim() : "";
      if (pixKey.length < 3 || pixKey.length > 140) {
        return json({ error: "Informe uma chave PIX válida", code: "invalid_pix_key" }, 400);
      }

      const amount = body.amount === undefined || body.amount === null
        ? null
        : toNumber(body.amount);

      const { data, error } = await admin.rpc("request_credit_withdrawal", {
        _user_id: user.id,
        _pix_key: pixKey,
        _amount: amount,
      });

      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("below_minimum")) {
          return json(
            { error: `O saque mínimo é de ${MIN_WITHDRAW} créditos`, code: "below_minimum" },
            400,
          );
        }
        if (msg.includes("invalid_amount")) {
          return json({ error: "Valor de saque inválido", code: "invalid_amount" }, 400);
        }
        if (msg.includes("invalid_pix_key")) {
          return json({ error: "Informe uma chave PIX válida", code: "invalid_pix_key" }, 400);
        }
        throw error;
      }

      const result = data as { request_id: string; amount: number | string; balance: number | string };
      return json({
        success: true,
        request_id: result.request_id,
        amount: toNumber(result.amount),
        balance: toNumber(result.balance),
        status: "pending",
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("video-rewards error:", err);
    return json({ error: sanitizeError(err) }, 500);
  }
});
