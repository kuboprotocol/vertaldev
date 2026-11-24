-- GitHub App installations (escolha de repositórios: "Only select repositories").
-- Uma linha por usuário Vertal. Escrita só pelo service_role (edge functions).
CREATE TABLE IF NOT EXISTS public.github_app_installations (
  user_id uuid PRIMARY KEY,
  installation_id bigint NOT NULL,
  account_login text,
  account_type text,
  repository_selection text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.github_app_installations TO service_role;
GRANT SELECT ON public.github_app_installations TO authenticated;
ALTER TABLE public.github_app_installations ENABLE ROW LEVEL SECURITY;

-- O próprio usuário pode ler a sua instalação (status na UI).
CREATE POLICY "Users read own github app installation"
ON public.github_app_installations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
