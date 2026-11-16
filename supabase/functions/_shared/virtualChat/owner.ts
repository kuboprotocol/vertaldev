/**
 * Quem pode usar o canal pelo Vertal Chat: só os IDs listados em CHANNEL_OWNER_USER_IDS.
 * Falha fechada: lista vazia ou ausente bloqueia todo mundo.
 *
 * Os tokens de canal são do operador (segredos da edge function), então envio e leitura
 * das conversas ficam restritos a ele até existirem tokens por usuário.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { channelOwnerIds } from "./ownerIds.ts";

/** Valida o JWT do chamador e confere se ele é dono do canal. Lança Response 401/403 se não for. */
export async function requireChannelOwner(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });

  if (!channelOwnerIds(Deno.env.get("CHANNEL_OWNER_USER_IDS")).has(user.id)) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  return { userId: user.id };
}
