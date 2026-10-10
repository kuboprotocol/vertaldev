// Run with: deno test --allow-env supabase/functions/creative-video-studio/index_test.ts
// (esm.sh imports need network; offline, map them to npm: with --import-map.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

(Deno as unknown as { serve: unknown }).serve = () => ({});
const { handleRequest, __setDeps } = await import("./index.ts");

const BASE = "https://proj.supabase.co";
const USER = "11111111-1111-1111-1111-111111111111";
const img = (n: number, user = USER) => `${BASE}/storage/v1/object/public/uploads/${user}/${n}.png`;

function setup(opts: { falKey?: string | null; falStatus?: Record<string, string>; failSubmitFor?: string[]; failResultFor?: string[] } = {}) {
  const assets = new Map<string, any>();
  const rpc: { name: string; args: any }[] = [];
  const deductions: number[] = [];
  const falCalls: string[] = [];
  const falStatus = opts.falStatus ?? {};

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
    falCalls.push(`${init?.method ?? "GET"} ${url}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (init?.method === "POST") {
      const { image_url } = JSON.parse(String(init.body));
      const id = image_url.split("/").pop().replace(".png", "");
      if (opts.failSubmitFor?.includes(id)) return json({ detail: "bad" }, 422);
      return json({
        request_id: id,
        status_url: `https://queue.fal.run/m/requests/${id}/status`,
        response_url: `https://queue.fal.run/m/requests/${id}`,
      });
    }
    const m = url.match(/requests\/([^/]+)(\/status)?$/);
    if (m && m[2]) return json({ status: falStatus[m[1]] ?? "IN_QUEUE" }, falStatus[m[1]] === "COMPLETED" ? 200 : 202);
    if (m) return opts.failResultFor?.includes(m[1]) ? json({ detail: "nsfw" }, 500) : json({ video: { url: `https://v3.fal.media/${m[1]}.mp4` } });
    if (url.startsWith("https://v3.fal.media/")) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error(`unexpected fetch ${url}`);
  };

  const env: Record<string, string> = { SUPABASE_URL: BASE };
  if (opts.falKey !== null) env.FAL_KEY = opts.falKey ?? "fal-test";

  __setDeps({
    getUser: async (h: string | null) => (h === "Bearer ok" ? { id: USER, email: "u@x.dev" } : h === "Bearer other" ? { id: "other" } : null),
    deductCredits: async (_u: string, amount: number) => (deductions.push(amount), { ok: true }),
    admin: () => admin,
    fetch: fakeFetch,
    env: (k: string) => env[k],
  } as any);

  const call = async (body: unknown, auth = "Bearer ok") => {
    const res = await handleRequest(new Request("https://fn/creative-video-studio", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  const refunds = () => rpc.filter((r) => r.name === "execute_atomic_credit_topup");
  return { call, assets, deductions, refunds, falCalls, falStatus };
}

const ai = (images: string[]) => ({ action: "submit", tier: "realistic", style: "music", aspect: "9:16", images });

Deno.test("rejects unauthenticated requests", async () => {
  const { call } = setup();
  assertEquals((await call(ai([img(1)]), "Bearer nope")).status, 401);
});

Deno.test("rejects images that are not the user's own uploads, without charging", async () => {
  const t = setup();
  for (const bad of [img(1, "someone-else"), "https://evil.com/a.png", `${BASE}/storage/v1/object/public/uploads/${USER}/../x/a.png`]) {
    assertEquals((await t.call(ai([bad]))).status, 400);
  }
  assertEquals(t.deductions.length, 0);
});

Deno.test("rejects 0 or more than 10 images", async () => {
  const t = setup();
  assertEquals((await t.call(ai([]))).status, 400);
  assertEquals((await t.call(ai(Array.from({ length: 11 }, (_, i) => img(i))))).status, 400);
  assertEquals((await t.call({ action: "submit", tier: "express", style: "meme", aspect: "1:1", image_count: 11 })).status, 400);
  assertEquals(t.deductions.length, 0);
});

Deno.test("express charges a flat fee and calls no AI provider", async () => {
  const t = setup();
  const r = await t.call({ action: "submit", tier: "express", style: "meme", aspect: "1:1", image_count: 7 });
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "completed");
  assertEquals(t.deductions, [2]);
  assertEquals(t.falCalls.length, 0);
});

Deno.test("AI tier without FAL_KEY returns 503 before charging", async () => {
  const t = setup({ falKey: null });
  assertEquals((await t.call(ai([img(1)]))).status, 503);
  assertEquals(t.deductions.length, 0);
});

Deno.test("AI flow: charges per clip, refunds each failed clip exactly once", async () => {
  const t = setup({ failSubmitFor: ["3"], failResultFor: ["2"] });
  const sub = await t.call(ai([img(1), img(2), img(3)]));
  assertEquals(sub.status, 200);
  assertEquals(t.deductions, [36]);
  assertEquals(sub.body.status, "processing");
  assertEquals(sub.body.clips.map((c: any) => c.status), ["queued", "queued", "failed"]);
  assertEquals(t.refunds().length, 1);
  assertEquals(t.refunds()[0].args._amount, 12);
  assertEquals(t.refunds()[0].args._idempotency_key, `refund:video_studio:${sub.body.asset_id}:2`);

  t.falStatus["1"] = "COMPLETED";
  const p1 = await t.call({ action: "status", asset_id: sub.body.asset_id });
  assertEquals(p1.body.clips.map((c: any) => c.status), ["completed", "queued", "failed"]);
  assert(p1.body.clips[0].video_url.includes(`/uploads/${USER}/video-studio/`), "clip re-hosted in storage");
  assertEquals(p1.body.status, "processing");

  t.falStatus["2"] = "COMPLETED";
  const p2 = await t.call({ action: "status", asset_id: sub.body.asset_id });
  assertEquals(p2.body.clips.map((c: any) => c.status), ["completed", "failed", "failed"]);
  assertEquals(p2.body.status, "completed");
  assertEquals(t.refunds().length, 2);

  await t.call({ action: "status", asset_id: sub.body.asset_id });
  assertEquals(t.refunds().length, 2, "no double refund on repeated polling");
  assertEquals(t.assets.get(sub.body.asset_id).output_url, p1.body.clips[0].video_url);
});

Deno.test("status is scoped to the asset owner", async () => {
  const t = setup();
  const sub = await t.call(ai([img(1)]));
  assertEquals((await t.call({ action: "status", asset_id: sub.body.asset_id }, "Bearer other")).status, 404);
});
