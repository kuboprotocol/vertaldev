// Edge function: Gerar logos com IA (DALL-E)
// POST /functions/v1/generate-logo-ai?action=generate|list-generations

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

// Chamada à OpenAI DALL-E API
async function generateLogoWithDALLE(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `Professional logo design for: ${prompt}. Modern, clean, minimalist, suitable for tech/startup. PNG format, transparent background.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`DALL-E API error: ${error.error?.message || "Unknown error"}`);
  }

  const data = await response.json();
  return data.data[0].url; // URL da imagem gerada
}

// Converter URL de imagem para blob e salvar no Storage
async function downloadAndSaveImage(
  imageUrl: string,
  appId: string,
  generationId: string,
  db: any
): Promise<string> {
  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to download image");

    const blob = await imageResponse.arrayBuffer();
    const storagePath = `${appId}/${generationId}-ai.png`;

    const { error: uploadErr } = await db.storage
      .from("app_logos")
      .upload(storagePath, blob, { contentType: "image/png" });

    if (uploadErr) throw uploadErr;
    return storagePath;
  } catch (err) {
    console.error("Error downloading/saving image:", err);
    throw err;
  }
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

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "generate";
  const appId = url.searchParams.get("app_id");

  if (!appId) return json({ error: "app_id required" }, 400);

  // Gerar novo logo com IA
  if (action === "generate") {
    try {
      const body = await req.json() as { prompt: string; name?: string };
      const { prompt, name } = body;

      if (!prompt || prompt.trim().length < 5) {
        return json({ error: "prompt must be at least 5 characters" }, 400);
      }

      if (prompt.length > 500) {
        return json({ error: "prompt must be less than 500 characters" }, 400);
      }

      // Verificar limite de gerações por dia (max 10 por dia)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: generationsToday } = await db
        .from("logo_ai_generations")
        .select("id", { count: "exact" })
        .eq("app_id", appId)
        .eq("user_id", userId)
        .gte("created_at", today.toISOString());

      if ((generationsToday || 0) >= 10) {
        return json(
          { error: "Daily limit reached (10 generations per day)" },
          429
        );
      }

      // Gerar logo com DALL-E
      const imageUrl = await generateLogoWithDALLE(prompt);

      // Salvar no Storage
      const generationId = crypto.randomUUID();
      const storagePath = await downloadAndSaveImage(imageUrl, appId, generationId, db);

      // Salvar metadata no banco
      const { data: generation, error: dbErr } = await db
        .from("logo_ai_generations")
        .insert({
          id: generationId,
          app_id: appId,
          user_id: userId,
          prompt,
          storage_path: storagePath,
          image_url: imageUrl,
          status: "completed",
          name: name || `AI Logo - ${new Date().toLocaleString()}`,
        })
        .select()
        .single();

      if (dbErr) throw dbErr;

      const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/app_logos/${storagePath}`;

      return json({
        success: true,
        generation: {
          ...generation,
          publicUrl,
        },
      });
    } catch (e: any) {
      console.error("Generation error:", e);
      return json(
        { error: e.message || "Failed to generate logo" },
        400
      );
    }
  }

  // Listar gerações de logos do app
  if (action === "list-generations") {
    try {
      const { data, error } = await db
        .from("logo_ai_generations")
        .select("id, name, prompt, storage_path, status, created_at, image_url")
        .eq("app_id", appId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const withUrls = data?.map(g => ({
        ...g,
        publicUrl: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/app_logos/${g.storage_path}`,
      })) || [];

      return json({
        generations: withUrls,
        count: withUrls.length,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
