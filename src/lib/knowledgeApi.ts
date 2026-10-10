/**
 * Client for the Vertal Knowledge API key endpoints (/api/keys).
 * Requests carry the logged-in user's token. The full key is returned once, on creation.
 */

export const KNOWLEDGE_API_URL = (import.meta.env.VITE_KNOWLEDGE_API_URL as string | undefined)?.replace(/\/$/, '');

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatedKey extends ApiKeyRow {
  key: string;
}

export class KeyApiError extends Error {
  constructor(public status: number, public code: 'missing_config' | 'limit' | 'forbidden' | 'generic') {
    super(code);
  }
}

async function request<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  if (!KNOWLEDGE_API_URL) throw new KeyApiError(0, 'missing_config');

  const response = await fetch(`${KNOWLEDGE_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    if (response.status === 409) throw new KeyApiError(409, 'limit');
    if (response.status === 403) throw new KeyApiError(403, 'forbidden');
    throw new KeyApiError(response.status, 'generic');
  }
  return (await response.json()) as T;
}

export const listApiKeys = async (accessToken: string) =>
  (await request<{ keys: ApiKeyRow[] }>('/api/keys', accessToken)).keys;

export const createApiKey = (
  accessToken: string,
  input: { name: string; permissions: ('read' | 'write')[]; expires_in_days?: number }
) => request<CreatedKey>('/api/keys', accessToken, { method: 'POST', body: JSON.stringify(input) });

export const revokeApiKey = (accessToken: string, keyId: string) =>
  request<ApiKeyRow>(`/api/keys/${encodeURIComponent(keyId)}/revoke`, accessToken, { method: 'POST' });
