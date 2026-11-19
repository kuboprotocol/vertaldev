// Vertal Vibe Pay: ações de e-bank da função `wallet` (Stripe conta global + ASAAS).
//
//   bank-overview                       -> saldos unificados, status dos provedores, flags
//   bank-statement  { limit? }          -> extrato unificado (bank_transactions + wallet_charges)
//   bank-provider-statement { provider, days? } -> extrato bruto do provedor (ASAAS financialTransactions / Stripe balance transactions)
//   bank-receive    { method, amount, description?, payer?, dueDays? }  -> cobrança ASAAS (pix/boleto/card/link)
//   bank-send-pix   { amount, pixKeyType, pixKey | pixId, description? } -> Pix de saída (ASAAS)
//   bank-payout     { amount, currency }                                 -> saque Stripe para o banco da conta conectada
//   bank-payout-mode { mode: automatic | manual }
//   asaas-open      { ...dados cadastrais }                              -> cria a subconta ASAAS do usuário
//   asaas-status                                                         -> situação cadastral da subconta
//   asaas-card-charge { amount, description?, payer, card | tokenId, saveCard? } (flag ASAAS_DIRECT_CARD_ENABLED)
//   asaas-card-tokens                                                    -> tokens de cartão salvos (pagadores)
//
// Tudo que é ASAAS fica inerte sem ASAAS_API_KEY (erro `asaas_not_configured`).

import type Stripe from "npm:stripe@^14";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import { encryptSecret, decryptSecret } from "../_shared/connectorCrypto.ts";
import {
  asaasConfigured, asaasEnv, asaasRoot, asaasAs, AsaasError, AsaasNotConfigured,
  mapPaymentStatus, mapTransferStatus, PIX_KEY_TYPE_TO_ASAAS, ASAAS_WEBHOOK_EVENTS, dueDateIn,
} from "../_shared/asaas.ts";
import { routeReceive, type ReceiveMethod } from "../_shared/bankRouting.ts";
import { findCurrency, toMinorUnits, PLATFORM_FEE_RATE } from "../_shared/walletCurrency.ts";
import { isValidCpf, isValidCnpj, normalizePixKey, validatePixKey, type PixKeyType } from "../_shared/pixKeys.ts";

type Row = Record<string, any>;

export interface BankCtx {
  req: Request;
  user: User;
  db: SupabaseClient;
  body: Row;
  json: (body: unknown, status?: number) => Response;
  stripeClient: () => Stripe;
  getConnected: () => Promise<string | null>;
}

export const BANK_ACTIONS = new Set([
  "bank-overview", "bank-statement", "bank-provider-statement", "bank-receive", "bank-send-pix",
  "bank-payout", "bank-payout-mode", "asaas-open", "asaas-status", "asaas-card-charge", "asaas-card-tokens",
]);

const flag = (name: string) => (Deno.env.get(name) ?? "").toLowerCase() === "true";
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const toCents = (v: number) => Math.round(v * 100);
const fromCents = (v: number) => Math.round(v) / 100;

/** Limites por operação de saída (BRL), configuráveis por env. */
const PIX_OUT_MAX = Number(Deno.env.get("BANK_PIX_OUT_MAX_BRL") ?? "5000");

function maskDoc(doc: string) {
  return doc.length === 11
    ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
    : `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-**`;
}

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  return xf.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
}

function toTx(r: Row) {
  return {
    id: r.id,
    provider: r.provider,
    direction: r.direction,
    method: r.method,
    status: r.status,
    amountMinor: Number(r.amount_minor),
    netMinor: r.net_minor === null || r.net_minor === undefined ? null : Number(r.net_minor),
    currency: String(r.currency).toUpperCase(),
    description: r.description,
    counterparty: r.counterparty,
    url: r.checkout_url,
    pixPayload: r.status === "pending" ? r.pix_payload : null,
    boletoLine: r.status === "pending" ? r.boleto_line : null,
    receiptUrl: r.receipt_url,
    failureReason: r.failure_reason,
    dueDate: r.due_date,
    settledAt: r.settled_at,
    createdAt: r.created_at,
  };
}

/** Linha antiga de wallet_charges (Stripe Connect) no formato do extrato. */
function chargeToTx(r: Row) {
  const status = r.status === "open" ? "pending" : r.status;
  return {
    id: r.id,
    provider: "stripe",
    direction: "in",
    method: "link",
    status,
    amountMinor: Number(r.amount_minor),
    netMinor: Number(r.amount_minor) - Number(r.platform_fee_minor ?? 0),
    currency: String(r.currency).toUpperCase(),
    description: r.description,
    counterparty: null,
    url: r.status === "open" ? r.checkout_url : null,
    pixPayload: null,
    boletoLine: null,
    receiptUrl: null,
    failureReason: null,
    dueDate: null,
    settledAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export async function handleBankAction(action: string, ctx: BankCtx): Promise<Response> {
  const { req, user, db, body, json, stripeClient, getConnected } = ctx;

  // ── ASAAS: subconta do usuário ─────────────────────────────────────────
  const getAsaasRow = async () => {
    const { data } = await db.from("bank_asaas_accounts").select("*")
      .eq("user_id", user.id).eq("env", asaasEnv()).maybeSingle();
    return data as Row | null;
  };
  const asaasFor = async () => {
    if (!asaasConfigured()) throw new AsaasNotConfigured();
    const row = await getAsaasRow();
    if (!row) return null;
    const key = await decryptSecret({ ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, tag: row.api_key_tag });
    return { row, api: asaasAs(key) };
  };
  const asaasReadyRow = (row: Row | null) => Boolean(row && asaasConfigured() && row.status !== "rejected");

  const syncAsaasStatus = async (row: Row, api: ReturnType<typeof asaasAs>) => {
    const st = await api<Row>("GET", "/myAccount/status/");
    const general = String(st.general ?? "PENDING");
    const status = general === "APPROVED" ? "approved"
      : general === "REJECTED" ? "rejected"
      : general === "AWAITING_APPROVAL" ? "awaiting_approval" : "pending";
    await db.from("bank_asaas_accounts").update({
      status,
      status_detail: {
        commercialInfo: st.commercialInfo ?? null,
        bankAccountInfo: st.bankAccountInfo ?? null,
        documentation: st.documentation ?? null,
        general,
      },
      status_synced_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { status, detail: { commercialInfo: st.commercialInfo, bankAccountInfo: st.bankAccountInfo, documentation: st.documentation, general } };
  };

  /** Cliente (pagador) dentro da subconta: busca por CPF/CNPJ, senão cria. */
  const ensureCustomer = async (api: ReturnType<typeof asaasAs>, payer: Row) => {
    const doc = onlyDigits(payer.cpfCnpj);
    if (!(isValidCpf(doc) || isValidCnpj(doc))) throw Object.assign(new Error("invalid_payer_document"), { status: 400 });
    const name = String(payer.name ?? "").trim().slice(0, 100);
    if (!name) throw Object.assign(new Error("missing_payer_name"), { status: 400 });
    const found = await api<Row>("GET", "/customers", { query: { cpfCnpj: doc, limit: 1 } });
    const existing = Array.isArray(found.data) ? found.data[0] : null;
    if (existing?.id) return String(existing.id);
    const created = await api<Row>("POST", "/customers", {
      body: {
        name,
        cpfCnpj: doc,
        email: payer.email ? String(payer.email).slice(0, 100) : undefined,
        mobilePhone: payer.phone ? onlyDigits(payer.phone) : undefined,
        postalCode: payer.postalCode ? onlyDigits(payer.postalCode) : undefined,
        addressNumber: payer.addressNumber ? String(payer.addressNumber).slice(0, 10) : undefined,
        externalReference: `vb:${user.id}`,
        notificationDisabled: true,
      },
    });
    return String(created.id);
  };

  /** Split de 1% para a carteira ASAAS da plataforma, se configurada. */
  const platformSplit = () => {
    const walletId = Deno.env.get("ASAAS_PLATFORM_WALLET_ID");
    return walletId ? [{ walletId, percentualValue: PLATFORM_FEE_RATE * 100 }] : undefined;
  };

  try {
    // ── Visão geral ──────────────────────────────────────────────────────
    if (action === "bank-overview") {
      const out: Row = {
        flags: {
          asaasConfigured: asaasConfigured(),
          asaasEnv: asaasEnv(),
          asaasDirectCard: flag("ASAAS_DIRECT_CARD_ENABLED"),
          stripeTreasury: flag("BANK_STRIPE_TREASURY_ENABLED"),
          stripeGlobalPayouts: flag("BANK_STRIPE_GLOBAL_PAYOUTS_ENABLED"),
          platformFeeRate: PLATFORM_FEE_RATE,
          pixOutMaxBrl: PIX_OUT_MAX,
        },
        stripe: { configured: Boolean(Deno.env.get("STRIPE_SECRET_KEY")), account: null, balances: [], externalAccounts: [], payoutSchedule: null, financialAccounts: null, error: null },
        asaas: { configured: asaasConfigured(), account: null, balance: null, error: null },
      };

      // Stripe: conta global (Connect)
      const accountId = out.stripe.configured ? await getConnected() : null;
      if (accountId) {
        try {
          const stripe = stripeClient();
          const [a, bal, ext] = await Promise.all([
            stripe.accounts.retrieve(accountId),
            stripe.balance.retrieve({ stripeAccount: accountId }),
            stripe.accounts.listExternalAccounts(accountId, { limit: 10 }),
          ]);
          const byCur: Record<string, { available: number; pending: number }> = {};
          for (const x of bal.available ?? []) (byCur[x.currency] ??= { available: 0, pending: 0 }).available += x.amount;
          for (const x of bal.pending ?? []) (byCur[x.currency] ??= { available: 0, pending: 0 }).pending += x.amount;
          out.stripe.account = {
            id: a.id,
            country: a.country,
            defaultCurrency: a.default_currency?.toUpperCase() ?? null,
            chargesEnabled: a.charges_enabled,
            payoutsEnabled: a.payouts_enabled,
            detailsSubmitted: a.details_submitted,
          };
          out.stripe.balances = Object.entries(byCur).map(([c, v]) => ({ currency: c.toUpperCase(), availableMinor: v.available, pendingMinor: v.pending }));
          out.stripe.externalAccounts = (ext.data ?? []).map((e: Row) => ({
            id: e.id,
            kind: e.object,
            bankName: e.bank_name ?? e.brand ?? null,
            last4: e.last4,
            currency: String(e.currency ?? "").toUpperCase(),
            country: e.country ?? null,
            isDefault: Boolean(e.default_for_currency),
          }));
          out.stripe.payoutSchedule = a.settings?.payouts?.schedule?.interval ?? null;
          await db.from("connected_accounts").update({ country: a.country ?? null, default_currency: a.default_currency ?? null } as Row)
            .eq("stripe_account_id", a.id).eq("user_id", user.id);

          // Treasury (Financial Accounts v1) — só com a flag e onde o Stripe liberar (EUA).
          if (out.flags.stripeTreasury) {
            try {
              const fas = await stripe.treasury.financialAccounts.list({ limit: 5 }, { stripeAccount: accountId });
              out.stripe.financialAccounts = fas.data.map((f) => ({
                id: f.id,
                status: f.status,
                currencies: f.supported_currencies,
                cashMinor: f.balance?.cash ?? {},
              }));
            } catch (e) {
              out.stripe.financialAccounts = { unavailable: (e as Error).message };
            }
          }
        } catch (e) {
          out.stripe.error = (e as Error).message;
        }
      }

      // ASAAS: subconta
      if (asaasConfigured()) {
        try {
          const ctxA = await asaasFor();
          if (ctxA) {
            const [st, bal] = await Promise.all([
              syncAsaasStatus(ctxA.row, ctxA.api).catch(() => ({ status: ctxA.row.status, detail: ctxA.row.status_detail })),
              ctxA.api<Row>("GET", "/finance/balance").catch(() => null),
            ]);
            out.asaas.account = {
              env: ctxA.row.env,
              holderName: ctxA.row.holder_name,
              document: ctxA.row.cpf_cnpj_masked,
              personType: ctxA.row.person_type,
              status: st.status,
              statusDetail: st.detail,
            };
            out.asaas.balance = bal ? { currency: "BRL", availableMinor: toCents(Number(bal.balance ?? 0)) } : null;
          }
        } catch (e) {
          out.asaas.error = (e as Error).message;
        }
      }

      // Totais por moeda (disponível) somando os dois provedores.
      const totals: Record<string, { availableMinor: number; pendingMinor: number }> = {};
      for (const b of out.stripe.balances as Row[]) {
        const t = (totals[b.currency] ??= { availableMinor: 0, pendingMinor: 0 });
        t.availableMinor += b.availableMinor; t.pendingMinor += b.pendingMinor;
      }
      if (out.asaas.balance) {
        (totals.BRL ??= { availableMinor: 0, pendingMinor: 0 }).availableMinor += out.asaas.balance.availableMinor;
      }
      out.totals = Object.entries(totals).map(([currency, v]) => ({ currency, ...v }));
      return json(out);
    }

    // ── Extrato unificado ────────────────────────────────────────────────
    if (action === "bank-statement") {
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

      // Sincroniza até 10 itens ASAAS pendentes (o webhook é a via principal).
      if (asaasConfigured()) {
        const { data: pending } = await db.from("bank_transactions").select("*")
          .eq("user_id", user.id).eq("provider", "asaas").eq("status", "pending")
          .order("created_at", { ascending: false }).limit(10);
        if (pending?.length) {
          const ctxA = await asaasFor().catch(() => null);
          if (ctxA) {
            for (const t of pending) {
              try {
                if (t.method === "transfer") {
                  const tr = await ctxA.api<Row>("GET", `/transfers/${t.provider_ref}`);
                  await db.from("bank_transactions").update({
                    status: mapTransferStatus(tr.status),
                    failure_reason: tr.failReason ?? null,
                    receipt_url: tr.transactionReceiptUrl ?? null,
                    settled_at: tr.status === "DONE" ? new Date().toISOString() : null,
                  }).eq("id", t.id);
                } else if (t.method !== "link") {
                  const p = await ctxA.api<Row>("GET", `/payments/${t.provider_ref}`);
                  const status = mapPaymentStatus(p.status);
                  if (status !== "pending") {
                    await db.from("bank_transactions").update({
                      status,
                      net_minor: p.netValue !== undefined ? toCents(Number(p.netValue)) : null,
                      receipt_url: p.transactionReceiptUrl ?? null,
                      settled_at: status === "paid" ? new Date().toISOString() : null,
                    }).eq("id", t.id);
                  }
                }
              } catch (e) {
                console.warn("bank: sync ASAAS falhou", t.provider_ref, (e as Error).message);
              }
            }
          }
        }
      }

      const [{ data: txs }, { data: charges }] = await Promise.all([
        db.from("bank_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit),
        db.from("wallet_charges").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit),
      ]);
      const items = [...(txs ?? []).map(toTx), ...(charges ?? []).map(chargeToTx)]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
      return json({ items });
    }

    // ── Extrato bruto do provedor ────────────────────────────────────────
    if (action === "bank-provider-statement") {
      const provider = String(body.provider ?? "");
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);
      if (provider === "asaas") {
        const ctxA = await asaasFor();
        if (!ctxA) return json({ error: "asaas_not_opened" }, 400);
        const res = await ctxA.api<Row>("GET", "/financialTransactions", {
          query: { startDate: dueDateIn(-days), finishDate: dueDateIn(0), limit: 100, order: "desc" },
        });
        return json({
          items: (res.data ?? []).map((t: Row) => ({
            id: t.id,
            date: t.date,
            type: t.type,
            description: t.description,
            amountMinor: toCents(Number(t.value ?? 0)),
            balanceMinor: t.balance !== undefined ? toCents(Number(t.balance)) : null,
            currency: "BRL",
            ref: t.paymentId ?? t.transferId ?? null,
          })),
        });
      }
      if (provider === "stripe") {
        const accountId = await getConnected();
        if (!accountId) return json({ error: "connect_not_started" }, 400);
        const stripe = stripeClient();
        const since = Math.floor(Date.now() / 1000) - days * 86_400;
        const res = await stripe.balanceTransactions.list({ limit: 100, created: { gte: since } }, { stripeAccount: accountId });
        return json({
          items: res.data.map((t) => ({
            id: t.id,
            date: new Date(t.created * 1000).toISOString(),
            type: t.type,
            description: t.description,
            amountMinor: t.amount,
            feeMinor: t.fee,
            netMinor: t.net,
            currency: t.currency.toUpperCase(),
            status: t.status,
            availableOn: new Date(t.available_on * 1000).toISOString(),
            ref: typeof t.source === "string" ? t.source : (t.source as Row | null)?.id ?? null,
          })),
        });
      }
      return json({ error: "invalid_provider" }, 400);
    }

    // ── ASAAS: abrir subconta ────────────────────────────────────────────
    if (action === "asaas-open") {
      if (!asaasConfigured()) return json({ error: "asaas_not_configured" }, 503);
      if (await getAsaasRow()) return json({ error: "asaas_already_opened" }, 409);

      const doc = onlyDigits(body.cpfCnpj);
      const isPf = doc.length === 11;
      if (!(isPf ? isValidCpf(doc) : isValidCnpj(doc))) return json({ error: "invalid_document" }, 400);
      const name = String(body.name ?? "").trim().slice(0, 120);
      const email = String(body.email ?? user.email ?? "").trim().toLowerCase();
      const mobilePhone = onlyDigits(body.mobilePhone);
      const incomeValue = Number(body.incomeValue);
      const postalCode = onlyDigits(body.postalCode);
      const birthDate = String(body.birthDate ?? "");
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "missing_fields" }, 400);
      if (mobilePhone.length < 10 || mobilePhone.length > 11) return json({ error: "invalid_phone" }, 400);
      if (!Number.isFinite(incomeValue) || incomeValue <= 0) return json({ error: "invalid_income" }, 400);
      if (postalCode.length !== 8) return json({ error: "invalid_postal_code" }, 400);
      if (isPf && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json({ error: "invalid_birth_date" }, 400);
      const companyType = String(body.companyType ?? "");
      if (!isPf && !["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"].includes(companyType)) return json({ error: "invalid_company_type" }, 400);
      for (const f of ["address", "addressNumber", "province"]) {
        if (!String(body[f] ?? "").trim()) return json({ error: "missing_fields" }, 400);
      }

      const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`;
      const payload: Row = {
        name,
        email,
        cpfCnpj: doc,
        birthDate: isPf ? birthDate : undefined,
        companyType: isPf ? undefined : companyType,
        mobilePhone,
        incomeValue,
        address: String(body.address).trim().slice(0, 120),
        addressNumber: String(body.addressNumber).trim().slice(0, 10),
        complement: body.complement ? String(body.complement).trim().slice(0, 60) : undefined,
        province: String(body.province).trim().slice(0, 60),
        postalCode,
        webhooks: webhookToken ? [{
          name: "Vertal Vibe Pay",
          url: webhookUrl,
          email: Deno.env.get("ASAAS_WEBHOOK_EMAIL") ?? email,
          enabled: true,
          interrupted: false,
          authToken: webhookToken,
          sendType: "SEQUENTIALLY",
          apiVersion: 3,
          events: ASAAS_WEBHOOK_EVENTS,
        }] : undefined,
      };
      const created = await asaasRoot()<Row>("POST", "/accounts", { body: payload });
      const apiKey = String(created.apiKey ?? created.accessToken ?? "");
      if (!apiKey || !created.id || !created.walletId) {
        console.error("bank: subconta criada sem apiKey/walletId", created.id);
        return json({ error: "asaas_account_incomplete" }, 502);
      }
      const enc = await encryptSecret(apiKey);
      const { error } = await db.from("bank_asaas_accounts").insert({
        user_id: user.id,
        env: asaasEnv(),
        asaas_account_id: String(created.id),
        wallet_id: String(created.walletId),
        api_key_ciphertext: enc.ciphertext,
        api_key_iv: enc.iv,
        api_key_tag: enc.tag,
        person_type: isPf ? "FISICA" : "JURIDICA",
        holder_name: name,
        cpf_cnpj_masked: maskDoc(doc),
        status: "pending",
      });
      if (error) throw error;
      return json({ ok: true, status: "pending", webhookConfigured: Boolean(webhookToken) });
    }

    if (action === "asaas-status") {
      const ctxA = await asaasFor();
      if (!ctxA) return json({ account: null });
      const st = await syncAsaasStatus(ctxA.row, ctxA.api);
      return json({ account: { status: st.status, statusDetail: st.detail, document: ctxA.row.cpf_cnpj_masked, holderName: ctxA.row.holder_name } });
    }

    // ── Receber (ASAAS): Pix, boleto, cartão (fatura hospedada) ou link ──
    if (action === "bank-receive") {
      const method = String(body.method ?? "") as ReceiveMethod;
      if (!["pix", "boleto", "card", "link"].includes(method)) return json({ error: "invalid_method" }, 400);
      const asaasRow = await getAsaasRow();
      const accountId = await getConnected();
      const route = routeReceive({ method, currency: "BRL", asaasReady: asaasReadyRow(asaasRow), stripeReady: Boolean(accountId) });
      if (route.provider !== "asaas") return json({ error: "route_not_asaas", reason: route.reason, provider: route.provider }, 400);

      const amountMinor = toMinorUnits(Number(body.amount), "BRL");
      if (amountMinor === null) return json({ error: "invalid_amount" }, 400);
      if (method === "boleto" && amountMinor < 500) return json({ error: "boleto_min_amount" }, 400);
      const description = body.description ? String(body.description).trim().slice(0, 200) : null;
      const dueDays = Math.min(Math.max(Number(body.dueDays) || (method === "boleto" ? 3 : 1), 0), 60);

      const ctxA = await asaasFor();
      if (!ctxA) return json({ error: "asaas_not_opened" }, 400);
      const split = platformSplit();

      if (method === "link") {
        const link = await ctxA.api<Row>("POST", "/paymentLinks", {
          body: {
            name: (description ?? "Pagamento Vertal Vibe Pay").slice(0, 100),
            description: description ?? undefined,
            value: fromCents(amountMinor),
            billingType: "UNDEFINED",
            chargeType: "DETACHED",
            dueDateLimitDays: dueDays || 1,
            externalReference: `vb:${user.id}`,
            notificationEnabled: false,
          },
        });
        const { data: row, error } = await db.from("bank_transactions").insert({
          user_id: user.id, provider: "asaas", direction: "in", method: "link", status: "pending",
          amount_minor: amountMinor, currency: "brl", description,
          provider_ref: String(link.id), checkout_url: link.url ?? null,
        }).select("*").single();
        if (error) throw error;
        return json({ transaction: toTx(row) });
      }

      const customer = await ensureCustomer(ctxA.api, body.payer ?? {});
      const billingType = method === "pix" ? "PIX" : method === "boleto" ? "BOLETO" : "CREDIT_CARD";
      const p = await ctxA.api<Row>("POST", "/payments", {
        body: {
          customer,
          billingType,
          value: fromCents(amountMinor),
          dueDate: dueDateIn(dueDays),
          description: description ?? undefined,
          externalReference: `vb:${user.id}`,
          split,
        },
      });
      let pixPayload: string | null = null;
      let pixImage: string | null = null;
      let boletoLine: string | null = null;
      if (method === "pix") {
        const qr = await ctxA.api<Row>("GET", `/payments/${p.id}/pixQrCode`);
        pixPayload = qr.payload ?? null;
        pixImage = qr.encodedImage ?? null;
      } else if (method === "boleto") {
        const idf = await ctxA.api<Row>("GET", `/payments/${p.id}/identificationField`).catch(() => null);
        boletoLine = idf?.identificationField ?? null;
      }
      const { data: row, error } = await db.from("bank_transactions").insert({
        user_id: user.id, provider: "asaas", direction: "in", method, status: mapPaymentStatus(p.status),
        amount_minor: amountMinor, currency: "brl", description,
        counterparty: String(body.payer?.name ?? "").slice(0, 120) || null,
        provider_ref: String(p.id),
        checkout_url: method === "boleto" ? (p.bankSlipUrl ?? p.invoiceUrl ?? null) : (p.invoiceUrl ?? null),
        pix_payload: pixPayload, boleto_line: boletoLine,
        due_date: p.dueDate ?? null,
        metadata: { billing_type: billingType, split: Boolean(split) },
      }).select("*").single();
      if (error) throw error;
      return json({ transaction: toTx(row), pixImage });
    }

    // ── Cartão direto no ASAAS (tokenização) — atrás de flag (PCI) ───────
    if (action === "asaas-card-tokens") {
      const { data } = await db.from("bank_asaas_card_tokens").select("id, asaas_customer_id, card_brand, card_last4, holder_name, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      return json({ tokens: (data ?? []).map((t) => ({ id: t.id, brand: t.card_brand, last4: t.card_last4, holderName: t.holder_name, createdAt: t.created_at })) });
    }

    if (action === "asaas-card-charge") {
      if (!flag("ASAAS_DIRECT_CARD_ENABLED")) return json({ error: "asaas_direct_card_disabled" }, 403);
      const ctxA = await asaasFor();
      if (!ctxA) return json({ error: "asaas_not_opened" }, 400);
      const amountMinor = toMinorUnits(Number(body.amount), "BRL");
      if (amountMinor === null) return json({ error: "invalid_amount" }, 400);
      const description = body.description ? String(body.description).trim().slice(0, 200) : null;
      const payer = body.payer ?? {};
      const remoteIp = clientIp(req);
      if (!remoteIp) return json({ error: "missing_remote_ip" }, 400);

      let customer: string;
      let creditCardToken: string | undefined;
      let creditCard: Row | undefined;
      if (body.tokenId) {
        const { data: tok } = await db.from("bank_asaas_card_tokens").select("*")
          .eq("id", String(body.tokenId)).eq("user_id", user.id).maybeSingle();
        if (!tok) return json({ error: "not_found" }, 404);
        customer = tok.asaas_customer_id;
        creditCardToken = await decryptSecret({ ciphertext: tok.token_ciphertext, iv: tok.token_iv, tag: tok.token_tag });
      } else {
        customer = await ensureCustomer(ctxA.api, payer);
        const c = body.card ?? {};
        const number = onlyDigits(c.number);
        if (number.length < 13 || number.length > 19) return json({ error: "invalid_card" }, 400);
        creditCard = {
          holderName: String(c.holderName ?? "").slice(0, 80),
          number,
          expiryMonth: String(c.expiryMonth ?? "").padStart(2, "0"),
          expiryYear: String(c.expiryYear ?? ""),
          ccv: onlyDigits(c.ccv),
        };
      }
      // O número do cartão só passa pela memória desta requisição até o ASAAS.
      // Não é logado nem gravado; guardamos só o creditCardToken (cifrado) e o final.
      const p = await ctxA.api<Row>("POST", "/payments", {
        body: {
          customer,
          billingType: "CREDIT_CARD",
          value: fromCents(amountMinor),
          dueDate: dueDateIn(0),
          description: description ?? undefined,
          externalReference: `vb:${user.id}`,
          split: platformSplit(),
          creditCard,
          creditCardToken,
          creditCardHolderInfo: creditCard ? {
            name: String(payer.name ?? "").slice(0, 100),
            email: String(payer.email ?? ""),
            cpfCnpj: onlyDigits(payer.cpfCnpj),
            postalCode: onlyDigits(payer.postalCode),
            addressNumber: String(payer.addressNumber ?? ""),
            phone: onlyDigits(payer.phone),
          } : undefined,
          remoteIp,
        },
      });
      if (creditCard && body.saveCard && p.creditCard?.creditCardToken) {
        const enc = await encryptSecret(String(p.creditCard.creditCardToken));
        await db.from("bank_asaas_card_tokens").insert({
          user_id: user.id, asaas_customer_id: customer,
          token_ciphertext: enc.ciphertext, token_iv: enc.iv, token_tag: enc.tag,
          card_brand: p.creditCard.creditCardBrand ?? null,
          card_last4: /^\d{4}$/.test(String(p.creditCard.creditCardNumber ?? "")) ? String(p.creditCard.creditCardNumber) : null,
          holder_name: creditCard.holderName || null,
        });
      }
      const { data: row, error } = await db.from("bank_transactions").insert({
        user_id: user.id, provider: "asaas", direction: "in", method: "card", status: mapPaymentStatus(p.status),
        amount_minor: amountMinor, currency: "brl", description,
        counterparty: String(payer.name ?? "").slice(0, 120) || null,
        provider_ref: String(p.id), checkout_url: p.invoiceUrl ?? null,
        receipt_url: p.transactionReceiptUrl ?? null,
        net_minor: p.netValue !== undefined ? toCents(Number(p.netValue)) : null,
        settled_at: mapPaymentStatus(p.status) === "paid" ? new Date().toISOString() : null,
        metadata: { direct_card: true },
      }).select("*").single();
      if (error) throw error;
      return json({ transaction: toTx(row) });
    }

    // ── Pix de saída (ASAAS) ─────────────────────────────────────────────
    if (action === "bank-send-pix") {
      const ctxA = await asaasFor();
      if (!ctxA) return json({ error: "asaas_not_opened" }, 400);
      if (ctxA.row.status !== "approved") return json({ error: "asaas_not_approved" }, 400);
      const amountMinor = toMinorUnits(Number(body.amount), "BRL");
      if (amountMinor === null) return json({ error: "invalid_amount" }, 400);
      if (amountMinor > toCents(PIX_OUT_MAX)) return json({ error: "pix_out_limit" }, 400);

      let keyType = String(body.pixKeyType ?? "") as PixKeyType;
      let key = String(body.pixKey ?? "");
      if (body.pixId) {
        const { data: pm } = await db.from("wallet_payment_methods").select("*")
          .eq("id", String(body.pixId)).eq("user_id", user.id).eq("kind", "pix").maybeSingle();
        if (!pm) return json({ error: "not_found" }, 404);
        keyType = pm.pix_key_type;
        key = await decryptSecret({ ciphertext: pm.pix_key_ciphertext, iv: pm.pix_key_iv, tag: pm.pix_key_tag });
      } else {
        if (!PIX_KEY_TYPE_TO_ASAAS[keyType]) return json({ error: "invalid_key_type" }, 400);
        const invalid = validatePixKey(keyType, key);
        if (invalid) return json({ error: invalid }, 400);
        key = normalizePixKey(keyType, key);
      }

      const bal = await ctxA.api<Row>("GET", "/finance/balance");
      if (toCents(Number(bal.balance ?? 0)) < amountMinor) return json({ error: "insufficient_balance" }, 400);

      const description = body.description ? String(body.description).trim().slice(0, 140) : null;
      const tr = await ctxA.api<Row>("POST", "/transfers", {
        body: {
          value: fromCents(amountMinor),
          operationType: "PIX",
          pixAddressKey: key,
          pixAddressKeyType: PIX_KEY_TYPE_TO_ASAAS[keyType],
          description: description ?? undefined,
          externalReference: `vb:${user.id}`,
        },
      });
      const { data: row, error } = await db.from("bank_transactions").insert({
        user_id: user.id, provider: "asaas", direction: "out", method: "transfer", status: mapTransferStatus(tr.status),
        amount_minor: amountMinor, currency: "brl", description,
        fee_minor: tr.transferFee !== undefined ? toCents(Number(tr.transferFee)) : null,
        net_minor: tr.netValue !== undefined ? toCents(Number(tr.netValue)) : null,
        counterparty: keyType === "random" ? "Chave aleatória" : `${keyType.toUpperCase()} ${key.slice(0, 3)}***`,
        provider_ref: String(tr.id),
        receipt_url: tr.transactionReceiptUrl ?? null,
        failure_reason: tr.authorized === false ? "Aguardando autorização (token SMS / validação de saque no ASAAS)" : (tr.failReason ?? null),
        metadata: { pix_key_type: keyType, end_to_end: tr.endToEndIdentifier ?? null },
      }).select("*").single();
      if (error) throw error;
      return json({ transaction: toTx(row), authorized: tr.authorized !== false });
    }

    // ── Saque Stripe (payout) para a conta bancária da conta global ──────
    if (action === "bank-payout-mode") {
      const accountId = await getConnected();
      if (!accountId) return json({ error: "connect_not_started" }, 400);
      const mode = body.mode === "manual" ? "manual" : "daily";
      await stripeClient().accounts.update(accountId, { settings: { payouts: { schedule: { interval: mode } } } });
      return json({ ok: true, interval: mode });
    }

    if (action === "bank-payout") {
      const accountId = await getConnected();
      if (!accountId) return json({ error: "connect_not_started" }, 400);
      const currency = String(body.currency ?? "").toUpperCase();
      if (!findCurrency(currency) && !/^[A-Z]{3}$/.test(currency)) return json({ error: "invalid_currency" }, 400);
      const decimals = findCurrency(currency)?.decimals ?? 2;
      const amountMinor = Math.round(Number(body.amount) * 10 ** decimals);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) return json({ error: "invalid_amount" }, 400);

      const stripe = stripeClient();
      const acct = await stripe.accounts.retrieve(accountId);
      if (!acct.payouts_enabled) return json({ error: "payouts_not_enabled" }, 400);
      const bal = await stripe.balance.retrieve({ stripeAccount: accountId });
      const avail = (bal.available ?? []).filter((b) => b.currency === currency.toLowerCase()).reduce((s, b) => s + b.amount, 0);
      if (avail < amountMinor) return json({ error: "insufficient_balance" }, 400);

      const po = await stripe.payouts.create({
        amount: amountMinor,
        currency: currency.toLowerCase(),
        metadata: { wallet_user_id: user.id, source: "vertal_bank" },
      }, { stripeAccount: accountId, idempotencyKey: `vb-po-${user.id}-${body.idempotencyKey ?? crypto.randomUUID()}` });
      const { data: row, error } = await db.from("bank_transactions").insert({
        user_id: user.id, provider: "stripe", direction: "out", method: "payout",
        status: po.status === "paid" ? "paid" : po.status === "failed" ? "failed" : po.status === "canceled" ? "canceled" : "pending",
        amount_minor: amountMinor, currency: currency.toLowerCase(),
        description: "Saque para conta bancária",
        provider_ref: po.id,
        metadata: { stripe_account_id: accountId, arrival_date: po.arrival_date },
      }).select("*").single();
      if (error) throw error;
      return json({ transaction: toTx(row) });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    if (e instanceof AsaasNotConfigured) return json({ error: "asaas_not_configured" }, 503);
    if (e instanceof AsaasError) {
      console.warn("bank: ASAAS", e.status, e.message);
      return json({ error: "asaas_error", message: e.message, codes: e.errors.map((x) => x.code) }, e.status >= 500 ? 502 : 400);
    }
    const status = (e as { status?: number }).status;
    if (status && status < 500) return json({ error: (e as Error).message }, status);
    throw e;
  }
}
