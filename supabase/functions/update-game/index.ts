import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);

  const userId = userRes.user.id;

  try {
    const body = await req.json() as {
      game_id: string;
      title?: string;
      description?: string;
      cover_image_url?: string;
      status?: 'draft' | 'published' | 'archived';
      config?: Record<string, any>;
      is_multiplayer?: boolean;
      has_ai?: boolean;
      has_monetization?: boolean;
      monetization_type?: string;
    };

    if (!body.game_id) return json({ error: "game_id required" }, 400);

    const { data, error } = await db
      .from("games")
      .update({
        ...(body.title && { title: body.title }),
        ...(body.description && { description: body.description }),
        ...(body.cover_image_url && { cover_image_url: body.cover_image_url }),
        ...(body.status && { status: body.status }),
        ...(body.config && { config: body.config }),
        ...(body.is_multiplayer !== undefined && { is_multiplayer: body.is_multiplayer }),
        ...(body.has_ai !== undefined && { has_ai: body.has_ai }),
        ...(body.has_monetization !== undefined && { has_monetization: body.has_monetization }),
        ...(body.monetization_type && { monetization_type: body.monetization_type }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.game_id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    if (!data) return json({ error: "game not found" }, 404);

    return json({ game: data });
  } catch (e: any) {
    return json({ error: e.message }, 400);
  }
});
