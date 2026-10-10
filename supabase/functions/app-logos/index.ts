// Edge function: gerenciar logos dos aplicativos
// POST /functions/v1/app-logos?action=upload|list|delete|set-primary|download

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "npm:std@0.208.0/crypto/mod.ts";

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

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
  const action = url.searchParams.get("action") || "list";
  const appId = url.searchParams.get("app_id");

  if (!appId) return json({ error: "app_id required" }, 400);

  // Upload novo logo
  if (action === "upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const name = (formData.get("name") as string) || file.name;
      const tags = (formData.get("tags") as string)?.split(",") || [];

      if (!file) return json({ error: "file required" }, 400);

      const allowedMimes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
      if (!allowedMimes.includes(file.type)) {
        return json({ error: "invalid file type. allowed: png, jpg, svg, webp" }, 400);
      }

      if (file.size > 5 * 1024 * 1024) {
        return json({ error: "file too large. max 5MB" }, 400);
      }

      const ext = file.name.split(".").pop() || "png";
      const logoId = generateId();
      const storagePath = `${appId}/${logoId}.${ext}`;

      const fileBuffer = await file.arrayBuffer();
      const { error: uploadErr } = await db.storage
        .from("app_logos")
        .upload(storagePath, fileBuffer, { contentType: file.type });

      if (uploadErr) throw uploadErr;

      // Salvar metadata no banco
      const { data, error: dbErr } = await db
        .from("app_logos")
        .insert({
          app_id: appId,
          user_id: userId,
          name,
          storage_path: storagePath,
          file_format: ext,
          file_size: file.size,
          tags,
        })
        .select("id, name, storage_path, file_format, created_at")
        .single();

      if (dbErr) throw dbErr;

      const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/app_logos/${storagePath}`;

      return json({
        success: true,
        logo: data,
        publicUrl,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Listar logos do app
  if (action === "list") {
    try {
      const { data, error } = await db
        .from("app_logos")
        .select("id, name, storage_path, file_format, file_size, width, height, is_active, is_primary, created_at, tags")
        .eq("app_id", appId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Adicionar URLs públicas
      const logosWithUrls = data?.map(logo => ({
        ...logo,
        publicUrl: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/app_logos/${logo.storage_path}`,
      })) || [];

      return json({ logos: logosWithUrls, count: logosWithUrls.length });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Deletar logo
  if (action === "delete") {
    try {
      const body = await req.json() as { logo_id: string };
      if (!body.logo_id) return json({ error: "logo_id required" }, 400);

      const { data: logo } = await db
        .from("app_logos")
        .select("storage_path")
        .eq("id", body.logo_id)
        .eq("app_id", appId)
        .eq("user_id", userId)
        .single();

      if (!logo) return json({ error: "logo not found" }, 404);

      // Deletar do storage
      await db.storage.from("app_logos").remove([logo.storage_path]);

      // Deletar do banco
      const { error } = await db
        .from("app_logos")
        .delete()
        .eq("id", body.logo_id)
        .eq("user_id", userId);

      if (error) throw error;
      return json({ success: true, message: "Logo deleted" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Definir como logo principal
  if (action === "set-primary") {
    try {
      const body = await req.json() as { logo_id: string };
      if (!body.logo_id) return json({ error: "logo_id required" }, 400);

      // Desativar outros logos primários
      await db
        .from("app_logos")
        .update({ is_primary: false })
        .eq("app_id", appId)
        .eq("user_id", userId);

      // Ativar o novo logo primário
      const { data, error } = await db
        .from("app_logos")
        .update({ is_primary: true })
        .eq("id", body.logo_id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return json({ success: true, logo: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Download logo (redirecionar para URL pública)
  if (action === "download") {
    try {
      const logoId = url.searchParams.get("logo_id");
      if (!logoId) return json({ error: "logo_id required" }, 400);

      const { data: logo } = await db
        .from("app_logos")
        .select("storage_path, name")
        .eq("id", logoId)
        .eq("app_id", appId)
        .eq("user_id", userId)
        .single();

      if (!logo) return json({ error: "logo not found" }, 404);

      const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/app_logos/${logo.storage_path}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: publicUrl,
          "Content-Disposition": `attachment; filename="${logo.name}"`,
        },
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
