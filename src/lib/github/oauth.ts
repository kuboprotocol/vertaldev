// Conector GitHub: login OAuth por usuário ("Entrar com GitHub").
// A edge function `github-auth` gera a URL de autorização (state = nonce guardado
// no servidor) e `github-callback` troca o código, cifra o token (AES-256-GCM) e
// grava em `github_connections`. O token nunca passa pelo navegador.
// O token pessoal (PAT) continua como opção avançada em /connectors/github/setup.
import { supabase } from '@/integrations/supabase/client'

export const GITHUB_TOKEN_SETUP_ROUTE = '/connectors/github/setup'

/** Escopos pedidos no OAuth (o mesmo que as funções usam hoje: repos, perfil e e-mail). */
export const GITHUB_OAUTH_SCOPES = ['repo', 'read:user', 'user:email'] as const

/** Página para onde o GitHub devolve o usuário (painel do conector). */
export function githubOAuthReturnUrl(origin: string = window.location.origin): string {
  return `${origin}/connectors/github`
}

/** Pede a URL de autorização ao servidor. Lança erro se não vier uma URL do GitHub. */
export async function getGitHubOAuthUrl(returnUrl: string = githubOAuthReturnUrl()): Promise<string> {
  const { data, error } = await supabase.functions.invoke('github-auth', { body: { returnUrl } })
  if (error) throw new Error(error.message || 'github_auth_failed')
  const url = (data as { url?: unknown } | null)?.url
  if (typeof url !== 'string' || !url.startsWith('https://github.com/login/oauth/authorize?')) {
    throw new Error((data as { error?: string } | null)?.error || 'github_auth_failed')
  }
  return url
}

/** Mensagem amigável para o erro que o callback devolve em ?error=. */
export function githubOAuthErrorMessage(code: string | null): string {
  if (!code) return ''
  if (code === 'oauth_denied' || code === 'access_denied') return 'Login no GitHub cancelado ou expirado. Tente de novo.'
  return `Não foi possível conectar o GitHub: ${code}`
}

/** Passos da opção avançada (token pessoal), mostrados só em /connectors/github/setup. */
export const GITHUB_TOKEN_STEPS = [
  { title: 'Acesse seu GitHub', description: 'Abra Settings → Developer settings → Personal access tokens (classic).' },
  { title: 'Gere um novo token', description: 'Selecione os escopos: repo e read:user.' },
  { title: 'Cole o token aqui', description: 'O token é criptografado e guardado com segurança na Vertal.' },
] as const
