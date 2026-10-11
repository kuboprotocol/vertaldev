// Run with: deno test --allow-env supabase/functions/_shared/creative_test.ts
// (esm.sh imports need network; offline, map them to npm: with --import-map.)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");
const { deductCredits, withRefundOnFailure } = await import("./creative.ts");

const USER = "11111111-1111-1111-1111-111111111111";

/** Fakes the PostgREST RPC endpoints used by deductCredits and the refund. */
function fakeDb(opts: { replayed?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const fn = new URL(req.url).pathname.split("/rpc/")[1];
    const args = JSON.parse(await req.text() || "{}");
    calls.push({ fn, args });
    const body = fn === "is_admin" ? false
      : fn === "bump_rate_limit" ? 1
      : { success: true, replayed: fn === "execute_atomic_credit_deduction" && !!opts.replayed };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { refunds: () => calls.filter((c) => c.fn === "execute_atomic_credit_topup") };
}

const charge = () => deductCredits(USER, 3, "creative_test", {}, null, "key-1");
const call = (h: (req: Request) => Promise<Response>) => withRefundOnFailure(h)(new Request("https://fn/x"));

Deno.test("successful responses keep the charge", async () => {
  const db = fakeDb();
  const res = await call(async () => (await charge(), new Response("ok")));
  assertEquals(res.status, 200);
  assertEquals(db.refunds().length, 0);
});

Deno.test("a failed response after charging refunds it once, keyed on the charge", async () => {
  const db = fakeDb();
  const res = await call(async () => (await charge(), new Response("{}", { status: 503 })));
  assertEquals(res.status, 503);
  assertEquals(db.refunds().length, 1);
  assertEquals(db.refunds()[0].args._amount, 3);
  assertEquals(db.refunds()[0].args._idempotency_key, "refund:key-1");
});

Deno.test("a thrown error after charging refunds it", async () => {
  const db = fakeDb();
  let threw = false;
  try {
    await call(async () => {
      await charge();
      throw new Error("boom");
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(db.refunds().length, 1);
});

Deno.test("failures before any charge refund nothing", async () => {
  const db = fakeDb();
  await call(async () => new Response("{}", { status: 400 }));
  assertEquals(db.refunds().length, 0);
});

Deno.test("a replayed idempotency key is refused instead of served for free", async () => {
  const db = fakeDb({ replayed: true });
  const ded = await charge();
  assertEquals(ded, { ok: false, error: "duplicate_request", status: 409 });
  const res = await call(async () => {
    const d = await charge();
    return new Response("{}", { status: d.ok ? 200 : 409 });
  });
  assertEquals(res.status, 409);
  assertEquals(db.refunds().length, 0, "nothing was charged, so nothing is refunded");
});
