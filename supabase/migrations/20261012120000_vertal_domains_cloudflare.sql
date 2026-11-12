-- Vertal Domínios - Parceiros: Cloudflare Registrar/DNS + subdomains.

ALTER TABLE public.kubo_dns_records ADD COLUMN IF NOT EXISTS cf_record_id text;

CREATE TABLE IF NOT EXISTS public.kubo_subdomains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.kubo_domains(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('vertal', 'custom')),
  target text NOT NULL,
  project_id uuid,
  cf_record_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kubo_subdomains_user_idx ON public.kubo_subdomains (user_id);
CREATE INDEX IF NOT EXISTS kubo_subdomains_domain_idx ON public.kubo_subdomains (domain_id);

ALTER TABLE public.kubo_subdomains ENABLE ROW LEVEL SECURITY;
-- Writes go through the domain-subdomains edge function (service role), which owns the DNS side.
GRANT SELECT ON public.kubo_subdomains TO authenticated;
GRANT ALL ON public.kubo_subdomains TO service_role;
CREATE POLICY "Users view own subdomains" ON public.kubo_subdomains FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages subdomains" ON public.kubo_subdomains FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_kubo_subdomains_updated BEFORE UPDATE ON public.kubo_subdomains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
