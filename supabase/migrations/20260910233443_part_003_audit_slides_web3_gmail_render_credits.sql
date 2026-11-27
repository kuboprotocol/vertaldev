-- Production migration 20260910233443 "part_003_audit_slides_web3_gmail_render_credits", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

insert into storage.buckets (id, name, public) values ('audit-reports', 'audit-reports', true) on conflict (id) do nothing;

create policy "Public can read audit reports"
on storage.objects for select
to public
using (bucket_id = 'audit-reports');

create policy "Anyone can upload audit reports"
on storage.objects for insert
to public
with check (bucket_id = 'audit-reports');

CREATE TABLE public.audit_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  label TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_shares_user ON public.audit_shares(user_id, created_at DESC);

ALTER TABLE public.audit_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own shares" ON public.audit_shares
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own shares" ON public.audit_shares
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own shares" ON public.audit_shares
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages shares" ON public.audit_shares
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_audit_shares_updated
  BEFORE UPDATE ON public.audit_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

UPDATE storage.buckets SET public = false WHERE id = 'audit-reports';

DROP POLICY IF EXISTS "Anyone can view audit reports" ON storage.objects;
DROP POLICY IF EXISTS "Public view audit reports" ON storage.objects;

CREATE POLICY "Users upload own audit reports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own audit reports" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'audit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own audit reports" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audit-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE TABLE public.slide_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled deck',
  theme JSONB NOT NULL DEFAULT '{"name":"midnight"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_slide_decks_user ON public.slide_decks(user_id, updated_at DESC);

ALTER TABLE public.slide_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own decks" ON public.slide_decks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own decks" ON public.slide_decks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own decks" ON public.slide_decks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own decks" ON public.slide_decks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_slide_decks_updated
  BEFORE UPDATE ON public.slide_decks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.slide_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.slide_decks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  layout TEXT NOT NULL DEFAULT 'title-content',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_slide_pages_deck ON public.slide_pages(deck_id, position);

ALTER TABLE public.slide_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own pages" ON public.slide_pages
  FOR SELECT TO authenticated
  USING (deck_id IN (SELECT id FROM public.slide_decks WHERE user_id = auth.uid()));
CREATE POLICY "Users insert own pages" ON public.slide_pages
  FOR INSERT TO authenticated
  WITH CHECK (deck_id IN (SELECT id FROM public.slide_decks WHERE user_id = auth.uid()));
CREATE POLICY "Users update own pages" ON public.slide_pages
  FOR UPDATE TO authenticated
  USING (deck_id IN (SELECT id FROM public.slide_decks WHERE user_id = auth.uid()));
CREATE POLICY "Users delete own pages" ON public.slide_pages
  FOR DELETE TO authenticated
  USING (deck_id IN (SELECT id FROM public.slide_decks WHERE user_id = auth.uid()));

CREATE TRIGGER trg_slide_pages_updated
  BEFORE UPDATE ON public.slide_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


CREATE TABLE public.api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  connector_slug TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  masked_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, connector_slug)
);

ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credentials metadata"
ON public.api_credentials FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages credentials"
ON public.api_credentials FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users delete own credentials"
ON public.api_credentials FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER api_credentials_touch
BEFORE UPDATE ON public.api_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_api_credentials_user_slug ON public.api_credentials(user_id, connector_slug);


create table public.web3_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  network text not null,
  connection_name text not null,
  rpc_url_ciphertext text not null,
  rpc_url_iv text not null,
  rpc_url_tag text not null,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  api_key_hint text,
  explorer_url text not null,
  last_status text not null default 'unknown',
  last_checked_at timestamptz,
  last_block bigint,
  last_latency_ms integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, network, connection_name)
);

create index web3_connections_user_idx on public.web3_connections (user_id, updated_at desc);

alter table public.web3_connections enable row level security;

create policy "web3 owner select" on public.web3_connections
  for select to authenticated using (auth.uid() = user_id);
create policy "web3 owner insert" on public.web3_connections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "web3 owner update" on public.web3_connections
  for update to authenticated using (auth.uid() = user_id);
create policy "web3 owner delete" on public.web3_connections
  for delete to authenticated using (auth.uid() = user_id);
create policy "web3 service role" on public.web3_connections
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create trigger web3_connections_touch_updated_at
  before update on public.web3_connections
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.web3_connections;


CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  scope text NOT NULL DEFAULT '',
  refresh_token_ciphertext text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_tag text NOT NULL,
  access_token_cache text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX gmail_accounts_user_idx ON public.gmail_accounts (user_id);

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail owner select"
  ON public.gmail_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "gmail owner insert"
  ON public.gmail_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gmail owner update"
  ON public.gmail_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "gmail owner delete"
  ON public.gmail_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "gmail service role all"
  ON public.gmail_accounts FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER gmail_accounts_touch
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.gmail_oauth_states (
  nonce TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  origin TEXT NOT NULL,
  return_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at TIMESTAMPTZ
);

GRANT ALL ON public.gmail_oauth_states TO service_role;

ALTER TABLE public.gmail_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_gmail_oauth_states_expires ON public.gmail_oauth_states(expires_at);


CREATE TABLE public.render_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Render',
  api_key_ciphertext text NOT NULL,
  api_key_iv text NOT NULL,
  api_key_tag text NOT NULL,
  api_key_hint text,
  workspace_id text,
  last_status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  last_latency_ms integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_connections TO authenticated;
GRANT ALL ON public.render_connections TO service_role;
ALTER TABLE public.render_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render conn owner select" ON public.render_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "render conn owner insert" ON public.render_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "render conn owner update" ON public.render_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "render conn owner delete" ON public.render_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "render conn service role" ON public.render_connections FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE TRIGGER render_connections_touch BEFORE UPDATE ON public.render_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.render_auto_heal_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.render_connections(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  service_name text,
  enabled boolean NOT NULL DEFAULT true,
  health_url text,
  max_restarts_per_hour integer NOT NULL DEFAULT 5,
  rollback_on_fail boolean NOT NULL DEFAULT true,
  e2e_webhook_url text,
  e2e_run_on_deploy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_auto_heal_policies TO authenticated;
GRANT ALL ON public.render_auto_heal_policies TO service_role;
ALTER TABLE public.render_auto_heal_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render policy owner all" ON public.render_auto_heal_policies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "render policy service role" ON public.render_auto_heal_policies FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE TRIGGER render_policies_touch BEFORE UPDATE ON public.render_auto_heal_policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.render_heal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid REFERENCES public.render_connections(id) ON DELETE SET NULL,
  service_id text NOT NULL,
  action text NOT NULL,
  trigger text NOT NULL,
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.render_heal_events TO authenticated;
GRANT ALL ON public.render_heal_events TO service_role;
ALTER TABLE public.render_heal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "render heal owner select" ON public.render_heal_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "render heal owner insert" ON public.render_heal_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "render heal service role" ON public.render_heal_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE INDEX render_heal_events_user_created_idx ON public.render_heal_events (user_id, created_at DESC);
CREATE INDEX render_heal_events_service_idx ON public.render_heal_events (service_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_idem_uniq
  ON public.credit_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx
  ON public.credit_transactions(user_id, created_at DESC);

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credit transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages credit transactions"
  ON public.credit_transactions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.execute_atomic_credit_deduction(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _category TEXT DEFAULT 'general',
  _metadata JSONB DEFAULT '{}'::jsonb,
  _idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _balance_after INTEGER;
  _tx_id UUID;
  _existing RECORD;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id, balance_after INTO _existing
    FROM public.credit_transactions
    WHERE user_id = _user_id AND idempotency_key = _idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'replayed', true,
        'transaction_id', _existing.id,
        'balance_after', _existing.balance_after
      );
    END IF;
  END IF;

  SELECT * INTO _sub
  FROM public.subscriptions
  WHERE user_id = _user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  IF (_sub.edits_limit - _sub.edits_used) < _amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.subscriptions
  SET edits_used = edits_used + _amount, updated_at = now()
  WHERE id = _sub.id;

  _balance_after := (_sub.edits_limit - (_sub.edits_used + _amount));

  INSERT INTO public.credit_transactions
    (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
  VALUES
    (_user_id, -_amount, _balance_after, _reason, _category, _metadata, _idempotency_key)
  RETURNING id INTO _tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'replayed', false,
    'transaction_id', _tx_id,
    'balance_after', _balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_atomic_credit_deduction(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_atomic_credit_deduction(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO service_role;

ALTER TABLE public.credit_transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_transactions;

CREATE TABLE public.npc_memories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  npc_id text NOT NULL,
  world_seed integer NOT NULL DEFAULT 0,
  persona text,
  memory jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, npc_id, world_seed)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.npc_memories TO authenticated;
GRANT ALL ON public.npc_memories TO service_role;

ALTER TABLE public.npc_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own npc memories" ON public.npc_memories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own npc memories" ON public.npc_memories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own npc memories" ON public.npc_memories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own npc memories" ON public.npc_memories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_npc_memories_lookup ON public.npc_memories (user_id, world_seed);

CREATE TRIGGER trg_npc_memories_updated_at
  BEFORE UPDATE ON public.npc_memories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP POLICY IF EXISTS "Public can read audit reports" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload audit reports" ON storage.objects;

CREATE TABLE IF NOT EXISTS public.github_oauth_states (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL,
  return_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz
);

GRANT ALL ON public.github_oauth_states TO service_role;
ALTER TABLE public.github_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE SELECT (referral_code) ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "Authenticated users can view products" ON public.connect_products;
CREATE POLICY "Users can view own products"
ON public.connect_products
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

REVOKE SELECT (messages) ON public.projects FROM anon;

DROP POLICY IF EXISTS "Users can view own github connection" ON public.github_connections;
CREATE POLICY "Users can view own github connection"
ON public.github_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TABLE public.skill_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','registered','failed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_imports TO authenticated;
GRANT ALL ON public.skill_imports TO service_role;

ALTER TABLE public.skill_imports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_skill_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'kuboprotocol@gmail.com'
  );
$$;

CREATE POLICY "admin reads skill_imports" ON public.skill_imports
  FOR SELECT TO authenticated USING (public.is_skill_admin());
CREATE POLICY "admin inserts skill_imports" ON public.skill_imports
  FOR INSERT TO authenticated WITH CHECK (public.is_skill_admin() AND uploaded_by = auth.uid());
CREATE POLICY "admin updates skill_imports" ON public.skill_imports
  FOR UPDATE TO authenticated USING (public.is_skill_admin()) WITH CHECK (public.is_skill_admin());
CREATE POLICY "admin deletes skill_imports" ON public.skill_imports
  FOR DELETE TO authenticated USING (public.is_skill_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('skill-uploads', 'skill-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin reads skill zips" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'skill-uploads' AND public.is_skill_admin());

CREATE POLICY "admin uploads skill zips" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'skill-uploads' AND public.is_skill_admin());

CREATE POLICY "admin deletes skill zips" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'skill-uploads' AND public.is_skill_admin());

ALTER TABLE public.skill_imports
  ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{"step":"queued","percent":0}'::jsonb;

ALTER TABLE public.skill_imports REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'skill_imports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_imports';
  END IF;
END $$;

ALTER TABLE public.skill_imports
  ADD COLUMN IF NOT EXISTS logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation jsonb,
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
