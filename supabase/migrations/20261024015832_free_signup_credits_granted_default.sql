-- Production migration 20261024015832 "free_signup_credits_granted_default", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

UPDATE public.subscriptions
  SET signup_credits_granted = true
  WHERE plan = 'free' AND signup_credits_granted = false;

ALTER TABLE public.subscriptions
  ALTER COLUMN signup_credits_granted SET DEFAULT true;
