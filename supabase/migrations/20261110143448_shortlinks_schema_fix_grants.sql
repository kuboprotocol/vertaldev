-- Production migration 20261110143448 "shortlinks_schema_fix_grants", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

grant select, insert, update, delete on public.shortlinks to authenticated;
grant all on public.shortlinks to service_role;
grant select, insert on public.shortlink_views to authenticated;
grant all on public.shortlink_views to service_role;
