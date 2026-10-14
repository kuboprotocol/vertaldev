// Publish a builder project to Cloudflare's edge as a Worker that serves its generated HTML.
//   POST { project_id }  →  { url, worker }
// Runs on the platform's Cloudflare account (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID), so users
// publish with one click and get https://<worker>.<account-subdomain>.workers.dev. Re-publishing
// the same project overwrites the same Worker, so the URL stays stable.
import { corsHeaders } from "../_shared/cors.ts";
import * as creative from "../_shared/creative.ts";

const CF_API = "https://api.cloudflare.com/client/v4";
const COMPATIBILITY_DATE = "2026-01-01";
/** Workers accept up to 10 MB per script; keep a margin for the wrapper. */
const MAX_HTML_BYTES = 9 * 1024 * 1024;

const defaultDeps = {
  getUser: creative.getUser,
  admin: creative.supaAdmin as () => any,
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  env: (k: string): string | undefined => Deno.env.get(k),
};
let deps = defaultDeps;
/** Test seam: swap external dependencies (database, Cloudflare). */
export function __setDeps(d: Partial<typeof defaultDeps>) {
  deps = { ...defaultDeps, ...d };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "unauthorized" });

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id;
    if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) {
      return j(400, { error: "project_id_required" });
    }

    const token = deps.env("CLOUDFLARE_API_TOKEN");
    const accountId = deps.env("CLOUDFLARE_ACCOUNT_ID");
    if (!token || !accountId) return j(503, { error: "cloudflare_not_configured" });

    const admin = deps.admin();
    const { data: project } = await admin
      .from("projects")
      .select("id, user_id, title, generated_code")
      .eq("id", projectId)
      .maybeSingle();
    if (!project || project.user_id !== user.id) return j(404, { error: "not_found" });

    const html: string = project.generated_code ?? "";
    if (!html.trim()) return j(400, { error: "no_code" });
    if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) return j(413, { error: "project_too_large" });

    const worker = workerName(project.id, project.title);
    const cf = (path: string, init: RequestInit = {}) =>
      deps.fetch(`${CF_API}/accounts/${accountId}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      });

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify({ main_module: "index.js", compatibility_date: COMPATIBILITY_DATE })], {
        type: "application/json",
      }),
    );
    form.append("index.js", new Blob([workerSource(html)], { type: "application/javascript+module" }), "index.js");

    const up = await cf(`/workers/scripts/${worker}`, { method: "PUT", body: form });
    if (!up.ok) {
      console.error(`[cloudflare-publish] upload failed (${up.status})`, (await up.text()).slice(0, 300));
      return j(502, { error: "upload_failed" });
    }

    const sub = await cf(`/workers/scripts/${worker}/subdomain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    });
    if (!sub.ok) console.warn(`[cloudflare-publish] enabling workers.dev failed (${sub.status})`);

    const accountSub = await cf(`/workers/subdomain`).then((r) => r.json()).catch(() => null);
    const subdomain = accountSub?.result?.subdomain;
    if (typeof subdomain !== "string" || !subdomain) return j(502, { error: "subdomain_unavailable" });

    const url = `https://${worker}.${subdomain}.workers.dev`;
    await admin
      .from("projects")
      .update({ is_published: true, published_url: url, published_at: new Date().toISOString() })
      .eq("id", project.id);

    return j(200, { ok: true, url, worker });
  } catch (e) {
    console.error("[cloudflare-publish] error:", e);
    return j(500, { error: creative.sanitizeError(e) });
  }
}

Deno.serve(handleRequest);

/** Stable, DNS-safe Worker name: "vertal-<slug>-<id prefix>", at most 63 chars. */
export function workerName(projectId: string, title: string | null | undefined): string {
  const slug = (title ?? "app")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";
  return `vertal-${slug}-${projectId.replace(/-/g, "").slice(0, 8)}`.replace(/-+/g, "-");
}

/** Worker module that serves the project's HTML for every path (single-page apps). */
export function workerSource(html: string): string {
  return `const HTML = ${JSON.stringify(html)};
export default {
  fetch() {
    return new Response(HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
        "x-powered-by": "Vertal",
      },
    });
  },
};
`;
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
