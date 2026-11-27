-- Production migration 20261101235231 "restore_missing_objects", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Aplica supabase/manual/20261102_restore_missing_objects.sql do repositório
-- kuboprotocol/vertaldev no commit 31d0ce3c6ae5bffae21a0dcd3e662fe632d1d0ae,
-- conferindo o SHA-256 do arquivo antes de executar.
do $restore$
declare
  r record; body text;
begin
  select status, content into r from public.http_get('https://raw.githubusercontent.com/kuboprotocol/vertaldev/31d0ce3c6ae5bffae21a0dcd3e662fe632d1d0ae/supabase/manual/20261102_restore_missing_objects.sql');
  if r.status <> 200 then raise exception 'download failed: %', r.status; end if;
  body := r.content;
  if encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex') <> '3ad34b30466a2a9da3ab8152f4be1955f49efddac2897b9a8b65f4dc1ed48a5d' then
    raise exception 'checksum mismatch';
  end if;
  execute body;
end
$restore$;
