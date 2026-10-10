import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('knowledgeApi', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_KNOWLEDGE_API_URL', 'https://api.example.test/');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the login token and never a key in the list request', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ keys: [] }), { status: 200 }));
    const { listApiKeys } = await import('./knowledgeApi');
    await listApiKeys('user-token');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/keys');
    expect(init.headers.Authorization).toBe('Bearer user-token');
  });

  it('posts the key request as JSON', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ key: 'vrtl_live_x' }), { status: 201 }));
    const { createApiKey } = await import('./knowledgeApi');
    await createApiKey('user-token', { name: 'Editor', permissions: ['read'], expires_in_days: 30 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Editor', permissions: ['read'], expires_in_days: 30 });
  });

  it('maps 409 to the limit error and 403 to forbidden', async () => {
    const { createApiKey, KeyApiError } = await import('./knowledgeApi');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await expect(createApiKey('t', { name: 'x', permissions: ['read'] })).rejects.toMatchObject({ code: 'limit' });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(createApiKey('t', { name: 'x', permissions: ['read'] })).rejects.toBeInstanceOf(KeyApiError);
  });

  it('reports a missing API address instead of calling fetch', async () => {
    vi.stubEnv('VITE_KNOWLEDGE_API_URL', '');
    const { listApiKeys } = await import('./knowledgeApi');
    await expect(listApiKeys('t')).rejects.toMatchObject({ code: 'missing_config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
