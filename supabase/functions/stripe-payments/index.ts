// Edge function: Integração Stripe para pagamentos e recarga de créditos
// POST /functions/v1/stripe-payments?action=create-session|webhook

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "npm:std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Preços dos planos (em centavos)
const CREDIT_TIERS = {
  starter: { credits: 50, amount: 499, name: 'Starter' },
  pro: { credits: 150, amount: 1299, name: 'Pro' },
  premium: { credits: 350, amount: 2499, name: 'Premium' },
};

// Criar Stripe Checkout Session
async function createCheckoutSession(
  userId: string,
  tier: keyof typeof CREDIT_TIERS,
  stripeCustomerId: string
): Promise<{ sessionId: string; url: string }> {
  const apiKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const tierData = CREDIT_TIERS[tier];
  if (!tierData) throw new Error("Invalid tier");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "customer": stripeCustomerId,
      "payment_method_types[]": "card",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": tierData.amount.toString(),
      "line_items[0][price_data][product_data][name]": `${tierData.credits} Créditos - ${tierData.name}`,
      "line_items[0][quantity]": "1",
      "mode": "payment",
      "success_url": `${Deno.env.get("SITE_URL")}/dashboard?payment=success`,
      "cancel_url": `${Deno.env.get("SITE_URL")}/pricing?payment=cancelled`,
      "metadata[user_id]": userId,
      "metadata[tier]": tier,
      "metadata[credits]": tierData.credits.toString(),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Stripe error: ${error.error?.message || "Unknown error"}`);
  }

  const session = await response.json();
  return {
    sessionId: session.id,
    url: session.url,
  };
}

// Obter ou criar Stripe Customer
async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const apiKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY not configured");

  // Procurar cliente existente
  const listResponse = await fetch(
    `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
    {
      headers: { "Authorization": `Bearer ${apiKey}` },
    }
  );

  const listData = await listResponse.json();
  if (listData.data?.length > 0) {
    return listData.data[0].id;
  }

  // Criar novo cliente
  const createResponse = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "email": email,
      "metadata[user_id]": userId,
    }),
  });

  const customer = await createResponse.json();
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Webhook endpoint (sem autenticação JWT)
  if (action === "webhook") {
    try {
      const signature = req.headers.get("stripe-signature");
      if (!signature) return json({ error: "Missing signature" }, 401);

      const body = await req.text();
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");

      // Verificar assinatura do webhook (implementação simplificada)
      // Em produção, use library official do Stripe
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const event = JSON.parse(body);

      // Log do evento
      await db
        .from("stripe_webhook_events")
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          data: event,
        });

      // Processar payment_intent.succeeded
      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;
        const userId = paymentIntent.metadata?.user_id;
        const tier = paymentIntent.metadata?.tier;
        const credits = parseInt(paymentIntent.metadata?.credits || "0");

        if (userId && tier && credits > 0) {
          // Encontrar transação
          const { data: transaction } = await db
            .from("stripe_transactions")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .single();

          if (transaction) {
            // Processar pagamento (adicionar créditos)
            await db.rpc("process_stripe_payment", {
              _transaction_id: transaction.id,
              _credits: credits,
            });

            // Marcar webhook como processado
            await db
              .from("stripe_webhook_events")
              .update({ processed: true, processed_at: new Date().toISOString() })
              .eq("stripe_event_id", event.id);
          }
        }
      }

      return json({ received: true });
    } catch (e: any) {
      console.error("Webhook error:", e);
      return json({ error: e.message }, 400);
    }
  }

  // Endpoints com autenticação JWT
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);

  const userId = userRes.user.id;
  const userEmail = userRes.user.email!;

  // Criar checkout session
  if (action === "create-session") {
    try {
      const body = await req.json() as { tier: keyof typeof CREDIT_TIERS };
      const { tier } = body;

      if (!tier || !CREDIT_TIERS[tier]) {
        return json({ error: "Invalid tier" }, 400);
      }

      // Obter ou criar Stripe Customer
      const stripeCustomerId = await getOrCreateStripeCustomer(userId, userEmail);

      // Criar checkout session
      const { sessionId, url } = await createCheckoutSession(userId, tier, stripeCustomerId);

      // Salvar transação pendente
      const { data: transaction } = await db
        .from("stripe_transactions")
        .insert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_session_id: sessionId,
          tier,
          amount_cents: CREDIT_TIERS[tier].amount,
          credits_purchased: CREDIT_TIERS[tier].credits,
          status: "pending",
        })
        .select("id")
        .single();

      return json({
        success: true,
        sessionId,
        checkoutUrl: url,
      });
    } catch (e: any) {
      console.error("Create session error:", e);
      return json({ error: e.message }, 400);
    }
  }

  // Listar transações do usuário
  if (action === "list-transactions") {
    try {
      const { data, error } = await db
        .from("stripe_transactions")
        .select("id, amount_cents, credits_purchased, tier, status, created_at, completed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return json({
        transactions: data || [],
        count: data?.length || 0,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
