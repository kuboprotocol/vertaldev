// Vertal Vibe Pay: cadastro único (função `wallet`).
//
//   pay-open   { name, cpfCnpj, birthDate?, email, mobilePhone, postalCode, address,
//                addressNumber, complement?, province, city, state, incomeValue,
//                companyType?, returnPath? }
//              -> abre a subconta ASAAS e a conta Stripe Express (pré-preenchida)
//                 { asaas, stripe, status, nextUrl }
//   pay-status -> status combinado das duas contas { status, asaas, stripe }
//
// Regras (docs/VERTAL_BANK.md §cadastro único):
//   * Valida com a mesma função do formulário (`_shared/payOnboarding.ts`).
//   * Cada provedor é independente: se um falha, o outro fica aberto e o
//     cliente mostra a mensagem e o botão "tentar de novo".
//   * Idempotente: linha local existente -> pula; ASAAS: procura subconta da
//     plataforma com o mesmo CPF/CNPJ ou e-mail antes de criar; Stripe: conta
//     já vinculada / adotada (metadata) e chave de idempotência por dados.
//   * Nunca chama o ASAAS se a CONNECTOR_ENC_KEY não serve (a apiKey da
//     subconta só é devolvida uma vez).

import type Stripe from "npm:stripe@^14";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import { encryptSecret, encryptionReady } from "../_shared/connectorCrypto.ts";
import { asaasConfigured, asaasEnv, asaasRoot, AsaasError, ASAAS_WEBHOOK_EVENTS } from "../_shared/asaas.ts";
import {
  combinePayStatus, runPayOpen, validatePayOpen, PAY_FIELD_MESSAGES,
  type AsaasSnapshot, type PayOpenDeps, type StripeSnapshot,
} from "../_shared/payOnboarding.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respostas dos provedores e linhas do banco sem tipo gerado
type Row = Record<string, any>;

export const PAY_ACTIONS = new Set(["pay-open", "pay-status"]);

export interface PayCtx {
  user: User;
  db: SupabaseClient;
  body: Row;
  json: (body: unknown, status?: number) => Response;
  stripeClient: () => Stripe;
  getConnected: () => Promise<string | null>;
  adoptExisting: (stripe: Stripe) => Promise<string | null>;
  syncAccountRow: (a: Stripe.Account) => Promise<void>;
  accountLink: (stripe: Stripe, accountId: string) => Promise<{ url: string }>;
  platformCnpj: string;
}

function maskDoc(doc: string) {
  return doc.length === 11
    ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
    : `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-**`;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function stripeSnapshot(a: Stripe.Account): StripeSnapshot {
  const r = a.requirements;
  return {
    detailsSubmitted: Boolean(a.details_submitted),
    chargesEnabled: Boolean(a.charges_enabled),
    payoutsEnabled: Boolean(a.payouts_enabled),
    requirementsDue: new Set([...(r?.past_due ?? []), ...(r?.currently_due ?? [])]).size,
    disabledReason: r?.disabled_reason ?? null,
  };
}

export async function handlePayAction(action: string, ctx: PayCtx): Promise<Response> {
  const { user, db, body, json } = ctx;
  const stripeConfigured = Boolean(Deno.env.get("STRIPE_SECRET_KEY"));

  const getAsaasRow = async () => {
    const { data } = await db.from("bank_asaas_accounts").select("id, status, holder_name, cpf_cnpj_masked, person_type")
      .eq("user_id", user.id).eq("env", asaasEnv()).maybeSingle();
    return data as Row | null;
  };

  if (action === "pay-status") {
    const row = asaasConfigured() ? await getAsaasRow() : null;
    let stripe: StripeSnapshot | null = null;
    let stripeError: string | null = null;
    if (stripeConfigured) {
      const accountId = await ctx.getConnected();
      if (accountId) {
        try {
          const a = await ctx.stripeClient().accounts.retrieve(accountId);
          await ctx.syncAccountRow(a);
          stripe = stripeSnapshot(a);
        } catch (e) {
          stripeError = (e as Error).message;
          // Sem resposta do Stripe: usa o espelho local.
          const { data: m } = await db.from("connected_accounts")
            .select("details_submitted, charges_enabled, payouts_enabled, requirements_due, requirements_disabled_reason")
            .eq("stripe_account_id", accountId).maybeSingle();
          if (m) {
            stripe = {
              detailsSubmitted: m.details_submitted, chargesEnabled: m.charges_enabled, payoutsEnabled: m.payouts_enabled,
              requirementsDue: (m.requirements_due ?? []).length, disabledReason: m.requirements_disabled_reason,
            };
          }
        }
      }
    }
    const asaas: AsaasSnapshot | null = row ? { status: row.status } : null;
    return json({
      status: combinePayStatus({ asaasConfigured: asaasConfigured(), stripeConfigured }, asaas, stripe),
      asaas: row ? { status: row.status, holderName: row.holder_name, document: row.cpf_cnpj_masked, personType: row.person_type } : null,
      stripe: stripe ? { ...stripe, error: stripeError } : null,
    });
  }

  // ── pay-open ────────────────────────────────────────────────────────────
  const v = validatePayOpen(body);
  if (!v.ok) {
    return json({
      error: "invalid_fields",
      fields: v.errors.map((e) => ({ ...e, message: PAY_FIELD_MESSAGES[e.code] ?? e.code })),
    }, 400);
  }
  const d = v.data;

  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const deps: PayOpenDeps = {
    userId: user.id,
    platformCnpj: ctx.platformCnpj,
    hash: sha256,
    log: (msg, extra) => console.warn(msg, extra ?? ""),
    asaas: !asaasConfigured() ? null : {
      encryptionReady,
      getRow: async () => {
        const r = await getAsaasRow();
        return r ? { status: r.status } : null;
      },
      findOwn: async ({ cpfCnpj, email }) => {
        const root = asaasRoot();
        let hit: Row | null = null;
        for (const query of [{ cpfCnpj }, { email }]) {
          try {
            const res = await root<Row>("GET", "/accounts", { query: { ...query, limit: 1 } });
            hit = Array.isArray(res.data) && res.data[0]?.id ? res.data[0] : null;
          } catch (e) {
            // Sem permissão de listar: segue para a criação (o ASAAS barra duplicatas).
            console.warn("pay-open: GET /accounts falhou", (e as Error).message);
          }
          if (hit) break;
        }
        if (!hit) return null;
        const { data: linked } = await db.from("bank_asaas_accounts").select("user_id")
          .eq("env", asaasEnv()).eq("asaas_account_id", String(hit.id)).maybeSingle();
        return { id: String(hit.id), walletId: String(hit.walletId ?? ""), linkedToOtherUser: Boolean(linked && linked.user_id !== user.id) };
      },
      recoverKey: async (accountId) => {
        // Exige "gerenciamento de chaves de subcontas" habilitado no painel do
        // ASAAS (temporário, com whitelist de IP). Sem isso o ASAAS recusa.
        try {
          const r = await asaasRoot()<Row>("POST", `/accounts/${encodeURIComponent(accountId)}/accessTokens`, {
            body: { name: "Vertal Vibe Pay" },
          });
          return r.apiKey ? String(r.apiKey) : null;
        } catch (e) {
          console.warn("pay-open: recuperação de chave da subconta recusada", accountId, (e as Error).message);
          return null;
        }
      },
      create: async (payload) => {
        const created = await asaasRoot()<Row>("POST", "/accounts", { body: payload });
        const apiKey = String(created.apiKey ?? created.accessToken ?? "");
        if (!apiKey || !created.id || !created.walletId) {
          console.error("pay-open: subconta criada sem apiKey/walletId", created.id);
          throw new AsaasError(502, [{ code: "asaas_account_incomplete", description: "O ASAAS não devolveu a chave da conta" }]);
        }
        return { id: String(created.id), walletId: String(created.walletId), apiKey };
      },
      store: async (acct) => {
        const enc = await encryptSecret(acct.apiKey);
        const { error } = await db.from("bank_asaas_accounts").insert({
          user_id: user.id,
          env: asaasEnv(),
          asaas_account_id: acct.id,
          wallet_id: acct.walletId,
          api_key_ciphertext: enc.ciphertext,
          api_key_iv: enc.iv,
          api_key_tag: enc.tag,
          person_type: d.personType,
          holder_name: d.name,
          cpf_cnpj_masked: maskDoc(d.cpfCnpj),
          status: "pending",
        });
        // 23505: corrida com outra requisição do mesmo usuário que já gravou.
        if (error && (error as Row).code !== "23505") throw error;
      },
      webhook: webhookToken ? {
        url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`,
        email: Deno.env.get("ASAAS_WEBHOOK_EMAIL") ?? d.email,
        authToken: webhookToken,
        events: ASAAS_WEBHOOK_EVENTS,
      } : null,
    },
    stripe: !stripeConfigured ? null : {
      getExisting: async () => (await ctx.getConnected()) ?? (await ctx.adoptExisting(ctx.stripeClient())),
      create: async (params, idempotencyKey) => {
        const a = await ctx.stripeClient().accounts.create(params as Stripe.AccountCreateParams, { idempotencyKey });
        const { error } = await db.from("connected_accounts").insert({
          user_id: user.id, stripe_account_id: a.id, contact_email: d.email,
          country: a.country ?? "BR", default_currency: a.default_currency ?? null,
        });
        // Já vinculada (retry com a mesma chave de idempotência devolve a mesma conta).
        if (error && (error as Row).code !== "23505") throw error;
        return a.id;
      },
      prefill: async (accountId, prefill) => {
        await ctx.stripeClient().accounts.update(accountId, prefill as Stripe.AccountUpdateParams);
      },
      snapshot: async (accountId) => {
        const a = await ctx.stripeClient().accounts.retrieve(accountId);
        await ctx.syncAccountRow(a);
        return stripeSnapshot(a);
      },
      onboardingLink: async (accountId) => (await ctx.accountLink(ctx.stripeClient(), accountId)).url,
    },
  };

  const result = await runPayOpen(deps, d);
  return json(result);
}
