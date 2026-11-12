// Edge Function: carteira do perfil (cartões de crédito/débito e chaves Pix).
//
// POST /functions/v1/wallet  body: { action, ... }
//   list                                   -> { cards, pix, publishableKey }
//   card-setup                             -> { clientSecret, publishableKey }
//   card-attach   { setupIntentId, label?, makeDefault? }
//   pix-add       { keyType, key, label?, countries?, makeDefault? }
//   set-default   { id }
//   remove        { id }
//
// Cartões nunca chegam aqui: o número é digitado no Stripe Elements e vira um
// PaymentMethod do Customer do Stripe. Guardamos só a referência e os dados de
// exibição (bandeira, final, validade, crédito/débito, país emissor).
// Chaves Pix são cifradas com CONNECTOR_ENC_KEY (AES-GCM).

import { createClient } from "npm:@supabase/supabase-js@^2";
import Stripe from "npm:stripe@^14";
import { encryptSecret } from "../_shared/connectorCrypto.ts";
import {
  normalizePixKey,
  validatePixKey,
  maskPixKey,
  PIX_COUNTRY_CODES,
  type PixKeyType,
} from "../_shared/pixKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ITEMS_PER_KIND = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripeClient() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Row = Record<string, any>;

function toCard(r: Row) {
  return {
    id: r.id,
    label: r.label,
    isDefault: r.is_default,
    brand: r.card_brand,
    last4: r.card_last4,
    expMonth: r.card_exp_month,
    expYear: r.card_exp_year,
    funding: r.card_funding,
    country: r.card_country,
    holderName: r.holder_name,
    createdAt: r.created_at,
  };
}

function toPix(r: Row) {
  return {
    id: r.id,
    label: r.label,
    isDefault: r.is_default,
    keyType: r.pix_key_type,
    maskedKey: r.pix_key_masked,
    countries: r.pix_countries,
    createdAt: r.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "invalid_token" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? null;

  let body: Row = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = String(body.action ?? "");

  const countKind = async (kind: "card" | "pix") => {
    const { count } = await db
      .from("wallet_payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("kind", kind);
    return count ?? 0;
  };

  const clearDefault = (kind: "card" | "pix") =>
    db.from("wallet_payment_methods").update({ is_default: false })
      .eq("user_id", user.id).eq("kind", kind).eq("is_default", true);

  const getOrCreateCustomer = async (stripe: Stripe) => {
    const { data: profile } = await db
      .from("profiles").select("stripe_customer_id, display_name").eq("id", user.id).maybeSingle();
    let customerId = (profile as Row | null)?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: (profile as Row | null)?.display_name || user.email || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await db.from("profiles").update({ stripe_customer_id: customerId } as Row).eq("id", user.id);
    }
    return customerId;
  };

  try {
    // ── Listar ────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data, error } = await db
        .from("wallet_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      return json({
        cards: rows.filter((r) => r.kind === "card").map(toCard),
        pix: rows.filter((r) => r.kind === "pix").map(toPix),
        publishableKey,
      });
    }

    // ── Cartão: iniciar (SetupIntent) ─────────────────────────────────────
    if (action === "card-setup") {
      if ((await countKind("card")) >= MAX_ITEMS_PER_KIND) return json({ error: "limit_reached" }, 400);
      if (!publishableKey) return json({ error: "STRIPE_PUBLISHABLE_KEY not configured" }, 500);
      const stripe = stripeClient();
      const customer = await getOrCreateCustomer(stripe);
      const intent = await stripe.setupIntents.create({
        customer,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { supabase_user_id: user.id, source: "wallet" },
      });
      return json({ clientSecret: intent.client_secret, publishableKey });
    }

    // ── Cartão: concluir (depois do confirmSetup no navegador) ────────────
    if (action === "card-attach") {
      const setupIntentId = String(body.setupIntentId ?? "");
      if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId)) return json({ error: "invalid_setup_intent" }, 400);

      const stripe = stripeClient();
      const customer = await getOrCreateCustomer(stripe);
      const intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
      if (intent.customer !== customer || intent.metadata?.supabase_user_id !== user.id) {
        return json({ error: "forbidden" }, 403);
      }
      if (intent.status !== "succeeded") return json({ error: `setup_${intent.status}` }, 400);

      const pm = intent.payment_method as Stripe.PaymentMethod | null;
      if (!pm?.card) return json({ error: "not_a_card" }, 400);

      // Mesmo cartão (fingerprint) já salvo? Remove o PaymentMethod novo e devolve o existente.
      const { data: existing } = await db
        .from("wallet_payment_methods")
        .select("id, stripe_payment_method_id")
        .eq("user_id", user.id).eq("kind", "card");
      if (pm.card.fingerprint && existing?.length) {
        for (const r of existing) {
          try {
            const old = await stripe.paymentMethods.retrieve(r.stripe_payment_method_id);
            if (old.card?.fingerprint === pm.card.fingerprint) {
              await stripe.paymentMethods.detach(pm.id);
              return json({ error: "duplicate_card" }, 409);
            }
          } catch { /* PaymentMethod antigo pode ter sido removido no Stripe */ }
        }
      }

      const makeDefault = Boolean(body.makeDefault) || (existing?.length ?? 0) === 0;
      if (makeDefault) {
        await clearDefault("card");
        await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm.id } });
      }

      const funding = ["credit", "debit", "prepaid"].includes(pm.card.funding) ? pm.card.funding : "unknown";
      const { data: row, error } = await db.from("wallet_payment_methods").insert({
        user_id: user.id,
        kind: "card",
        label: body.label ? String(body.label).slice(0, 40) : null,
        is_default: makeDefault,
        stripe_payment_method_id: pm.id,
        card_brand: pm.card.brand,
        card_last4: pm.card.last4,
        card_exp_month: pm.card.exp_month,
        card_exp_year: pm.card.exp_year,
        card_funding: funding,
        card_country: pm.card.country ?? null,
        holder_name: pm.billing_details?.name?.slice(0, 80) ?? null,
      }).select("*").single();
      if (error) throw error;
      return json({ card: toCard(row) });
    }

    // ── Pix: adicionar chave ──────────────────────────────────────────────
    if (action === "pix-add") {
      const keyType = String(body.keyType ?? "") as PixKeyType;
      if (!["cpf", "cnpj", "email", "phone", "random"].includes(keyType)) return json({ error: "invalid_key_type" }, 400);
      const raw = String(body.key ?? "");
      const invalid = validatePixKey(keyType, raw);
      if (invalid) return json({ error: invalid }, 400);
      if ((await countKind("pix")) >= MAX_ITEMS_PER_KIND) return json({ error: "limit_reached" }, 400);

      const key = normalizePixKey(keyType, raw);
      const requested = Array.isArray(body.countries) ? body.countries.map(String) : ["BR"];
      const countries = Array.from(new Set(["BR", ...requested.filter((c: string) => PIX_COUNTRY_CODES.includes(c))]));

      const hash = await sha256(`${user.id}:${key}`);
      const enc = await encryptSecret(key);
      const isFirst = (await countKind("pix")) === 0;
      const makeDefault = Boolean(body.makeDefault) || isFirst;
      if (makeDefault) await clearDefault("pix");

      const { data: row, error } = await db.from("wallet_payment_methods").insert({
        user_id: user.id,
        kind: "pix",
        label: body.label ? String(body.label).slice(0, 40) : null,
        is_default: makeDefault,
        pix_key_type: keyType,
        pix_key_ciphertext: enc.ciphertext,
        pix_key_iv: enc.iv,
        pix_key_tag: enc.tag,
        pix_key_masked: maskPixKey(keyType, key),
        pix_key_hash: hash,
        pix_countries: countries,
      }).select("*").single();
      if (error) {
        if ((error as Row).code === "23505") return json({ error: "duplicate_pix_key" }, 409);
        throw error;
      }
      return json({ pix: toPix(row) });
    }

    // ── Definir padrão / remover ──────────────────────────────────────────
    if (action === "set-default" || action === "remove") {
      const id = String(body.id ?? "");
      const { data: row } = await db
        .from("wallet_payment_methods").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!row) return json({ error: "not_found" }, 404);

      if (action === "set-default") {
        await clearDefault(row.kind);
        if (row.kind === "card") {
          const stripe = stripeClient();
          const customer = await getOrCreateCustomer(stripe);
          await stripe.customers.update(customer, { invoice_settings: { default_payment_method: row.stripe_payment_method_id } });
        }
        const { error } = await db.from("wallet_payment_methods").update({ is_default: true }).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      if (row.kind === "card" && row.stripe_payment_method_id) {
        try {
          await stripeClient().paymentMethods.detach(row.stripe_payment_method_id);
        } catch (e) {
          console.warn("wallet: detach falhou (seguindo com a remoção local)", e);
        }
      }
      const { error } = await db.from("wallet_payment_methods").delete().eq("id", id);
      if (error) throw error;

      // Se era o padrão, promove o mais recente do mesmo tipo.
      if (row.is_default) {
        const { data: next } = await db
          .from("wallet_payment_methods").select("id, stripe_payment_method_id")
          .eq("user_id", user.id).eq("kind", row.kind)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (next) {
          await db.from("wallet_payment_methods").update({ is_default: true }).eq("id", next.id);
          if (row.kind === "card" && next.stripe_payment_method_id) {
            const stripe = stripeClient();
            const customer = await getOrCreateCustomer(stripe);
            await stripe.customers.update(customer, { invoice_settings: { default_payment_method: next.stripe_payment_method_id } });
          }
        }
      }
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("wallet error:", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});
