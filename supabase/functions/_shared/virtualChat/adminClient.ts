/** Cliente com service role para as tabelas de canal. Só edge functions importam este arquivo. */
import { createClient } from "npm:@supabase/supabase-js@2";

export function channelAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}
