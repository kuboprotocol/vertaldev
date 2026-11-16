import { describe, expect, it } from "vitest";
import { channelOwnerIds } from "../../../supabase/functions/_shared/virtualChat/ownerIds";

const UUID = "0f6c1b7e-3a2d-4c5b-9e8f-112233445566";
const UUID2 = "9a8b7c6d-1111-4222-8333-444455556666";

describe("channelOwnerIds (falha fechada)", () => {
  it("lista vazia ou ausente não libera ninguém", () => {
    expect(channelOwnerIds(undefined).size).toBe(0);
    expect(channelOwnerIds("").size).toBe(0);
    expect(channelOwnerIds(" , ").size).toBe(0);
  });

  it("aceita só UUIDs, separados por vírgula, sem espaços", () => {
    const ids = channelOwnerIds(` ${UUID} ,${UUID2}, nao-e-uuid, 1234 `);
    expect([...ids].sort()).toEqual([UUID, UUID2].sort());
  });
});
