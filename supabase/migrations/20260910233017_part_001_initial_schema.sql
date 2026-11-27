-- Production migration 20260910233017 "part_001_initial_schema", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Project',
  description TEXT,
  generated_code TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);



CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();



-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to avatars
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');



CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'beta',
  edits_used integer NOT NULL DEFAULT 0,
  edits_limit integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  paid_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);



CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own tickets"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- Table to map platform users to their Stripe Connected Accounts
CREATE TABLE public.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_account_id text NOT NULL UNIQUE,
  display_name text,
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connected accounts"
  ON public.connected_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connected accounts"
  ON public.connected_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connected accounts"
  ON public.connected_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Table for platform-level products linked to connected accounts
CREATE TABLE public.connect_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id text NOT NULL UNIQUE,
  stripe_price_id text,
  connected_account_id text NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connect_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view products"
  ON public.connect_products FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON public.connect_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public read access for uploads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'uploads');

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS published_url text,
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

CREATE POLICY "Anyone can view published projects" ON public.projects FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE TABLE public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  generated_code text,
  title text NOT NULL,
  description text,
  published_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, version_number)
);

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project versions"
  ON public.project_versions FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own project versions"
  ON public.project_versions FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own project versions"
  ON public.project_versions FOR DELETE TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can view published project versions"
  ON public.project_versions FOR SELECT TO anon, authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE is_published = true));


-- Shortlink definitions (the links users will visit)
CREATE TABLE public.shortlinks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Shortlink',
  destination_url text NOT NULL,
  reward_credits numeric NOT NULL DEFAULT 0.5,
  wait_seconds integer NOT NULL DEFAULT 8,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Track each user click/completion
CREATE TABLE public.shortlink_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  shortlink_id uuid NOT NULL REFERENCES public.shortlinks(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  reward_credited numeric NOT NULL DEFAULT 0,
  clicked_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- RLS on shortlinks (public read)
ALTER TABLE public.shortlinks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active shortlinks" ON public.shortlinks FOR SELECT TO anon, authenticated USING (is_active = true);

-- RLS on shortlink_clicks (user-scoped)
ALTER TABLE public.shortlink_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own clicks" ON public.shortlink_clicks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clicks" ON public.shortlink_clicks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clicks" ON public.shortlink_clicks FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Seed some sample shortlinks
INSERT INTO public.shortlinks (slug, title, destination_url, reward_credits, wait_seconds) VALUES
  ('music1', '🎵 Discover New Music', 'https://kubovibe.dev', 0.5, 8),
  ('crypto1', '₿ Crypto News', 'https://kubovibe.dev', 0.5, 8),
  ('game1', '🎮 Gaming Tips', 'https://kubovibe.dev', 0.5, 8),
  ('tech1', '💻 Tech Trends', 'https://kubovibe.dev', 0.5, 8),
  ('art1', '🎨 Digital Art', 'https://kubovibe.dev', 0.5, 8),
  ('learn1', '📚 Learn Web3', 'https://kubovibe.dev', 0.5, 8),
  ('news1', '📰 Daily News', 'https://kubovibe.dev', 0.5, 8),
  ('sports1', '⚽ Sports Updates', 'https://kubovibe.dev', 0.5, 8),
  ('food1', '🍕 Food & Recipes', 'https://kubovibe.dev', 0.5, 8),
  ('travel1', '✈️ Travel Deals', 'https://kubovibe.dev', 0.5, 8);



CREATE TABLE public.ad_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  reward_credits numeric NOT NULL DEFAULT 0.5,
  ad_type text NOT NULL DEFAULT 'unity_rewarded',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ad rewards" ON public.ad_rewards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ad rewards" ON public.ad_rewards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);


ALTER TABLE public.shortlink_clicks ADD COLUMN IF NOT EXISTS ip_address text;


CREATE TABLE public.user_streaks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streak" ON public.user_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own streak" ON public.user_streaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streak" ON public.user_streaks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
