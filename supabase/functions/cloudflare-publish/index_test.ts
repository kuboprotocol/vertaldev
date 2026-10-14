// Run with: deno test --allow-env supabase/functions/cloudflare-publish/index_test.ts
// (esm.sh imports need network; offline, map them to npm: with --import-map.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

(Deno as unknown as { serve: unknown }).serve = () => ({});
const { handleRequest, __setDeps, workerName, workerSource } = await import("./index.ts");

const USER = "11111111-1111-1111-1111-111111111111";
const PID = "abcdef12-3456-7890-abcd-ef1234567890";

function setup(opts: { env?: Record<string, string>; project?: any; uploadStatus?: number } = {}) {
  const updates: any[] = [];
  const calls: { method: string; url: string }[] = [];
  const project = opts.project === undefined
    ? { id: PID, user_id: USER, title: "Minha Loja Ótima", generated_code: "<h1>Olá</h1>" }
    : opts.project;
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: project }) }) }),
      update: (patch: any) => ({ eq: async () => (updates.push(patch), { error: null }) }),
    }),
  };
  const env = opts.env ?? { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "acc" };
  __setDeps({
    getUser: async (h: string | null) => (h === "Bearer ok" ? { id: USER } : null),
    admin: () => admin,
    env: (k: string) => env[k],
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url });
      if (url.endsWith("/workers/subdomain")) return new Response(JSON.stringify({ result: { subdomain: "kubo" } }));
      if (init?.method === "PUT") return new Response("{}", { status: opts.uploadStatus ?? 200 });
      return new Response("{}");
    },
  } as any);
  const call = async (body: unknown, auth = "Bearer ok") => {
    const res = await handleRequest(new Request("https://fn/cloudflare-publish", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { call, updates, calls };
}

Deno.test("worker names are DNS-safe and stable", () => {
  assertEquals(workerName(PID, "Minha Loja Ótima!"), "vertal-minha-loja-otima-abcdef12");
  assertEquals(workerName(PID, ""), "vertal-app-abcdef12");
  assert(workerName(PID, "x".repeat(200)).length <= 63);
});

Deno.test("worker source embeds the HTML safely", () => {
  const src = workerSource('</script><script>alert("x")</script>`${1}`');
  assert(src.includes(JSON.stringify('</script><script>alert("x")</script>`${1}`')));
});

Deno.test("rejects unauthenticated requests", async () => {
  assertEquals((await setup().call({ project_id: PID }, "Bearer no")).status, 401);
});

Deno.test("503 when Cloudflare is not configured", async () => {
  assertEquals((await setup({ env: {} }).call({ project_id: PID })).status, 503);
});

Deno.test("404 for someone else's project", async () => {
  const t = setup({ project: { id: PID, user_id: "other", title: "x", generated_code: "<p>" } });
  assertEquals((await t.call({ project_id: PID })).status, 404);
});

Deno.test("publishes and saves the workers.dev URL", async () => {
  const t = setup();
  const r = await t.call({ project_id: PID });
  assertEquals(r.status, 200);
  assertEquals(r.body.url, "https://vertal-minha-loja-otima-abcdef12.kubo.workers.dev");
  assertEquals(t.updates[0].published_url, r.body.url);
  assert(t.calls.some((c) => c.method === "PUT" && c.url.endsWith("/workers/scripts/vertal-minha-loja-otima-abcdef12")));
});

Deno.test("upload failure does not mark the project published", async () => {
  const t = setup({ uploadStatus: 403 });
  assertEquals((await t.call({ project_id: PID })).status, 502);
  assertEquals(t.updates.length, 0);
});
