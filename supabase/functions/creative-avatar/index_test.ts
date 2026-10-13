// Run with: deno test --allow-env supabase/functions/creative-avatar/index_test.ts
// (esm.sh imports need network; offline, map them to npm: with --import-map.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

(Deno as unknown as { serve: unknown }).serve = () => ({});
const { handleRequest, __setDeps } = await import("./index.ts");

const BASE = "https://proj.supabase.co";
const USER = "11111111-1111-1111-1111-111111111111";
const IMG = `${BASE}/storage/v1/object/public/uploads/${USER}/face.png`;
const OR = "https://openrouter.ai/api/v1/videos";

function setup(opts: { orKey?: string | null; failSubmit?: boolean; jobStatus?: string } = {}) {
  const assets = new Map<string, any>();
  const rpc: { name: string; args: any }[] = [];
  const deductions: number[] = [];
  const orCalls: { method: string; url: string; body?: any }[] = [];
  const state = { jobStatus: opts.jobStatus ?? "in_progress" };

  const admin = {
    rpc: async (name: string, args: any) => {
      rpc.push({ name, args });
      return name === "is_admin" ? { data: false } : { data: { success: true }, error: null };
    },
    from: () => ({
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            const id = crypto.randomUUID();
            assets.set(id, structuredClone({ ...row, id }));
            return { data: { id }, error: null };
          },
        }),
      }),
      update: (patch: any) => ({
        eq: async (_c: string, id: string) => {
          Object.assign(assets.get(id), structuredClone(patch));
          return { error: null };
        },
      }),
      select: () => {
        const f: Record<string, string> = {};
        const q = {
          eq: (c: string, v: string) => ((f[c] = v), q),
          maybeSingle: async () => {
            const a = assets.get(f.id);
            return { data: a && a.user_id === f.user_id && a.tool === f.tool ? structuredClone(a) : null };
          },
        };
        return q;
      },
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}/storage/v1/object/public/uploads/${p}` } }),
      }),
    },
  };

  const fakeFetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    orCalls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (method === "POST" && url === OR) return opts.failSubmit ? json({ error: { code: 400 } }, 400) : json({ id: "job-1", status: "pending" }, 202);
    if (url === `${OR}/job-1`) return json({ id: "job-1", status: state.jobStatus, usage: { cost: 1.5 }, error: state.jobStatus === "failed" ? "policy" : undefined });
    if (url === `${OR}/job-1/content?index=0`) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error(`unexpected fetch ${url}`);
  };

  const env: Record<string, string> = { SUPABASE_URL: BASE };
  if (opts.orKey !== null) env.OPENROUTER_API_KEY = opts.orKey ?? "sk-or-test";

  __setDeps({
    getUser: async (h: string | null) => (h === "Bearer ok" ? { id: USER, email: "u@x.dev" } : h === "Bearer other" ? { id: "other" } : null),
    deductCredits: async (_u: string, amount: number) => (deductions.push(amount), { ok: true }),
    admin: () => admin,
    fetch: fakeFetch,
    env: (k: string) => env[k],
  } as any);

  const call = async (body: unknown, auth = "Bearer ok") => {
    const res = await handleRequest(new Request("https://fn/creative-avatar", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  const refunds = () => rpc.filter((r) => r.name === "execute_atomic_credit_topup");
  return { call, assets, deductions, refunds, orCalls, state };
}

const submit = (extra: Record<string, unknown> = {}) => ({
  action: "submit", image_url: IMG, script: "Olá, bem-vindo à KUBO.", duration: 30, aspect: "9:16", ...extra,
});

Deno.test("rejects unauthenticated requests", async () => {
  const t = setup();
  assertEquals((await t.call(submit(), "Bearer nope")).status, 401);
});

Deno.test("rejects foreign images, bad durations and over-long scripts without charging", async () => {
  const t = setup();
  assertEquals((await t.call(submit({ image_url: "https://evil.com/a.png" }))).status, 400);
  assertEquals((await t.call(submit({ duration: 45 }))).status, 400);
  assertEquals((await t.call(submit({ script: Array(40).fill("palavra").join(" "), duration: 15 }))).status, 400);
  assertEquals((await t.call(submit({ script: "" }))).status, 400);
  assertEquals(t.deductions.length, 0);
});

Deno.test("returns 503 before charging when OpenRouter is not configured", async () => {
  const t = setup({ orKey: null });
  assertEquals((await t.call(submit())).status, 503);
  assertEquals(t.deductions.length, 0);
});

Deno.test("charges the 350% quote and submits heygen/avatar-iv with the photo", async () => {
  const t = setup();
  const r = await t.call(submit());
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "processing");
  assertEquals(t.deductions, [126]);
  const sent = t.orCalls[0].body;
  assertEquals(sent.model, "heygen/avatar-iv");
  assertEquals(sent.prompt, "Olá, bem-vindo à KUBO.");
  assertEquals(sent.input_references[0].image_url.url, IMG);
});

Deno.test("status copies the finished video to storage", async () => {
  const t = setup();
  const { body } = await t.call(submit());
  assertEquals((await t.call({ action: "status", asset_id: body.asset_id })).body.status, "processing");
  t.state.jobStatus = "completed";
  const done = await t.call({ action: "status", asset_id: body.asset_id });
  assertEquals(done.body.status, "completed");
  assert(done.body.video_url.endsWith(`/uploads/${USER}/avatar/${body.asset_id}.mp4`));
  assertEquals(t.assets.get(body.asset_id).metadata.provider_cost_usd, 1.5);
  assertEquals(t.refunds().length, 0);
});

Deno.test("a failed job is refunded exactly once", async () => {
  const t = setup({ jobStatus: "failed" });
  const { body } = await t.call(submit());
  const r = await t.call({ action: "status", asset_id: body.asset_id });
  assertEquals(r.body.status, "failed");
  assertEquals(r.body.refunded, true);
  await t.call({ action: "status", asset_id: body.asset_id });
  assertEquals(t.refunds().length, 1);
  assertEquals(t.refunds()[0].args._amount, 126);
});

Deno.test("a rejected submit is refunded immediately", async () => {
  const t = setup({ failSubmit: true });
  const r = await t.call(submit());
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "failed");
  assertEquals(t.refunds().length, 1);
});

Deno.test("another user cannot read the asset", async () => {
  const t = setup();
  const { body } = await t.call(submit());
  assertEquals((await t.call({ action: "status", asset_id: body.asset_id }, "Bearer other")).status, 404);
});
