// Backfill único do cofre da auditoria do Vertal Navigator.
//
// Cifra as linhas ANTIGAS de navigator_audit que ainda têm conteúdo sensível em claro
// em `detail` (texto da tarefa, URL, host, nome do segredo, loja…): reaplica
// auditDetail (tira senhas/URLs com token), separa o que pode ficar em claro
// (end_reason/minutes/limit) e grava o resto em detail_ciphertext/iv/tag + key_version,
// com o MESMO código do Worker (_shared/navigatorAuditVault.ts).
//
// Só rode DEPOIS de aplicar a migração 20261122140000_navigator_audit_vault.sql, criar
// a NAVIGATOR_AUDIT_KEY no Worker e ter o OK do Laércio. Padrão = simulação (não grava).
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… NAVIGATOR_AUDIT_KEY=… \
//     deno run --no-check -A scripts/navigator-audit-backfill.ts            # simulação
//   … deno run --no-check -A scripts/navigator-audit-backfill.ts --apply    # grava
//
// Use a MESMA NAVIGATOR_AUDIT_KEY do Worker (sem ela, cai no fallback NAVIGATOR_ENC_KEY/
// CONNECTOR_ENC_KEY, key_version 0 — também precisa ser a mesma do Worker).
// Nada aqui imprime conteúdo da auditoria nem chaves: só contagens e ids.
// Depois: alter table public.navigator_audit validate constraint navigator_audit_detail_clear_only;
import { auditWriteKey, needsAuditBackfill, openAuditDetail, sealAuditDetail } from "../supabase/functions/_shared/navigatorAuditVault.ts";

type Env = Record<string, string | undefined>;
const env: Env = (globalThis as { process?: { env: Env } }).process?.env ??
  (globalThis as unknown as { Deno: { env: { toObject(): Env } } }).Deno.env.toObject();
const args: string[] = (globalThis as { process?: { argv: string[] } }).process?.argv ??
  (globalThis as unknown as { Deno: { args: string[] } }).Deno.args;
const APPLY = args.includes("--apply");

interface Row {
  id: string;
  user_id: string;
  kind: string;
  detail: Record<string, unknown> | null;
  detail_ciphertext: string | null;
  detail_iv: string | null;
  detail_tag: string | null;
  key_version: number | null;
}

async function main() {
  const base = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) throw new Error("defina SUPABASE_URL e SUPABASE_SECRET_KEY");
  const key = auditWriteKey(env);
  if (!key) throw new Error("defina NAVIGATOR_AUDIT_KEY (32 bytes base64/hex) — ou a NAVIGATOR_ENC_KEY/CONNECTOR_ENC_KEY do Worker");
  if (key.version === 0) console.warn("aviso: sem NAVIGATOR_AUDIT_KEY; usando o fallback (key_version 0)");
  const headers = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

  // 1) Lê todas as linhas sem cifra (só leitura, paginado).
  const all: Row[] = [];
  for (let offset = 0; ; offset += 200) {
    const q = new URLSearchParams({
      select: "id,user_id,kind,detail,detail_ciphertext,detail_iv,detail_tag,key_version",
      detail_ciphertext: "is.null",
      order: "created_at.asc",
      limit: "200",
      offset: String(offset),
    });
    const res = await fetch(`${base}/rest/v1/navigator_audit?${q}`, { headers });
    if (!res.ok) throw new Error(`leitura falhou: HTTP ${res.status} (a migração foi aplicada?)`);
    const rows = (await res.json()) as Row[];
    all.push(...rows);
    if (rows.length < 200) break;
  }
  const todo = all.filter(needsAuditBackfill);

  // 2) Cifra, confere a volta e (com --apply) grava linha a linha.
  let done = 0;
  let failed = 0;
  for (const row of todo) {
    const sealed = await sealAuditDetail(key, row.user_id, row.kind, row.detail ?? {});
    const back = await openAuditDetail(env, { ...sealed, user_id: row.user_id, kind: row.kind });
    if (back.sealed) {
      failed++;
      console.error(`linha ${row.id}: conferência da cifra falhou; não gravada`);
      continue;
    }
    if (!APPLY) continue;
    const up = await fetch(`${base}/rest/v1/navigator_audit?id=eq.${row.id}&detail_ciphertext=is.null`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(sealed),
    });
    if (up.ok) done++;
    else {
      failed++;
      console.error(`linha ${row.id}: HTTP ${up.status}`);
    }
  }
  const pending = todo.length;
  console.log(APPLY
    ? `backfill: ${done} linha(s) cifrada(s), ${failed} falha(s), key_version ${key.version}`
    : `simulação: ${pending} linha(s) a cifrar (${failed} falharia(m)). Rode com --apply para gravar.`);
  if (APPLY && failed === 0) console.log("próximo passo: alter table public.navigator_audit validate constraint navigator_audit_detail_clear_only;");
}

main().catch((e) => {
  console.error("backfill falhou:", e instanceof Error ? e.message : String(e));
  (globalThis as { process?: { exit(c: number): void } }).process?.exit(1);
});
