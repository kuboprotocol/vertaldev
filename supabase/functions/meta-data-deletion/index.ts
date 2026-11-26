// ============================================================
// Edge Function: meta-data-deletion (verify_jwt = false)
// App da Meta "Vertal Dev" (1145586658064572). Uma função só (limite de funções do plano):
//   POST https://<ref>.supabase.co/functions/v1/meta-data-deletion/deauthorize   "Remover app" (Deauthorize callback)
//   POST https://<ref>.supabase.co/functions/v1/meta-data-deletion               "Exclusão de dados" → {url, confirmation_code}
//   GET  https://<ref>.supabase.co/functions/v1/meta-data-deletion?code=XXXX     status (página https://vertal.dev/data-deletion)
// Segredos: FLUXOS_OAUTH_META_SECRET (App Secret), FLUXOS_INTERNAL_URL/_KEY (motor). Lógica em _shared/metaDataDeletion.ts.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeEngine } from "../_shared/fluxosApps.ts";
import { handleMetaDeletion, type MetaDeletionStore } from "../_shared/metaDataDeletion.ts";

function store(): MetaDeletionStore {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  return {
    async rowsForEngineConnection(id) {
      const { data, error } = await db.from("fluxos_connections").select("id, user_id, app_key").eq("fluxos_connection_id", id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async deleteLinkRow(id) {
      const { error } = await db.from("fluxos_connections").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async logDisconnect(row, kind) {
      const { error } = await db.from("connector_activity_logs").insert({
        user_id: row.user_id,
        connector_slug: `fluxos-${row.app_key}`,
        event_type: "fluxos_disconnect",
        message: kind === "deauthorize"
          ? "Desconectado: o app foi removido nas configurações da Meta"
          : "Desconectado: exclusão de dados pedida na Meta",
        status: "success",
        metadata: { app: row.app_key, op: "disconnect", source: `meta_${kind}` },
      });
      if (error) console.error("[meta-data-deletion] log failed:", error.message);
    },
    async insertRequest(row) {
      const { error } = await db.from("meta_data_requests").insert(row);
      if (error) throw new Error(error.message);
    },
    async getRequest(code) {
      const { data, error } = await db.from("meta_data_requests")
        .select("kind, confirmation_code, meta_user_hash, status, removed_connections, created_at, completed_at")
        .eq("confirmation_code", code).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

Deno.serve(async (req) => {
  const env = (k: string) => Deno.env.get(k);
  const url = env("FLUXOS_INTERNAL_URL");
  const key = env("FLUXOS_INTERNAL_KEY");
  try {
    return await handleMetaDeletion(req, { env, engine: url && key ? makeEngine(url, key) : null, store: store() });
  } catch (e) {
    console.error("[meta-data-deletion] failed:", (e as Error)?.message);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
