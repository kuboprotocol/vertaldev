// Edge function `kubo-secrets`: painel secreto do Vertal Dev.
//   POST { action: "list" }
//   POST { action: "create", name, env_key, value, group_name?, description?, bound_to? }
//   POST { action: "rotate", id, value }                       (troca o valor; só o dono)
//   POST { action: "update", id, name?, env_key?, group_name?, description?, bound_to? }
//   POST { action: "delete", id }                              (só o dono)
//   POST { action: "reveal", id }                              (dono, ou convidado com can_reveal)
//   POST { action: "grant", id, email, can_reveal? }           (só o dono)
//   POST { action: "revoke", id, grantee_id }                  (só o dono)
//   POST { action: "audit", id?, limit? }                      (só o dono)
// Autenticação: JWT do usuário logado (getUser). Acesso aos dados: service role,
// com as regras de dono e convidado aplicadas aqui. Nenhum cliente lê as tabelas.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { encryptSecret, decryptSecret } from "../_shared/connectorCrypto.ts";
import {
  parseSecretFields,
  maskSecret,
  validateValue,
  REVEAL_WINDOW_LIMIT,
  revealWindowStartIso,
} from "../_shared/kuboSecretsCore.ts";
import { audit, SECRET_COLUMNS, type SecretRowRecord } from "../_shared/kuboSecrets.ts";

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

const fail = (message: string, status = 400) => json({ error: message }, status);

type Body = Record<string, unknown>;

async function loadSecret(admin: SupabaseClient, id: unknown) {
  if (typeof id !== "string" || !id) return { row: null as SecretRowRecord | null, error: "id obrigatório" };
  const { data, error } = await admin.from("kubo_secrets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return { row: (data as SecretRowRecord | null) ?? null, error: null };
}

async function grantOf(admin: SupabaseClient, secretId: string, userId: string) {
  const { data, error } = await admin
    .from("kubo_secret_grants")
    .select("can_reveal")
    .eq("secret_id", secretId)
    .eq("grantee_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { can_reveal: boolean } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail("missing auth", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userDb.auth.getUser();
    if (userErr || !userData.user) return fail("invalid token", 401);
    const userId = userData.user.id;

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return fail("JSON inválido");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const action = String(body.action ?? "");

    switch (action) {
      case "list": {
        const { data: owned, error: ownedErr } = await admin
          .from("kubo_secrets")
          .select(SECRET_COLUMNS)
          .eq("owner_id", userId)
          .order("group_name")
          .order("name");
        if (ownedErr) throw new Error(ownedErr.message);
        const ownedRows = (owned ?? []) as Array<Record<string, unknown>>;
        const ownedIds = ownedRows.map((r) => r.id as string);

        // Concessões dos segredos que são meus, com e-mail só para o dono.
        const grantsBysecret = new Map<string, Array<{ grantee_id: string; email: string | null; can_reveal: boolean }>>();
        if (ownedIds.length > 0) {
          const { data: grants, error: gErr } = await admin
            .from("kubo_secret_grants")
            .select("secret_id,grantee_id,can_reveal")
            .in("secret_id", ownedIds);
          if (gErr) throw new Error(gErr.message);
          const emailCache = new Map<string, string | null>();
          for (const g of grants ?? []) {
            if (!emailCache.has(g.grantee_id)) {
              const { data: u } = await admin.auth.admin.getUserById(g.grantee_id);
              emailCache.set(g.grantee_id, u?.user?.email ?? null);
            }
            const list = grantsBysecret.get(g.secret_id) ?? [];
            list.push({ grantee_id: g.grantee_id, email: emailCache.get(g.grantee_id) ?? null, can_reveal: g.can_reveal });
            grantsBysecret.set(g.secret_id, list);
          }
        }

        // Segredos de terceiros que foram concedidos a mim.
        const { data: myGrants, error: mgErr } = await admin
          .from("kubo_secret_grants")
          .select("secret_id,can_reveal")
          .eq("grantee_id", userId);
        if (mgErr) throw new Error(mgErr.message);
        const grantedMap = new Map((myGrants ?? []).map((g) => [g.secret_id as string, g.can_reveal as boolean]));
        let granted: Array<Record<string, unknown>> = [];
        if (grantedMap.size > 0) {
          const { data, error } = await admin
            .from("kubo_secrets")
            .select(SECRET_COLUMNS)
            .in("id", [...grantedMap.keys()]);
          if (error) throw new Error(error.message);
          granted = (data ?? []) as Array<Record<string, unknown>>;
        }

        const secrets = [
          ...ownedRows.map((r) => ({
            ...r,
            role: "owner" as const,
            can_reveal: true,
            grants: grantsBysecret.get(r.id as string) ?? [],
          })),
          ...granted.map((r) => ({
            ...r,
            role: "grant" as const,
            can_reveal: grantedMap.get(r.id as string) === true,
            grants: [],
          })),
        ];
        return json({ secrets });
      }

      case "create": {
        const parsed = parseSecretFields(body, { partial: false });
        if (!parsed.ok) return fail(parsed.error);
        const value = validateValue(body.value);
        if (!value.ok) return fail(value.error);

        const enc = await encryptSecret(value.data);
        const { data, error } = await admin
          .from("kubo_secrets")
          .insert({
            owner_id: userId,
            name: parsed.data.name,
            env_key: parsed.data.env_key,
            group_name: parsed.data.group_name ?? "geral",
            description: parsed.data.description ?? null,
            bound_to: parsed.data.bound_to ?? null,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
            masked_hint: maskSecret(value.data),
          })
          .select(SECRET_COLUMNS)
          .single();
        if (error) {
          if (error.code === "23505") {
            return fail("Você já tem um segredo com essa variável. Edite o existente ou escolha outro nome.", 409);
          }
          throw new Error(error.message);
        }
        await audit(admin, {
          secretId: data.id as string,
          ownerId: userId,
          actorId: userId,
          action: "create",
          envKey: parsed.data.env_key,
        });
        return json({ secret: data });
      }

      case "rotate": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);
        if (row.owner_id !== userId) return fail("Só o dono pode trocar o valor", 403);
        const value = validateValue(body.value);
        if (!value.ok) return fail(value.error);

        const enc = await encryptSecret(value.data);
        const now = new Date().toISOString();
        const { error } = await admin
          .from("kubo_secrets")
          .update({
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
            masked_hint: maskSecret(value.data),
            rotated_at: now,
            updated_at: now,
          })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
        await audit(admin, { secretId: row.id, ownerId: userId, actorId: userId, action: "rotate", envKey: row.env_key });
        return json({ ok: true, masked_hint: maskSecret(value.data) });
      }

      case "update": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);
        if (row.owner_id !== userId) return fail("Só o dono pode editar", 403);

        const parsed = parseSecretFields(body, { partial: true });
        if (!parsed.ok) return fail(parsed.error);
        const changes = parsed.data;
        if (Object.keys(changes).length === 0) return fail("Nada para atualizar");

        const { data, error } = await admin
          .from("kubo_secrets")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .select(SECRET_COLUMNS)
          .single();
        if (error) {
          if (error.code === "23505") return fail("Já existe um segredo com essa variável na sua conta", 409);
          throw new Error(error.message);
        }
        await audit(admin, {
          secretId: row.id,
          ownerId: userId,
          actorId: userId,
          action: "update",
          envKey: data.env_key as string,
          meta: { fields: Object.keys(changes) },
        });
        return json({ secret: data });
      }

      case "delete": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);
        if (row.owner_id !== userId) return fail("Só o dono pode excluir", 403);

        // Auditoria antes do delete: a linha sem FK sobrevive ao segredo.
        await audit(admin, { secretId: row.id, ownerId: userId, actorId: userId, action: "delete", envKey: row.env_key });
        const { error } = await admin.from("kubo_secrets").delete().eq("id", row.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      case "reveal": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);

        const isOwner = row.owner_id === userId;
        if (!isOwner) {
          const grant = await grantOf(admin, row.id, userId);
          if (!grant) return fail("Segredo não encontrado", 404);
          if (!grant.can_reveal) return fail("Você pode usar este segredo, mas não ver o valor", 403);
        }

        // Limite de revelações por usuário: protege contra quem tiver a sessão roubada.
        const { count, error: cErr } = await admin
          .from("kubo_secret_audit")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", userId)
          .eq("action", "reveal")
          .gte("created_at", revealWindowStartIso(new Date()));
        if (cErr) throw new Error(cErr.message);
        if ((count ?? 0) >= REVEAL_WINDOW_LIMIT) {
          return fail("Muitas revelações em pouco tempo. Aguarde alguns minutos.", 429);
        }

        const value = await decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
        await audit(admin, {
          secretId: row.id,
          ownerId: row.owner_id,
          actorId: userId,
          action: "reveal",
          envKey: row.env_key,
        });
        return json({ value, env_key: row.env_key });
      }

      case "grant": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);
        if (row.owner_id !== userId) return fail("Só o dono pode conceder acesso", 403);

        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email || !email.includes("@")) return fail("Informe o e-mail da conta");

        const { data: granteeId, error: findErr } = await admin.rpc("kubo_find_user_id_by_email", { _email: email });
        if (findErr) throw new Error(findErr.message);
        if (!granteeId) return fail("Nenhuma conta com esse e-mail", 404);
        if (granteeId === userId) return fail("Você já é o dono deste segredo");

        const canReveal = body.can_reveal === true;
        const { error } = await admin
          .from("kubo_secret_grants")
          .upsert(
            { secret_id: row.id, grantee_id: granteeId as string, can_reveal: canReveal },
            { onConflict: "secret_id,grantee_id" },
          );
        if (error) throw new Error(error.message);
        await audit(admin, {
          secretId: row.id,
          ownerId: userId,
          actorId: userId,
          action: "grant",
          envKey: row.env_key,
          meta: { grantee_id: granteeId, can_reveal: canReveal },
        });
        return json({ ok: true });
      }

      case "revoke": {
        const { row, error: idErr } = await loadSecret(admin, body.id);
        if (idErr) return fail(idErr);
        if (!row) return fail("Segredo não encontrado", 404);
        if (row.owner_id !== userId) return fail("Só o dono pode revogar acesso", 403);
        const granteeId = String(body.grantee_id ?? "");
        if (!granteeId) return fail("grantee_id obrigatório");

        const { error } = await admin
          .from("kubo_secret_grants")
          .delete()
          .eq("secret_id", row.id)
          .eq("grantee_id", granteeId);
        if (error) throw new Error(error.message);
        await audit(admin, {
          secretId: row.id,
          ownerId: userId,
          actorId: userId,
          action: "revoke",
          envKey: row.env_key,
          meta: { grantee_id: granteeId },
        });
        return json({ ok: true });
      }

      case "audit": {
        const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);
        let query = admin
          .from("kubo_secret_audit")
          .select("id,secret_id,env_key,action,actor_id,meta,created_at")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (typeof body.id === "string" && body.id) query = query.eq("secret_id", body.id);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return json({ entries: data ?? [] });
      }

      default:
        return fail("ação desconhecida");
    }
  } catch (e) {
    console.error("[kubo-secrets] error:", e instanceof Error ? e.message : e);
    return json({ error: sanitizeError(e) }, 500);
  }
});
