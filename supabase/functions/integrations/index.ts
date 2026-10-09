// Edge function: Gerenciar integrações com GitHub, Vercel, Railway
// POST /functions/v1/integrations?action=oauth-url|oauth-callback|list|disconnect

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

// OAuth configs
const OAUTH_CONFIGS = {
  github: {
    clientId: Deno.env.get("GITHUB_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET") || "",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    scope: "repo,workflow,read:user",
  },
  vercel: {
    clientId: Deno.env.get("VERCEL_CLIENT_ID") || "",
    clientSecret: Deno.env.get("VERCEL_CLIENT_SECRET") || "",
    authUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    userUrl: "https://api.vercel.com/v2/user",
    scope: "read write",
  },
  railway: {
    clientId: Deno.env.get("RAILWAY_CLIENT_ID") || "",
    clientSecret: Deno.env.get("RAILWAY_CLIENT_SECRET") || "",
    authUrl: "https://railway.app/oauth/authorize",
    tokenUrl: "https://railway.app/oauth/token",
    userUrl: "https://api.railway.app/graphql",
    scope: "read write",
  },
};

function generateRandomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // OAuth callback (sem JWT, com state validation)
  if (action === "oauth-callback") {
    try {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const provider = url.searchParams.get("provider");

      if (!code || !state || !provider) {
        return json({ error: "Missing parameters" }, 400);
      }

      if (!Object.keys(OAUTH_CONFIGS).includes(provider)) {
        return json({ error: "Invalid provider" }, 400);
      }

      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

      // Validar state (CSRF protection)
      const { data: stateRecord } = await db
        .from("oauth_states")
        .select("user_id, app_id, expires_at")
        .eq("state", state)
        .single();

      if (!stateRecord) return json({ error: "Invalid state" }, 400);
      if (new Date(stateRecord.expires_at) < new Date()) {
        return json({ error: "State expired" }, 400);
      }

      // Trocar code por access token
      const config = OAUTH_CONFIGS[provider as keyof typeof OAUTH_CONFIGS];
      const tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: new URLSearchParams({
          "client_id": config.clientId,
          "client_secret": config.clientSecret,
          "code": code,
          "redirect_uri": `${Deno.env.get("SITE_URL")}/integrations/oauth-callback`,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${error.error_description || "Unknown error"}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Obter dados do usuário na plataforma
      const userResponse = await fetch(config.userUrl, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!userResponse.ok) throw new Error("Failed to get user info");

      const userData = await userResponse.json();
      const providerAccountId = userData.login || userData.id;

      // Salvar integração
      const { error: insertErr } = await db
        .from("app_integrations")
        .upsert({
          app_id: stateRecord.app_id,
          user_id: stateRecord.user_id,
          provider,
          provider_account_id: providerAccountId,
          access_token: accessToken,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null,
          status: "connected",
          metadata: {
            login: userData.login || userData.email,
            avatar_url: userData.avatar_url,
            profile_url: userData.html_url || `https://${provider}.com/${providerAccountId}`,
          },
        }, {
          onConflict: "app_id,provider",
        });

      if (insertErr) throw insertErr;

      // Deletar state após uso
      await db.from("oauth_states").delete().eq("state", state);

      return json({
        success: true,
        provider,
        redirectUrl: `${Deno.env.get("SITE_URL")}/dashboard?integration=${provider}&status=connected`,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Endpoints que requerem JWT
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);

  const userId = userRes.user.id;

  // Gerar URL OAuth
  if (action === "oauth-url") {
    try {
      const { provider, app_id } = await req.json() as { provider: string; app_id: string };

      if (!Object.keys(OAUTH_CONFIGS).includes(provider)) {
        return json({ error: "Invalid provider" }, 400);
      }

      const config = OAUTH_CONFIGS[provider as keyof typeof OAUTH_CONFIGS];
      const state = generateRandomState();

      // Salvar state para validação posterior
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
      await db.from("oauth_states").insert({
        state,
        user_id: userId,
        provider,
        app_id,
        expires_at: expiresAt.toISOString(),
      });

      const oauthUrl = new URL(config.authUrl);
      oauthUrl.searchParams.set("client_id", config.clientId);
      oauthUrl.searchParams.set("redirect_uri", `${Deno.env.get("SITE_URL")}/integrations/oauth-callback`);
      oauthUrl.searchParams.set("scope", config.scope);
      oauthUrl.searchParams.set("state", state);

      return json({
        success: true,
        authUrl: oauthUrl.toString(),
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Listar integrações
  if (action === "list") {
    try {
      const appId = url.searchParams.get("app_id");

      const { data, error } = await db
        .from("app_integrations")
        .select("id, provider, provider_account_id, status, last_sync, created_at, metadata")
        .eq("app_id", appId)
        .eq("user_id", userId);

      if (error) throw error;

      return json({
        integrations: data || [],
        count: data?.length || 0,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Desconectar integração
  if (action === "disconnect") {
    try {
      const { integration_id } = await req.json() as { integration_id: string };

      const { error } = await db
        .from("app_integrations")
        .delete()
        .eq("id", integration_id)
        .eq("user_id", userId);

      if (error) throw error;

      return json({ success: true, message: "Integration disconnected" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
