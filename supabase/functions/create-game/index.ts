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
      title: string;
      description?: string;
      game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d';
      engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';
      cover_image_url?: string;
    };

    if (!body.title) return json({ error: "title required" }, 400);
    if (!body.game_type) return json({ error: "game_type required" }, 400);
    if (!body.engine) return json({ error: "engine required" }, 400);

    const { data, error } = await db
      .from("games")
      .insert({
        user_id: userId,
        title: body.title,
        description: body.description || null,
        game_type: body.game_type,
        engine: body.engine,
        cover_image_url: body.cover_image_url || null,
        status: 'draft',
        config: {},
      })
      .select("*")
      .single();

    if (error) throw error;

    return json({ game: data }, 201);
  } catch (e: any) {
    return json({ error: e.message }, 400);
  }
});
