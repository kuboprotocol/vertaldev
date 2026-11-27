// Vertal · conector MetaMask — peças que só rodam no Deno (edge function): recuperação da assinatura com
// bibliotecas auditadas (@noble/curves + @noble/hashes, as mesmas usadas por viem/ethers) e acesso ao banco.
// Fica fora dos testes do Vitest (imports por URL); a lógica testável está em core.ts / trade.ts / handler.ts.

import { secp256k1 } from "https://esm.sh/@noble/curves@1.6.0/secp256k1";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.5.0/sha3";
import { WALLET_TABLE, type WalletConnection, type WalletStore } from "./handler.ts";

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from((h.replace(/^0x/, "").match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));

/** EIP-191 personal_sign → endereço (minúsculas) que assinou. null se a assinatura não fecha. */
export function recoverPersonalSign(message: string, signature: string): string | null {
  const sig = fromHex(signature);
  if (sig.length !== 65) return null;
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) return null;
  const msg = enc.encode(message);
  const prefixed = new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]);
  const hash = keccak_256(prefixed);
  const s = secp256k1.Signature.fromCompact(sig.slice(0, 64));
  if (s.hasHighS()) return null; // EIP-2: só s baixo
  const pub = s.addRecoveryBit(v).recoverPublicKey(hash).toRawBytes(false); // 65 bytes, 0x04 + X + Y
  return `0x${hex(keccak_256(pub.slice(1)).slice(-20))}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const isMissingTable = (e: Loose) => e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|schema cache/i.test(e?.message ?? "");

/** Tabela vertal_wallet_connections (migração deixada sem aplicar). Sem a tabela: "missing_table". */
export function supabaseWalletStore(admin: Loose): WalletStore {
  return {
    async get(userId) {
      const { data, error } = await admin.from(WALLET_TABLE).select("address, chain_id, connected_at").eq("user_id", userId).maybeSingle();
      if (error) return isMissingTable(error) ? "missing_table" : null;
      return (data as WalletConnection | null) ?? null;
    },
    async upsert(userId, c) {
      const { error } = await admin.from(WALLET_TABLE).upsert({ user_id: userId, ...c }, { onConflict: "user_id" });
      if (error) return isMissingTable(error) ? "missing_table" : "error";
      return true;
    },
    async remove(userId) {
      const { error } = await admin.from(WALLET_TABLE).delete().eq("user_id", userId);
      if (error) return isMissingTable(error) ? "missing_table" : "error";
      return true;
    },
  };
}
