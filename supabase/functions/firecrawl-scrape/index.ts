import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validatePublicUrl } from "../_shared/security.ts";

// Firecrawl API v2 (a v1 responde 410 a partir de 10/12/2026 15:00 UTC).
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

/**
 * Converte formatos no estilo v1 vindos do cliente para o formato da v2:
 * "screenshot@fullPage" → { type: "screenshot", fullPage: true };
 * "json"/"extract" + jsonOptions/extract → { type: "json", prompt, schema }.
 * Strings simples ("markdown", "html", "links", "screenshot"…) valem igual na v2.
 */
function toV2Formats(formats: unknown, options: Record<string, unknown> | undefined): unknown[] {
  const list = Array.isArray(formats) ? formats : ["markdown", "html", "screenshot", "links"];
  const jsonOpts = (options?.jsonOptions ?? options?.extract) as Record<string, unknown> | undefined;
  const out: unknown[] = [];
  for (const f of list) {
    if (f === "screenshot@fullPage") {
      out.push({ type: "screenshot", fullPage: true });
    } else if (f === "json" || f === "extract") {
      const prompt = [jsonOpts?.systemPrompt, jsonOpts?.prompt].filter((v) => typeof v === "string" && v).join("\n\n");
      out.push({
        type: "json",
        ...(prompt ? { prompt } : {}),
        ...(jsonOpts?.schema ? { schema: jsonOpts.schema } : {}),
      });
    } else {
      out.push(f);
    }
  }
  return out;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller — prevents anonymous abuse of FIRECRAWL_API_KEY
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-user rate limit (30 req/min)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rl } = await adminClient.rpc("bump_rate_limit", {
      _bucket: "firecrawl_scrape", _user: userData.user.id, _window_seconds: 60,
    });
    if (typeof rl === "number" && rl > 30) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }

    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = (Deno.env.get("FIRECRAWL_API_KEY") || Deno.env.get("API_key_Fireclawl") || Deno.env.get("API_KEY_FIRECRAWL"));
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let rawUrl = url.trim();
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = `https://${rawUrl}`;
    }
    const formattedUrl = validatePublicUrl(rawUrl).toString();

    console.log("Scraping URL:", formattedUrl);

    const location = options?.location;
    const response = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: toV2Formats(options?.formats, options),
        onlyMainContent: options?.onlyMainContent ?? false,
        waitFor: options?.waitFor,
        location,
        // Mesmos padrões da v1: sem cache (v2 usa 2 dias), timeout de 30 s (v2 usa 60 s)
        // e, com país definido, proxy "basic" (v2 passaria a "auto").
        maxAge: 0,
        timeout: 30_000,
        ...(location?.country ? { proxy: "basic" } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl API error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scrape successful");
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error scraping:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to scrape";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
