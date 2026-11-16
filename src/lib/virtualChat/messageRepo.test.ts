import { describe, expect, it } from "vitest";
import {
  CHANNEL_TABLE,
  lastInboundAt,
  STORED_BODY_LIMIT,
  storeChannelMessage,
} from "../../../supabase/functions/_shared/virtualChat/messageRepo";

type Call = { table: string; op: string; args: unknown[] };
type Result = { data?: unknown; error?: { code?: string } | null };

/** Cliente falso do Supabase: grava cada chamada e devolve o resultado configurado. */
function fakeAdmin(result: Result) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      return {
        upsert(...args: unknown[]) {
          calls.push({ table, op: "upsert", args });
          return { select: () => Promise.resolve(result) };
        },
        select(...args: unknown[]) {
          calls.push({ table, op: "select", args });
          const query = {
            eq(...a: unknown[]) { calls.push({ table, op: "eq", args: a }); return query; },
            order(...a: unknown[]) { calls.push({ table, op: "order", args: a }); return query; },
            limit(...a: unknown[]) { calls.push({ table, op: "limit", args: a }); return Promise.resolve(result); },
          };
          return query;
        },
      };
    },
  };
  return { admin, calls };
}

const row = {
  channel: "instagram" as const,
  direction: "in" as const,
  contact_id: "1234567890",
  display_name: null,
  message_id: "m1",
  kind: "text" as const,
  body: "oi",
  occurred_at: "2026-11-16T12:00:00.000Z",
};

describe("storeChannelMessage", () => {
  it("grava com deduplicação por canal e message_id e devolve true na primeira vez", async () => {
    const { admin, calls } = fakeAdmin({ data: [{ id: "x" }], error: null });
    expect(await storeChannelMessage(admin, row)).toBe(true);
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.table).toBe(CHANNEL_TABLE);
    expect(upsert?.args[1]).toEqual({ onConflict: "channel,message_id", ignoreDuplicates: true });
  });

  it("devolve false quando a Meta reenviou a mesma mensagem", async () => {
    const { admin } = fakeAdmin({ data: [], error: null });
    expect(await storeChannelMessage(admin, row)).toBe(false);
  });

  it("corta o corpo no limite guardado e nunca grava o erro bruto", async () => {
    const { admin, calls } = fakeAdmin({ data: [{ id: "x" }], error: null });
    await storeChannelMessage(admin, { ...row, body: "a".repeat(STORED_BODY_LIMIT + 50) });
    const stored = calls.find((c) => c.op === "upsert")!.args[0] as { body: string };
    expect(stored.body.length).toBe(STORED_BODY_LIMIT);
  });

  it("propaga falha só com o código, sem detalhes", async () => {
    const { admin } = fakeAdmin({ data: null, error: { code: "23505" } });
    await expect(storeChannelMessage(admin, row)).rejects.toThrow("store 23505");
  });
});

describe("lastInboundAt", () => {
  it("devolve o instante da última mensagem recebida do contato", async () => {
    const { admin, calls } = fakeAdmin({ data: [{ occurred_at: "2026-11-16T12:00:00.000Z" }], error: null });
    expect(await lastInboundAt(admin, "instagram", "1234567890")).toBe(Date.parse("2026-11-16T12:00:00.000Z"));
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["channel", "instagram"], ["contact_id", "1234567890"], ["direction", "in"],
    ]);
  });

  it("devolve null quando o contato nunca escreveu", async () => {
    const { admin } = fakeAdmin({ data: [], error: null });
    expect(await lastInboundAt(admin, "whatsapp", "5511999999999")).toBeNull();
  });
});
